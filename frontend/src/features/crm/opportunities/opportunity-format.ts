import { formatDecimal, formatMoney, formatPercent, formatTonnage } from '@/features/crm/common/decimal';
import { formatCalendarDate } from '@/features/crm/projects';

import type { OpportunityCore, OpportunityDateField, OpportunityOutcome, OutcomeOption, ResultHistoryAction } from './opportunities.api';

/**
 * Etiquetas y formatos de Oportunidades (03 §E.7). Los montos siguen RN-03.83:
 * siempre el monto original con su moneda y el equivalente en USD; nunca se
 * suman monedas distintas.
 */

/** Etiquetas de respaldo del conjunto cerrado de resultados (DM-15); las de `form-options` mandan. */
const OUTCOME_FALLBACK_LABELS: Record<OpportunityOutcome, string> = {
  WON: 'Ganado',
  PARTIAL: 'Parcial',
  LOST: 'Perdido',
};

export function outcomeLabel(outcome: OpportunityOutcome, options?: readonly OutcomeOption[]): string {
  return options?.find((option) => option.code === outcome)?.label ?? OUTCOME_FALLBACK_LABELS[outcome];
}

export const RESULT_ACTION_LABELS: Record<ResultHistoryAction, string> = {
  RECORDED: 'Registrado',
  CHANGED: 'Modificado',
  CLEARED: 'Anulado (reapertura)',
};

export const OPPORTUNITY_DATE_FIELD_LABELS: Record<OpportunityDateField, string> = {
  opportunityDate: 'Fecha de la oportunidad',
  nextActionDate: 'Fecha de la siguiente acción',
  updatedAt: 'Última actualización',
};

export const OPPORTUNITY_FIELD_LABELS = {
  code: 'Código',
  projectId: 'Proyecto',
  customerId: 'Cliente',
  stageId: 'Etapa',
  toStageId: 'Etapa destino',
  ownerId: 'Asesor',
  status: 'Situación',
  outcome: 'Resultado',
  decisionFrom: 'Decisión desde',
  decisionTo: 'Decisión hasta',
  dateField: 'Campo de fecha',
  dateFrom: 'Desde',
  dateTo: 'Hasta',
  opportunityDate: 'Fecha de la oportunidad',
  estimatedAmount: 'Monto estimado',
  currencyCode: 'Moneda',
  estimatedTonnage: 'Tonelaje estimado',
  description: 'Descripción',
  nextAction: 'Siguiente acción',
  nextActionDate: 'Fecha de la siguiente acción',
  comment: 'Comentario',
  reasonId: 'Motivo',
  awardedPercent: 'Porcentaje adjudicado',
  decisionDate: 'Fecha de decisión',
  comments: 'Comentarios del resultado',
} as const;

export const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Abiertas' },
  { value: 'CLOSED', label: 'Cerradas' },
] as const;

/** "OPO-2026-00042 · Torre Norte". */
export function opportunityLabel(opportunity: Pick<OpportunityCore, 'code' | 'project'>): string {
  return `${opportunity.code} · ${opportunity.project.name}`;
}

export interface EstimateTexts {
  /** Monto original con su moneda (`GTQ 7,750.00`) o `—`. */
  original: string;
  /** Equivalente en USD; `null` si no hay estimación o ya está en USD. */
  usd: string | null;
  /** Tonelaje estimado (`120.50 t`) o `null`. */
  tonnage: string | null;
}

/** Textos de la estimación (RN-03.83): original + moneda y equivalente en USD. */
export function estimateTexts(opportunity: Pick<OpportunityCore, 'estimatedAmount' | 'currencyCode' | 'estimatedAmountUsd' | 'estimatedTonnage'>): EstimateTexts {
  const hasAmount = opportunity.estimatedAmount !== null && opportunity.currencyCode !== null;
  return {
    original: hasAmount ? formatMoney(opportunity.estimatedAmount, opportunity.currencyCode) : '—',
    usd: hasAmount && opportunity.currencyCode !== 'USD' ? formatMoney(opportunity.estimatedAmountUsd, 'USD') : null,
    tonnage: opportunity.estimatedTonnage ? formatTonnage(opportunity.estimatedTonnage) : null,
  };
}

/** "7.75 GTQ por USD, vigente desde el 1 oct 2026" (detalle, RN-03.83). */
export function exchangeRateText(opportunity: Pick<OpportunityCore, 'currencyCode' | 'exchangeRate' | 'exchangeRateDate'>): string {
  if (!opportunity.currencyCode || !opportunity.exchangeRate) {
    return '—';
  }
  if (opportunity.currencyCode === 'USD') {
    return 'Moneda base (sin conversión)';
  }
  const rate = `${formatDecimal(opportunity.exchangeRate, { maxFractionDigits: 8 })} ${opportunity.currencyCode} por USD`;
  return opportunity.exchangeRateDate ? `${rate}, vigente desde el ${formatCalendarDate(opportunity.exchangeRateDate)}` : rate;
}

/** "Parcial · 60%" / "Ganado". */
export function resultText(result: { outcome: OpportunityOutcome; awardedPercent: string | null }, options?: readonly OutcomeOption[]): string {
  const label = outcomeLabel(result.outcome, options);
  return result.awardedPercent ? `${label} · ${formatPercent(result.awardedPercent)}` : label;
}

/** Una oportunidad abierta sin siguiente acción genera alerta en Inicio (03 §E.4 #4). */
export function lacksNextAction(opportunity: Pick<OpportunityCore, 'stage' | 'nextAction'>): boolean {
  return !opportunity.stage.isClosed && !opportunity.nextAction?.trim();
}
