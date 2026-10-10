import type { AuditChanges } from '../audit-diff';

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');

export interface AuditRecordInput {
  event: string;
  correlationId: string;
  subjectId: string | null;
  subjectEmail: string | null;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  changes: AuditChanges | null;
  metadata: Record<string, string | number | boolean | null> | null;
}

/**
 * Puerto de la bitácora (ADR-004). La escritura es de esta base común; la
 * consulta y la exportación las añade el paso de Auditoría de PLAN-ADMIN.
 */
export interface AuditRepository {
  record(entry: AuditRecordInput): Promise<void>;
}
