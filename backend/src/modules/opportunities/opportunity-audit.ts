import type { OpportunityRecord, OpportunityResultRecord } from './ports/opportunities.repository.port';

/**
 * Auditoría de oportunidades y resultados (03 RN-03.13, RN-03.53, F.2 paso 7). Todas
 * las entradas llevan `resourceType = crm.opportunity`, `resourceId` = la oportunidad
 * y `metadata.projectId`, de modo que el historial de la ficha las encuentre. Los
 * eventos `stage_changed` y `opportunity_result.*` repiten un historial funcional y la
 * ficha no los muestra (`HISTORY_DUPLICATED_AUDIT_EVENTS` de E2a).
 */
export const OPPORTUNITY_AUDIT_RESOURCE = 'crm.opportunity';

export const OPPORTUNITY_AUDIT_EVENTS = {
  created: 'crm.opportunity.created',
  updated: 'crm.opportunity.updated',
  deleted: 'crm.opportunity.deleted',
  stageChanged: 'crm.opportunity.stage_changed',
  resultRecorded: 'crm.opportunity_result.recorded',
  resultChanged: 'crm.opportunity_result.changed',
  resultCleared: 'crm.opportunity_result.cleared',
} as const;

/** Texto libre que puede contener datos personales: se registra que cambió, no su contenido (AGENTS §9.4). */
export const OPPORTUNITY_MASKED_FIELDS = ['description', 'nextAction'] as const;
export const STAGE_CHANGE_MASKED_FIELDS = ['comment'] as const;
export const RESULT_MASKED_FIELDS = ['comments'] as const;

/** Estado auditable (ids, fechas y cifras de empresa; los cinco campos de la estimación, RN-03.82). */
export function opportunityAuditState(record: OpportunityRecord): Record<string, unknown> {
  return {
    code: record.code,
    stageId: record.stage.id,
    opportunityDate: record.opportunityDate,
    ownerId: record.owner.id,
    estimatedAmount: record.estimatedAmount,
    currencyCode: record.currencyCode,
    exchangeRate: record.exchangeRate,
    exchangeRateDate: record.exchangeRateDate,
    estimatedAmountUsd: record.estimatedAmountUsd,
    estimatedTonnage: record.estimatedTonnage,
    description: record.description,
    nextAction: record.nextAction,
    nextActionDate: record.nextActionDate,
  };
}

export function resultAuditState(result: OpportunityResultRecord | null): Record<string, unknown> | null {
  if (!result) return null;
  return {
    outcome: result.outcome,
    reasonId: result.reason?.id ?? null,
    awardedPercent: result.awardedPercent,
    decisionDate: result.decisionDate,
    comments: result.comments,
  };
}
