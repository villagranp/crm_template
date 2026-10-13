import { z } from 'zod';

import { compareDecimals, DECIMAL_SPECS, describeDecimalIssue, parseDecimal, type DecimalSpec } from '@/features/crm/common/decimal';
import { isCalendarDate } from '@/features/crm/projects';

import type {
  CreateOpportunityInput,
  OpportunityDetail,
  OpportunityOutcome,
  OpportunityResultInput,
  OpportunityStage,
  OutcomeOption,
  ReasonOption,
  StageChangeInput,
  StageOutcome,
  UpdateOpportunityInput,
} from './opportunities.api';

/**
 * Validación de los formularios de Oportunidades y resultados (03 §C.7, §C.8,
 * §C.11, §E.7). Es experiencia de usuario: el backend valida de nuevo y decide.
 * Las reglas de resultado salen de `form-options` (`requiresReason`,
 * `requiresAwardedPercent`, `stageOutcome`, `appliesTo`), nunca de listas fijas.
 */

export const OPPORTUNITY_LIMITS = {
  description: 2000,
  nextAction: 300,
  comment: 1000,
  resultComments: 2000,
} as const;

export const REQUIRED_MESSAGE = 'Este campo es obligatorio.';
const DATE_MESSAGE = 'Escribe una fecha válida.';

function maxMessage(limit: number): string {
  return `Usa como máximo ${limit} caracteres.`;
}

function decimalIssue(value: string, spec: DecimalSpec, required: boolean): string | null {
  const parsed = parseDecimal(value, spec);
  if (parsed.ok) {
    return null;
  }
  return parsed.issue === 'empty' && !required ? null : describeDecimalIssue(parsed.issue, spec);
}

function canonical(value: string, spec: DecimalSpec): string | null {
  const parsed = parseDecimal(value, spec);
  return parsed.ok ? parsed.value : null;
}

function textOrNull(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

// ---------------------------------------------------------------------------
// Resultado (F-18)
// ---------------------------------------------------------------------------

export interface ResultFormValues {
  outcome: string;
  reasonId: string;
  awardedPercent: string;
  /** `YYYY-MM-DD` del campo de fecha nativo. */
  decisionDate: string;
  comments: string;
}

export function emptyResultValues(decisionDate = ''): ResultFormValues {
  return { outcome: '', reasonId: '', awardedPercent: '', decisionDate, comments: '' };
}

/** Resultados que admite una etapa cerrada (RN-03.47): Ganado → Ganado/Parcial; Perdido → Perdido. */
export function outcomesForStage(outcomes: readonly OutcomeOption[], stageOutcome: StageOutcome | null | undefined): OutcomeOption[] {
  return stageOutcome ? outcomes.filter((option) => option.stageOutcome === stageOutcome) : [];
}

/** Motivos aplicables a un resultado (`metadata.appliesTo`, AC-03.57). */
export function reasonsForOutcome(reasons: readonly ReasonOption[], outcome: string): ReasonOption[] {
  return outcome ? reasons.filter((reason) => reason.appliesTo.includes(outcome as OpportunityOutcome)) : [];
}

export interface ResultRulesContext {
  /** Resultados admitidos por la etapa (ya filtrados con `outcomesForStage`). */
  outcomes: readonly OutcomeOption[];
  reasons: readonly ReasonOption[];
}

/** Incidencias del resultado (RN-03.48–RN-03.50), por campo. Vacío = válido. */
export function resultIssues(values: ResultFormValues, { outcomes, reasons }: ResultRulesContext): Partial<Record<keyof ResultFormValues, string>> {
  const issues: Partial<Record<keyof ResultFormValues, string>> = {};
  const outcome = outcomes.find((option) => option.code === values.outcome);
  if (!outcome) {
    issues.outcome = 'Elige el resultado.';
  } else {
    const applicable = reasonsForOutcome(reasons, outcome.code);
    if (values.reasonId && !applicable.some((reason) => reason.id === values.reasonId)) {
      issues.reasonId = 'Este motivo no aplica al resultado elegido.';
    } else if (outcome.requiresReason && !values.reasonId) {
      issues.reasonId = 'Indica el motivo.';
    }
    if (outcome.requiresAwardedPercent) {
      const issue = decimalIssue(values.awardedPercent, DECIMAL_SPECS.percent, true);
      if (issue) {
        issues.awardedPercent = issue;
      }
    }
  }
  if (!values.decisionDate) {
    issues.decisionDate = REQUIRED_MESSAGE;
  } else if (!isCalendarDate(values.decisionDate)) {
    issues.decisionDate = DATE_MESSAGE;
  }
  if (values.comments.length > OPPORTUNITY_LIMITS.resultComments) {
    issues.comments = maxMessage(OPPORTUNITY_LIMITS.resultComments);
  }
  return issues;
}

/** Cuerpo del resultado para la API: el porcentaje solo en `PARTIAL` (E2b #7, `RESULT_PERCENT_NOT_ALLOWED`). */
export function toResultInput(values: ResultFormValues, outcomes: readonly OutcomeOption[]): OpportunityResultInput {
  const outcome = outcomes.find((option) => option.code === values.outcome);
  const input: OpportunityResultInput = {
    outcome: values.outcome as OpportunityOutcome,
    decisionDate: values.decisionDate,
    reasonId: values.reasonId || null,
    comments: textOrNull(values.comments),
  };
  if (outcome?.requiresAwardedPercent) {
    input.awardedPercent = canonical(values.awardedPercent, DECIMAL_SPECS.percent);
  }
  return input;
}

const resultShape = {
  outcome: z.string(),
  reasonId: z.string(),
  awardedPercent: z.string(),
  decisionDate: z.string(),
  comments: z.string(),
};

/** Esquema de "Modificar resultado" (`PUT /result`, RN-03.52). */
export function buildResultSchema(context: ResultRulesContext) {
  return z.object(resultShape).superRefine((values, ctx) => {
    for (const [path, message] of Object.entries(resultIssues(values, context))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    }
  });
}

/** Valores iniciales del formulario desde el resultado vigente. */
export function resultValuesFrom(result: OpportunityDetail['result']): ResultFormValues {
  if (!result) {
    return emptyResultValues();
  }
  return {
    outcome: result.outcome,
    reasonId: result.reason?.id ?? '',
    awardedPercent: result.awardedPercent ? (canonical(result.awardedPercent, DECIMAL_SPECS.percent) ?? result.awardedPercent) : '',
    decisionDate: result.decisionDate,
    comments: result.comments ?? '',
  };
}

// ---------------------------------------------------------------------------
// Cambio de etapa (F-17, F-18)
// ---------------------------------------------------------------------------

export interface StageChangeFormValues extends ResultFormValues {
  toStageId: string;
  comment: string;
}

export interface StageChangeContext {
  current: OpportunityStage;
  /** `allowedTransitions` del detalle. */
  transitions: readonly OpportunityStage[];
  outcomes: readonly OutcomeOption[];
  reasons: readonly ReasonOption[];
}

/** Reabrir = de una etapa cerrada a una abierta (RN-03.42): comentario obligatorio y se anula el resultado. */
export function isReopening(current: OpportunityStage, target: OpportunityStage | undefined): boolean {
  return Boolean(target && current.isClosed && !target.isClosed);
}

export function buildStageChangeSchema({ current, transitions, outcomes, reasons }: StageChangeContext) {
  return z
    .object({
      ...resultShape,
      toStageId: z.string().min(1, 'Elige la etapa destino.'),
      comment: z.string().max(OPPORTUNITY_LIMITS.comment, maxMessage(OPPORTUNITY_LIMITS.comment)),
    })
    .superRefine((values, ctx) => {
      const target = transitions.find((stage) => stage.id === values.toStageId);
      if (!target) {
        if (values.toStageId) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['toStageId'], message: 'Este destino no está permitido.' });
        }
        return;
      }
      if (isReopening(current, target) && !values.comment.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['comment'], message: 'Escribe el motivo de la reapertura.' });
      }
      if (target.isClosed) {
        const issues = resultIssues(values, { outcomes: outcomesForStage(outcomes, target.outcome), reasons });
        for (const [path, message] of Object.entries(issues)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
        }
      }
    });
}

