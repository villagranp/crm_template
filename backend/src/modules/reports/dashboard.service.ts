import { Injectable } from '@nestjs/common';

import { type DecimalString, sumDecimals } from '@/common/decimal';
import {
  type CommercialDashboardCriteria,
  CommercialMetricsService,
  type CommercialSemantics,
  MONTHLY_SERIES_METRICS,
  type MonthlyCounts,
  type MonthlyPoint,
  type MonthlySeriesMetric,
  type PhaseCount,
  periodMonths,
  seriesOf,
  type ReportStageCount,
} from '@/modules/commercial-metrics/commercial-metrics.service';
import { type DateRange, monthRange, toBusinessWindow } from '@/modules/commercial-metrics/commercial-period';
import { addMonths, businessMonth, compareYearMonth, forecastWindowMonths, type YearMonth } from '@/modules/commercial-metrics/metric-definitions';
import type { UserRef } from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import { REPORT_PARAMETERS, type ReportContext } from './report-context';
import { periodTooLongError, reportValidationError } from './report-errors';

/** C.2: el período del dashboard abarca como mucho 24 meses de calendario. */
export const DASHBOARD_MAX_MONTHS = 24;
/** E.7: meses cerrados del período por defecto (más el mes en curso). */
export const DASHBOARD_DEFAULT_CLOSED_MONTHS = 12;
/** E.7: asesores con barra propia en "Distribución por asesor"; el resto se agrupa en "Otros". */
export const DASHBOARD_TOP_OWNERS = 10;

const TONNAGE_DECIMALS = 4;
const ZERO = (0).toFixed(TONNAGE_DECIMALS);

export interface DashboardFilter {
  readonly from?: string;
  readonly to?: string;
  readonly countryId?: readonly string[];
  readonly ownerId?: readonly string[];
}

export interface DashboardForecastMonth {
  readonly year: number;
  readonly month: number;
  readonly tonnage: DecimalString;
  readonly cumulative: DecimalString;
  readonly lineCount: number;
  readonly linesWithoutConversion: number;
}

export interface DashboardOwnerRow {
  /** `null` = "Otros" (resto de asesores fuera del top 10). */
  readonly owner: UserRef | null;
  readonly openOpportunities: number;
  readonly won: number;
  readonly forecastTonnage: DecimalString;
}

export interface CommercialDashboard {
  readonly period: DateRange;
  readonly activeProjects: { readonly count: number; readonly byPhase: readonly PhaseCount[] };
  readonly opportunitiesByStage: readonly ReportStageCount[];
  readonly wonLostByMonth: readonly Pick<MonthlyCounts, 'year' | 'month' | 'won' | 'wonFull' | 'partial' | 'lost'>[];
  readonly forecastRange: { readonly from: YearMonth; readonly to: YearMonth };
  readonly forecastByMonth: readonly DashboardForecastMonth[];
  readonly tonnageUnit: string;
  readonly byOwner: readonly DashboardOwnerRow[];
  readonly activityVisitByMonth: readonly Pick<MonthlyCounts, 'year' | 'month' | 'activitiesCompleted' | 'visitsCompleted' | 'visitsCancelled'>[];
}

export interface CommercialTrends {
  readonly period: DateRange;
  readonly series: readonly { readonly metric: MonthlySeriesMetric; readonly points: readonly MonthlyPoint[] }[];
}

function ids(values: readonly string[] | undefined): readonly string[] {
  return values ? [...new Set(values)] : [];
}

/**
 * Período del dashboard (E.7, C.2): `from`/`to` juntos o ninguno (`400`), `from ≤ to`
 * (`400`), ≤ 24 meses de calendario (`422 PERIOD_TOO_LONG`). Sin período: desde el primer
 * día de M-12 hasta el último día del mes en curso (M), en la zona del negocio.
 */
