import { compareDecimal, isDecimalString, roundDecimal } from '@/common/decimal';
import type { OpportunityOutcomeCode, SemanticCatalogItem } from '@/modules/commercial-metrics/metric-definitions';

import { PERCENT_DECIMALS } from './opportunity-constants';
import { OPPORTUNITY_ERROR_CODES, type OpportunityIssue, opportunityIssue } from './opportunity-errors';

/**
 * Reglas del resultado comercial (03 C.8, RN-03.46–RN-03.52, DM-15). Puras.
 *
 * Semántica que se pregunta (00 §3.3), nunca etiquetas:
 * - `crm.etapa_oportunidad.metadata.outcome` (`WON` | `LOST` | `null`): resultado que
 *   admite una etapa cerrada.
 * - `crm.resultado_oportunidad.metadata` (`stageOutcome`, `requiresReason`,
 *   `requiresAwardedPercent`) del elemento cuyo `code` es el resultado. Si el elemento
 *   falta, se aplican los valores del contrato (00 §3.4): `WON`/`PARTIAL` → etapa `WON`,
 *   `LOST` → etapa `LOST`; motivo obligatorio en `LOST`; porcentaje obligatorio en
 *   `PARTIAL`. Lo que la base exige (`ck_opportunity_results_*`) nunca se relaja.
 * - `crm.motivo_resultado.metadata.appliesTo`: resultados a los que aplica un motivo.
 */

export const OUTCOMES: readonly OpportunityOutcomeCode[] = ['WON', 'LOST', 'PARTIAL'];

export interface ResultInput {
  readonly outcome: OpportunityOutcomeCode;
  readonly reasonId?: string | null;
  readonly awardedPercent?: string | null;
  readonly decisionDate: string;
  readonly comments?: string | null;
}

/** Resultado normalizado listo para escribir (porcentaje con 2 decimales o nulo). */
export interface NormalizedResult {
  readonly outcome: OpportunityOutcomeCode;
  readonly reasonId: string | null;
  readonly awardedPercent: string | null;
  readonly decisionDate: string;
  readonly comments: string | null;
}

interface OutcomeSemantics {
  readonly stageOutcome: 'WON' | 'LOST';
  readonly requiresReason: boolean;
  readonly requiresAwardedPercent: boolean;
}

const CONTRACT: Readonly<Record<OpportunityOutcomeCode, OutcomeSemantics>> = {
  WON: { stageOutcome: 'WON', requiresReason: false, requiresAwardedPercent: false },
  LOST: { stageOutcome: 'LOST', requiresReason: true, requiresAwardedPercent: false },
  PARTIAL: { stageOutcome: 'WON', requiresReason: false, requiresAwardedPercent: true },
};

/** Semántica de un resultado: la del catálogo, sin relajar nunca lo que exige la base. */
export function outcomeSemantics(outcome: OpportunityOutcomeCode, outcomeItems: readonly SemanticCatalogItem[]): OutcomeSemantics {
  const contract = CONTRACT[outcome];
  const metadata = outcomeItems.find((item) => item.code === outcome)?.metadata ?? null;
  const stageOutcome = metadata?.['stageOutcome'];
  return {
    stageOutcome: stageOutcome === 'WON' || stageOutcome === 'LOST' ? stageOutcome : contract.stageOutcome,
    requiresReason: contract.requiresReason || metadata?.['requiresReason'] === true,
    requiresAwardedPercent: contract.requiresAwardedPercent || metadata?.['requiresAwardedPercent'] === true,
  };
}

/** `metadata.outcome` de una etapa cerrada (`WON` | `LOST`), o `null`. */
export function stageOutcome(stage: SemanticCatalogItem): 'WON' | 'LOST' | null {
  const value = stage.metadata?.['outcome'];
  return value === 'WON' || value === 'LOST' ? value : null;
}

/** Resultados que admite una etapa cerrada (para el formulario: Ganado → Ganado/Parcial; Perdido → Perdido). */
export function outcomesForStage(stage: SemanticCatalogItem, outcomeItems: readonly SemanticCatalogItem[]): OpportunityOutcomeCode[] {
  const target = stageOutcome(stage);
  return target === null ? [] : OUTCOMES.filter((outcome) => outcomeSemantics(outcome, outcomeItems).stageOutcome === target);
}

