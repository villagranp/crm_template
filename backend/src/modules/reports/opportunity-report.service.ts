import { Inject, Injectable } from '@nestjs/common';

import type { CalendarDate } from '@/common/calendar-date';
import type { DecimalString } from '@/common/decimal';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { CommercialMetricsService, type MetricCatalogItem, type ReportStageCount } from '@/modules/commercial-metrics/commercial-metrics.service';
import { isClosedStage, type OpportunityCounts } from '@/modules/commercial-metrics/metric-definitions';
import type { OwnerOpportunityCountsRecord } from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';
import { CurrencyConversionService } from '@/modules/exchange-rates/currency-conversion.service';

import { LocalCurrencyReferenceService, type LocalReferenceResult } from './local-currency-reference';
import {
  type OpportunityReportRecord,
  type OpportunityReportSortField,
  REPORTING_REPOSITORY,
  type ReportingRepository,
} from './ports/reporting.repository.port';
import type { ReportContext } from './report-context';
import { opportunityCriteria, type OpportunityReportFilter } from './report-criteria';
import { reportPage, type ReportPageQuery } from './report-paging';

export type OpportunityReportQuery = OpportunityReportFilter & ReportPageQuery<OpportunityReportSortField>;

export type DecisionDateKind = 'ACTUAL' | 'ESTIMATED';

/** Fila del reporte de oportunidades (F-35). */
export interface OpportunityReportView extends Omit<OpportunityReportRecord, 'stage' | 'result' | 'projectEstimatedDecisionDate'> {
  readonly stage: { readonly id: string; readonly label: string; readonly isClosed: boolean };
  readonly result: Omit<NonNullable<OpportunityReportRecord['result']>, 'decisionDate'> | null;
  readonly decisionDate: CalendarDate | null;
  readonly decisionDateKind: DecisionDateKind | null;
}

export interface OpportunityReportSummary extends OpportunityCounts {
  readonly byStage: readonly ReportStageCount[];
  readonly byOwner: readonly OwnerOpportunityCountsRecord[];
  readonly estimateTotals: {
    readonly amountUsd: DecimalString;
    readonly currencyCode: string;
    readonly tonnage: DecimalString;
    readonly local: LocalReferenceResult;
  };
}

export const OPPORTUNITY_REPORT_DEFAULT_SORT = { sortBy: 'updatedAt', sortOrder: 'desc' } as const;

/** RN-05.28: fecha de decisión real si hay resultado; si no, la estimada del proyecto marcada como estimada. */
export function decisionDateOf(record: Pick<OpportunityReportRecord, 'result' | 'projectEstimatedDecisionDate'>): {
  decisionDate: CalendarDate | null;
  decisionDateKind: DecisionDateKind | null;
} {
  if (record.result) return { decisionDate: record.result.decisionDate, decisionDateKind: 'ACTUAL' };
  if (record.projectEstimatedDecisionDate) return { decisionDate: record.projectEstimatedDecisionDate, decisionDateKind: 'ESTIMATED' };
  return { decisionDate: null, decisionDateKind: null };
}

/** Registro → fila del reporte (pantalla y exportación, RN-05.44). */
export function opportunityView(
  { stage, result, projectEstimatedDecisionDate, ...row }: OpportunityReportRecord,
  stages: ReadonlyMap<string, MetricCatalogItem>,
): OpportunityReportView {
  const semantic = stages.get(stage.id);
  return {
    ...row,
    stage: { ...stage, isClosed: semantic ? isClosedStage(semantic) : false },
    result: result ? { outcome: result.outcome, reason: result.reason, awardedPercent: result.awardedPercent } : null,
    ...decisionDateOf({ result, projectEstimatedDecisionDate }),
  };
}

/**
 * Reporte de oportunidades (05 F-35, E.3, AC-05.5–AC-05.11, AC-05.44, AC-05.45). Una
 * fila por oportunidad; conteos, distribuciones y totales en USD del servicio compartido
 * con **el mismo** criterio que la lista.
 */
@Injectable()
export class OpportunityReportService {
  constructor(
    private readonly metrics: CommercialMetricsService,
    @Inject(REPORTING_REPOSITORY) private readonly reporting: ReportingRepository,
    private readonly localReference: LocalCurrencyReferenceService,
    private readonly currencies: CurrencyConversionService,
  ) {}

  async list(ctx: ReportContext, query: OpportunityReportQuery): Promise<Page<OpportunityReportView>> {
    const semantics = await this.metrics.semantics();
    const criteria = opportunityCriteria(query, ctx, semantics);
    const page = await this.reporting.opportunityRows(criteria, {
      ...reportPage(query, OPPORTUNITY_REPORT_DEFAULT_SORT),
      stageRanking: semantics.stages.map((stage) => stage.id),
    });
    const stages = new Map(semantics.stages.map((stage) => [stage.id, stage]));
    return {
      ...page,
      items: page.items.map((record) => opportunityView(record, stages)),
    };
  }

  async summary(ctx: ReportContext, filter: OpportunityReportFilter): Promise<OpportunityReportSummary> {
    const semantics = await this.metrics.semantics();
    const criteria = opportunityCriteria(filter, ctx, semantics);
    const [totals, byStage, byOwner, baseCurrencyCode] = await Promise.all([
      this.metrics.countOpportunities(criteria),
      this.metrics.stageDistribution(criteria, semantics),
      this.metrics.ownerDistribution(criteria),
      this.currencies.baseCurrencyCode(),
    ]);
    const local = await this.localReference.resolve({
      filterCountryIds: criteria.countryIds,
      scope: ctx.scope,
      totalUsd: totals.amountUsd,
      periodTo: criteria.period?.window.to ?? null,
      clock: ctx,
    });
    return {
      total: totals.total,
      open: totals.open,
      won: totals.won,
      wonFull: totals.wonFull,
      partial: totals.partial,
      lost: totals.lost,
      closedWithoutResult: totals.closedWithoutResult,
      byStage,
      byOwner,
      estimateTotals: { amountUsd: totals.amountUsd, currencyCode: baseCurrencyCode, tonnage: totals.tonnage, local },
    };
  }
}
