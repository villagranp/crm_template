import { COMMON_ERROR_CODES, type ApiErrorView } from '@/lib/api-error-view';
import { ApiError } from '@/services/api/api-error';

/**
 * Mensajes en español de los códigos del submódulo de Proyectos (03 §L.6,
 * "Formas finales de details" de E2a) y lectura de sus `details`. Se pasan como
 * `overrides` a `describeApiError`; nunca se muestra el `message` del backend.
 */

export const PROJECT_ERROR_CODES = {
  requiredFieldMissing: 'REQUIRED_FIELD_MISSING',
  invalidDateRange: 'INVALID_DATE_RANGE',
  invalidOwner: 'INVALID_OWNER',
  unknownReference: 'UNKNOWN_REFERENCE',
  customerInactive: 'CUSTOMER_INACTIVE',
  fieldNotEditable: 'FIELD_NOT_EDITABLE',
  projectCodeTaken: 'PROJECT_CODE_TAKEN',
  projectCustomerLocked: 'PROJECT_CUSTOMER_LOCKED',
  projectHasActiveChildren: 'PROJECT_HAS_ACTIVE_CHILDREN',
  invalidCatalogValue: 'INVALID_CATALOG_VALUE',
  conversionRuleNotFound: 'CONVERSION_RULE_NOT_FOUND',
  invalidConversionRule: 'INVALID_CONVERSION_RULE',
  invalidQuantity: 'INVALID_QUANTITY',
  invalidProgress: 'INVALID_PROGRESS',
  phaseProgressRule: 'PHASE_PROGRESS_RULE',
  phaseUnchanged: 'PHASE_UNCHANGED',
  productInactive: 'PRODUCT_INACTIVE',
  opportunityNotInProject: 'OPPORTUNITY_NOT_IN_PROJECT',
  projectProductDuplicate: 'PROJECT_PRODUCT_DUPLICATE',
  productHasForecast: 'PRODUCT_HAS_FORECAST',
  attachmentTooLarge: 'ATTACHMENT_TOO_LARGE',
  attachmentTypeNotAllowed: 'ATTACHMENT_TYPE_NOT_ALLOWED',
  resourceNotFound: 'RESOURCE_NOT_FOUND',
  permissionDenied: 'PERMISSION_DENIED',
} as const;

const CODES = PROJECT_ERROR_CODES;

/** Mensaje general (alerta del formulario o del diálogo) por código. */
export const PROJECT_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  [CODES.requiredFieldMissing]: 'Faltan campos obligatorios.',
  [CODES.invalidDateRange]: 'El fin estimado no puede ser anterior al inicio estimado.',
  [CODES.invalidOwner]: 'El asesor elegido no está activo o no está en tu alcance.',
  [CODES.unknownReference]: 'Alguno de los valores elegidos no existe o está inactivo.',
  [CODES.customerInactive]: 'El cliente está inactivo y no admite proyectos nuevos.',
  [CODES.fieldNotEditable]: 'No tienes permiso para cambiar alguno de los campos enviados.',
  [CODES.projectCodeTaken]: 'Ya existe un proyecto con ese código.',
  [CODES.projectCustomerLocked]: 'No se puede cambiar el cliente: el proyecto tiene visitas o actividades vinculadas.',
  [CODES.projectHasActiveChildren]: 'El proyecto tiene elementos activos y no se puede eliminar.',
  [CODES.invalidCatalogValue]: 'Alguno de los valores elegidos ya no está disponible. Actualiza y vuelve a elegirlo.',
  [CODES.conversionRuleNotFound]: 'No hay una regla de conversión aplicable a esa unidad. Elige "Manual" o "Sin estimación".',
  [CODES.invalidConversionRule]: 'La regla de conversión ya no es válida. Vuelve a guardar la clasificación.',
  [CODES.invalidQuantity]: 'La cantidad debe ser mayor o igual que 0.',
  [CODES.invalidProgress]: 'El porcentaje debe estar entre 0 y 100.',
  [CODES.phaseProgressRule]: 'El porcentaje no cumple la regla de avance de la fase.',
  [CODES.phaseUnchanged]: 'No hay cambios: la fase y el porcentaje son los actuales.',
  [CODES.productInactive]: 'El producto está inactivo y no admite asociaciones nuevas.',
  [CODES.opportunityNotInProject]: 'La oportunidad no pertenece a este proyecto.',
  [CODES.projectProductDuplicate]: 'Ese producto ya está asociado al proyecto (con la misma oportunidad).',
  [CODES.productHasForecast]: 'El producto tiene forecast en la ventana vigente y no se puede quitar.',
  [CODES.attachmentTooLarge]: 'El archivo supera el tamaño máximo permitido.',
  [CODES.attachmentTypeNotAllowed]: 'El tipo de archivo no está permitido.',
};

