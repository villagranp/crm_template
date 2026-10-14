import type { CalendarDate } from '@/common/calendar-date';
import { normalizeName } from '@/modules/customers/customer-normalization';
import type { CommercialSemantics } from '@/modules/commercial-metrics/commercial-metrics.service';
import { exceedsYears, monthsBetween, parseYearMonth, toBusinessWindow } from '@/modules/commercial-metrics/commercial-period';
import {
  type ActivityCategory,
  compareYearMonth,
  forecastWindowMonths,
  type OpportunityStatusFilter,
  type VisitCategory,
  type YearMonth,
} from '@/modules/commercial-metrics/metric-definitions';
import type {
  ActivityCriteria,
  ActivityDateBasis,
  ForecastCriteria,
  MetricContext,
  OpportunityCriteria,
  OpportunityDateBasis,
  PeriodCriterion,
  ProjectCriteria,
  ProjectDateBasis,
  ProjectSituation,
  VisitCriteria,
  VisitDateBasis,
} from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';
import { type CommercialStatusFilter, parseCommercialStatusFilter } from '@/modules/projects/project-commercial-status';

import { periodTooLongError, reportValidationError } from './report-errors';

/**
 * Traducción de los filtros de la API a los criterios del servicio de indicadores y del
 * `ReportingRepository` (05 F.2, C.2). Funciones puras: un mismo filtro produce el
 * **mismo** criterio para la lista, el resumen y (en F-39) la exportación (RN-05.44).
 */

/** Rango máximo de los reportes con período de fechas (C.2, D-05.4). */
export const MAX_PERIOD_YEARS = 5;
/** Rango máximo del forecast en meses (C.2). */
export const MAX_FORECAST_MONTHS = 24;

export interface PeriodRequest<TBasis extends string> {
  readonly from?: CalendarDate;
  readonly to?: CalendarDate;
  readonly dateBasis?: TBasis;
}

/**
 * Período del reporte (RN-05.8): `from` y `to` **juntos** o ninguno; `from ≤ to`
 * (`400`); rango ≤ 5 años (`422 PERIOD_TOO_LONG`). Sin período no se filtra por fecha
 * (la pantalla envía su período por defecto, C.2). `defaultBasis = null` exige
 * `dateBasis` cuando hay período (proyectos, sin base por defecto).
 */
export function resolveReportPeriod<TBasis extends string>(
  request: PeriodRequest<TBasis>,
  defaultBasis: TBasis | null,
  timeZone: string,
): PeriodCriterion<TBasis> | null {
  const { from, to } = request;
  if (from === undefined && to === undefined) return null;
  if (from === undefined) throw reportValidationError('from', 'from and to must be sent together');
  if (to === undefined) throw reportValidationError('to', 'from and to must be sent together');
  if (from > to) throw reportValidationError('to', 'to must be on or after from');
  if (exceedsYears({ from, to }, MAX_PERIOD_YEARS)) throw periodTooLongError('to', { maxYears: MAX_PERIOD_YEARS });
  const basis = request.dateBasis ?? defaultBasis;
  if (basis === null) throw reportValidationError('dateBasis', 'dateBasis is required when a period is sent');
  return { basis, window: toBusinessWindow({ from, to }, timeZone) };
}

function ids(values: readonly string[] | undefined): readonly string[] {
  return values ? [...new Set(values)] : [];
}

// ---------------------------------------------------------------------------
// F-35 Oportunidades
// ---------------------------------------------------------------------------

export interface OpportunityReportFilter extends PeriodRequest<OpportunityDateBasis> {
  readonly ownerId?: readonly string[];
  readonly customerId?: readonly string[];
  readonly countryId?: readonly string[];
  readonly status?: readonly OpportunityStatusFilter[];
  readonly stageId?: readonly string[];
  readonly productId?: readonly string[];
  readonly productFamilyId?: readonly string[];
}

export function opportunityCriteria(filter: OpportunityReportFilter, ctx: MetricContext, semantics: CommercialSemantics): OpportunityCriteria {
  return {
    scope: ctx.scope,
    openStageIds: semantics.openStageIds,
    closedStageIds: semantics.closedStageIds,
    period: resolveReportPeriod(filter, 'IDENTIFIED', ctx.businessTimeZone),
    ownerIds: ids(filter.ownerId),
    customerIds: ids(filter.customerId),
    countryIds: ids(filter.countryId),
    stageIds: ids(filter.stageId),
    statuses: filter.status ? [...new Set(filter.status)] : [],
    productIds: ids(filter.productId),
    productFamilyIds: ids(filter.productFamilyId),
  };
}

// ---------------------------------------------------------------------------
// F-34 Proyectos
// ---------------------------------------------------------------------------

export interface ProjectReportFilter extends PeriodRequest<ProjectDateBasis> {
  readonly search?: string;
  readonly countryId?: readonly string[];
  readonly city?: string;
  readonly ownerId?: readonly string[];
  readonly customerId?: readonly string[];
  readonly projectTypeId?: readonly string[];
  readonly phaseId?: readonly string[];
  /** `OPEN_STAGE[:<stageId>]`, `WON`, `LOST`, `NO_OPPORTUNITIES` (validado en el DTO). */
  readonly commercialStatus?: readonly string[];
  readonly situation?: ProjectSituation;
}

