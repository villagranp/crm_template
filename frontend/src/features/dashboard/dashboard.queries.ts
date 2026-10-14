import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useCan } from '@/hooks/use-permission';
import { createScopedQueryKeys } from '@/lib/query-keys';
import type { ApiError } from '@/services/api';

import {
  getActivityIndicators,
  getAlertsSummary,
  getForecastIndicators,
  getOpportunityIndicators,
  getProjectIndicators,
  getTargetIndicators,
  getVisitIndicators,
  listAlerts,
  listRecentActivity,
  listUpcomingVisits,
} from './dashboard.api';
import { resolveDashboardAccess, type DashboardAccess } from './dashboard.permissions';
import type {
  ActivityIndicators,
  AlertsQuery,
  AlertsSummary,
  DashboardPeriod,
  ForecastIndicators,
  OpportunityIndicators,
  PaginatedAlerts,
  PaginatedRecentActivity,
  PaginatedUpcomingVisits,
  ProjectIndicators,
  RecentActivityQuery,
  TargetIndicators,
  VisitIndicators,
} from './dashboard.types';

/**
 * Estado de servidor del Panel de control.
 *
 * - Claves bajo `['dashboard', …]`.
 * - RN-01.29: nada se guarda más de 60 s (`staleTime`), se vuelve a pedir al
 *   recuperar el foco y al volver a la pantalla (`refetchOnMount: 'always'`),
 *   así que una alerta resuelta en otro módulo desaparece al volver a `/`.
 * - RN-01.4: cada hook recibe `enabled` con el permiso de su bloque; sin él
 *   **no hay petición** (RN-01.7: sin ningún permiso de fuente, cero
 *   peticiones a `/dashboard/*`).
 */

const DASHBOARD_STALE_TIME_MS = 60_000;

const FRESHNESS = {
  staleTime: DASHBOARD_STALE_TIME_MS,
  refetchOnWindowFocus: true,
  refetchOnMount: 'always',
} as const;

const indicatorKeys = createScopedQueryKeys('dashboard', 'indicators');
const alertKeys = createScopedQueryKeys('dashboard', 'alerts');

export const dashboardKeys = {
  all: ['dashboard'] as const,
  indicators: (source: string, period?: DashboardPeriod) =>
    period
      ? ([...indicatorKeys.all, source, period] as const)
      : ([...indicatorKeys.all, source] as const),
  upcomingVisits: (pageSize: number) => ['dashboard', 'upcoming-visits', pageSize] as const,
  recentActivity: (query: RecentActivityQuery) => ['dashboard', 'recent-activity', query] as const,
  alerts: (query: AlertsQuery) => [...alertKeys.all, 'list', query] as const,
  alertsSummary: () => [...alertKeys.all, 'summary'] as const,
};

/** Qué bloques del panel puede ver la sesión (permisos efectivos de `/me`, vía la sesión). */
export function useDashboardAccess(): DashboardAccess {
  const can = useCan();
  return useMemo(() => resolveDashboardAccess(can), [can]);
}

export function useProjectIndicators(enabled: boolean) {
  return useQuery<ProjectIndicators, ApiError>({
    queryKey: dashboardKeys.indicators('projects'),
    queryFn: getProjectIndicators,
    enabled,
    ...FRESHNESS,
  });
}

export function useOpportunityIndicators(period: DashboardPeriod, enabled: boolean) {
  return useQuery<OpportunityIndicators, ApiError>({
    queryKey: dashboardKeys.indicators('opportunities', period),
    queryFn: () => getOpportunityIndicators(period),
    enabled,
    placeholderData: keepPreviousData,
    ...FRESHNESS,
  });
}

export function useForecastIndicators(enabled: boolean) {
  return useQuery<ForecastIndicators, ApiError>({
    queryKey: dashboardKeys.indicators('forecast'),
    queryFn: getForecastIndicators,
    enabled,
    ...FRESHNESS,
  });
}

export function useVisitIndicators(enabled: boolean) {
  return useQuery<VisitIndicators, ApiError>({
    queryKey: dashboardKeys.indicators('visits'),
    queryFn: getVisitIndicators,
    enabled,
    ...FRESHNESS,
  });
}

export function useActivityIndicators(enabled: boolean) {
  return useQuery<ActivityIndicators, ApiError>({
    queryKey: dashboardKeys.indicators('activities'),
    queryFn: getActivityIndicators,
    enabled,
    ...FRESHNESS,
  });
}

export function useTargetIndicators(period: DashboardPeriod, enabled: boolean) {
  return useQuery<TargetIndicators, ApiError>({
    queryKey: dashboardKeys.indicators('targets', period),
    queryFn: () => getTargetIndicators(period),
    enabled,
    placeholderData: keepPreviousData,
    ...FRESHNESS,
  });
}

export function useUpcomingVisits(pageSize: number, enabled: boolean) {
  return useQuery<PaginatedUpcomingVisits, ApiError>({
    queryKey: dashboardKeys.upcomingVisits(pageSize),
    queryFn: () => listUpcomingVisits(pageSize),
    enabled,
    placeholderData: keepPreviousData,
    ...FRESHNESS,
  });
}

/** Actividad reciente con "Cargar más" (paginación de servidor, RN-01.24). */
export function useRecentActivity(query: RecentActivityQuery, enabled: boolean) {
  return useInfiniteQuery<PaginatedRecentActivity, ApiError>({
    queryKey: dashboardKeys.recentActivity(query),
    queryFn: ({ pageParam }) => listRecentActivity({ ...query, page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    enabled,
    ...FRESHNESS,
  });
}

export function useAlerts(query: AlertsQuery, enabled: boolean) {
  return useQuery<PaginatedAlerts, ApiError>({
    queryKey: dashboardKeys.alerts(query),
    queryFn: () => listAlerts(query),
    enabled,
    placeholderData: keepPreviousData,
    ...FRESHNESS,
  });
}

export function useAlertsSummary(enabled: boolean) {
  return useQuery<AlertsSummary, ApiError>({
    queryKey: dashboardKeys.alertsSummary(),
    queryFn: getAlertsSummary,
    enabled,
    ...FRESHNESS,
  });
}