export function dashboardPeriod(filter: DashboardFilter, ctx: Pick<ReportContext, 'now' | 'businessTimeZone'>): DateRange {
  if (filter.from === undefined && filter.to === undefined) {
    const current = businessMonth(ctx);
    return { from: monthRange(addMonths(current, -DASHBOARD_DEFAULT_CLOSED_MONTHS)).from, to: monthRange(current).to };
  }
  if (filter.from === undefined) throw reportValidationError('from', 'from and to must be sent together');
  if (filter.to === undefined) throw reportValidationError('to', 'from and to must be sent together');
  if (filter.from > filter.to) throw reportValidationError('to', 'to must be on or after from');
  const period = { from: filter.from, to: filter.to };
  if (periodMonths(period).length > DASHBOARD_MAX_MONTHS) throw periodTooLongError('to', { maxMonths: DASHBOARD_MAX_MONTHS });
  return period;
}

/** Meses del período ∪ M+1…M+H, en orden (E.7 "Forecast por mes"). */
export function dashboardForecastMonths(period: DateRange, ctx: Pick<ReportContext, 'now' | 'businessTimeZone'>, horizonMonths: number): YearMonth[] {
  const months = new Map<string, YearMonth>();
  for (const month of [...periodMonths(period), ...forecastWindowMonths(ctx, horizonMonths)]) months.set(`${month.year}-${month.month}`, month);
  return [...months.values()].sort(compareYearMonth);
}

/**
 * Top N por (abiertas + ganadas), después toneladas y nombre; el resto se suma en "Otros"
 * (E.7). Las tres medidas salen de los conjuntos de los paneles anteriores.
 */
export function topOwners(rows: readonly DashboardOwnerRow[], limit = DASHBOARD_TOP_OWNERS): DashboardOwnerRow[] {
  const sorted = [...rows].sort((a, b) => {
    const activity = b.openOpportunities + b.won - (a.openOpportunities + a.won);
    if (activity !== 0) return activity;
    const tonnage = Number(b.forecastTonnage) - Number(a.forecastTonnage);
    if (tonnage !== 0) return tonnage;
    return (a.owner?.displayName ?? '').localeCompare(b.owner?.displayName ?? '', 'es') || (a.owner?.id ?? '').localeCompare(b.owner?.id ?? '');
  });
  if (sorted.length <= limit) return sorted;
  const rest = sorted.slice(limit);
  return [
    ...sorted.slice(0, limit),
    {
      owner: null,
      openOpportunities: rest.reduce((sum, row) => sum + row.openOpportunities, 0),
      won: rest.reduce((sum, row) => sum + row.won, 0),
      forecastTonnage: sumDecimals(
        rest.map((row) => row.forecastTonnage),
        TONNAGE_DECIMALS,
      ),
    },
  ];
}