export function projectCriteria(filter: ProjectReportFilter, ctx: MetricContext, semantics: CommercialSemantics): ProjectCriteria {
  const commercialStatus: CommercialStatusFilter[] = [];
  for (const value of filter.commercialStatus ?? []) {
    const parsed = parseCommercialStatusFilter(value);
    if (!parsed) throw reportValidationError('commercialStatus', 'each value must be OPEN_STAGE[:<stageId>], WON, LOST or NO_OPPORTUNITIES');
    commercialStatus.push(parsed);
  }
  return {
    scope: ctx.scope,
    nonFinalPhaseIds: semantics.nonFinalPhaseIds,
    finalPhaseIds: semantics.finalPhaseIds,
    openStageRanking: semantics.openStageRanking,
    phaseRanking: semantics.phaseRanking,
    period: resolveReportPeriod(filter, null, ctx.businessTimeZone),
    search: normalizeName(filter.search),
    city: normalizeName(filter.city),
    countryIds: ids(filter.countryId),
    ownerIds: ids(filter.ownerId),
    customerIds: ids(filter.customerId),
    projectTypeIds: ids(filter.projectTypeId),
    phaseIds: ids(filter.phaseId),
    commercialStatus,
    situation: filter.situation ?? 'ALL',
  };
}

// ---------------------------------------------------------------------------
// F-36 Forecast
// ---------------------------------------------------------------------------

export interface ForecastReportFilter {
  readonly fromMonth?: string;
  readonly toMonth?: string;
  readonly projectId?: readonly string[];
  readonly customerId?: readonly string[];
  readonly productId?: readonly string[];
  readonly productFamilyId?: readonly string[];
  readonly ownerId?: readonly string[];
  readonly countryId?: readonly string[];
}

/**
 * Rango de meses (C.2): `fromMonth`/`toMonth` juntos (`400` si llega uno solo); sin
 * ellos, la ventana M+1…M+H (`crm.forecast.horizonte_meses`, DEF-G). `fromMonth >
 * toMonth` → `400`; más de 24 meses → `422 PERIOD_TOO_LONG`.
 */
export function forecastRange(filter: ForecastReportFilter, ctx: MetricContext, horizonMonths: number): { from: YearMonth; to: YearMonth } {
  if (filter.fromMonth === undefined && filter.toMonth === undefined) {
    const window = forecastWindowMonths(ctx, horizonMonths);
    return { from: window[0] as YearMonth, to: window[window.length - 1] as YearMonth };
  }
  if (filter.fromMonth === undefined) throw reportValidationError('fromMonth', 'fromMonth and toMonth must be sent together');
  if (filter.toMonth === undefined) throw reportValidationError('toMonth', 'fromMonth and toMonth must be sent together');
  const from = parseYearMonth(filter.fromMonth);
  const to = parseYearMonth(filter.toMonth);
  if (!from) throw reportValidationError('fromMonth', 'fromMonth must be a month YYYY-MM');
  if (!to) throw reportValidationError('toMonth', 'toMonth must be a month YYYY-MM');
  if (compareYearMonth(from, to) > 0) throw reportValidationError('toMonth', 'toMonth must be on or after fromMonth');
  if (monthsBetween(from, to).length > MAX_FORECAST_MONTHS) throw periodTooLongError('toMonth', { maxMonths: MAX_FORECAST_MONTHS });
  return { from, to };
}

export function forecastCriteria(filter: ForecastReportFilter, ctx: MetricContext, horizonMonths: number): ForecastCriteria {
  const range = forecastRange(filter, ctx, horizonMonths);
  return {
    scope: ctx.scope,
    fromMonth: range.from,
    toMonth: range.to,
    projectIds: ids(filter.projectId),
    customerIds: ids(filter.customerId),
    productIds: ids(filter.productId),
    productFamilyIds: ids(filter.productFamilyId),
    ownerIds: ids(filter.ownerId),
    countryIds: ids(filter.countryId),
  };
}

// ---------------------------------------------------------------------------
// F-37 Visitas
// ---------------------------------------------------------------------------

export interface VisitReportFilter extends PeriodRequest<VisitDateBasis> {
  readonly ownerId?: readonly string[];
  readonly customerId?: readonly string[];
  readonly countryId?: readonly string[];
  readonly projectId?: readonly string[];
  readonly statusCategory?: readonly VisitCategory[];
  readonly statusId?: readonly string[];
}

export function visitCriteria(filter: VisitReportFilter, ctx: MetricContext, semantics: CommercialSemantics): VisitCriteria {
  return {
    scope: ctx.scope,
    statusSets: semantics.visitStatusSets,
    period: resolveReportPeriod(filter, 'SCHEDULED', ctx.businessTimeZone),
    ownerIds: ids(filter.ownerId),
    customerIds: ids(filter.customerId),
    countryIds: ids(filter.countryId),
    projectIds: ids(filter.projectId),
    categories: filter.statusCategory ? [...new Set(filter.statusCategory)] : [],
    statusIds: ids(filter.statusId),
  };
}

// ---------------------------------------------------------------------------
// F-38 Actividades
// ---------------------------------------------------------------------------

export interface ActivityReportFilter extends PeriodRequest<ActivityDateBasis> {
  readonly ownerId?: readonly string[];
  readonly customerId?: readonly string[];
  readonly countryId?: readonly string[];
  readonly typeId?: readonly string[];
  readonly statusCategory?: readonly ActivityCategory[];
  readonly statusId?: readonly string[];
  readonly priorityId?: readonly string[];
}

export function activityCriteria(filter: ActivityReportFilter, ctx: MetricContext, semantics: CommercialSemantics): ActivityCriteria {
  return {
    scope: ctx.scope,
    now: ctx.now,
    statusSets: semantics.activityStatusSets,
    period: resolveReportPeriod(filter, 'ACTIVITY_DATE', ctx.businessTimeZone),
    ownerIds: ids(filter.ownerId),
    customerIds: ids(filter.customerId),
    countryIds: ids(filter.countryId),
    typeIds: ids(filter.typeId),
    priorityIds: ids(filter.priorityId),
    categories: filter.statusCategory ? [...new Set(filter.statusCategory)] : [],
    statusIds: ids(filter.statusId),
  };
}
