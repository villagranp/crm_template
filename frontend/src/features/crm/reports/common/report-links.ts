import { ROUTE_PATHS } from '@/routes/route-paths';

import { monthKey } from './report-format';
import type { ReportPeriod } from './report-period';
import type { ForecastMonthRef } from './report-types';

/**
 * Enlaces del dashboard y el embudo a un reporte con el filtro aplicado (05 E.7 "clic en una
 * barra navega al reporte correspondiente", E.8). Usan los nombres de parámetro de la URL de
 * cada reporte (= los de la API, P-05.19); los valores vacíos no se escriben.
 */

type Params = Readonly<Record<string, string | null | undefined>>;

export function reportHref(path: string, params: Params): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}

export interface OpportunityLinkFilters {
  stageId?: string;
  ownerId?: string;
  countryId?: string;
  customerId?: string;
  /** Período por fecha de identificación (`IDENTIFIED`), el mismo conjunto del panel o del embudo. */
  period?: ReportPeriod | null;
}

/** Reporte de oportunidades (F-35) con etapa, asesor, país, cliente y período `IDENTIFIED`. */
export function opportunitiesReportHref({ stageId, ownerId, countryId, customerId, period }: OpportunityLinkFilters): string {
  return reportHref(ROUTE_PATHS.reports.opportunities, {
    stageId,
    ownerId,
    countryId,
    customerId,
    from: period?.from,
    to: period?.to,
    dateBasis: period ? 'IDENTIFIED' : undefined,
  });
}

/** Reporte de proyectos (F-34) de una fase, sólo activos (RN-05.15), con asesor y país. */
export function activeProjectsReportHref({ phaseId, ownerId, countryId }: { phaseId: string; ownerId?: string; countryId?: string }): string {
  return reportHref(ROUTE_PATHS.reports.projects, { phaseId, situation: 'ACTIVE', ownerId, countryId });
}

/** Reporte de forecast (F-36) de un mes, con asesor y país. */
export function forecastMonthReportHref({ month, ownerId, countryId }: { month: ForecastMonthRef; ownerId?: string; countryId?: string }): string {
  const key = monthKey(month);
  return reportHref(ROUTE_PATHS.reports.forecast, { fromMonth: key, toMonth: key, ownerId, countryId });
}
