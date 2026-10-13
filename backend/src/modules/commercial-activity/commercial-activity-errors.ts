import {
  AccessDeniedError,
  BusinessRuleViolationError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '@/common/errors/application-error';
import type { FieldIssue } from '@/common/errors/field-issue';

import type { LifecycleViolation } from './activity-lifecycle';

/**
 * Códigos de error del Módulo 4 (04 F.5). Los de cliente y contacto
 * (`CUSTOMER_INACTIVE`, `INVALID_CONTACT`, `CONTACT_INACTIVE`) los emite
 * `CustomerReferenceGuard` (02 F.6.3) e `INVALID_CATALOG_VALUE`, `CatalogReferenceValidator`.
 */
export const COMMERCIAL_ERROR_CODES = {
  requiredFieldMissing: 'REQUIRED_FIELD_MISSING',
  unknownReference: 'UNKNOWN_REFERENCE',
  inactiveReference: 'INACTIVE_REFERENCE',
  projectCustomerMismatch: 'PROJECT_CUSTOMER_MISMATCH',
  opportunityProjectMismatch: 'OPPORTUNITY_PROJECT_MISMATCH',
  opportunityRequiresProject: 'OPPORTUNITY_REQUIRES_PROJECT',
  ownerNotEligible: 'OWNER_NOT_ELIGIBLE',
  invalidDateRange: 'INVALID_DATE_RANGE',
  actualDateInFuture: 'ACTUAL_DATE_IN_FUTURE',
  dateInPast: 'DATE_IN_PAST',
  rescheduleSameDate: 'RESCHEDULE_SAME_DATE',
  reasonRequired: 'REASON_REQUIRED',
  confirmationSummaryRequired: 'CONFIRMATION_SUMMARY_REQUIRED',
  resultRequired: 'RESULT_REQUIRED',
  fieldNotApplicable: 'FIELD_NOT_APPLICABLE',
  useReschedule: 'USE_RESCHEDULE',
  useLifecycleOperation: 'USE_LIFECYCLE_OPERATION',
  invalidStatusTransition: 'INVALID_STATUS_TRANSITION',
  recordReadOnly: 'RECORD_READ_ONLY',
  scheduleConflict: 'SCHEDULE_CONFLICT',
  rangeTooWide: 'RANGE_TOO_WIDE',
  visitConfirmationOwnerOnly: 'VISIT_CONFIRMATION_OWNER_ONLY',
  invalidContact: 'INVALID_CONTACT',
} as const;

export const ACTIVITY_RESOURCE = 'Activity';

/** Mensajes fijos por código: nunca repiten el valor recibido (SECURITY.md). */
const MESSAGES: Readonly<Record<string, string>> = {
  [COMMERCIAL_ERROR_CODES.requiredFieldMissing]: 'The field is required',
  [COMMERCIAL_ERROR_CODES.unknownReference]: 'The referenced record does not exist or is not visible',
  [COMMERCIAL_ERROR_CODES.inactiveReference]: 'The referenced record is inactive or deleted',
  [COMMERCIAL_ERROR_CODES.projectCustomerMismatch]: 'The project does not belong to the customer',
  [COMMERCIAL_ERROR_CODES.opportunityProjectMismatch]: 'The opportunity does not belong to the project',
  [COMMERCIAL_ERROR_CODES.opportunityRequiresProject]: 'An opportunity requires a project',
  [COMMERCIAL_ERROR_CODES.ownerNotEligible]: 'The owner is not an eligible active user within your scope',
  [COMMERCIAL_ERROR_CODES.actualDateInFuture]: 'The date cannot be in the future',
  [COMMERCIAL_ERROR_CODES.resultRequired]: 'A result (catalog value or notes) is required',
  [COMMERCIAL_ERROR_CODES.fieldNotApplicable]: 'The field does not apply to the activity type',
  [COMMERCIAL_ERROR_CODES.useLifecycleOperation]: 'Use the completion or cancellation operation to change to this status',
  [COMMERCIAL_ERROR_CODES.invalidContact]: 'The contact participants belong to the previous customer',
};

export function commercialIssue(field: string, code: string, extra: Record<string, unknown> = {}): FieldIssue & Record<string, unknown> {
  return { field, code, message: MESSAGES[code] ?? 'The value is not valid', ...extra };
}

/**
 * `422` con **todas** las incidencias de una misma regla (p. ej. todos los campos
 * obligatorios que faltan, RN-04.7). El código de la respuesta es el de la primera.
 */
export function issuesError(issues: readonly (FieldIssue & Record<string, unknown>)[]): BusinessRuleViolationError {
  const first = issues[0];
  const code = first?.code ?? 'VALIDATION_FAILED';
  const message = issues.length === 1 ? (first?.message ?? 'The value is not valid') : 'Some fields are not valid';
  return new BusinessRuleViolationError(code, message, issues.map((issue) => ({ ...issue })));
}

export function issueError(field: string, code: string, extra: Record<string, unknown> = {}): BusinessRuleViolationError {
  return issuesError([commercialIssue(field, code, extra)]);
}

export function activityNotFound(activityId: string): ResourceNotFoundError {
  return new ResourceNotFoundError(ACTIVITY_RESOURCE, activityId);
}

/** `409` del estado leído (RN-04.21, RN-04.27, RN-04.28, D-04.6). */
export function lifecycleConflict(violation: LifecycleViolation, currentStatusCode: string): ResourceConflictError {
  return new ResourceConflictError(
    violation === 'RECORD_READ_ONLY' ? 'The record is read-only in its current status' : 'The operation is not allowed from the current status',
    [{ field: 'statusId', currentStatus: currentStatusCode }],
    violation,
  );
}

/** `409 INVALID_STATUS_TRANSITION`: otro usuario cambió el estado o eliminó el registro entretanto (RN-04.12). */
export function concurrentChangeConflict(): ResourceConflictError {
  return new ResourceConflictError(
    'The record changed while the operation was running',
    [{ field: 'statusId', reason: 'CONCURRENT_CHANGE' }],
    COMMERCIAL_ERROR_CODES.invalidStatusTransition,
  );
}

/** `403 VISIT_CONFIRMATION_OWNER_ONLY` (RN-04.18, DM-20): para los casos de uso de visitas. */
export function visitConfirmationOwnerOnlyError(): AccessDeniedError {
  return new AccessDeniedError(COMMERCIAL_ERROR_CODES.visitConfirmationOwnerOnly, 'Only the visit owner can confirm it');
}
