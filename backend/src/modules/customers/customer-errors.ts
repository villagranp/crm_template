import {
  AccessDeniedError,
  BusinessRuleViolationError,
  RequestValidationError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '@/common/errors/application-error';
import type { FieldIssue } from '@/common/errors/field-issue';

/**
 * Códigos de error del Módulo 2 (02 L.7). Los de validación de campo son también
 * el `code` de `FieldIssue` (F.6.1): la importación los muestra por fila.
 */
export const CUSTOMER_ERROR_CODES = {
  customerCodeTaken: 'CUSTOMER_CODE_TAKEN',
  possibleDuplicate: 'POSSIBLE_DUPLICATE',
  duplicateBlocked: 'DUPLICATE_BLOCKED',
  customerHasDependencies: 'CUSTOMER_HAS_DEPENDENCIES',
  customerNotDeleted: 'CUSTOMER_NOT_DELETED',
  contactEmailTaken: 'CONTACT_EMAIL_TAKEN',
  contactHasHistory: 'CONTACT_HAS_HISTORY',
  contactNotDeleted: 'CONTACT_NOT_DELETED',
  requiredFieldMissing: 'REQUIRED_FIELD_MISSING',
  invalidCountry: 'INVALID_COUNTRY',
  invalidSalesOwner: 'INVALID_SALES_OWNER',
  invalidPhoneFormat: 'INVALID_PHONE_FORMAT',
  invalidTaxIdFormat: 'INVALID_TAX_ID_FORMAT',
  contactInactive: 'CONTACT_INACTIVE',
  invalidContact: 'INVALID_CONTACT',
  customerInactive: 'CUSTOMER_INACTIVE',
  formulaNotAllowed: 'FORMULA_NOT_ALLOWED',
  fieldNotEditable: 'FIELD_NOT_EDITABLE',
  /** Formato o longitud inválidos detectados por el servicio (importación); en la API los emite el DTO con `400`. */
  validationFailed: 'VALIDATION_FAILED',
} as const;

export const CUSTOMER_RESOURCE = 'Customer';
export const CONTACT_RESOURCE = 'Contact';

/** Mensajes fijos por código: nunca repiten el valor recibido (RN-02.32, SECURITY.md). */
export const FIELD_ISSUE_MESSAGES: Readonly<Record<string, string>> = {
  [CUSTOMER_ERROR_CODES.requiredFieldMissing]: 'The field is required',
  [CUSTOMER_ERROR_CODES.invalidCountry]: 'The country does not exist or is inactive',
  [CUSTOMER_ERROR_CODES.invalidSalesOwner]: 'The sales owner is not an eligible active user',
  [CUSTOMER_ERROR_CODES.invalidPhoneFormat]: 'The phone number does not have a valid format',
  [CUSTOMER_ERROR_CODES.invalidTaxIdFormat]: 'The tax identifier does not have a valid format for the country',
  [CUSTOMER_ERROR_CODES.formulaNotAllowed]: 'The value cannot start with =, @, tab or carriage return',
  [CUSTOMER_ERROR_CODES.validationFailed]: 'The value does not have a valid format',
};

export function fieldIssue(field: string, code: string, extra: Record<string, unknown> = {}): FieldIssue & Record<string, unknown> {
  return { field, code, message: FIELD_ISSUE_MESSAGES[code] ?? 'The value is not valid', ...extra };
}

/**
 * Error con todas las incidencias de la entrada (RN-02.12). El código de la
 * respuesta es el de la primera incidencia (el validador las ordena por
 * gravedad); cada elemento de `details` lleva su propio `code` y `field`.
 *
 * Status: `422`, salvo que la primera sea `VALIDATION_FAILED` (longitud o formato
 * de correo, que el validador comprueba para la importación): entonces `400`,
 * igual que el `ValidationPipe` (DC-6), para que un mismo código tenga siempre el
 * mismo status. La importación (Módulo 6) no usa este error: lee las incidencias
 * por fila de `ValidationOutcome.errors`.
 */
export function fieldIssuesError(
  issues: readonly (FieldIssue & Record<string, unknown>)[],
): BusinessRuleViolationError | RequestValidationError {
  const first = issues[0];
  const code = first?.code ?? CUSTOMER_ERROR_CODES.validationFailed;
  const message = issues.length === 1 ? (first?.message ?? 'The value is not valid') : 'Some fields are not valid';
  const details = issues.map((issue) => ({ ...issue }));
  return code === CUSTOMER_ERROR_CODES.validationFailed
    ? new RequestValidationError(message, details)
    : new BusinessRuleViolationError(code, message, details);
}

export function customerNotFound(customerId: string): ResourceNotFoundError {
  return new ResourceNotFoundError(CUSTOMER_RESOURCE, customerId);
}

export function contactNotFound(contactId: string): ResourceNotFoundError {
  return new ResourceNotFoundError(CONTACT_RESOURCE, contactId);
}

/** `403 FIELD_NOT_EDITABLE` con un elemento por campo reservado enviado sin permiso (H.2). */
export function fieldNotEditableError(fields: readonly string[], requiredPermission: string): AccessDeniedError {
  return new AccessDeniedError(
    CUSTOMER_ERROR_CODES.fieldNotEditable,
    fields.length === 1 ? 'The field cannot be edited by the current user' : 'Some fields cannot be edited by the current user',
    fields.map((field) => ({ field, requiredPermission })),
  );
}

export interface CustomerCodeConflictDetails {
  /** Id del cliente que ocupa el código, solo si el actor lo ve (D-02.3). */
  readonly customerId: string | null;
  readonly crmCode: string;
  readonly isDeleted: boolean;
}

/** `409 CUSTOMER_CODE_TAKEN` (RN-02.13). `isDeleted` permite ofrecer la restauración (D-02.6). */
export function customerCodeTakenError(conflict: CustomerCodeConflictDetails | null): ResourceConflictError {
  return new ResourceConflictError(
    'The customer code is already in use',
    [{ field: 'customerCode', customerId: conflict?.customerId ?? null, crmCode: conflict?.crmCode ?? null, isDeleted: conflict?.isDeleted ?? null }],
    CUSTOMER_ERROR_CODES.customerCodeTaken,
  );
}

export function possibleDuplicateError(details: readonly Record<string, unknown>[]): ResourceConflictError {
  return new ResourceConflictError(
    'Possible duplicates found; resend with acknowledgedDuplicateIds to confirm',
    details,
    CUSTOMER_ERROR_CODES.possibleDuplicate,
  );
}

export function duplicateBlockedError(details: readonly Record<string, unknown>[]): ResourceConflictError {
  return new ResourceConflictError('A duplicate record exists and the rule blocks the operation', details, CUSTOMER_ERROR_CODES.duplicateBlocked);
}

export function customerInactiveError(customerId: string): BusinessRuleViolationError {
  return new BusinessRuleViolationError(CUSTOMER_ERROR_CODES.customerInactive, 'The customer is inactive', [
    { field: 'customerId', customerId },
  ]);
}

export function contactInactiveError(field = 'contactId'): BusinessRuleViolationError {
  return new BusinessRuleViolationError(CUSTOMER_ERROR_CODES.contactInactive, 'The contact is inactive', [{ field }]);
}

export function invalidContactError(field = 'contactId'): BusinessRuleViolationError {
  return new BusinessRuleViolationError(CUSTOMER_ERROR_CODES.invalidContact, 'The contact does not belong to the customer', [{ field }]);
}
