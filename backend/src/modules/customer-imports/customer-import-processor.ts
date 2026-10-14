import { Inject, Injectable } from '@nestjs/common';

import { ApplicationError } from '@/common/errors/application-error';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { CustomerActor } from '@/modules/customers/customer-actor.resolver';
import { CustomerCreationService } from '@/modules/customers/customer-creation.service';
import { CUSTOMER_ERROR_CODES } from '@/modules/customers/customer-errors';

import { CUSTOMER_IMPORT_AUDIT_EVENTS, CUSTOMER_IMPORT_AUDIT_RESOURCE } from './customer-import-audit';
import { toCustomerDraft } from './cell-sanitizer';
import { IMPORT_ISSUE_CODES, importFieldOf, importIssue, type StoredImportIssue } from './import-issues';
import { duplicateWarnings } from './import-row-validator';
import { CUSTOMER_IMPORTS_REPOSITORY, type CustomerImportsRepository, type PendingImportRow } from './ports/customer-imports.repository.port';

/** Señal de vida cada N filas (RN-06.24). */
export const HEARTBEAT_EVERY_ROWS = 50;

export const interruptedIssue = (): StoredImportIssue => importIssue('row', IMPORT_ISSUE_CODES.importInterrupted);

export interface ImportRunOptions {
  readonly importId: string;
  readonly importCode: string;
  /** Quien confirmó: crea los clientes con sus reglas de alcance (RN-06.21). */
  readonly actor: CustomerActor;
  readonly includeRowsWithWarnings: boolean;
}

/** La fila dejó de estar `VALID` (carga marcada interrumpida): el alta se deshace sin tocar la fila. */
class RowNoLongerPendingError extends Error {}

interface Rejection {
  readonly issues: StoredImportIssue[];
  readonly duplicateOfCustomerId: string | null;
}

function detailsOf(error: ApplicationError): Record<string, unknown>[] {
  return error.details.map((detail) => ({ ...detail }));
}

/**
 * Procesamiento de una carga confirmada (06 RN-06.21–RN-06.25, D-06.7): en
 * segundo plano en el mismo proceso, fila a fila, cada una en **su** transacción
 * a través del caso de uso de alta del Módulo 2 (que revalida, asigna el folio y
 * audita). La fila se marca `IMPORTED` dentro de esa misma transacción; si algo
 * falla, solo esa fila pasa a `REJECTED` con su incidencia.
 */
@Injectable()
export class CustomerImportProcessor {
  /** Procesos en curso (las pruebas esperan a que terminen). */
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    @Inject(CUSTOMER_IMPORTS_REPOSITORY) private readonly imports: CustomerImportsRepository,
    private readonly creation: CustomerCreationService,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  /** Lanza el procesamiento sin esperar (la confirmación responde `202`). */
  start(options: ImportRunOptions): void {
    const run = this.run(options).finally(() => this.running.delete(options.importId));
    this.running.set(options.importId, run);
  }

  /** Espera a que terminen los procesamientos en curso (pruebas y apagado ordenado). */
  async whenIdle(): Promise<void> {
    await Promise.all([...this.running.values()]);
  }

