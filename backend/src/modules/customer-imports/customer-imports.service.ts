import { Inject, Injectable } from '@nestjs/common';

import { PermissionDeniedError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { SEQUENCE_GENERATOR, type SequenceGenerator } from '@/infrastructure/database/ports/sequence-generator.port';
import { TRANSACTION_RUNNER, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { isWithinScope } from '@/modules/access/visibility-scope';
import { VisibilityScopeResolver } from '@/modules/access/visibility-scope.resolver';
import { AuditService } from '@/modules/audit/audit.service';
import { type CustomerActor, CustomerActorResolver } from '@/modules/customers/customer-actor.resolver';
import { CUSTOMER_PERMISSIONS } from '@/modules/customers/customer-access-policy';
import { CustomerValidationService } from '@/modules/customers/customer-validation.service';
import { CustomersService } from '@/modules/customers/customers.service';
import { ParameterReader } from '@/modules/parameters/parameter-reader';
import { MAX_UPLOAD_MB } from '@/modules/parameters/parameter-rules.registry';

import {
  type ImportActorScopes,
  type ImportCapabilities,
  canManageImport,
  canViewImport,
  IMPORT_PERMISSIONS,
  importCapabilities,
} from './customer-import-access-policy';
import { CUSTOMER_IMPORT_AUDIT_EVENTS, CUSTOMER_IMPORT_AUDIT_RESOURCE } from './customer-import-audit';
import {
  errorFileNotFound,
  importChangedError,
  importDataPurgedError,
  importInProgressError,
  importNotFound,
  importsDisabledError,
  invalidImportFileError,
  invalidImportStatusError,
  noValidRowsError,
  structureFailureReason,
  unsupportedFileTypeError,
  UnsupportedImportFileError,
} from './customer-import-errors';
import { CustomerImportProcessor, interruptedIssue } from './customer-import-processor';
import { buildErrorFile, type ErrorFile } from './error-file';
import type { ImportFileFormat } from './file-signature';
import { detectFormat, IMPORT_MAX_COLUMNS, IMPORT_PARSE_TIMEOUT_MS, type ImportUpload, readImportFile } from './import-file-reader';
import { importFieldOf, publicIssue } from './import-issues';
import { ImportRowValidator } from './import-row-validator';
import type { ImportStatus } from './import-status';
import { IMPORT_COLUMNS, IMPORT_TEMPLATE_VERSION, type ImportColumnKey } from './import-template';
import {
  CUSTOMER_IMPORTS_REPOSITORY,
  type CustomerImportDetailRecord,
  type CustomerImportRecord,
  type CustomerImportRowRecord,
  type CustomerImportsRepository,
  type ImportRowCriteria,
  type ImportSearchCriteria,
} from './ports/customer-imports.repository.port';
import { buildTemplateFile, type TemplateValue } from './template-file';

/** Parámetros de la carga masiva (00 §8.2, 06 RN-06.1, RN-06.7, RN-06.29). */
export const IMPORT_PARAMETERS = {
  enabled: 'crm.importaciones.habilitada',
  maxRows: 'crm.importaciones.max_filas',
  maxMb: 'crm.importaciones.max_mb',
  retentionDays: 'crm.importaciones.dias_retencion_filas',
  timeZone: 'crm.zona_horaria_negocio',
} as const;

/** Secuencia del código de carga (`IMP-2026-0007`, RN-06.4). */
export const IMPORT_SEQUENCE_KEY = 'crm.importacion';
/** Topes duros en código (RN-06.7): un parámetro mayor se recorta. */
export const HARD_MAX_ROWS = 10_000;
export const HARD_MAX_MB = MAX_UPLOAD_MB;
/** Una carga activa sin señal de vida durante este tiempo se considera interrumpida (RN-06.24). */
export const STALE_IMPORT_MS = 15 * 60 * 1000;

const MAX_FILE_NAME = 255;
const TEMPLATE_HEADERS: ReadonlySet<string> = new Set(IMPORT_COLUMNS.map((column) => column.header));

export interface ImportLimits {
  readonly enabled: boolean;
  readonly maxMb: number;
  readonly maxBytes: number;
  readonly maxRows: number;
}

export interface ImportSettings extends Omit<ImportLimits, 'maxBytes'> {
  readonly formats: readonly ImportFileFormat[];
  readonly templateVersion: string;
  readonly columns: readonly {
    readonly key: ImportColumnKey;
    readonly header: string;
    readonly isRequired: boolean;
    readonly maxLength: number | null;
    readonly description: string;
  }[];
}

export interface CustomerImportView {
  readonly record: CustomerImportDetailRecord;
  readonly capabilities: ImportCapabilities;
}

export interface CustomerImportRowView {
  readonly row: CustomerImportRowRecord;
  /** Cliente existente duplicado, solo si el usuario lo ve (H.4). */
  readonly duplicateOfCustomer: { readonly id: string; readonly crmCode: string; readonly legalName: string } | null;
}

export interface UploadedImportFile extends ImportUpload {
  readonly size: number;
}

export type SearchImportsRequest = Omit<ImportSearchCriteria, 'visibleStarterId'>;

export interface ConfirmImportRequest {
  readonly expectedValidRows: number;
  readonly includeRowsWithWarnings: boolean;
}

/** Nombre original saneado: sin control ni separadores de ruta, ≤ 255 (H.2). Solo dato, nunca ruta ni cabecera. */
export function sanitizeFileName(name: string): string {
  // Control, formato (bidi como U+202E, que haría engañoso el nombre) y separadores de ruta.
  const cleaned = name.replace(/[\p{Cc}\p{Cf}/\\]/gu, '_').trim();
  return (cleaned || 'archivo').slice(0, MAX_FILE_NAME);
}

/**
 * Casos de uso de la carga masiva de clientes (06 F.1). Sin Prisma (ADR-004):
 * orquesta la lectura (`import-file-reader`), la validación con el Módulo 2
 * (`ImportRowValidator`), la persistencia (puerto) y el procesamiento en
 * segundo plano (`CustomerImportProcessor`).
 */
@Injectable()
export class CustomerImportsService {
  constructor(
    @Inject(CUSTOMER_IMPORTS_REPOSITORY) private readonly imports: CustomerImportsRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(SEQUENCE_GENERATOR) private readonly sequences: SequenceGenerator,
    private readonly parameters: ParameterReader,
    private readonly scopes: VisibilityScopeResolver,
    private readonly actors: CustomerActorResolver,
    private readonly validation: CustomerValidationService,
    private readonly customers: CustomersService,
    private readonly rowValidator: ImportRowValidator,
    private readonly processor: CustomerImportProcessor,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  /** Habilitación y límites efectivos (RN-06.1, RN-06.7). Sin caché (DC-3). */
  async limits(): Promise<ImportLimits> {
    const [enabled, maxRows, maxMb] = await Promise.all([
      this.parameters.get<boolean>(IMPORT_PARAMETERS.enabled),
      this.parameters.get<number>(IMPORT_PARAMETERS.maxRows),
      this.parameters.get<number>(IMPORT_PARAMETERS.maxMb),
    ]);
    const effectiveMb = Math.min(maxMb, HARD_MAX_MB);
    return { enabled, maxMb: effectiveMb, maxBytes: effectiveMb * 1024 * 1024, maxRows: Math.min(maxRows, HARD_MAX_ROWS) };
  }

  async settings(): Promise<ImportSettings> {
    const [limits, required] = await Promise.all([this.limits(), this.requiredColumns()]);
    return {
      enabled: limits.enabled,
      maxMb: limits.maxMb,
      maxRows: limits.maxRows,
      formats: ['CSV', 'XLSX'],
      templateVersion: IMPORT_TEMPLATE_VERSION,
      columns: IMPORT_COLUMNS.map((column) => ({
        key: column.key,
        header: column.header,
        isRequired: required.has(column.key),
        maxLength: column.maxLength,
        description: column.description,
      })),
    };
  }

  /**
   * Columnas que el archivo debe traer con valor: los obligatorios del Módulo 2
   * (`crm.campos_obligatorios`), salvo los que el alta completa sola (responsable
   * = quien carga; catálogos con valor por defecto vigente).
   */
  private async requiredColumns(): Promise<Set<ImportColumnKey>> {
    const [requiredFields, defaults] = await Promise.all([
      this.validation.requiredFieldNames(),
      this.validation.defaultCatalogValues('BY_NATURAL_KEY'),
    ]);
    const required = new Set<ImportColumnKey>();
    for (const field of requiredFields) {
      const key = IMPORT_COLUMNS.find((column) => column.key === importFieldOf(field))?.key;
      if (!key || key === 'salesOwner') continue;
      if ((key === 'status' || key === 'companyType' || key === 'rating') && defaults[key]) continue;
      required.add(key);
    }
    return required;
  }

  async template(format: ImportFileFormat): Promise<ErrorFile> {
    const [required, options] = await Promise.all([this.requiredColumns(), this.customers.formOptions()]);
    const validValues: TemplateValue[] = [
      ...options.countries.filter((country) => country.isActive).map((country) => ({ group: 'País', code: country.isoCode, label: country.name })),
      ...options.companyTypes.map((item) => ({ group: 'Tipo de empresa', code: item.code, label: item.label })),
      ...options.statuses.map((item) => ({ group: 'Estado', code: item.code, label: item.label })),
      ...options.ratings.map((item) => ({ group: 'Calificación', code: item.code, label: item.label })),
    ];
    return buildTemplateFile(format, { requiredColumns: required, validValues });
  }

  private async actorScopes(actor: CustomerActor): Promise<ImportActorScopes> {
    const scopes = await this.scopes.resolveMany(actor.userId, [IMPORT_PERMISSIONS.view, IMPORT_PERMISSIONS.create]);
    return {
      viewAll: scopes.get(IMPORT_PERMISSIONS.view)?.kind === 'ALL',
      manageAll: scopes.get(IMPORT_PERMISSIONS.create)?.kind === 'ALL',
    };
  }

  /** Marca interrumpidas las cargas activas sin señal de vida (RN-06.24) y audita cada una. */
  private async failStaleImports(filter: { importId?: string; startedById?: string }, actor: CustomerActor): Promise<void> {
    const failed = await this.imports.failStale({ ...filter, staleBefore: new Date(Date.now() - STALE_IMPORT_MS) }, interruptedIssue());
    for (const importId of failed) {
      this.logger.warn('customer_import_interrupted', { correlationId: actor.audit.correlationId, importId });
      await this.audit.record(CUSTOMER_IMPORT_AUDIT_EVENTS.failed, actor.audit, {
        resourceType: CUSTOMER_IMPORT_AUDIT_RESOURCE,
        resourceId: importId,
        metadata: { failureReason: 'PROCESS_INTERRUPTED' },
      });
    }
  }

  /** Subir, leer y validar (06 F.1 §3, RN-06.7–RN-06.18, RN-06.30). */
  async upload(actor: CustomerActor, file: UploadedImportFile): Promise<CustomerImportView> {
    const userId = actor.userId;
    if (!userId) throw new PermissionDeniedError(IMPORT_PERMISSIONS.create);
    const limits = await this.limits();
    if (!limits.enabled) throw importsDisabledError();

    let format: ImportFileFormat;
    try {
      format = detectFormat(file);
    } catch (error) {
      if (error instanceof UnsupportedImportFileError) {
        this.logger.warn('customer_import_rejected_type', { correlationId: actor.audit.correlationId, reason: error.reason, sizeBytes: file.size });
        throw unsupportedFileTypeError();
      }
      throw error;
    }

    await this.failStaleImports({ startedById: userId }, actor);
    const startedAt = Date.now();
    let read: Awaited<ReturnType<typeof readImportFile>>;
    try {
      read = await readImportFile(file, format, { maxRows: limits.maxRows, maxColumns: IMPORT_MAX_COLUMNS, parseTimeoutMs: IMPORT_PARSE_TIMEOUT_MS });
    } catch (error) {
      if (error instanceof UnsupportedImportFileError) {
        this.logger.warn('customer_import_rejected_type', { correlationId: actor.audit.correlationId, reason: error.reason, sizeBytes: file.size });
        throw unsupportedFileTypeError();
      }
      throw error;
    }

    const timeZone = await this.parameters.get<string>(IMPORT_PARAMETERS.timeZone);
    const { importId, code } = await this.transactions.run(async (tx) => {
      // RN-06.30: una carga activa por usuario; el bloqueo serializa dos subidas simultáneas.
      await this.imports.lockStarter(userId, tx);
      if (await this.imports.hasActiveImport(userId, tx)) throw importInProgressError();
      const importCode = await this.sequences.next(IMPORT_SEQUENCE_KEY, tx, { timeZone });
      const id = await this.imports.create(
        { code: importCode, format, originalFileName: sanitizeFileName(file.originalName), templateVersion: IMPORT_TEMPLATE_VERSION, startedById: userId },
        tx,
      );
      return { importId: id, code: importCode };
    });
    this.logger.info('customer_import_uploaded', { correlationId: actor.audit.correlationId, importId, code, format, sizeBytes: file.size });
    await this.audit.record(CUSTOMER_IMPORT_AUDIT_EVENTS.uploaded, actor.audit, {
      resourceType: CUSTOMER_IMPORT_AUDIT_RESOURCE,
      resourceId: importId,
      metadata: { code, format, sizeBytes: file.size, templateVersion: IMPORT_TEMPLATE_VERSION },
    });

    if (!read.ok) {
      // RN-06.9: un archivo rechazado por estructura queda en el historial como FAILED, sin filas.
      const failureReason = structureFailureReason(read.problems, TEMPLATE_HEADERS);
      await this.imports.fail(importId, ['VALIDATING'], failureReason);
      await this.recordFailure(actor, importId, code, failureReason);
      this.logger.warn('customer_import_structure_invalid', {
        correlationId: actor.audit.correlationId,
        importId,
        issues: read.problems.map((problem) => problem.issue),
      });
      throw invalidImportFileError(read.problems);
    }

    try {
      const rows = await this.rowValidator.validate(read.file, actor);
      if (!(await this.imports.saveValidation(importId, rows))) throw invalidImportStatusError('FAILED');
      const counts = { totalRows: rows.length, validRows: rows.filter((row) => row.status === 'VALID').length };
      this.logger.info('customer_import_validated', {
        correlationId: actor.audit.correlationId,
        importId,
        ...counts,
        invalidRows: counts.totalRows - counts.validRows,
        durationMs: Date.now() - startedAt,
      });
      await this.audit.record(CUSTOMER_IMPORT_AUDIT_EVENTS.validated, actor.audit, {
        resourceType: CUSTOMER_IMPORT_AUDIT_RESOURCE,
        resourceId: importId,
        metadata: { code, ...counts, invalidRows: counts.totalRows - counts.validRows },
      });
    } catch (error) {
      if (await this.imports.fail(importId, ['VALIDATING'], 'VALIDATION_ERROR')) {
        await this.recordFailure(actor, importId, code, 'VALIDATION_ERROR');
      }
      throw error;
    }
    return this.view(actor, importId, limits.enabled);
  }

  private async recordFailure(actor: CustomerActor, importId: string, code: string, failureReason: string): Promise<void> {
    await this.audit.record(CUSTOMER_IMPORT_AUDIT_EVENTS.failed, actor.audit, {
      resourceType: CUSTOMER_IMPORT_AUDIT_RESOURCE,
      resourceId: importId,
      metadata: { code, failureReason },
    });
  }

  async search(actor: CustomerActor, request: SearchImportsRequest): Promise<Page<CustomerImportRecord>> {
    const scopes = await this.actorScopes(actor);
    return this.imports.search({
      ...request,
      // `startedById` solo tiene efecto con alcance ORGANIZATION (06 F.1 §4).
      ...(scopes.viewAll ? {} : { startedById: undefined }),
      visibleStarterId: scopes.viewAll ? null : (actor.userId ?? '00000000-0000-0000-0000-000000000000'),
    });
  }

  /** Carga visible o `404` idéntico a inexistente (H.4). Antes, detecta la interrupción (RN-06.24). */
  private async visibleImport(actor: CustomerActor, importId: string): Promise<{ record: CustomerImportDetailRecord; scopes: ImportActorScopes }> {
    const scopes = await this.actorScopes(actor);
    const first = await this.imports.findById(importId);
    if (!first || !canViewImport(actor, scopes, first)) throw importNotFound(importId);
    if (first.status === 'IMPORTING' || first.status === 'VALIDATING' || first.status === 'UPLOADED') {
      await this.failStaleImports({ importId }, actor);
      const current = await this.imports.findById(importId);
      if (!current) throw importNotFound(importId);
      return { record: current, scopes };
    }
    return { record: first, scopes };
  }

  private async view(actor: CustomerActor, importId: string, enabled?: boolean): Promise<CustomerImportView> {
    const { record, scopes } = await this.visibleImport(actor, importId);
    const isEnabled = enabled ?? (await this.parameters.get<boolean>(IMPORT_PARAMETERS.enabled));
    return { record, capabilities: importCapabilities(actor, scopes, record, isEnabled) };
  }

  async findById(actor: CustomerActor, importId: string): Promise<CustomerImportView> {
    return this.view(actor, importId);
  }

  async rows(actor: CustomerActor, importId: string, criteria: ImportRowCriteria): Promise<Page<CustomerImportRowView>> {
    await this.visibleImport(actor, importId);
    const page = await this.imports.findRows(importId, criteria);
    const visibility = await this.actors.visibility(actor);
    const canSeeDeleted = actor.permissions.has(CUSTOMER_PERMISSIONS.delete);
    return {
      ...page,
      items: page.items.map((row) => {
        const duplicate = row.duplicateOf;
        // Visibilidad directa de `clientes.ver` (sin herencia): la opción más restrictiva (H.4).
        const visible =
          duplicate !== null &&
          isWithinScope(visibility.direct, { ownerId: duplicate.salesOwnerId, countryId: duplicate.countryId }) &&
          (!duplicate.isDeleted || canSeeDeleted);
        return {
          row: { ...row, issues: row.issues.map(publicIssue) },
          duplicateOfCustomer: visible ? { id: duplicate.id, crmCode: duplicate.crmCode, legalName: duplicate.legalName } : null,
        };
      }),
    };
  }

  private assertManageable(actor: CustomerActor, scopes: ImportActorScopes, record: CustomerImportRecord): void {
    if (!canManageImport(actor, scopes, record)) throw new PermissionDeniedError(IMPORT_PERMISSIONS.create);
  }

  private assertStatus(record: CustomerImportRecord, expected: ImportStatus): void {
    if (record.status !== expected) throw invalidImportStatusError(record.status);
  }

  /** Confirmar e importar (06 F.1 §7, RN-06.19–RN-06.21): responde con la carga en `IMPORTING`. */
  async confirm(actor: CustomerActor, importId: string, request: ConfirmImportRequest): Promise<CustomerImportView> {
    if (!(await this.parameters.get<boolean>(IMPORT_PARAMETERS.enabled))) throw importsDisabledError();
    const { record, scopes } = await this.visibleImport(actor, importId);
    this.assertManageable(actor, scopes, record);
    this.assertStatus(record, 'VALIDATED');
    if (record.validRows === 0) throw noValidRowsError();
    if (record.stats.isPurged) throw importDataPurgedError();
    if (request.expectedValidRows !== record.validRows) throw importChangedError(record.validRows);
    const confirmerId = actor.userId;
    if (!confirmerId) throw new PermissionDeniedError(IMPORT_PERMISSIONS.create);
    const started = await this.transactions.run(async (tx) => {
      // RN-06.30: el autor de la carga no puede tener otra validándose o importándose.
      await this.imports.lockStarter(record.startedBy.id, tx);
      if (await this.imports.hasActiveImport(record.startedBy.id, tx, importId)) throw importInProgressError();
      return this.imports.startImporting(importId, confirmerId, tx);
    });
    if (!started) {
      // Otra confirmación o cancelación ganó la transición condicional (RN-06.20).
      throw invalidImportStatusError('IMPORTING');
    }
    this.logger.info('customer_import_confirmed', { correlationId: actor.audit.correlationId, importId, validRows: record.validRows });
    await this.audit.record(CUSTOMER_IMPORT_AUDIT_EVENTS.confirmed, actor.audit, {
      resourceType: CUSTOMER_IMPORT_AUDIT_RESOURCE,
      resourceId: importId,
      metadata: { code: record.code, expectedValidRows: request.expectedValidRows, includeRowsWithWarnings: request.includeRowsWithWarnings },
    });
    const view = await this.view(actor, importId, true);
    this.processor.start({ importId, importCode: record.code, actor, includeRowsWithWarnings: request.includeRowsWithWarnings });
    return view;
  }

  async cancel(actor: CustomerActor, importId: string): Promise<CustomerImportView> {
    if (!(await this.parameters.get<boolean>(IMPORT_PARAMETERS.enabled))) throw importsDisabledError();
    const { record, scopes } = await this.visibleImport(actor, importId);
    this.assertManageable(actor, scopes, record);
    this.assertStatus(record, 'VALIDATED');
    if (!(await this.imports.cancel(importId))) throw invalidImportStatusError('IMPORTING');
    await this.audit.record(CUSTOMER_IMPORT_AUDIT_EVENTS.cancelled, actor.audit, {
      resourceType: CUSTOMER_IMPORT_AUDIT_RESOURCE,
      resourceId: importId,
      metadata: { code: record.code },
    });
    return this.view(actor, importId);
  }

  /** Archivo de errores (06 F.1 §9, RN-06.26): extracción en bloque, auditada. */
  async errorFile(actor: CustomerActor, importId: string): Promise<ErrorFile> {
    const { record } = await this.visibleImport(actor, importId);
    if (record.stats.isPurged) throw importDataPurgedError();
    const rows = await this.imports.listNotImportedRows(importId);
    if (rows.length === 0) throw errorFileNotFound(importId);
    const file = await buildErrorFile(record.format, record.code, rows);
    await this.audit.record(CUSTOMER_IMPORT_AUDIT_EVENTS.errorFileDownloaded, actor.audit, {
      resourceType: CUSTOMER_IMPORT_AUDIT_RESOURCE,
      resourceId: importId,
      metadata: { code: record.code, rows: rows.length },
    });
    return file;
  }

  /** Purga de retención (RN-06.29, D-06.12): la ejecuta el script de operación. */
  async purgeExpiredRowData(now: Date = new Date()): Promise<{ purgedRows: number; before: Date }> {
    const days = await this.parameters.get<number>(IMPORT_PARAMETERS.retentionDays);
    const before = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { purgedRows: await this.imports.purgeRowData(before), before };
  }
}
