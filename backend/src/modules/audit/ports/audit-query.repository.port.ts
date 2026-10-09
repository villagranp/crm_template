import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';

export const AUDIT_QUERY_REPOSITORY = Symbol('AUDIT_QUERY_REPOSITORY');

/** Registro de la bitácora tal como se consulta. `changes` y `metadata` van como se guardaron. */
export interface AuditLogRecord {
  id: string;
  occurredAt: Date;
  event: string;
  correlationId: string;
  subjectId: string | null;
  subjectEmail: string | null;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  changes: unknown;
  metadata: unknown;
}

export const AUDIT_SORTABLE_FIELDS = ['occurredAt', 'event'] as const;
export type AuditSortField = (typeof AUDIT_SORTABLE_FIELDS)[number];

/**
 * Criterios ya normalizados por `buildAuditFilter`. El adaptador sólo los
 * traduce; no decide nada.
 */
export interface AuditLogFilter {
  /** Coincidencia exacta del evento. Excluyente con `eventPrefix`. */
  event?: string;
  /** Prefijo del evento (`auth.` → todos los de autenticación). */
  eventPrefix?: string;
  /** Texto libre sobre el actor: contenido en el correo o igual al identificador. */
  subjectSearch?: string;
  subjectId?: string;
  resourceType?: string;
  resourceId?: string;
  correlationId?: string;
  /** Inclusivo. */
  occurredFrom?: Date;
  /** Exclusivo. */
  occurredBefore?: Date;
}

export interface AuditLogPageRequest extends PageRequest {
  sortBy: AuditSortField;
  sortOrder: 'asc' | 'desc';
}

/**
 * Puerto de consulta de la bitácora (ADR-004). Separado del de escritura
 * (`AuditRepository`) para que quien sólo registra eventos no dependa de la
 * consulta.
 */
export interface AuditQueryRepository {
  search(filter: AuditLogFilter, page: AuditLogPageRequest): Promise<Page<AuditLogRecord>>;
  /** Más recientes primero, como mucho `limit` filas. */
  findForExport(filter: AuditLogFilter, limit: number): Promise<AuditLogRecord[]>;
  /** Nombres de evento distintos, ordenados, como mucho `limit`. */
  listEventNames(limit: number): Promise<string[]>;
}