  async run(options: ImportRunOptions): Promise<void> {
    const { importId, actor } = options;
    const startedAt = Date.now();
    try {
      const rows = await this.imports.listPendingRows(importId);
      const createdCustomerIds: string[] = [];
      for (const [index, row] of rows.entries()) {
        const customerId = await this.processRow(row, options, createdCustomerIds);
        if (customerId) createdCustomerIds.push(customerId);
        if ((index + 1) % HEARTBEAT_EVERY_ROWS === 0) await this.imports.touch(importId);
      }
      const status = await this.imports.complete(importId);
      const record = await this.imports.findById(importId);
      this.logger.info('customer_import_completed', {
        correlationId: actor.audit.correlationId,
        importId,
        status: status ?? record?.status ?? null,
        importedRows: record?.importedRows ?? null,
        rejectedRows: record?.stats.rejectedRows ?? null,
        durationMs: Date.now() - startedAt,
      });
      if (status && record) {
        await this.audit.record(CUSTOMER_IMPORT_AUDIT_EVENTS.completed, actor.audit, {
          resourceType: CUSTOMER_IMPORT_AUDIT_RESOURCE,
          resourceId: importId,
          metadata: {
            code: options.importCode,
            status,
            totalRows: record.totalRows,
            validRows: record.validRows,
            invalidRows: record.invalidRows,
            importedRows: record.importedRows,
            rejectedRows: record.stats.rejectedRows,
          },
        });
      }
    } catch (error) {
      // Fallo inesperado que impide continuar (RN-06.25): FAILED, filas pendientes rechazadas.
      this.logger.error('customer_import_processing_failed', {
        correlationId: actor.audit.correlationId,
        importId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      const failed = await this.imports.failStale({ staleBefore: new Date(Date.now() + 60_000), importId }, interruptedIssue()).catch(() => []);
      if (failed.length > 0) {
        await this.audit
          .record(CUSTOMER_IMPORT_AUDIT_EVENTS.failed, actor.audit, {
            resourceType: CUSTOMER_IMPORT_AUDIT_RESOURCE,
            resourceId: importId,
            metadata: { code: options.importCode, failureReason: 'PROCESS_INTERRUPTED' },
          })
          .catch(() => undefined);
      }
    }
  }

  /** Devuelve el id del cliente creado, o `null` si la fila se rechazó. */
  private async processRow(row: PendingImportRow, options: ImportRunOptions, createdCustomerIds: readonly string[]): Promise<string | null> {
    const warnings = row.issues.filter((issue) => issue.severity === 'WARNING');
    if (!row.values) {
      await this.imports.markRowRejected(row.id, [...row.issues, interruptedIssue()], null);
      return null;
    }
    if (warnings.length > 0 && !options.includeRowsWithWarnings) {
      // Sin la marca, las filas con advertencias no se importan (RN-06.18, D-06.6).
      await this.imports.markRowRejected(row.id, warnings.map((warning) => ({ ...warning, severity: 'ERROR' })), null);
      return null;
    }
    // Confirmar las advertencias = reconocer los clientes avisados en la vista previa
    // y los creados por esta misma carga (RN-06.18, PF-06.52).
    const acknowledgedDuplicateIds =
      warnings.length > 0 ? [...new Set([...warnings.flatMap((warning) => warning.candidateIds ?? []), ...createdCustomerIds])] : undefined;
    try {
      const customer = await this.creation.create(toCustomerDraft(row.values), {
        actor: options.actor,
        mode: 'BY_NATURAL_KEY',
        source: 'IMPORT',
        sourceImportId: options.importId,
        ...(acknowledgedDuplicateIds ? { acknowledgedDuplicateIds } : {}),
        auditMetadata: { rowNumber: row.rowNumber },
        withinTransaction: async (customerId, tx) => {
          if (!(await this.imports.markRowImported(row.id, customerId, tx))) throw new RowNoLongerPendingError();
        },
      });
      return customer.id;
    } catch (error) {
      if (error instanceof RowNoLongerPendingError) return null;
      const rejection = this.rejectionFor(error, options, row);
      await this.imports.markRowRejected(row.id, rejection.issues, rejection.duplicateOfCustomerId);
      return null;
    }
  }

  /** Traduce el error del alta a incidencias de fila (mismos códigos que el Módulo 2). */
  private rejectionFor(error: unknown, options: ImportRunOptions, row: PendingImportRow): Rejection {
    if (error instanceof ApplicationError) {
      const details = detailsOf(error);
      if (error.code === CUSTOMER_ERROR_CODES.customerCodeTaken) {
        const customerId = typeof details[0]?.['customerId'] === 'string' ? (details[0]['customerId'] as string) : null;
        return { issues: [importIssue('customerCode', IMPORT_ISSUE_CODES.customerCodeTaken)], duplicateOfCustomerId: customerId };
      }
      if (error.code === CUSTOMER_ERROR_CODES.possibleDuplicate || error.code === CUSTOMER_ERROR_CODES.duplicateBlocked) {
        const candidates = details.map((detail) => {
          const candidate = detail['candidate'] as { id?: unknown } | undefined;
          return {
            reason: typeof detail['reason'] === 'string' ? detail['reason'] : 'LEGAL_NAME',
            candidate: { id: typeof candidate?.id === 'string' ? candidate.id : null },
          };
        });
        if (error.code === CUSTOMER_ERROR_CODES.duplicateBlocked) {
          const visible = candidates.find((candidate) => candidate.candidate.id);
          return { issues: [importIssue('legalName', IMPORT_ISSUE_CODES.duplicateBlocked)], duplicateOfCustomerId: visible?.candidate.id ?? null };
        }
        const issues = duplicateWarnings(candidates).map((issue) => ({ field: issue.field, code: issue.code, message: issue.message, severity: 'ERROR' as const }));
        return { issues, duplicateOfCustomerId: null };
      }
      const fieldIssues = details.filter(
        (detail): detail is { field: string; code: string } => typeof detail['field'] === 'string' && typeof detail['code'] === 'string',
      );
      if (fieldIssues.length > 0) {
        return { issues: fieldIssues.map((detail) => importIssue(importFieldOf(detail.field), detail.code)), duplicateOfCustomerId: null };
      }
      return { issues: [importIssue('row', error.code)], duplicateOfCustomerId: null };
    }
    this.logger.error('customer_import_row_failed', {
      correlationId: options.actor.audit.correlationId,
      importId: options.importId,
      rowNumber: row.rowNumber,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return { issues: [importIssue('row', IMPORT_ISSUE_CODES.createFailed)], duplicateOfCustomerId: null };
  }
}
