import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListQuery } from '@/lib/query-keys';

import { reportKeys } from './filter-options.queries';
import { getActivityReportSummary, listActivityReport } from './activities/activities-report.api';
import { getCommercialDashboard, getCommercialTrends } from './dashboard/dashboard.api';
import { getForecastReportSummary, listForecastConsolidated, listForecastReport } from './forecast/forecast-report.api';
import { getSalesFunnel } from './funnel/funnel.api';
import { getOpportunityReportSummary, listOpportunityReport } from './opportunities/opportunities-report.api';
import { listProjectReport } from './projects/projects-report.api';
import { getVisitReportSummary, listVisitReport } from './visits/visits-report.api';

/**
 * Consultas de los cinco reportes, el dashboard y el embudo (05 F.1) bajo `['crm', 'reports', <reporte>, …]`. Las listas
 * conservan la página anterior mientras llega la nueva (`keepPreviousData`); los resúmenes se
 * piden con **los mismos filtros** que la lista (RN-05.9: todos los números de una pantalla
 * usan el mismo conjunto).
 */

export const reportQueryKeys = {
  list: (report: string, query: ListQuery) => [...reportKeys.all, report, 'list', query] as const,
  summary: (report: string, query: ListQuery) => [...reportKeys.all, report, 'summary', query] as const,
};

export function useProjectReport(query: ListQuery) {
  return useQuery({ queryKey: reportQueryKeys.list('projects', query), queryFn: () => listProjectReport(query), placeholderData: keepPreviousData });
}

export function useOpportunityReport(query: ListQuery) {
  return useQuery({ queryKey: reportQueryKeys.list('opportunities', query), queryFn: () => listOpportunityReport(query), placeholderData: keepPreviousData });
}

export function useOpportunityReportSummary(query: ListQuery) {
  return useQuery({ queryKey: reportQueryKeys.summary('opportunities', query), queryFn: () => getOpportunityReportSummary(query), placeholderData: keepPreviousData });
}

export function useForecastReport(query: ListQuery, enabled = true) {
  return useQuery({
    queryKey: reportQueryKeys.list('forecast', query),
    queryFn: () => listForecastReport(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useForecastConsolidated(query: ListQuery, enabled = true) {
  return useQuery({
    queryKey: [...reportKeys.all, 'forecast', 'consolidated', query] as const,
    queryFn: () => listForecastConsolidated(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useForecastReportSummary(query: ListQuery) {
  return useQuery({ queryKey: reportQueryKeys.summary('forecast', query), queryFn: () => getForecastReportSummary(query), placeholderData: keepPreviousData });
}

export function useVisitReport(query: ListQuery) {
  return useQuery({ queryKey: reportQueryKeys.list('visits', query), queryFn: () => listVisitReport(query), placeholderData: keepPreviousData });
}

export function useVisitReportSummary(query: ListQuery) {
  return useQuery({ queryKey: reportQueryKeys.summary('visits', query), queryFn: () => getVisitReportSummary(query), placeholderData: keepPreviousData });
}

export function useActivityReport(query: ListQuery) {
  return useQuery({ queryKey: reportQueryKeys.list('activities', query), queryFn: () => listActivityReport(query), placeholderData: keepPreviousData });
}

export function useActivityReportSummary(query: ListQuery) {
  return useQuery({ queryKey: reportQueryKeys.summary('activities', query), queryFn: () => getActivityReportSummary(query), placeholderData: keepPreviousData });
}

/** Paneles del dashboard (F-40): un panel falla junto a los demás de este endpoint; las tendencias, por separado. */
export function useCommercialDashboard(query: ListQuery) {
  return useQuery({ queryKey: [...reportKeys.all, 'dashboard', query] as const, queryFn: () => getCommercialDashboard(query), placeholderData: keepPreviousData });
}

/** Tendencias del dashboard (F-40, RN-05.52): consulta propia, carga y falla por separado (AC-05.32). */
export function useCommercialTrends(query: ListQuery) {
  return useQuery({ queryKey: [...reportKeys.all, 'dashboard', 'trends', query] as const, queryFn: () => getCommercialTrends(query), placeholderData: keepPreviousData });
}

/** Embudo comercial (F-41). */
export function useSalesFunnel(query: ListQuery) {
  return useQuery({ queryKey: [...reportKeys.all, 'funnel', query] as const, queryFn: () => getSalesFunnel(query), placeholderData: keepPreviousData });
}
