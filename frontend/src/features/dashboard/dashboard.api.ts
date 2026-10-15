import { httpClient } from '@/services/api';

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
  SafetyMinuteResponse,
  TargetIndicators,
  VisitIndicators,
} from './dashboard.types';

/**
 * Cliente HTTP del Panel de control (01 §F.1): los 10 `GET` de `/dashboard`,
 * siempre a través de `httpClient` (nunca `fetch`).
 */

const BASE = '/dashboard';

export function getProjectIndicators(): Promise<ProjectIndicators> {
  return httpClient.get<ProjectIndicators>(`${BASE}/indicators/projects`);
}

export function getOpportunityIndicators(period: DashboardPeriod): Promise<OpportunityIndicators> {
  return httpClient.get<OpportunityIndicators>(`${BASE}/indicators/opportunities`, {
    query: { period },
  });
}

export function getForecastIndicators(): Promise<ForecastIndicators> {
  return httpClient.get<ForecastIndicators>(`${BASE}/indicators/forecast`);
}

export function getVisitIndicators(): Promise<VisitIndicators> {
  return httpClient.get<VisitIndicators>(`${BASE}/indicators/visits`);
}

export function getActivityIndicators(): Promise<ActivityIndicators> {
  return httpClient.get<ActivityIndicators>(`${BASE}/indicators/activities`);
}

export function getTargetIndicators(period: DashboardPeriod): Promise<TargetIndicators> {
  return httpClient.get<TargetIndicators>(`${BASE}/indicators/targets`, { query: { period } });
}

/** Próximas visitas (orden fijo `scheduledStartAt` ascendente, lo decide el backend). */
export function listUpcomingVisits(pageSize: number): Promise<PaginatedUpcomingVisits> {
  return httpClient.get<PaginatedUpcomingVisits>(`${BASE}/upcoming-visits`, {
    query: { page: 1, pageSize },
  });
}

export function listRecentActivity(
  query: RecentActivityQuery & { page: number },
): Promise<PaginatedRecentActivity> {
  return httpClient.get<PaginatedRecentActivity>(`${BASE}/recent-activity`, {
    query: { ...query },
  });
}

export function listAlerts(query: AlertsQuery): Promise<PaginatedAlerts> {
  return httpClient.get<PaginatedAlerts>(`${BASE}/alerts`, { query: { ...query } });
}

export function getAlertsSummary(): Promise<AlertsSummary> {
  return httpClient.get<AlertsSummary>(`${BASE}/alerts/summary`);
}

/** `GET /me/safety-minute`: mensaje del día para toda sesión autenticada (sin permiso adicional). */
export function getSafetyMinute(): Promise<SafetyMinuteResponse> {
  return httpClient.get<SafetyMinuteResponse>('/me/safety-minute');
}