/**
 * Dashboard comercial (05 F-40, E.7, RN-05.51, RN-05.52): analítico, con las mismas
 * definiciones que Inicio y los reportes (servicio compartido, G.3) y el alcance de
 * `reportes.ver`. Filtros: período, país y asesor. Sin alertas ni pendientes personales.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly metrics: CommercialMetricsService,
    private readonly parameters: ParameterReader,
  ) {}

  async dashboard(ctx: ReportContext, filter: DashboardFilter): Promise<CommercialDashboard> {
    const period = dashboardPeriod(filter, ctx);
    const [semantics, horizon, tonnageUnit] = await Promise.all([
      this.metrics.semantics(),
      this.parameters.get<number>(REPORT_PARAMETERS.forecastHorizon),
      this.parameters.get<string>(REPORT_PARAMETERS.tonnageUnit),
    ]);
    const criteria = this.criteria(ctx, period, filter);
    const window = toBusinessWindow(period, ctx.businessTimeZone);
    const base = this.metrics.dashboardOpportunityCriteria(criteria, semantics);
    const identified = { ...base, period: { basis: 'IDENTIFIED' as const, window } };
    const decided = { ...base, period: { basis: 'DECIDED' as const, window } };
    const forecastMonths = dashboardForecastMonths(period, ctx, horizon);
    const forecastCriteria = {
      ...this.metrics.forecastCriteria(ctx, forecastMonths[0] as YearMonth, forecastMonths[forecastMonths.length - 1] as YearMonth),
      ownerIds: criteria.ownerIds,
      countryIds: criteria.countryIds,
    };

    const [activeProjects, opportunitiesByStage, monthly, forecast, openByOwner, wonByOwner, tonnageByOwner] = await Promise.all([
      this.metrics.activeProjectsByPhase(criteria, semantics),
      this.metrics.stageDistribution(identified, semantics),
      this.metrics.monthlyCounts(criteria, semantics),
      this.metrics.forecastTotals(forecastCriteria),
      this.metrics.ownerDistribution(identified),
      this.metrics.ownerDistribution(decided),
      this.metrics.forecastOwnerTonnage(forecastCriteria),
    ]);

    const wanted = new Set(forecastMonths.map((month) => `${month.year}-${month.month}`));
    let cumulative = ZERO;
    const forecastByMonth = forecast.months
      .filter((month) => wanted.has(`${month.year}-${month.month}`))
      .map((month) => {
        cumulative = sumDecimals([cumulative, month.tonnage], TONNAGE_DECIMALS);
        return { year: month.year, month: month.month, tonnage: month.tonnage, cumulative, lineCount: month.lineCount, linesWithoutConversion: month.linesWithoutConversion };
      });

    const owners = new Map<string, { owner: UserRef; openOpportunities: number; won: number; forecastTonnage: DecimalString }>();
    const entry = (owner: UserRef): { owner: UserRef; openOpportunities: number; won: number; forecastTonnage: DecimalString } => {
      const current = owners.get(owner.id) ?? { owner, openOpportunities: 0, won: 0, forecastTonnage: ZERO };
      owners.set(owner.id, current);
      return current;
    };
    for (const row of openByOwner) entry(row.owner).openOpportunities = row.open;
    for (const row of wonByOwner) entry(row.owner).won = row.won;
    for (const row of tonnageByOwner) entry(row.owner).forecastTonnage = row.tonnage;

    return {
      period,
      activeProjects,
      opportunitiesByStage,
      wonLostByMonth: monthly.map(({ year, month, won, wonFull, partial, lost }) => ({ year, month, won, wonFull, partial, lost })),
      forecastRange: { from: forecastMonths[0] as YearMonth, to: forecastMonths[forecastMonths.length - 1] as YearMonth },
      forecastByMonth,
      tonnageUnit,
      byOwner: topOwners([...owners.values()].filter((row) => row.openOpportunities > 0 || row.won > 0 || Number(row.forecastTonnage) > 0)),
      activityVisitByMonth: monthly.map(({ year, month, activitiesCompleted, visitsCompleted, visitsCancelled }) => ({
        year,
        month,
        activitiesCompleted,
        visitsCompleted,
        visitsCancelled,
      })),
    };
  }

  /** RN-05.52: series mensuales de los indicadores con fecha histórica fiable; "proyectos activos" no tiene tendencia (D-05.13). */
  async trends(ctx: ReportContext, filter: DashboardFilter): Promise<CommercialTrends> {
    const period = dashboardPeriod(filter, ctx);
    const semantics: CommercialSemantics = await this.metrics.semantics();
    const monthly = await this.metrics.monthlyCounts(this.criteria(ctx, period, filter), semantics);
    return { period, series: MONTHLY_SERIES_METRICS.map((metric) => ({ metric, points: seriesOf(metric, monthly) })) };
  }

  private criteria(ctx: ReportContext, period: DateRange, filter: DashboardFilter): CommercialDashboardCriteria {
    return { scope: ctx.scope, now: ctx.now, businessTimeZone: ctx.businessTimeZone, period, ownerIds: ids(filter.ownerId), countryIds: ids(filter.countryId) };
  }
}
