import { compareDecimal, type DecimalString, isDecimalString, roundDecimal } from '@/common/decimal';

import { PROJECT_ERROR_CODES, type ProjectIssue, projectIssue } from './project-errors';

/**
 * Reglas puras de la fase del cliente (03 C.6, RN-03.32–RN-03.35).
 */

export const PROGRESS_SCALE = 2;

/** `crm.proyectos.reglas_avance`: `{ CODIGO_FASE: { progresoMinimo } }`. */
export type ProgressRules = Readonly<Record<string, { readonly progresoMinimo: number }>>;

/** RN-03.33: 0 ≤ porcentaje ≤ 100, hasta 2 decimales. */
export function progressIssue(progress: DecimalString, field = 'progress'): ProjectIssue | null {
  const valid =
    isDecimalString(progress, { maxScale: PROGRESS_SCALE, maxIntegerDigits: 3, allowNegative: true }) &&
    compareDecimal(progress, '0') >= 0 &&
    compareDecimal(progress, '100') <= 0;
  return valid ? null : projectIssue(field, PROJECT_ERROR_CODES.invalidProgress, { min: '0', max: '100' });
}

/** RN-03.34: la fase destino con `progresoMinimo` exige porcentaje ≥ ese valor. */
export function progressRuleIssue(phaseCode: string, progress: DecimalString, rules: ProgressRules): ProjectIssue | null {
  const rule = rules[phaseCode];
  if (!rule) return null;
  const minimum = roundDecimal(String(rule.progresoMinimo), PROGRESS_SCALE);
  if (compareDecimal(progress, minimum) >= 0) return null;
  return {
    field: 'progress',
    code: PROJECT_ERROR_CODES.phaseProgressRule,
    message: 'The progress is below the minimum required by the phase',
    phaseCode,
    minimumProgress: minimum,
  };
}

export interface PhaseState {
  readonly phaseId: string;
  readonly progress: DecimalString;
}

/**
 * Porcentaje que se aplica (RN-03.34): el enviado; si no se envía y la fase cambia,
 * `defaultProgress` de la fase destino o, sin él, el porcentaje actual; si la fase no
 * cambia, el actual (y el cambio será `PHASE_UNCHANGED`).
 */
export function resolveTargetProgress(
  current: PhaseState,
  target: { readonly phaseId: string; readonly defaultProgress: DecimalString | null },
  sent: DecimalString | undefined,
): DecimalString {
  if (sent !== undefined) return sent;
  if (target.phaseId !== current.phaseId && target.defaultProgress !== null) return target.defaultProgress;
  return current.progress;
}

/** RN-03.35: un cambio sin diferencias (misma fase y mismo porcentaje) se rechaza. */
export function isPhaseUnchanged(current: PhaseState, next: PhaseState): boolean {
  return current.phaseId === next.phaseId && compareDecimal(current.progress, next.progress) === 0;
}

/** `metadata.defaultProgress` de una fase como decimal de 2 posiciones, o `null`. */
export function defaultProgressOf(metadata: Readonly<Record<string, unknown>> | null): DecimalString | null {
  const value = metadata?.['defaultProgress'];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null;
  return roundDecimal(String(value), PROGRESS_SCALE);
}
