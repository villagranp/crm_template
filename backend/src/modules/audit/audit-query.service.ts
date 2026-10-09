import { Inject, Injectable } from '@nestjs/common';

import { MAX_EXPORT_ROWS, toCsv, type CsvColumn } from '@/common/csv';
import type { Page } from '@/infrastructure/database/ports/pagination';

import { type AuditLogFilterInput, buildAuditFilter, describeAuditFilter } from './audit-filter';
import { type AuditContext, AuditService } from './audit.service';
import {
  AUDIT_QUERY_REPOSITORY,
  type AuditLogRecord,
  type AuditQueryRepository,
  type AuditSortField,
} from './ports/audit-query.repository.port';

/** Tope de nombres de evento para el desplegable del filtro. */
export const MAX_EVENT_NAMES = 500;

function json(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

const CSV_COLUMNS: readonly CsvColumn<AuditLogRecord>[] = [
  { header: 'Fecha (UTC)', value: (row) => row.occurredAt },
  { header: 'Evento', value: (row) => row.event },
  { header: 'Correo del actor', value: (row) => row.subjectEmail },
  { header: 'Id del actor', value: (row) => row.subjectId },
  { header: 'Tipo de recurso', value: (row) => row.resourceType },
  { header: 'Id del recurso', value: (row) => row.resourceId },
  { header: 'IP', value: (row) => row.ipAddress },
  { header: 'Correlación', value: (row) => row.correlationId },
  { header: 'Cambios', value: (row) => json(row.changes) },
  { header: 'Metadatos', value: (row) => json(row.metadata) },
];

export interface AuditExport {
  csv: string;
  rows: number;
  truncated: boolean;
}

/**
 * Consulta y exportación de la bitácora (PLAN-ADMIN, D11 y D13). Sólo lee:
 * la bitácora no se edita ni se borra desde la API.
 */
@Injectable()
export class AuditQueryService {
  constructor(
    @Inject(AUDIT_QUERY_REPOSITORY) private readonly repository: AuditQueryRepository,
    private readonly auditService: AuditService,
  ) {}

  search(
    input: AuditLogFilterInput,
    page: { page: number; pageSize: number; sortBy: AuditSortField; sortOrder: 'asc' | 'desc' },
  ): Promise<Page<AuditLogRecord>> {
    return this.repository.search(buildAuditFilter(input), page);
  }

  listEventNames(): Promise<string[]> {
    return this.repository.listEventNames(MAX_EVENT_NAMES);
  }

  /**
   * CSV con los filtros activos, como mucho `MAX_EXPORT_ROWS` filas (las más
   * recientes). La exportación extrae datos personales en bloque, así que
   * deja su propio registro `audit_log.exported` con los filtros y las filas.
   */
  async export(input: AuditLogFilterInput, context: AuditContext): Promise<AuditExport> {
    const filter = buildAuditFilter(input);
    const fetched = await this.repository.findForExport(filter, MAX_EXPORT_ROWS + 1);
    const truncated = fetched.length > MAX_EXPORT_ROWS;
    const rows = truncated ? fetched.slice(0, MAX_EXPORT_ROWS) : fetched;

    await this.auditService.record('audit_log.exported', context, {
      resourceType: 'audit_log',
      resourceId: '*',
      metadata: { ...describeAuditFilter(input), rows: rows.length, truncated },
    });

    return { csv: toCsv(rows, CSV_COLUMNS), rows: rows.length, truncated };
  }
}
