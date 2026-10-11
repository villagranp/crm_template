import { COMMON_ERROR_CODES, type ApiErrorView } from '@/lib/api-error-view';
import { ApiError } from '@/services/api/api-error';

/**
 * Mensajes en español de los códigos del Módulo 2 (02 §L.7) y lectura de los
 * `details` de sus errores. Se pasan como `overrides` a `describeApiError`;
 * nunca se muestra el `message` del backend.
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
  invalidCatalogValue: 'INVALID_CATALOG_VALUE',
  invalidCountry: 'INVALID_COUNTRY',
  invalidSalesOwner: 'INVALID_SALES_OWNER',
  invalidPhoneFormat: 'INVALID_PHONE_FORMAT',
  invalidTaxIdFormat: 'INVALID_TAX_ID_FORMAT',
  contactInactive: 'CONTACT_INACTIVE',
  invalidContact: 'INVALID_CONTACT',
  customerInactive: 'CUSTOMER_INACTIVE',
  formulaNotAllowed: 'FORMULA_NOT_ALLOWED',
  fieldNotEditable: 'FIELD_NOT_EDITABLE',
  attachmentTooLarge: 'ATTACHMENT_TOO_LARGE',
  attachmentTypeNotAllowed: 'ATTACHMENT_TYPE_NOT_ALLOWED',
  resourceNotFound: 'RESOURCE_NOT_FOUND',
  permissionDenied: 'PERMISSION_DENIED',
} as const;

const CODES = CUSTOMER_ERROR_CODES;

/** Mensaje general (alerta del formulario o del diálogo) por código. */
export const CUSTOMER_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  [CODES.customerCodeTaken]: 'Ya existe un cliente con ese código de cliente en el país.',
  [CODES.possibleDuplicate]: 'Encontramos posibles duplicados. Revísalos antes de guardar.',
  [CODES.duplicateBlocked]: 'Ya existe un registro con estos datos y la configuración no permite duplicarlo.',
  [CODES.customerHasDependencies]:
    'El cliente tiene proyectos, actividades abiertas o visitas pendientes y no se puede eliminar. Puedes desactivarlo.',
  [CODES.customerNotDeleted]: 'El cliente no está eliminado. Actualiza la página.',
  [CODES.contactEmailTaken]: 'Otro contacto de este cliente ya usa ese correo.',
  [CODES.contactHasHistory]: 'Este contacto participa en visitas o actividades; puedes desactivarlo.',
  [CODES.contactNotDeleted]: 'El contacto no está eliminado. Actualiza la lista.',
  [CODES.requiredFieldMissing]: 'Faltan campos obligatorios.',
  [CODES.invalidCatalogValue]: 'Alguno de los valores elegidos ya no está disponible. Actualiza y vuelve a elegirlo.',
  [CODES.invalidCountry]: 'El país no existe o está inactivo.',
  [CODES.invalidSalesOwner]: 'El responsable de ventas no es un usuario activo elegible.',
  [CODES.invalidPhoneFormat]: 'El teléfono no tiene un formato válido para el país.',
  [CODES.invalidTaxIdFormat]: 'El identificador fiscal no tiene un formato válido para el país.',
  [CODES.contactInactive]: 'Un contacto inactivo no puede ser el contacto principal.',
  [CODES.invalidContact]: 'El contacto no pertenece a este cliente.',
  [CODES.customerInactive]: 'El cliente está inactivo.',
  [CODES.formulaNotAllowed]: 'Algún texto empieza por =, @, tabulador o retorno de carro, y no se permite.',
  [CODES.fieldNotEditable]: 'No tienes permiso para cambiar alguno de los campos enviados.',
  [CODES.attachmentTooLarge]: 'El archivo supera el tamaño máximo permitido.',
  [CODES.attachmentTypeNotAllowed]: 'El tipo de archivo no está permitido.',
};

