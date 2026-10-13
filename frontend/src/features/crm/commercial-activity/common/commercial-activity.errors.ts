import { COMMON_ERROR_CODES, type ApiErrorView } from '@/lib/api-error-view';
import { ApiError } from '@/services/api/api-error';

/**
 * Mensajes en español de los códigos de Actividad comercial (04 §F.5) y lectura
 * de los `details[].field` de sus errores. Se pasan como `overrides` a
 * `describeApiError`; nunca se muestra el `message` del backend.
 */

export const COMMERCIAL_ERROR_CODES = {
  validationFailed: COMMON_ERROR_CODES.validationFailed,
  resourceNotFound: 'RESOURCE_NOT_FOUND',
  permissionDenied: 'PERMISSION_DENIED',
  visitConfirmationOwnerOnly: 'VISIT_CONFIRMATION_OWNER_ONLY',
  invalidCatalogValue: 'INVALID_CATALOG_VALUE',
  requiredFieldMissing: 'REQUIRED_FIELD_MISSING',
  unknownReference: 'UNKNOWN_REFERENCE',
  customerInactive: 'CUSTOMER_INACTIVE',
  invalidContact: 'INVALID_CONTACT',
  contactInactive: 'CONTACT_INACTIVE',
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
  attachmentTooLarge: 'ATTACHMENT_TOO_LARGE',
  attachmentTypeNotAllowed: 'ATTACHMENT_TYPE_NOT_ALLOWED',
} as const;

const CODES = COMMERCIAL_ERROR_CODES;

/** Mensaje general (alerta del formulario, del diálogo o de la lista) por código. */
export const COMMERCIAL_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  [CODES.visitConfirmationOwnerOnly]: 'Solo el asesor dueño de la visita puede confirmarla.',
  [CODES.invalidCatalogValue]: 'Alguno de los valores elegidos ya no está disponible. Actualiza y vuelve a elegirlo.',
  [CODES.requiredFieldMissing]: 'Faltan campos obligatorios.',
  [CODES.unknownReference]: 'El proyecto, la oportunidad o el usuario elegido no existe o no está en tu alcance.',
  [CODES.customerInactive]: 'El cliente está inactivo: no admite nuevas visitas ni actividades.',
  [CODES.invalidContact]: 'Algún contacto no pertenece a este cliente o ya no está disponible.',
  [CODES.contactInactive]: 'Algún contacto está inactivo y no se puede añadir.',
  [CODES.inactiveReference]: 'El usuario está inactivo, o el proyecto u oportunidad fue eliminado.',
  [CODES.projectCustomerMismatch]: 'El proyecto no pertenece al cliente elegido.',
  [CODES.opportunityProjectMismatch]: 'La oportunidad no pertenece al proyecto elegido.',
  [CODES.opportunityRequiresProject]: 'Para elegir una oportunidad, elige primero su proyecto.',
  [CODES.ownerNotEligible]: 'El responsable no es un usuario activo dentro de tu alcance.',
  [CODES.invalidDateRange]: 'La fecha de fin no puede ser anterior a la de inicio.',
  [CODES.actualDateInFuture]: 'La fecha no puede ser futura.',
  [CODES.dateInPast]: 'La nueva fecha no puede estar en el pasado.',
  [CODES.rescheduleSameDate]: 'La nueva fecha debe ser distinta de la vigente.',
  [CODES.reasonRequired]: 'Indica un motivo, de la lista o escrito.',
  [CODES.confirmationSummaryRequired]: 'Escribe un resumen de confirmación: la realización no tiene resumen ni comentarios.',
  [CODES.resultRequired]: 'Indica un resultado, de la lista o en notas.',
  [CODES.fieldNotApplicable]: 'Algún campo no aplica al tipo de actividad elegido.',
  [CODES.useReschedule]: 'La fecha de inicio solo cambia reprogramando la visita.',
  [CODES.useLifecycleOperation]: 'Para completar o cancelar usa sus acciones: el estado solo cambia entre estados abiertos.',
  [CODES.invalidStatusTransition]: 'El registro cambió de estado mientras tanto. Actualiza y vuelve a intentarlo.',
  [CODES.recordReadOnly]: 'El registro ya está cerrado y es de solo lectura.',
  [CODES.scheduleConflict]: 'El responsable ya tiene otra visita en ese horario.',
  [CODES.rangeTooWide]: 'El rango de fechas es demasiado amplio: como máximo 42 días.',
  [CODES.attachmentTooLarge]: 'El archivo supera el tamaño máximo permitido.',
  [CODES.attachmentTypeNotAllowed]: 'El tipo de archivo no está permitido.',
};

