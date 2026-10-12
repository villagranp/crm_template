import type { Page } from '@/infrastructure/database/ports/pagination';
import type { AllowedCurrencies } from '@/modules/exchange-rates/currency-conversion.service';
import { catalogOrder, isClosedStage, type OpportunityOutcomeCode, type SemanticCatalogItem } from '@/modules/commercial-metrics/metric-definitions';

import type {
  OpportunityDetailDto,
  OpportunityFormOptionsDto,
  OpportunityHistoryDto,
  OpportunityListItemDto,
  OpportunityMutationResponseDto,
  OpportunityStageDto,
  PaginatedOpportunitiesDto,
  StageSummaryDto,
} from './dto/opportunity.dto';
import type { OpportunityResultDto } from './dto/opportunity-result.dto';
import type { OpportunityDetailView, OpportunityFormOptions, OpportunityHistory, OpportunityMutationView, OpportunityView, StageSummaryItem } from './opportunities.service';
import { outcomeSemantics, OUTCOMES, reasonAppliesTo, stageOutcome } from './opportunity-result-rules';
import type { OpportunityResultRecord } from './ports/opportunities.repository.port';

/** Etiquetas por defecto de `crm.resultado_oportunidad` si el catálogo no las trae. */
const OUTCOME_LABELS: Readonly<Record<OpportunityOutcomeCode, string>> = { WON: 'Ganado', LOST: 'Perdido', PARTIAL: 'Parcial' };

export function toStageDto(stage: SemanticCatalogItem): OpportunityStageDto {
  return { id: stage.id, code: stage.code, label: stage.label, order: catalogOrder(stage), isClosed: isClosedStage(stage), outcome: stageOutcome(stage) };
}

export function toResultDto(result: OpportunityResultRecord, outcomeLabels: ReadonlyMap<string, string>): OpportunityResultDto {
  return {
    outcome: result.outcome,
    outcomeLabel: outcomeLabels.get(result.outcome) ?? OUTCOME_LABELS[result.outcome],
    reason: result.reason,
    awardedPercent: result.awardedPercent,
    decisionDate: result.decisionDate,
    comments: result.comments,
    recordedBy: result.recordedBy,
    recordedAt: result.recordedAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
    updatedBy: result.updatedBy,
  };
}

export function toListItemDto(view: OpportunityView): OpportunityListItemDto {
  const { record } = view;
  return {
    id: record.id,
    code: record.code,
    project: { id: record.project.id, code: record.project.code, name: record.project.name },
    customer: record.customer,
    stage: toStageDto(record.stage),
    opportunityDate: record.opportunityDate,
    owner: record.owner,
    estimatedAmount: record.estimatedAmount,
    currencyCode: record.currencyCode,
    exchangeRate: record.exchangeRate,
    exchangeRateDate: record.exchangeRateDate,
    estimatedAmountUsd: record.estimatedAmountUsd,
    estimatedTonnage: record.estimatedTonnage,
    nextAction: record.nextAction,
    nextActionDate: record.nextActionDate,
    result: record.result ? { outcome: record.result.outcome, awardedPercent: record.result.awardedPercent, decisionDate: record.result.decisionDate } : null,
    updatedAt: record.updatedAt.toISOString(),
    capabilities: { ...view.capabilities },
  };
}

export function toPaginatedOpportunitiesDto(page: Page<OpportunityView>): PaginatedOpportunitiesDto {
  return {
    data: page.items.map(toListItemDto),
    pagination: { page: page.page, pageSize: page.pageSize, totalItems: page.totalItems, totalPages: Math.ceil(page.totalItems / page.pageSize) },
  };
}

export function toDetailDto(view: OpportunityDetailView, outcomeLabels: ReadonlyMap<string, string>): OpportunityDetailDto {
  const { record } = view;
  return {
    ...toListItemDto(view),
    description: record.description,
    stageChangedAt: record.stageChangedAt.toISOString(),
    closedAt: record.closedAt ? record.closedAt.toISOString() : null,
    result: record.result ? toResultDto(record.result, outcomeLabels) : null,
    allowedTransitions: view.allowedTransitions.map(toStageDto),
    productLines: record.productLines,
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
  };
}

/** `warnings` solo aparece si hay alguno (RN-03.81: la respuesta normal no lo trae). */
export function toMutationDto(view: OpportunityMutationView, outcomeLabels: ReadonlyMap<string, string>): OpportunityMutationResponseDto {
  const dto: OpportunityMutationResponseDto = toDetailDto(view, outcomeLabels);
  if (view.warnings.length > 0) {
    dto.warnings = view.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      details: warning.details as unknown as NonNullable<OpportunityMutationResponseDto['warnings']>[number]['details'],
    }));
  }
  return dto;
}

export function toHistoryDto(history: OpportunityHistory): OpportunityHistoryDto {
  return {
    stages: history.stages.map((entry) => ({
      id: entry.id,
      fromStage: entry.fromStage,
      toStage: entry.toStage,
      comment: entry.comment,
      changedBy: entry.changedBy,
      changedAt: entry.changedAt.toISOString(),
    })),
    results: history.results.map((entry) => ({
      id: entry.id,
      action: entry.action,
      outcome: entry.outcome,
      reason: entry.reason,
      awardedPercent: entry.awardedPercent,
      decisionDate: entry.decisionDate,
      comments: entry.comments,
      changedBy: entry.changedBy,
      changedAt: entry.changedAt.toISOString(),
    })),
  };
}

export function toStageSummaryDto(items: readonly StageSummaryItem[]): StageSummaryDto {
  return { stages: items.map((item) => ({ stage: toStageDto(item.stage), count: item.count })) };
}

function toCurrenciesDto(currencies: AllowedCurrencies): NonNullable<OpportunityFormOptionsDto['currencies']> {
  return { allowed: currencies.allowed.map((currency) => ({ ...currency })), defaultCode: currencies.defaultCurrencyCode };
}

export function toFormOptionsDto(options: OpportunityFormOptions): OpportunityFormOptionsDto {
  const dto: OpportunityFormOptionsDto = {
    stages: options.stages.map(toStageDto),
    outcomes: options.outcomes
      .filter((item): item is typeof item & { code: OpportunityOutcomeCode } => (OUTCOMES as readonly string[]).includes(item.code))
      .map((item) => {
        const semantics = outcomeSemantics(item.code, options.outcomes);
        return {
          id: item.id,
          code: item.code,
          label: item.label,
          stageOutcome: semantics.stageOutcome,
          requiresReason: semantics.requiresReason,
          requiresAwardedPercent: semantics.requiresAwardedPercent,
        };
      }),
    reasons: options.reasons.map((item) => ({ id: item.id, code: item.code, label: item.label, appliesTo: reasonAppliesTo(item) })),
    baseCurrencyCode: options.baseCurrencyCode,
    defaults: { ...options.defaults },
  };
  if (options.currencies) dto.currencies = toCurrenciesDto(options.currencies);
  return dto;
}
