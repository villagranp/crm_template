import { Injectable } from '@nestjs/common';

import { RequestValidationError } from '@/common/errors/application-error';
import { type DateRange, MAX_PERIOD_DAYS, type PeriodKind, periodDays } from '@/modules/commercial-metrics/commercial-period';
import {
  type ActivityCounts,
  CommercialMetricsService,
  type ForecastWindowSummary,
  type MetricContext,
  type StageCount,
  type TargetCompliance,
  type VisitCounts,
} from '@/modules/commercial-metrics/commercial-metrics.service';
import type { CustomerActor } from '@/modules/customers/customer-actor.resolver';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import { DASHBOARD_PARAMETERS, DashboardContextFactory } from './dashboard-context';

export interface PeriodRequest {
  readonly period?: PeriodKind;
  readonly from?: string;
  readonly to?: string;
}

export interface ResolvedPeriod extends DateRange {
  readonly kind: PeriodKind | 'CUSTOM';
}

export interface OpportunityIndicators {
  readonly open: { readonly total: number; readonly byStage: readonly StageCount[] };
  readonly won: { readonly total: number; readonly won: number; readonly partial: number };
  readonly lost: number;
  readonly period: ResolvedPeriod;
}

export interface TargetIndicators {
  readonly period: ResolvedPeriod;
  readonly items: readonly TargetCompliance[];
}

/** `400 VALIDATION_FAILED` con `{ field, issue }`, como el `ValidationPipe` (01 F.1, AC-01.20). */
function periodError(field: string, issue: string): RequestValidationError {
  return new RequestValidationError('Request validation failed', [{ field, issue }]);
}

/**
 * Indicadores de Inicio (endpoints 1–6, F-02). Resuelve el alcance del permiso de
 * cada fuente y los parámetros, y delega **todas** las fórmulas en
 * `CommercialMetricsService` (RN-01.10): este servicio no cuenta nada por su cuenta.
 */
@Injectable()
export class DashboardIndicatorsService {
  constructor(
    private readonly metrics: CommercialMetricsService,
    private readonly context: DashboardContextFactory,
    private readonly parameters: ParameterReader,
  ) {}

  /** Período pedido (D-01.3): `from`/`to` anulan `period`; por defecto el mes en curso (RN-01.15). */
  resolvePeriod(request: PeriodRequest, ctx: MetricContext): ResolvedPeriod {
    if (request.from !== undefined || request.to !== undefined) {
      if (request.from === undefined) throw periodError('from', 'from is required when to is present');
      if (request.to === undefined) throw periodError('to', 'to is required when from is present');
      if (request.from > request.to) throw periodError('from', 'from must not be after to');
      const range = { from: request.from, to: request.to };
      if (periodDays(range) > MAX_PERIOD_DAYS) throw periodError('to', `the range must not exceed ${MAX_PERIOD_DAYS} days`);
      return { ...range, kind: 'CUSTOM' };
    }
    const kind = request.period ?? 'MONTH';
    return { ...this.metrics.resolvePeriod(kind, ctx), kind };
  }

  async projects(actor: CustomerActor): Promise<number> {
    return this.metrics.countActiveProjects(await this.context.metricContext(actor, 'projects'));
  }

  async opportunities(actor: CustomerActor, request: PeriodRequest): Promise<OpportunityIndicators> {
    const ctx = await this.context.metricContext(actor, 'opportunities');
    const period = this.resolvePeriod(request, ctx);
    const [open, won, lost] = await Promise.all([
      this.metrics.countOpenOpportunities(ctx),
      this.metrics.countWonOpportunities(ctx, period),
      this.metrics.countLostOpportunities(ctx, period),
    ]);
    return { open, won, lost, period };
  }

  async forecast(actor: CustomerActor): Promise<ForecastWindowSummary> {
    const [ctx, horizon, unit] = await Promise.all([
      this.context.metricContext(actor, 'forecast'),
      this.parameters.get<number>(DASHBOARD_PARAMETERS.forecastHorizon),
      this.parameters.get<string>(DASHBOARD_PARAMETERS.tonnageUnit),
    ]);
    return this.metrics.forecastWindow(ctx, horizon, unit);
  }

  async visits(actor: CustomerActor): Promise<VisitCounts> {
    const [ctx, days] = await Promise.all([
      this.context.metricContext(actor, 'visits'),
      this.parameters.get<number>(DASHBOARD_PARAMETERS.upcomingVisitDays),
    ]);
    return this.metrics.countVisits(ctx, days);
  }

  async activities(actor: CustomerActor): Promise<ActivityCounts> {
    const [ctx, hours] = await Promise.all([
      this.context.metricContext(actor, 'activities'),
      this.parameters.get<number>(DASHBOARD_PARAMETERS.dueSoonHours),
    ]);
    return this.metrics.countActivities(ctx, hours);
  }

  async targets(actor: CustomerActor, request: PeriodRequest): Promise<TargetIndicators> {
    const ctx = await this.context.metricContext(actor, 'targets');
    const period = this.resolvePeriod(request, ctx);
    return { period, items: await this.metrics.targetCompliance(ctx, period) };
  }
}