/** `metadata.appliesTo` de un motivo; sin lista válida, el motivo no aplica a nada (opción restrictiva). */
export function reasonAppliesTo(reason: SemanticCatalogItem): OpportunityOutcomeCode[] {
  const value = reason.metadata?.['appliesTo'];
  return Array.isArray(value) ? OUTCOMES.filter((outcome) => value.includes(outcome)) : [];
}

function percentIssue(value: string, field: string): OpportunityIssue | null {
  const valid = isDecimalString(value, { maxScale: PERCENT_DECIMALS, maxIntegerDigits: 3 });
  if (valid && compareDecimal(value, '100') <= 0) return null;
  return opportunityIssue(field, OPPORTUNITY_ERROR_CODES.invalidProgress, { min: '0', max: '100' });
}

/**
 * Valida un resultado contra la etapa cerrada en la que queda la oportunidad
 * (RN-03.47–RN-03.49). Devuelve **todas** las incidencias, empezando por la
 * correspondencia etapa ↔ resultado. `fieldPrefix` = `result.` en `stage-changes` y
 * vacío en `PUT /result`. La pertenencia del motivo a su catálogo y su `appliesTo` se
 * validan aparte (necesitan el catálogo vigente dentro de la transacción).
 */
export function resultIssues(
  input: ResultInput,
  stage: SemanticCatalogItem,
  outcomeItems: readonly SemanticCatalogItem[],
  fieldPrefix = '',
): OpportunityIssue[] {
  const issues: OpportunityIssue[] = [];
  const semantics = outcomeSemantics(input.outcome, outcomeItems);
  const target = stageOutcome(stage);
  if (target === null || semantics.stageOutcome !== target) {
    issues.push(
      opportunityIssue(`${fieldPrefix}outcome`, OPPORTUNITY_ERROR_CODES.resultStageMismatch, {
        stageCode: stage.code,
        allowedOutcomes: outcomesForStage(stage, outcomeItems),
      }),
    );
  }
  const reasonId = input.reasonId ?? null;
  if (semantics.requiresReason && reasonId === null) {
    issues.push(opportunityIssue(`${fieldPrefix}reasonId`, OPPORTUNITY_ERROR_CODES.resultReasonRequired));
  }
  const percent = input.awardedPercent ?? null;
  if (semantics.requiresAwardedPercent && percent === null) {
    issues.push(opportunityIssue(`${fieldPrefix}awardedPercent`, OPPORTUNITY_ERROR_CODES.resultPercentRequired));
  }
  if (percent !== null) {
    const range = percentIssue(percent, `${fieldPrefix}awardedPercent`);
    if (range) issues.push(range);
    // DM-15: WON es 100 % implícito y LOST no lleva porcentaje (opción restrictiva: se rechaza, no se descarta).
    else if (!semantics.requiresAwardedPercent) {
      issues.push(opportunityIssue(`${fieldPrefix}awardedPercent`, OPPORTUNITY_ERROR_CODES.resultPercentNotAllowed));
    }
  }
  return issues;
}

export function normalizeResult(input: ResultInput): NormalizedResult {
  const comments = input.comments?.trim() ?? '';
  return {
    outcome: input.outcome,
    reasonId: input.reasonId ?? null,
    awardedPercent: input.awardedPercent === undefined || input.awardedPercent === null ? null : roundDecimal(input.awardedPercent, PERCENT_DECIMALS),
    decisionDate: input.decisionDate,
    comments: comments.length > 0 ? comments : null,
  };
}

/** ¿Cambia algo del resultado vigente? (`PUT /result` sin diferencias no escribe ni audita). */
export function sameResult(a: NormalizedResult, b: NormalizedResult): boolean {
  return (
    a.outcome === b.outcome &&
    a.reasonId === b.reasonId &&
    a.decisionDate === b.decisionDate &&
    a.comments === b.comments &&
    (a.awardedPercent === null || b.awardedPercent === null
      ? a.awardedPercent === b.awardedPercent
      : compareDecimal(a.awardedPercent, b.awardedPercent) === 0)
  );
}
