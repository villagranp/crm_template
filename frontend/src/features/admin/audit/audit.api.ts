import type { ListQuery, Paginated } from '@/features/admin/common';
import { type DownloadedFile, httpClient } from '@/services/api';

/**
 * Cliente de `/audit-logs` (PLAN-ADMIN, D11 y D13). Los tipos reflejan
 * `backend/src/modules/audit/dto/audit-log.dto.ts`.
 */

export interface AuditLogEntry {
  id: string;
  occurredAt: string;
  event: string;
  correlationId: string;
  subjectId: string | null;
  subjectEmail: string | null;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  /** Diferencia `{ campo: { before, after } }` tal como se guardó. */
  changes: unknown;
  metadata: unknown;
}

/** Filtros de la API; los mismos en la consulta y en la exportación. */
export const AUDIT_FILTER_KEYS = ['event', 'subjectId', 'resourceType', 'resourceId', 'correlationId', 'from', 'to'] as const;
export type AuditFilterKey = (typeof AUDIT_FILTER_KEYS)[number];

const AUDIT_PATH = '/audit-logs';

export function listAuditLogs(query: ListQuery): Promise<Paginated<AuditLogEntry>> {
  return httpClient.get<Paginated<AuditLogEntry>>(AUDIT_PATH, { query });
}

export async function listAuditEvents(): Promise<string[]> {
  const response = await httpClient.get<{ data: string[] }>(`${AUDIT_PATH}/events`);
  return response.data;
}

/**
 * Descarga el CSV de la bitácora con los filtros activos. Pasa por el cliente
 * HTTP: el access token vive en memoria, así que un `<a href>` no autenticaría.
 */
export function exportAuditLogs(filters: ListQuery): Promise<DownloadedFile> {
  return httpClient.download(`${AUDIT_PATH}/export`, { query: filters });
}
