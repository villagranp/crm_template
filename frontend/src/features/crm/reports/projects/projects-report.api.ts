import type { ListQuery } from '@/lib/query-keys';
import { httpClient, type DownloadedFile } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

import { EXPORT_TIMEOUT_MS } from '../common/use-report-export';
import type { ReportLabelRef, ReportNamedRef, ReportUserRef } from '../common/report-types';

/** Reporte de proyectos (05 F-34, E.2): `ProjectReportRowDto` y sus consultas. */

export type ProjectCommercialStatusKind = 'OPEN_STAGE' | 'WON' | 'LOST' | 'NO_OPPORTUNITIES';

export interface ProjectReportRow {
  id: string;
  code: string;
  name: string;
  customer: ReportNamedRef;
  country: ReportNamedRef;
  city: string | null;
  owner: ReportUserRef;
  projectType: ReportLabelRef | null;
  phase: ReportLabelRef & { isFinal: boolean };
  /** % de avance con 2 decimales (`"45.00"`). */
  phaseProgress: string;
  commercialStatus: { kind: ProjectCommercialStatusKind; label: string; stage: ReportLabelRef | null };
  estimatedDecisionDate: string | null;
  lastActivityAt: string;
}

/** Lista blanca de `sortBy` (E.2). */
export const PROJECT_REPORT_SORT_FIELDS = [
  'code',
  'name',
  'customerName',
  'countryName',
  'ownerName',
  'phaseOrder',
  'phaseProgress',
  'estimatedDecisionDate',
  'lastActivityAt',
] as const;

/** Filtros de la pantalla (nombres de parámetro de la API, sin el período ni la búsqueda). */
export const PROJECT_REPORT_FILTER_KEYS = [
  'countryId',
  'city',
  'ownerId',
  'customerId',
  'projectTypeId',
  'phaseId',
  'commercialStatus',
  'situation',
] as const;

export type ProjectReportFilterKey = (typeof PROJECT_REPORT_FILTER_KEYS)[number];

/** Bases de fecha del período (C.2): proyectos no tiene base por defecto. */
export const PROJECT_DATE_BASES = ['DECISION_ESTIMATED', 'UPDATED', 'CREATED'] as const;

export function listProjectReport(query: ListQuery): Promise<PaginatedResponse<ProjectReportRow>> {
  return httpClient.get<PaginatedResponse<ProjectReportRow>>('/reports/projects', { query });
}

/** `GET /reports/projects/export`: mismos filtros y orden, sin paginación, `format=xlsx` (F-39). */
export function exportProjectReport(query: ListQuery): Promise<DownloadedFile> {
  return httpClient.download('/reports/projects/export', { query, timeoutMs: EXPORT_TIMEOUT_MS });
}
