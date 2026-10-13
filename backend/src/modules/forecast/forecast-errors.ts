import {
  AccessDeniedError,
  BusinessRuleViolationError,
  RequestValidationError,
  ResourceConflictError,
} from '@/common/errors/application-error';

/**
 * Códigos de error del forecast (03 F.3, C.10). `RESOURCE_NOT_FOUND` (proyecto no visible,
 * inexistente o eliminado) y `PERMISSION_DENIED` los emiten sus piezas de origen
 * (`projectNotFound` de Proyectos: mismo cuerpo que el resto del módulo).
 */
export const FORECAST_ERROR_CODES = {
  duplicateInBatch: 'FORECAST_DUPLICATE_IN_BATCH',
  periodOutOfWindow: 'FORECAST_PERIOD_OUT_OF_WINDOW',
  invalidQuantity: 'INVALID_QUANTITY',
  productNotAssociated: 'PRODUCT_NOT_ASSOCIATED',
  invalidOwner: 'INVALID_OWNER',
  unknownReference: 'UNKNOWN_REFERENCE',
  invalidDateRange: 'INVALID_DATE_RANGE',
  fieldNotEditable: 'FIELD_NOT_EDITABLE',
  lineStale: 'FORECAST_LINE_STALE',
} as const;

/** Mensajes fijos por código: nunca repiten el valor recibido (SECURITY.md). */
const ISSUE_MESSAGES: Readonly<Record<string, string>> = {
  [FORECAST_ERROR_CODES.duplicateInBatch]: 'The same project, product and period appear more than once in the batch',
  [FORECAST_ERROR_CODES.periodOutOfWindow]: 'The period is outside the editable forecast window',
  [FORECAST_ERROR_CODES.invalidQuantity]: 'The quantity must be a decimal greater than or equal to zero',
  [FORECAST_ERROR_CODES.productNotAssociated]: 'The product has no active association with the project',
  [FORECAST_ERROR_CODES.invalidOwner]: 'The owner is not an eligible active user within your scope',
  [FORECAST_ERROR_CODES.unknownReference]: 'The referenced record does not exist or is inactive',
  [FORECAST_ERROR_CODES.invalidDateRange]: 'The end period cannot be earlier than the start period',
};

/** Incidencia de negocio (`details[]` de un `422`): `{ field, code, message, …extra }`. */
export interface ForecastIssue {
  readonly field: string;
  readonly code: string;
  readonly message: string;
  readonly [extra: string]: unknown;
}

export function forecastIssue(field: string, code: string, extra: Record<string, unknown> = {}): ForecastIssue {
  return { field, code, message: ISSUE_MESSAGES[code] ?? 'The value is not valid', ...extra };
}

/** Ruta de un campo de una línea del lote: `lines[3].quantity` (RN-03.72). */
export function lineField(index: number, field: string): string {
  return `lines[${index}].${field}`;
}

/** Incidencia de la línea `index`: lleva además `index` para que la interfaz la pinte en su celda. */
export function lineIssue(index: number, field: string, code: string, extra: Record<string, unknown> = {}): ForecastIssue {
  return forecastIssue(lineField(index, field), code, { index, ...extra });
}

/**
 * `422` con **todas** las incidencias del paso (AGENTS §9.4). El código de la respuesta es
 * el de la primera; cada elemento de `details` lleva el suyo.
 */
export function forecastIssuesError(issues: readonly ForecastIssue[]): BusinessRuleViolationError {
  const first = issues[0];
  return new BusinessRuleViolationError(
    first?.code ?? 'VALIDATION_FAILED',
    issues.length === 1 ? (first?.message ?? 'The value is not valid') : 'Some lines are not valid',
    issues.map((issue) => ({ ...issue })),
  );
}

/** `403 FIELD_NOT_EDITABLE` (RN-03.70): `details[]` = `{ field: 'lines[i].ownerId', requiredPermission }`. */
export function lineOwnerNotEditableError(fields: readonly string[], requiredPermission: string): AccessDeniedError {
  return new AccessDeniedError(
    FORECAST_ERROR_CODES.fieldNotEditable,
    fields.length === 1 ? 'The field cannot be edited by the current user' : 'Some fields cannot be edited by the current user',
    fields.map((field) => ({ field, requiredPermission })),
  );
}

export interface StaleLine {
  readonly index: number;
  readonly lineId: string | null;
  readonly updatedAt: Date | null;
}

/** `409 FORECAST_LINE_STALE` (RN-03.73, D-03.6): `details[]` = `{ index, lineId, updatedAt }` de cada línea en conflicto. */
export function forecastLineStaleError(lines: readonly StaleLine[]): ResourceConflictError {
  return new ResourceConflictError(
    'Some forecast lines were modified by another user',
    lines.map((line) => ({ index: line.index, lineId: line.lineId, updatedAt: line.updatedAt ? line.updatedAt.toISOString() : null })),
    FORECAST_ERROR_CODES.lineStale,
  );
}

/** `400 VALIDATION_FAILED` detectado por el servicio (misma forma que el `ValidationPipe`). */
export function forecastFieldValidationError(field: string, issue: string): RequestValidationError {
  return new RequestValidationError('Request validation failed', [{ field, issue }]);
}
