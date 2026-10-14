import type { ListQuery } from '@/lib/query-keys';
import { httpClient, type DownloadedFile } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

import { EXPORT_TIMEOUT_MS } from '../common/use-report-export';
import type { ReportLabelRef, ReportNamedRef, ReportProjectRef, ReportUserRef, VisitCategory } from '../common/report-types';

/** Reporte de visitas (05 F-37, E.5). Una fila por visita (RN-05.39). */

export interface VisitReportRow {
  id: string;
  code: string;
  customer: ReportNamedRef;
  project: ReportProjectRef | null;
  owner: ReportUserRef;
  /** Fecha planificada **vigente**. */
  scheduledStartAt: string;
  originalScheduledAt: string;
  rescheduleCount: number;
  actualStartAt: string | null;
  status: ReportLabelRef & { category: VisitCategory };
  result: ReportLabelRef | null;
  resultSummary: string | null;
  confirmedAt: string | null;
}

export interface VisitReportSummary {
  total: number;
  scheduled: number;
  completed: number;
  confirmed: number;
  cancelled: number;
  completedTotal: number;
  rescheduledVisits: number;
  rescheduleEvents: number;
  overduePending: number;
}

export const VISIT_REPORT_SORT_FIELDS = ['scheduledStartAt', 'actualStartAt', 'confirmedAt', 'customerName', 'ownerName', 'statusOrder'] as const;

export const VISIT_REPORT_FILTER_KEYS = ['ownerId', 'customerId', 'countryId', 'projectId', 'statusCategory', 'statusId'] as const;
export type VisitReportFilterKey = (typeof VISIT_REPORT_FILTER_KEYS)[number];

/** Bases de fecha (C.2): por defecto `SCHEDULED` (la vigente). */
export const VISIT_DATE_BASES = ['SCHEDULED', 'ACTUAL', 'CONFIRMED'] as const;

export function listVisitReport(query: ListQuery): Promise<PaginatedResponse<VisitReportRow>> {
  return httpClient.get<PaginatedResponse<VisitReportRow>>('/reports/visits', { query });
}

export function getVisitReportSummary(query: ListQuery): Promise<VisitReportSummary> {
  return httpClient.get<VisitReportSummary>('/reports/visits/summary', { query });
}

export function exportVisitReport(query: ListQuery): Promise<DownloadedFile> {
  return httpClient.download('/reports/visits/export', { query, timeoutMs: EXPORT_TIMEOUT_MS });
}
