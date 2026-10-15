import type { ListQuery } from '@/lib/query-keys';
import { httpClient, type DownloadedFile } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

import { EXPORT_TIMEOUT_MS } from '../common/use-report-export';
import type { ForecastMonthRef, ReportNamedRef, ReportProjectRef, ReportUnitRef, ReportUserRef } from '../common/report-types';

/** Reporte de forecast (05 F-36, E.4): detalle, consolidado, resumen y exportación. */

export interface ForecastReportRow {
  id: string;
  project: ReportProjectRef;
  customer: ReportNamedRef;
  product: { id: string; sku: string; description: string };
  family: ReportNamedRef;
  year: number;
  month: number;
  quantity: string;
  unit: ReportUnitRef;
  /** `null` = sin conversión (DM-24). */
  tonnage: string | null;
  owner: ReportUserRef;
  updatedAt: string;
}

export interface ForecastUnitQuantity {
  unit: ReportUnitRef;
  quantity: string;
}

export interface ForecastTotals {
  tonnage: string;
  quantities: ForecastUnitQuantity[];
  lineCount: number;
  linesWithoutConversion: number;
}

export interface ForecastMonthSummary {
  year: number;
  month: number;
  tonnage: string;
  cumulativeTonnage: string;
  quantities: (ForecastUnitQuantity & { cumulative: string })[];
  lineCount: number;
  linesWithoutConversion: number;
}

export interface ForecastReportSummary {
  range: { from: ForecastMonthRef; to: ForecastMonthRef };
  months: ForecastMonthSummary[];
  totals: ForecastTotals;
  tonnageUnit: string;
  lastUpdatedAt: string | null;
  lineCount: number;
}

export const FORECAST_GROUP_BY = ['MONTH', 'PRODUCT', 'FAMILY', 'PROJECT', 'CUSTOMER', 'OWNER'] as const;
export type ForecastGroupBy = (typeof FORECAST_GROUP_BY)[number];

export interface ForecastGroupKey {
  type: ForecastGroupBy;
  id: string | null;
  label: string;
}

export interface ForecastGroupMonth extends ForecastTotals {
  year: number;
  month: number;
}

export interface ForecastSubgroup {
  key: ForecastGroupKey;
  months: ForecastGroupMonth[];
  total: ForecastTotals;
}

export interface ForecastGroup extends ForecastSubgroup {
  subgroups: ForecastSubgroup[] | null;
}

/** Lista blanca de `sortBy` del detalle (E.4; `period` = año y mes, P-05.4). */
export const FORECAST_REPORT_SORT_FIELDS = ['period', 'projectName', 'productSku', 'familyName', 'ownerName', 'tonnage', 'updatedAt'] as const;

export const FORECAST_REPORT_FILTER_KEYS = ['projectId', 'customerId', 'productId', 'productFamilyId', 'ownerId', 'countryId'] as const;
export type ForecastReportFilterKey = (typeof FORECAST_REPORT_FILTER_KEYS)[number];

export function listForecastReport(query: ListQuery): Promise<PaginatedResponse<ForecastReportRow>> {
  return httpClient.get<PaginatedResponse<ForecastReportRow>>('/reports/forecast', { query });
}

export function listForecastConsolidated(query: ListQuery): Promise<PaginatedResponse<ForecastGroup>> {
  return httpClient.get<PaginatedResponse<ForecastGroup>>('/reports/forecast/consolidated', { query });
}

export function getForecastReportSummary(query: ListQuery): Promise<ForecastReportSummary> {
  return httpClient.get<ForecastReportSummary>('/reports/forecast/summary', { query });
}

/** Con `groupBy` (y `thenBy` opcional), el libro añade la hoja "Consolidado" (F.1). */
export function exportForecastReport(query: ListQuery): Promise<DownloadedFile> {
  return httpClient.download('/reports/forecast/export', { query, timeoutMs: EXPORT_TIMEOUT_MS });
}