/** Mensaje bajo un campo concreto, por el `code` de su incidencia. Nunca repite el valor enviado. */
const FIELD_MESSAGES: Readonly<Record<string, string>> = {
  [CODES.requiredFieldMissing]: 'Este campo es obligatorio.',
  [CODES.invalidCatalogValue]: 'Este valor ya no está disponible. Elige otro.',
  [CODES.invalidCountry]: 'El país no existe o está inactivo.',
  [CODES.invalidSalesOwner]: 'El responsable no es un usuario activo elegible.',
  [CODES.invalidPhoneFormat]: 'El teléfono no tiene un formato válido para el país.',
  [CODES.invalidTaxIdFormat]: 'No tiene un formato válido para el país.',
  [CODES.formulaNotAllowed]: 'No puede empezar por =, @, tabulador ni retorno de carro.',
  [CODES.fieldNotEditable]: 'No tienes permiso para cambiar este campo.',
  [CODES.customerCodeTaken]: 'Ya existe un cliente con este código en el país.',
  [CODES.contactEmailTaken]: 'Otro contacto de este cliente ya usa este correo.',
  [CODES.contactInactive]: 'Un contacto inactivo no puede ser el principal.',
  [COMMON_ERROR_CODES.validationFailed]: 'El valor no es válido.',
};

const GENERIC_FIELD_MESSAGE = 'El valor no es válido.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Errores por campo de un `400 VALIDATION_FAILED` (DC-6), un `422` de
 * validación, un `403 FIELD_NOT_EDITABLE` o un `409` con `details[].field`.
 * Cada incidencia usa su propio `code` si lo trae (los `422` traen todas las
 * incidencias), y si no el de la respuesta. El primer mensaje de cada campo gana.
 */
export function fieldErrorsFromApiError(error: unknown): Record<string, string> {
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

export interface CustomerCodeConflict {
  /** Sólo si el cliente que ocupa el código es visible para el usuario (D-02.3). */
  customerId: string | null;
  crmCode: string | null;
  isDeleted: boolean;
}

/** `details[0]` de un `409 CUSTOMER_CODE_TAKEN` (02 §F.3). */
export function customerCodeConflict(error: unknown): CustomerCodeConflict | null {
  if (!(error instanceof ApiError) || error.code !== CODES.customerCodeTaken) {
    return null;
  }
  const detail = error.details.find(isRecord);
  return {
    customerId: typeof detail?.customerId === 'string' ? detail.customerId : null,
    crmCode: typeof detail?.crmCode === 'string' ? detail.crmCode : null,
    isDeleted: detail?.isDeleted === true,
  };
}

export type CustomerDependency = 'projects' | 'openActivities' | 'pendingVisits';

const DEPENDENCY_LABELS: Record<CustomerDependency, [singular: string, plural: string]> = {
  projects: ['proyecto', 'proyectos'],
  openActivities: ['actividad abierta', 'actividades abiertas'],
  pendingVisits: ['visita pendiente', 'visitas pendientes'],
};

/** Conteos de un `409 CUSTOMER_HAS_DEPENDENCIES` como texto ("2 proyectos, 1 visita pendiente"). */
export function describeDependencies(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== CODES.customerHasDependencies) {
    return null;
  }
  const parts = error.details.flatMap((detail) => {
    if (!isRecord(detail) || typeof detail.count !== 'number' || detail.count <= 0) {
      return [];
    }
    const labels = DEPENDENCY_LABELS[detail.dependency as CustomerDependency];
    if (!labels) {
      return [];
    }
    return [`${detail.count} ${detail.count === 1 ? labels[0] : labels[1]}`];
  });
  return parts.length > 0 ? parts.join(', ') : null;
}

/** `true` si el error es de un código concreto. */
export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}

/** Mensaje de error con la referencia para soporte (AC-02.11). */
export function withReference(view: ApiErrorView): string {
  return view.correlationId ? `${view.message} Referencia: ${view.correlationId}` : view.message;
}
