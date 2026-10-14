import type { ListQuery } from '@/lib/query-keys';
import { httpClient, type DownloadedFile } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

import { EXPORT_TIMEOUT_MS } from '../common/use-report-export';
import type { ReportLabelRef, ReportNamedRef, ReportProjectRef, ReportUserRef } from '../common/report-types';

/** Reporte de oportunidades (05 F-35, E.3): filas, resumen y exportación. */

export type OpportunityOutcome = 'WON' | 'LOST' | 'PARTIAL';

export interface OpportunityReportEstimate {
  /** Monto original en su moneda. */
  amount: string | null;
  currencyCode: string | null;
  /** Unidades por 1 USD (foto al registrar). */
  exchangeRate: string | null;
  /** `null` en USD. */
  exchangeRateDate: string | null;
  /** Equivalente en USD guardado (`estimated_amount_usd`). */
  amountUsd: string | null;
  tonnage: string | null;
}

export interface OpportunityReportRow {
  id: string;
  code: string;
  project: ReportProjectRef;
  customer: ReportNamedRef;
  owner: ReportUserRef;
  stage: ReportLabelRef & { isClosed: boolean };
  result: { outcome: OpportunityOutcome; reason: ReportLabelRef | null; awardedPercent: string | null } | null;
  estimate: OpportunityReportEstimate;
  decisionDate: string | null;
  decisionDateKind: 'ACTUAL' | 'ESTIMATED' | null;
  updatedAt: string;
}

export interface ReportStageCount {
  stage: ReportLabelRef & { code: string; order: number; isClosed: boolean; isActive: boolean };
  count: number;
}

export interface ReportOwnerCount {
  owner: ReportUserRef;
  total: number;
  open: number;
  won: number;
  partial: number;
  lost: number;
}

export type LocalReferenceUnavailableReason = 'MULTIPLE_COUNTRIES' | 'BASE_CURRENCY' | 'EXCHANGE_RATE_NOT_FOUND';

export interface LocalCurrencyReference {
  currencyCode: string;
  amount: string;
  exchangeRate: string;
  exchangeRateDate: string;
  cutDate: string;
  label: 'referencial';
}

export interface OpportunityReportSummary {
  total: number;
  open: number;
  /** Ganadas = WON + PARTIAL (DM-15). */
  won: number;
  wonFull: number;
  partial: number;
  lost: number;
  closedWithoutResult: number;
  byStage: ReportStageCount[];
  byOwner: ReportOwnerCount[];
  estimateTotals: {
    /** El único total (RN-05.13). */
    amountUsd: string;
    currencyCode: string;
    tonnage: string;
    localReference: LocalCurrencyReference | null;
    localReferenceUnavailableReason: LocalReferenceUnavailableReason | null;
  };
}

/** Lista blanca de `sortBy` (E.3). */
export const OPPORTUNITY_REPORT_SORT_FIELDS = [
  'code',
  'projectName',
  'customerName',
  'ownerName',
  'stageOrder',
  'estimatedAmountUsd',
  'decisionDate',
  'updatedAt',
] as const;

export const OPPORTUNITY_REPORT_FILTER_KEYS = ['ownerId', 'customerId', 'countryId', 'status', 'stageId', 'productId', 'productFamilyId'] as const;

export type OpportunityReportFilterKey = (typeof OPPORTUNITY_REPORT_FILTER_KEYS)[number];

/** Filtro de estado (RN-05.32). */
export const OPPORTUNITY_STATUS_FILTERS = ['OPEN', 'CLOSED', 'WON', 'PARTIAL', 'LOST', 'CLOSED_NO_RESULT'] as const;
export type OpportunityStatusFilter = (typeof OPPORTUNITY_STATUS_FILTERS)[number];

/** Bases de fecha (C.2): por defecto `IDENTIFIED`. */
export const OPPORTUNITY_DATE_BASES = ['IDENTIFIED', 'DECIDED', 'UPDATED'] as const;

export function listOpportunityReport(query: ListQuery): Promise<PaginatedResponse<OpportunityReportRow>> {
  return httpClient.get<PaginatedResponse<OpportunityReportRow>>('/reports/opportunities', { query });
}

export function getOpportunityReportSummary(query: ListQuery): Promise<OpportunityReportSummary> {
  return httpClient.get<OpportunityReportSummary>('/reports/opportunities/summary', { query });
}

export function exportOpportunityReport(query: ListQuery): Promise<DownloadedFile> {
  return httpClient.download('/reports/opportunities/export', { query, timeoutMs: EXPORT_TIMEOUT_MS });
}
