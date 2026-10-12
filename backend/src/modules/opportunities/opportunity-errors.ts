import {
  AccessDeniedError,
  BusinessRuleViolationError,
  RequestValidationError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '@/common/errors/application-error';

/**
 * Códigos de error de Oportunidades y Resultados (03 §L.6). Los compartidos
 * (`RESOURCE_NOT_FOUND`, `PERMISSION_DENIED`, `INVALID_CATALOG_VALUE`,
 * `CURRENCY_NOT_ALLOWED`, `EXCHANGE_RATE_NOT_FOUND`) los emiten sus piezas de origen.
 * Sin marca = `422`.
 */
export const OPPORTUNITY_ERROR_CODES = {
  requiredFieldMissing: 'REQUIRED_FIELD_MISSING',
  invalidDateRange: 'INVALID_DATE_RANGE',
  invalidOwner: 'INVALID_OWNER',
  fieldNotEditable: 'FIELD_NOT_EDITABLE',
  invalidInitialStage: 'INVALID_INITIAL_STAGE',
  invalidStageTransition: 'INVALID_STAGE_TRANSITION',
  stageUnchanged: 'STAGE_UNCHANGED',
  commentRequired: 'COMMENT_REQUIRED',
  currencyRequired: 'CURRENCY_REQUIRED',
  resultRequired: 'RESULT_REQUIRED',
  resultNotAllowed: 'RESULT_NOT_ALLOWED',
  resultStageMismatch: 'RESULT_STAGE_MISMATCH',
  resultReasonRequired: 'RESULT_REASON_REQUIRED',
  resultPercentRequired: 'RESULT_PERCENT_REQUIRED',
  resultPercentNotAllowed: 'RESULT_PERCENT_NOT_ALLOWED',
  invalidProgress: 'INVALID_PROGRESS',
  /** 409 */
  opportunityNotClosed: 'OPPORTUNITY_NOT_CLOSED',
  /** 409 */
  opportunityClosed: 'OPPORTUNITY_CLOSED',
  /** 409 */
  opportunityHasDependencies: 'OPPORTUNITY_HAS_DEPENDENCIES',
} as const;

export const OPPORTUNITY_RESOURCE = 'Opportunity';

/** Mensajes fijos por código: nunca repiten el valor recibido (SECURITY.md). */
const ISSUE_MESSAGES: Readonly<Record<string, string>> = {
  [OPPORTUNITY_ERROR_CODES.requiredFieldMissing]: 'The field is required',
  [OPPORTUNITY_ERROR_CODES.invalidDateRange]: 'The end date cannot be earlier than the start date',
  [OPPORTUNITY_ERROR_CODES.invalidOwner]: 'The owner is not an eligible active user within your scope',
  [OPPORTUNITY_ERROR_CODES.invalidInitialStage]: 'An opportunity must be created in an open stage',
  [OPPORTUNITY_ERROR_CODES.invalidStageTransition]: 'The stage transition is not allowed',
  [OPPORTUNITY_ERROR_CODES.stageUnchanged]: 'The opportunity is already in that stage',
  [OPPORTUNITY_ERROR_CODES.commentRequired]: 'A comment is required to reopen the opportunity',
  [OPPORTUNITY_ERROR_CODES.currencyRequired]: 'An estimated amount requires a currency',
  [OPPORTUNITY_ERROR_CODES.resultRequired]: 'Moving to a closed stage requires the result',
  [OPPORTUNITY_ERROR_CODES.resultNotAllowed]: 'A result can only be recorded when moving to a closed stage',
  [OPPORTUNITY_ERROR_CODES.resultStageMismatch]: 'The result does not correspond to the closed stage',
  [OPPORTUNITY_ERROR_CODES.resultReasonRequired]: 'The result requires a reason',
  [OPPORTUNITY_ERROR_CODES.resultPercentRequired]: 'The result requires the awarded percentage',
  [OPPORTUNITY_ERROR_CODES.resultPercentNotAllowed]: 'The awarded percentage only applies to a partial result',
  [OPPORTUNITY_ERROR_CODES.invalidProgress]: 'The percentage must be between 0 and 100',
};

/** Incidencia de negocio de un campo (`details[]` de un `422`). */
export interface OpportunityIssue {
  readonly field: string;
  readonly code: string;
  readonly message: string;
  readonly [extra: string]: unknown;
}

export function opportunityIssue(field: string, code: string, extra: Record<string, unknown> = {}): OpportunityIssue {
  return { field, code, message: ISSUE_MESSAGES[code] ?? 'The value is not valid', ...extra };
}

/** `422` con todas las incidencias; el código de la respuesta es el de la primera (AGENTS §9.4). */
export function opportunityIssuesError(issues: readonly OpportunityIssue[]): BusinessRuleViolationError {
  const first = issues[0];
  return new BusinessRuleViolationError(
    first?.code ?? 'VALIDATION_FAILED',
    issues.length === 1 ? (first?.message ?? 'The value is not valid') : 'Some fields are not valid',
    issues.map((issue) => ({ ...issue })),
  );
}

export function opportunityNotFound(opportunityId: string): ResourceNotFoundError {
  return new ResourceNotFoundError(OPPORTUNITY_RESOURCE, opportunityId);
}

/** `403 FIELD_NOT_EDITABLE` (RN-03.38): `details[]` = `{ field, requiredPermission }` (misma forma que 02 y E2a). */
export function fieldNotEditableError(field: string, requiredPermission: string): AccessDeniedError {
  return new AccessDeniedError(OPPORTUNITY_ERROR_CODES.fieldNotEditable, 'The field cannot be edited by the current user', [
    { field, requiredPermission },
  ]);
}

/** `409 OPPORTUNITY_NOT_CLOSED` (`PUT /result` sobre una abierta): `details[0]` = `{ stageId, stageCode }`. */
export function opportunityNotClosedError(stage: { readonly id: string; readonly code: string }): ResourceConflictError {
  return new ResourceConflictError(
    'The opportunity is not in a closed stage',
    [{ stageId: stage.id, stageCode: stage.code }],
    OPPORTUNITY_ERROR_CODES.opportunityNotClosed,
  );
}

/** `409 OPPORTUNITY_CLOSED` (RN-03.45, D-03.12): `details[0]` = `{ stageId, stageCode }`. */
export function opportunityClosedError(stage: { readonly id: string; readonly code: string }): ResourceConflictError {
  return new ResourceConflictError(
    'A closed opportunity cannot be deleted',
    [{ stageId: stage.id, stageCode: stage.code }],
    OPPORTUNITY_ERROR_CODES.opportunityClosed,
  );
}

export interface OpportunityDependencies {
  readonly activeProducts: number;
  readonly openActivities: number;
}

/** `409 OPPORTUNITY_HAS_DEPENDENCIES` (RN-03.45): `details[]` = `{ dependency, count }` de cada bloqueo > 0. */
export function opportunityHasDependenciesError(dependencies: OpportunityDependencies): ResourceConflictError {
  const details = (Object.entries(dependencies) as [keyof OpportunityDependencies, number][])
    .filter(([, count]) => count > 0)
    .map(([dependency, count]) => ({ dependency, count }));
  return new ResourceConflictError('The opportunity has active dependencies', details, OPPORTUNITY_ERROR_CODES.opportunityHasDependencies);
}

/** `400 VALIDATION_FAILED` detectado por el servicio (misma forma que el `ValidationPipe`). */
export function fieldValidationError(field: string, issue: string): RequestValidationError {
  return new RequestValidationError('Request validation failed', [{ field, issue }]);
}
