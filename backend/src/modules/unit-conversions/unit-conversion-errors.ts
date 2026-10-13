import { BusinessRuleViolationError } from '@/common/errors/application-error';

import type { ConversionRuleIssue, TonnageUnitIssue } from './conversion-precedence';

/** `422`: no hay regla activa aplicable hacia la unidad de tonelaje (RN-03.27/28, AC-03.32). */
export const CONVERSION_RULE_NOT_FOUND = 'CONVERSION_RULE_NOT_FOUND';
/** `422`: la regla indicada existe pero no es aplicable (inactiva, otra unidad, otro ámbito; RN-03.28). */
export const INVALID_CONVERSION_RULE = 'INVALID_CONVERSION_RULE';

export function conversionRuleNotFoundError(field: string, details: { fromUnitId: string; toUnitCode: string }): BusinessRuleViolationError {
  return new BusinessRuleViolationError(CONVERSION_RULE_NOT_FOUND, 'There is no active conversion rule to the tonnage unit', [
    { field, code: CONVERSION_RULE_NOT_FOUND, fromUnitId: details.fromUnitId, toUnitCode: details.toUnitCode },
  ]);
}

export function invalidConversionRuleError(field: string, ruleId: string, issues: readonly ConversionRuleIssue[] | ['NOT_FOUND']): BusinessRuleViolationError {
  return new BusinessRuleViolationError(INVALID_CONVERSION_RULE, 'The conversion rule is not applicable', [
    { field, code: INVALID_CONVERSION_RULE, ruleId, reasons: [...issues] },
  ]);
}

/**
 * La unidad de tonelaje configurada no es utilizable (RN-07.33 roto por fuera de la
 * API, p. ej. la unidad se desactivó). Es un fallo de **configuración**, no del
 * usuario: la API responde `500` con `correlationId` (mismo criterio que
 * `SequenceNotFoundError`). `PATCH /parameters/crm.forecast.unidad_tonelaje` ya
 * impide guardar un valor así.
 */
export class TonnageUnitUnavailableError extends Error {
  constructor(
    readonly unitCode: string,
    readonly issues: readonly TonnageUnitIssue[],
  ) {
    super(`Tonnage unit ${unitCode} is not usable: ${issues.join(', ')}`);
    this.name = 'TonnageUnitUnavailableError';
  }
}