/** Mensaje bajo un campo concreto, por el `code` de su incidencia. Nunca repite el valor enviado. */
const FIELD_MESSAGES: Readonly<Record<string, string>> = {
  [CODES.requiredFieldMissing]: 'Este campo es obligatorio.',
  [CODES.fieldNotApplicable]: 'No aplica a este tipo de actividad.',
  [CODES.invalidCatalogValue]: 'Este valor ya no está disponible. Elige otro.',
  [CODES.unknownReference]: 'No existe o no está en tu alcance.',
  [CODES.inactiveReference]: 'Está inactivo o eliminado.',
  [CODES.customerInactive]: 'El cliente está inactivo.',
  [CODES.invalidContact]: 'Algún contacto no pertenece a este cliente.',
  [CODES.contactInactive]: 'Algún contacto está inactivo.',
  [CODES.projectCustomerMismatch]: 'No pertenece al cliente elegido.',
  [CODES.opportunityProjectMismatch]: 'No pertenece al proyecto elegido.',
  [CODES.opportunityRequiresProject]: 'Elige primero el proyecto.',
  [CODES.ownerNotEligible]: 'No es un usuario activo dentro de tu alcance.',
  [CODES.invalidDateRange]: 'No puede ser anterior al inicio.',
  [CODES.actualDateInFuture]: 'No puede ser futura.',
  [CODES.dateInPast]: 'No puede estar en el pasado.',
  [CODES.rescheduleSameDate]: 'Debe ser distinta de la vigente.',
  [CODES.reasonRequired]: 'Indica un motivo.',
  [CODES.resultRequired]: 'Indica un resultado o escribe notas.',
  [CODES.confirmationSummaryRequired]: 'Escribe un resumen.',
  [CODES.useReschedule]: 'Para cambiar la fecha, reprograma la visita.',
  [CODES.useLifecycleOperation]: 'Solo puedes elegir un estado abierto.',
  [CODES.validationFailed]: 'El valor no es válido.',
};

const GENERIC_FIELD_MESSAGE = 'El valor no es válido.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Errores por campo de un `400 VALIDATION_FAILED` o de un `422` con
 * `details[].field`. La clave es el primer tramo del campo
 * (`participants.0.contactId` → `participants`). Cada incidencia usa su propio
 * `code` si lo trae (los `422` traen todas las incidencias de la regla). El
 * primer mensaje de cada campo gana.
 */
export function commercialFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const detail of error.details) {
    if (!isRecord(detail) || typeof detail.field !== 'string' || !detail.field) {
      continue;
    }
    const field = detail.field.split('.')[0] ?? detail.field;
    if (result[field]) {
      continue;
    }
    const code = typeof detail.code === 'string' ? detail.code : error.code;
    result[field] = FIELD_MESSAGES[code] ?? GENERIC_FIELD_MESSAGE;
  }
  return result;
}

/** `true` si el error es de un código concreto. */
export function hasCommercialErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}

/** `true` para un `404` (inexistente o fuera del alcance: no se distingue, ADR-008). */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.isNotFound;
}

/** Mensaje con la referencia para soporte (`correlationId`). */
export function withReference(view: ApiErrorView): string {
  return view.correlationId ? `${view.message} Referencia: ${view.correlationId}` : view.message;
}
