import {
  AccessDeniedError,
  BusinessRuleViolationError,
  RequestValidationError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '@/common/errors/application-error';

/**
 * Códigos de error del Módulo 3 en el alcance de E2a (03 §L.6). Los compartidos
 * (`RESOURCE_NOT_FOUND`, `PERMISSION_DENIED`, `CUSTOMER_INACTIVE`, `INVALID_CATALOG_VALUE`,
 * `CONVERSION_RULE_NOT_FOUND`, `INVALID_CONVERSION_RULE`) los emiten sus piezas de origen.
 */
export const PROJECT_ERROR_CODES = {
  requiredFieldMissing: 'REQUIRED_FIELD_MISSING',
  invalidDateRange: 'INVALID_DATE_RANGE',
  invalidOwner: 'INVALID_OWNER',
  unknownReference: 'UNKNOWN_REFERENCE',
  fieldNotEditable: 'FIELD_NOT_EDITABLE',
  projectCodeTaken: 'PROJECT_CODE_TAKEN',
  projectCustomerLocked: 'PROJECT_CUSTOMER_LOCKED',
  projectHasActiveChildren: 'PROJECT_HAS_ACTIVE_CHILDREN',
  invalidQuantity: 'INVALID_QUANTITY',
  invalidProgress: 'INVALID_PROGRESS',
  phaseProgressRule: 'PHASE_PROGRESS_RULE',
  phaseUnchanged: 'PHASE_UNCHANGED',
  productInactive: 'PRODUCT_INACTIVE',
  opportunityNotInProject: 'OPPORTUNITY_NOT_IN_PROJECT',
  projectProductDuplicate: 'PROJECT_PRODUCT_DUPLICATE',
  productHasForecast: 'PRODUCT_HAS_FORECAST',
} as const;

export const PROJECT_RESOURCE = 'Project';
export const PROJECT_PRODUCT_RESOURCE = 'ProjectProduct';

/** Mensajes fijos por código: nunca repiten el valor recibido (SECURITY.md). */
const ISSUE_MESSAGES: Readonly<Record<string, string>> = {
  [PROJECT_ERROR_CODES.requiredFieldMissing]: 'The field is required',
  [PROJECT_ERROR_CODES.invalidDateRange]: 'The end date cannot be earlier than the start date',
  [PROJECT_ERROR_CODES.invalidOwner]: 'The owner is not an eligible active user within your scope',
  [PROJECT_ERROR_CODES.unknownReference]: 'The referenced record does not exist or is inactive',
  [PROJECT_ERROR_CODES.invalidQuantity]: 'The quantity must be a decimal greater than or equal to zero',
  [PROJECT_ERROR_CODES.invalidProgress]: 'The progress must be between 0 and 100',
  [PROJECT_ERROR_CODES.productInactive]: 'The product is inactive',
  [PROJECT_ERROR_CODES.opportunityNotInProject]: 'The opportunity does not belong to the project',
};

/** Incidencia de negocio de un campo (`details[]` de un `422`). */
export interface ProjectIssue {
  readonly field: string;
  readonly code: string;
  readonly message: string;
  readonly [extra: string]: unknown;
}

export function projectIssue(field: string, code: string, extra: Record<string, unknown> = {}): ProjectIssue {
  return { field, code, message: ISSUE_MESSAGES[code] ?? 'The value is not valid', ...extra };
}

/**
 * `422` con **todas** las incidencias (AGENTS §9.4). El código de la respuesta es el
 * de la primera; cada elemento de `details` lleva el suyo.
 */
export function projectIssuesError(issues: readonly ProjectIssue[]): BusinessRuleViolationError {
  const first = issues[0];
  return new BusinessRuleViolationError(
    first?.code ?? 'VALIDATION_FAILED',
    issues.length === 1 ? (first?.message ?? 'The value is not valid') : 'Some fields are not valid',
    issues.map((issue) => ({ ...issue })),
  );
}

export function projectNotFound(projectId: string): ResourceNotFoundError {
  return new ResourceNotFoundError(PROJECT_RESOURCE, projectId);
}

export function projectProductNotFound(projectProductId: string): ResourceNotFoundError {
  return new ResourceNotFoundError(PROJECT_PRODUCT_RESOURCE, projectProductId);
}

/** `403 FIELD_NOT_EDITABLE` (RN-03.6, DM-17): `details[]` = `{ field, requiredPermission }`. */
export function fieldNotEditableError(fields: readonly string[], requiredPermission: string): AccessDeniedError {
  return new AccessDeniedError(
    PROJECT_ERROR_CODES.fieldNotEditable,
    fields.length === 1 ? 'The field cannot be edited by the current user' : 'Some fields cannot be edited by the current user',
    fields.map((field) => ({ field, requiredPermission })),
  );
}

/** `409 PROJECT_CODE_TAKEN` (RN-03.1): `details[0]` = `{ field: 'code', code }`. */
export function projectCodeTakenError(code: string): ResourceConflictError {
  return new ResourceConflictError('The project code is already in use', [{ field: 'code', code }], PROJECT_ERROR_CODES.projectCodeTaken);
}

/** `409 PROJECT_CUSTOMER_LOCKED` (RN-03.10): `details[]` = `{ dependency: 'visits'|'activities', count }`. */
export function projectCustomerLockedError(counts: { readonly visits: number; readonly activities: number }): ResourceConflictError {
  return new ResourceConflictError(
    'The customer of a project with linked visits or activities cannot change',
    [
      { field: 'customerId', dependency: 'visits', count: counts.visits },
      { field: 'customerId', dependency: 'activities', count: counts.activities },
    ].filter((entry) => entry.count > 0),
    PROJECT_ERROR_CODES.projectCustomerLocked,
  );
}

export interface ProjectBlockingChildren {
  readonly openOpportunities: number;
  readonly productsWithForecast: number;
  readonly nonCancelledVisits: number;
  readonly openActivities: number;
}

/** `409 PROJECT_HAS_ACTIVE_CHILDREN` (RN-03.12): `details[]` = `{ dependency, count }` de cada bloqueo > 0. */
export function projectHasActiveChildrenError(children: ProjectBlockingChildren): ResourceConflictError {
  const details = (Object.entries(children) as [keyof ProjectBlockingChildren, number][])
    .filter(([, count]) => count > 0)
    .map(([dependency, count]) => ({ dependency, count }));
  return new ResourceConflictError('The project has active children', details, PROJECT_ERROR_CODES.projectHasActiveChildren);
}

/** `409 PROJECT_PRODUCT_DUPLICATE` (RN-03.59): `details[0]` = `{ field, projectProductId, productId, opportunityId }`. */
export function projectProductDuplicateError(existing: {
  readonly id: string;
  readonly productId: string;
  readonly opportunityId: string | null;
}): ResourceConflictError {
  return new ResourceConflictError(
    'The product is already associated with the project (and opportunity)',
    [{ field: 'productId', projectProductId: existing.id, productId: existing.productId, opportunityId: existing.opportunityId }],
    PROJECT_ERROR_CODES.projectProductDuplicate,
  );
}

/** `409 PRODUCT_HAS_FORECAST` (RN-03.61): `details[0]` = `{ productId, periods: ['YYYY-MM', …] }`. */
export function productHasForecastError(productId: string, periods: readonly string[]): ResourceConflictError {
  return new ResourceConflictError(
    'The product has forecast in the current window and no other active association',
    [{ productId, periods: [...periods] }],
    PROJECT_ERROR_CODES.productHasForecast,
  );
}

/** `400 VALIDATION_FAILED` detectado por el servicio (misma forma que el `ValidationPipe`). */
export function fieldValidationError(field: string, issue: string): RequestValidationError {
  return new RequestValidationError('Request validation failed', [{ field, issue }]);
}