/** Cuerpo de `POST /stage-changes`: el resultado solo si la destino es cerrada (RN-03.46). */
export function toStageChangeInput(values: StageChangeFormValues, { transitions, outcomes }: StageChangeContext): StageChangeInput {
  const target = transitions.find((stage) => stage.id === values.toStageId);
  const input: StageChangeInput = { toStageId: values.toStageId, comment: textOrNull(values.comment) };
  if (target?.isClosed) {
    input.result = toResultInput(values, outcomesForStage(outcomes, target.outcome));
  }
  return input;
}

// ---------------------------------------------------------------------------
// Alta y edición (F-17, C.11)
// ---------------------------------------------------------------------------

export interface OpportunityFormValues {
  /** Solo en el alta: etapa inicial abierta. */
  stageId: string;
  opportunityDate: string;
  /** `''` = el propio usuario (alta) o sin cambio (edición). */
  ownerId: string;
  estimatedAmount: string;
  currencyCode: string;
  estimatedTonnage: string;
  description: string;
  nextAction: string;
  nextActionDate: string;
}

export function buildOpportunitySchema() {
  return z
    .object({
      stageId: z.string(),
      opportunityDate: z.string(),
      ownerId: z.string(),
      estimatedAmount: z.string(),
      currencyCode: z.string(),
      estimatedTonnage: z.string(),
      description: z.string().max(OPPORTUNITY_LIMITS.description, maxMessage(OPPORTUNITY_LIMITS.description)),
      nextAction: z.string().max(OPPORTUNITY_LIMITS.nextAction, maxMessage(OPPORTUNITY_LIMITS.nextAction)),
      nextActionDate: z.string(),
    })
    .superRefine((values, ctx) => {
      const issue = (path: keyof OpportunityFormValues, message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      if (!values.opportunityDate) {
        issue('opportunityDate', REQUIRED_MESSAGE);
      } else if (!isCalendarDate(values.opportunityDate)) {
        issue('opportunityDate', DATE_MESSAGE);
      }
      if (values.nextActionDate && !isCalendarDate(values.nextActionDate)) {
        issue('nextActionDate', DATE_MESSAGE);
      }
      const amountIssue = decimalIssue(values.estimatedAmount, DECIMAL_SPECS.money, false);
      if (amountIssue) {
        issue('estimatedAmount', amountIssue);
      }
      // RN-03.38: un monto sin moneda no se admite (el servidor no aplica moneda por defecto).
      if (values.estimatedAmount.trim() && !values.currencyCode) {
        issue('currencyCode', 'Elige la moneda del monto.');
      }
      const tonnageIssue = decimalIssue(values.estimatedTonnage, DECIMAL_SPECS.tonnage, false);
      if (tonnageIssue) {
        issue('estimatedTonnage', tonnageIssue);
      }
    });
}

/** Alta: lo vacío se omite (valor por defecto del backend); la moneda solo acompaña a un monto. */
export function toCreateOpportunityInput(values: OpportunityFormValues): CreateOpportunityInput {
  const input: CreateOpportunityInput = { opportunityDate: values.opportunityDate };
  if (values.stageId) input.stageId = values.stageId;
  if (values.ownerId) input.ownerId = values.ownerId;
  const amount = canonical(values.estimatedAmount, DECIMAL_SPECS.money);
  if (amount !== null) {
    input.estimatedAmount = amount;
    input.currencyCode = values.currencyCode;
  }
  const tonnage = canonical(values.estimatedTonnage, DECIMAL_SPECS.tonnage);
  if (tonnage !== null) input.estimatedTonnage = tonnage;
  const description = textOrNull(values.description);
  if (description) input.description = description;
  const nextAction = textOrNull(values.nextAction);
  if (nextAction) input.nextAction = nextAction;
  if (values.nextActionDate) input.nextActionDate = values.nextActionDate;
  return input;
}

function sameDecimal(left: string | null, right: string | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return compareDecimals(left, right) === 0;
}

/**
 * Edición: solo lo que cambió (RN-03.82: tocar monto, moneda o fecha vuelve a
 * resolver la tasa; el resto conserva la foto). Monto vacío borra la estimación
 * (monto y moneda a `null`).
 */
export function toUpdateOpportunityInput(original: OpportunityDetail, values: OpportunityFormValues): UpdateOpportunityInput {
  const input: UpdateOpportunityInput = {};
  if (values.opportunityDate !== original.opportunityDate) input.opportunityDate = values.opportunityDate;
  if (values.ownerId && values.ownerId !== original.owner.id) input.ownerId = values.ownerId;

  const amount = canonical(values.estimatedAmount, DECIMAL_SPECS.money);
  const originalAmount = original.estimatedAmount ? canonical(original.estimatedAmount, DECIMAL_SPECS.money) : null;
  const currency = amount === null ? null : values.currencyCode;
  if (!sameDecimal(amount, originalAmount) || currency !== (original.currencyCode ?? null)) {
    input.estimatedAmount = amount;
    input.currencyCode = currency;
  }
  const tonnage = canonical(values.estimatedTonnage, DECIMAL_SPECS.tonnage);
  const originalTonnage = original.estimatedTonnage ? canonical(original.estimatedTonnage, DECIMAL_SPECS.tonnage) : null;
  if (!sameDecimal(tonnage, originalTonnage)) input.estimatedTonnage = tonnage;

  const description = textOrNull(values.description);
  if (description !== (original.description ?? null)) input.description = description;
  const nextAction = textOrNull(values.nextAction);
  if (nextAction !== (original.nextAction ?? null)) input.nextAction = nextAction;
  const nextActionDate = values.nextActionDate || null;
  if (nextActionDate !== (original.nextActionDate ?? null)) input.nextActionDate = nextActionDate;
  return input;
}

/** Valores iniciales: alta con los valores por defecto de `form-options`; edición con la oportunidad. */
export function opportunityFormValues(
  opportunity: OpportunityDetail | null | undefined,
  defaults: { stageId: string; opportunityDate: string; currencyCode: string },
): OpportunityFormValues {
  if (opportunity) {
    return {
      stageId: opportunity.stage.id,
      opportunityDate: opportunity.opportunityDate,
      ownerId: opportunity.owner.id,
      estimatedAmount: opportunity.estimatedAmount ? (canonical(opportunity.estimatedAmount, DECIMAL_SPECS.money) ?? '') : '',
      currencyCode: opportunity.currencyCode ?? defaults.currencyCode,
      estimatedTonnage: opportunity.estimatedTonnage ? (canonical(opportunity.estimatedTonnage, DECIMAL_SPECS.tonnage) ?? '') : '',
      description: opportunity.description ?? '',
      nextAction: opportunity.nextAction ?? '',
      nextActionDate: opportunity.nextActionDate ?? '',
    };
  }
  return {
    stageId: defaults.stageId,
    opportunityDate: defaults.opportunityDate,
    ownerId: '',
    estimatedAmount: '',
    currencyCode: defaults.currencyCode,
    estimatedTonnage: '',
    description: '',
    nextAction: '',
    nextActionDate: '',
  };
}