/** Mensaje bajo un campo concreto, por el `code` de su incidencia. Nunca repite el valor enviado. */
const FIELD_MESSAGES: Readonly<Record<string, string>> = {
  [CODES.requiredFieldMissing]: 'Este campo es obligatorio.',
  [CODES.invalidDateRange]: 'No puede ser anterior al inicio estimado.',
  [CODES.invalidOwner]: 'El asesor no está activo o no está en tu alcance.',
  [CODES.unknownReference]: 'No existe o está inactivo.',
  [CODES.customerInactive]: 'El cliente está inactivo.',
  [CODES.fieldNotEditable]: 'No tienes permiso para cambiar este campo.',
  [CODES.projectCodeTaken]: 'Ya existe un proyecto con este código.',
  [CODES.projectCustomerLocked]: 'No se puede cambiar: hay visitas o actividades vinculadas.',
  [CODES.invalidCatalogValue]: 'Este valor ya no está disponible. Elige otro.',
  [CODES.conversionRuleNotFound]: 'No hay regla de conversión para esta unidad.',
  [CODES.invalidQuantity]: 'Debe ser mayor o igual que 0.',
  [CODES.invalidProgress]: 'Debe estar entre 0 y 100.',
  [CODES.phaseUnchanged]: 'Elige otra fase u otro porcentaje.',
  [CODES.productInactive]: 'El producto está inactivo.',
  [CODES.opportunityNotInProject]: 'La oportunidad no es de este proyecto.',
  [CODES.projectProductDuplicate]: 'Ya está asociado al proyecto.',
  [COMMON_ERROR_CODES.validationFailed]: 'El valor no es válido.',
};

const GENERIC_FIELD_MESSAGE = 'El valor no es válido.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Errores por campo de un `400 VALIDATION_FAILED`, un `422` de negocio, un
 * `403 FIELD_NOT_EDITABLE` o un `409` con `details[].field`. Cada incidencia usa
 * su propio `code` si lo trae; si no, el de la respuesta. `PHASE_PROGRESS_RULE`
 * explica el mínimo de la fase. El primer mensaje de cada campo gana.
 */
export function projectFieldErrors(error: unknown): Record<string, string> {
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
    if (code === CODES.phaseProgressRule && (typeof detail.minimumProgress === 'number' || typeof detail.minimumProgress === 'string')) {
      result[field] = `Esta fase exige al menos ${String(detail.minimumProgress)}%.`;
      continue;
    }
    result[field] = FIELD_MESSAGES[code] ?? GENERIC_FIELD_MESSAGE;
  }
  return result;
}

export type ProjectBlocker = 'openOpportunities' | 'productsWithForecast' | 'nonCancelledVisits' | 'openActivities';

const BLOCKER_LABELS: Record<ProjectBlocker, [singular: string, plural: string]> = {
  openOpportunities: ['oportunidad abierta', 'oportunidades abiertas'],
  productsWithForecast: ['producto con forecast futuro', 'productos con forecast futuro'],
  nonCancelledVisits: ['visita no cancelada', 'visitas no canceladas'],
  openActivities: ['actividad abierta', 'actividades abiertas'],
};

/** Bloqueos de un `409 PROJECT_HAS_ACTIVE_CHILDREN` como texto ("2 oportunidades abiertas, 1 visita no cancelada"). */
export function describeActiveChildren(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== CODES.projectHasActiveChildren) {
    return null;
  }
  const parts = error.details.flatMap((detail) => {
    if (!isRecord(detail) || typeof detail.count !== 'number' || detail.count <= 0) {
      return [];
    }
    const labels = BLOCKER_LABELS[detail.dependency as ProjectBlocker];
    return labels ? [`${detail.count} ${detail.count === 1 ? labels[0] : labels[1]}`] : [];
  });
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Períodos (`AAAA-MM`) de un `409 PRODUCT_HAS_FORECAST`. */
export function forecastPeriodsOf(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.code !== CODES.productHasForecast) {
    return [];
  }
  return error.details.flatMap((detail) =>
    isRecord(detail) && Array.isArray(detail.periods) ? detail.periods.filter((period): period is string => typeof period === 'string') : [],
  );
}

/** `true` si el error es de un código concreto. */
export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}

/** Mensaje de error con la referencia para soporte. */
export function withReference(view: ApiErrorView): string {
  return view.correlationId ? `${view.message} Referencia: ${view.correlationId}` : view.message;
}
