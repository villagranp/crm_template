import type { ListQuery } from '@/lib/query-keys';
import { httpClient } from '@/services/api';

import type { ForecastMonthRef, ReportLabelRef, ReportUserRef } from '../common/report-types';
import type { ReportStageCount } from '../opportunities/opportunities-report.api';

/**
 * Dashboard comercial (05 F-40, E.7, P-05.14): `GET /reports/dashboard` (paneles de estado y
 * distribuciones) y `GET /reports/dashboard/trends` (series mensuales). Espejo de
 * `CommercialDashboardDto` y `CommercialTrendsDto`; decimales como cadena.
 */

/** Filtros del dashboard (F.2 `DashboardQueryDto`): período, país y asesor. Un valor por filtro en la URL (P-05.19). */
export const DASHBOARD_FILTER_KEYS = ['countryId', 'ownerId'] as const;
export type DashboardFilterKey = (typeof DASHBOARD_FILTER_KEYS)[number];

/** Máximo del período del dashboard en meses de calendario (P-05.14, `422 PERIOD_TOO_LONG`). */
export const DASHBOARD_MAX_MONTHS = 24;

export interface ReportPeriodRange {
  from: string;
  /** Incluido. */
  to: string;
}

export interface DashboardPhaseCount {
  phase: ReportLabelRef & { code: string; order: number };
  count: number;
}

export interface DashboardWonLostMonth extends ForecastMonthRef {
  /** WON + PARTIAL (DM-15). */
  won: number;
  /** Sólo WON (base del apilado). */
  wonFull: number;
  partial: number;
  lost: number;
}

export interface DashboardForecastMonth extends ForecastMonthRef {
  tonnage: string;
  cumulative: string;
  lineCount: number;
  linesWithoutConversion: number;
}

export interface DashboardOwnerRow {
  /** `null` = "Otros" (fuera del top 10). */
  owner: ReportUserRef | null;
  openOpportunities: number;
  won: number;
  forecastTonnage: string;
}

export interface DashboardActivityVisitMonth extends ForecastMonthRef {
  activitiesCompleted: number;
  visitsCompleted: number;
  visitsCancelled: number;
}

export interface CommercialDashboard {
  period: ReportPeriodRange;
  activeProjects: { count: number; byPhase: DashboardPhaseCount[] };
  opportunitiesByStage: ReportStageCount[];
  wonLostByMonth: DashboardWonLostMonth[];
  forecastRange: { from: ForecastMonthRef; to: ForecastMonthRef };
  forecastByMonth: DashboardForecastMonth[];
  tonnageUnit: string;
  byOwner: DashboardOwnerRow[];
  activityVisitByMonth: DashboardActivityVisitMonth[];
}

export const TREND_METRICS = ['OPPORTUNITIES_IDENTIFIED', 'WON', 'LOST', 'ACTIVITIES_COMPLETED', 'VISITS_COMPLETED'] as const;
export type TrendMetric = (typeof TREND_METRICS)[number];

export interface TrendPoint extends ForecastMonthRef {
  value: number;
}

export interface CommercialTrends {
  period: ReportPeriodRange;
  series: { metric: TrendMetric; points: TrendPoint[] }[];
}

export function getCommercialDashboard(query: ListQuery): Promise<CommercialDashboard> {
  return httpClient.get<CommercialDashboard>('/reports/dashboard', { query });
}

export function getCommercialTrends(query: ListQuery): Promise<CommercialTrends> {
  return httpClient.get<CommercialTrends>('/reports/dashboard/trends', { query });
}
