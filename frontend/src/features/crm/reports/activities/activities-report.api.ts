import type { ListQuery } from '@/lib/query-keys';
import { httpClient, type DownloadedFile } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

import { EXPORT_TIMEOUT_MS } from '../common/use-report-export';
import type { ActivityCategory, ReportLabelRef, ReportNamedRef, ReportProjectRef, ReportUserRef } from '../common/report-types';

/** Reporte de actividades (05 F-38, E.6). */

export interface ActivityReportRow {
  id: string;
  code: string;
  type: ReportLabelRef;
  subject: string;
  customer: ReportNamedRef;
  project: ReportProjectRef | null;
  owner: ReportUserRef;
  /** `COALESCE(scheduled_at, due_at)`. */
  activityDate: string | null;
  dueAt: string | null;
  priority: ReportLabelRef & { weight: number };
  status: ReportLabelRef & { category: ActivityCategory };
  isOverdue: boolean;
  result: ReportLabelRef | null;
  resultNotes: string | null;
}

export interface ActivityReportSummary {
  total: number;
  pending: number;
  overdue: number;
  completed: number;
  cancelled: number;
  dueSoon: number;
  dueSoonHours: number;
}

export const ACTIVITY_REPORT_SORT_FIELDS = ['activityDate', 'dueAt', 'priorityWeight', 'customerName', 'ownerName', 'typeName'] as const;

export const ACTIVITY_REPORT_FILTER_KEYS = ['ownerId', 'customerId', 'countryId', 'typeId', 'statusCategory', 'statusId', 'priorityId'] as const;
export type ActivityReportFilterKey = (typeof ACTIVITY_REPORT_FILTER_KEYS)[number];

/** Bases de fecha (C.2): por defecto `ACTIVITY_DATE`. */
export const ACTIVITY_DATE_BASES = ['ACTIVITY_DATE', 'DUE', 'COMPLETED'] as const;

export function listActivityReport(query: ListQuery): Promise<PaginatedResponse<ActivityReportRow>> {
  return httpClient.get<PaginatedResponse<ActivityReportRow>>('/reports/activities', { query });
}

export function getActivityReportSummary(query: ListQuery): Promise<ActivityReportSummary> {
  return httpClient.get<ActivityReportSummary>('/reports/activities/summary', { query });
}

export function exportActivityReport(query: ListQuery): Promise<DownloadedFile> {
  return httpClient.download('/reports/activities/export', { query, timeoutMs: EXPORT_TIMEOUT_MS });
}
