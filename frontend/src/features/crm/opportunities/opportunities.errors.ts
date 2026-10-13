import { formatCalendarDate } from '@/features/crm/projects';
import { COMMON_ERROR_CODES } from '@/lib/api-error-view';
import { ApiError } from '@/services/api/api-error';

import type { OpportunityWarning } from './opportunities.api';

/**
 * Mensajes en español de los códigos de Oportunidades y resultados (03 §L.6,
 * `docs/api/README.md` E2b) y lectura de sus `details`. Se pasan como
 * `overrides` a `describeApiError`; nunca se muestra el `message` del backend.
 */

export const OPPORTUNITY_ERROR_CODES = {
  invalidInitialStage: 'INVALID_INITIAL_STAGE',
  invalidStageTransition: 'INVALID_STAGE_TRANSITION',
  stageUnchanged: 'STAGE_UNCHANGED',
  commentRequired: 'COMMENT_REQUIRED',
  currencyRequired: 'CURRENCY_REQUIRED',
  currencyNotAllowed: 'CURRENCY_NOT_ALLOWED',
  exchangeRateNotFound: 'EXCHANGE_RATE_NOT_FOUND',
  resultRequired: 'RESULT_REQUIRED',
  resultNotAllowed: 'RESULT_NOT_ALLOWED',
  resultStageMismatch: 'RESULT_STAGE_MISMATCH',
  resultReasonRequired: 'RESULT_REASON_REQUIRED',
  resultPercentRequired: 'RESULT_PERCENT_REQUIRED',
  resultPercentNotAllowed: 'RESULT_PERCENT_NOT_ALLOWED',
  invalidProgress: 'INVALID_PROGRESS',
  invalidCatalogValue: 'INVALID_CATALOG_VALUE',
  opportunityNotClosed: 'OPPORTUNITY_NOT_CLOSED',
  opportunityClosed: 'OPPORTUNITY_CLOSED',
  opportunityHasDependencies: 'OPPORTUNITY_HAS_DEPENDENCIES',
  invalidOwner: 'INVALID_OWNER',
  fieldNotEditable: 'FIELD_NOT_EDITABLE',
  requiredFieldMissing: 'REQUIRED_FIELD_MISSING',
  invalidDateRange: 'INVALID_DATE_RANGE',
  unknownReference: 'UNKNOWN_REFERENCE',
} as const;

const CODES = OPPORTUNITY_ERROR_CODES;

/** Aviso no bloqueante de la estimación (RN-03.81). */
export const EXCHANGE_RATE_STALE = 'EXCHANGE_RATE_STALE';

export const OPPORTUNITY_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  [CODES.invalidInitialStage]: 'Una oportunidad nueva empieza en una etapa abierta.',
  [CODES.invalidStageTransition]: 'Ese cambio de etapa no está permitido desde la etapa actual.',
  [CODES.stageUnchanged]: 'La oportunidad ya está en esa etapa.',
  [CODES.commentRequired]: 'Para reabrir la oportunidad escribe un comentario.',
  [CODES.currencyRequired]: 'Indica la moneda del monto estimado.',
  [CODES.currencyNotAllowed]: 'La moneda no está admitida para este proyecto: usa USD o la moneda de su país.',
  [CODES.exchangeRateNotFound]:
    'No hay tipo de cambio vigente para esa moneda a la fecha de la oportunidad. Mientras no se carguen los tipos de cambio, registra la estimación en USD.',
  [CODES.resultRequired]: 'Para cerrar la oportunidad registra su resultado.',
  [CODES.resultNotAllowed]: 'Una etapa abierta no lleva resultado.',
  [CODES.resultStageMismatch]: 'El resultado no corresponde a la etapa elegida.',
  [CODES.resultReasonRequired]: 'Indica el motivo del resultado.',
  [CODES.resultPercentRequired]: 'Indica el porcentaje adjudicado.',
  [CODES.resultPercentNotAllowed]: 'El porcentaje adjudicado solo se indica en un resultado parcial.',
  [CODES.invalidProgress]: 'El porcentaje debe estar entre 0 y 100.',
  [CODES.invalidCatalogValue]: 'Alguno de los valores elegidos ya no está disponible. Actualiza y vuelve a elegirlo.',
  [CODES.opportunityNotClosed]: 'La oportunidad ya no está cerrada. Actualiza para ver su estado.',
  [CODES.opportunityClosed]: 'Una oportunidad cerrada no se elimina: conserva su resultado para los reportes.',
  [CODES.opportunityHasDependencies]: 'La oportunidad tiene elementos vinculados y no se puede eliminar.',
  [CODES.invalidOwner]: 'El asesor elegido no está activo o no está en tu alcance.',
  [CODES.fieldNotEditable]: 'No tienes permiso para cambiar alguno de los campos enviados.',
  [CODES.requiredFieldMissing]: 'Faltan campos obligatorios.',
  [CODES.invalidDateRange]: '"Desde" no puede ser posterior a "Hasta".',
  [CODES.unknownReference]: 'Alguno de los valores elegidos no existe o está inactivo.',
};

const FIELD_MESSAGES: Readonly<Record<string, string>> = {
  [CODES.invalidInitialStage]: 'Elige una etapa abierta.',
  [CODES.invalidStageTransition]: 'Este destino no está permitido.',
  [CODES.stageUnchanged]: 'Elige una etapa distinta de la actual.',
  [CODES.commentRequired]: 'Escribe el motivo de la reapertura.',
  [CODES.currencyRequired]: 'Elige la moneda del monto.',
  [CODES.currencyNotAllowed]: 'Moneda no admitida para este proyecto. Usa USD o la moneda de su país.',
  [CODES.resultRequired]: 'Registra el resultado.',
  [CODES.resultStageMismatch]: 'No corresponde a la etapa elegida.',
  [CODES.resultReasonRequired]: 'Indica el motivo.',
  [CODES.resultPercentRequired]: 'Indica el porcentaje adjudicado.',
  [CODES.resultPercentNotAllowed]: 'Solo en un resultado parcial.',
  [CODES.invalidProgress]: 'Debe estar entre 0 y 100.',
  [CODES.invalidCatalogValue]: 'Este valor ya no está disponible. Elige otro.',
  [CODES.invalidOwner]: 'El asesor no está activo o no está en tu alcance.',
  [CODES.fieldNotEditable]: 'No tienes permiso para cambiar este campo.',
  [CODES.requiredFieldMissing]: 'Este campo es obligatorio.',
  [CODES.unknownReference]: 'No existe o está inactivo.',
  [COMMON_ERROR_CODES.validationFailed]: 'El valor no es válido.',
};

const GENERIC_FIELD_MESSAGE = 'El valor no es válido.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Explicación de un `422 EXCHANGE_RATE_NOT_FOUND` (RN-03.79, AC-03.89): qué
 * moneda y fecha faltan y que mientras tanto solo funciona USD (§G.3).
 */
export function exchangeRateNotFoundMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== CODES.exchangeRateNotFound) {
    return null;
  }
  const detail = error.details.find(isRecord);
  const currency = typeof detail?.currencyCode === 'string' ? detail.currencyCode : null;
  const date = typeof detail?.date === 'string' ? formatCalendarDate(detail.date) : null;
  const what = currency && date ? `No hay tipo de cambio de ${currency} vigente al ${date}.` : 'No hay tipo de cambio vigente para esa moneda.';
  return `${what} Mientras no se carguen los tipos de cambio, solo se puede registrar la estimación en USD.`;
}

/** Explicación de un `422 CURRENCY_NOT_ALLOWED` con las monedas admitidas (E1 #2). */
function currencyNotAllowedMessage(detail: Record<string, unknown> | undefined): string {
  const allowed = Array.isArray(detail?.allowedCurrencyCodes) ? detail.allowedCurrencyCodes.filter((code): code is string => typeof code === 'string') : [];
  return allowed.length > 0
    ? `Moneda no admitida para este proyecto. Usa ${allowed.join(' o ')}.`
    : FIELD_MESSAGES[CODES.currencyNotAllowed] ?? GENERIC_FIELD_MESSAGE;
}

/** Último segmento de una ruta de campo (`result.reasonId` → `reasonId`): los formularios son planos. */
function fieldName(path: string): string {
  return path.split('.').at(-1) ?? path;
}

/**
 * Errores por campo de un `400`/`422`/`403 FIELD_NOT_EDITABLE`. Los de la
 * moneda (`CURRENCY_*`, `EXCHANGE_RATE_NOT_FOUND`) van siempre bajo el selector
 * de moneda (03 §E.7). El primer mensaje de cada campo gana.
 */
export function opportunityFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) {
    return {};
  }
  const result: Record<string, string> = {};
  const stale = exchangeRateNotFoundMessage(error);
  if (stale) {
    result.currencyCode = stale;
  }
  for (const detail of error.details) {
    if (!isRecord(detail)) {
      continue;
    }
    const code = typeof detail.code === 'string' ? detail.code : error.code;
    if (code === CODES.currencyNotAllowed || code === CODES.currencyRequired) {
      result.currencyCode ??= code === CODES.currencyNotAllowed ? currencyNotAllowedMessage(detail) : (FIELD_MESSAGES[code] ?? GENERIC_FIELD_MESSAGE);
      continue;
    }
    if (typeof detail.field !== 'string' || !detail.field) {
      continue;
    }
    const field = fieldName(detail.field);
    result[field] ??= FIELD_MESSAGES[code] ?? GENERIC_FIELD_MESSAGE;
  }
  return result;
}

export type OpportunityDependency = 'activeProducts' | 'openActivities';

const DEPENDENCY_LABELS: Record<OpportunityDependency, [singular: string, plural: string]> = {
  activeProducts: ['producto asociado activo', 'productos asociados activos'],
  openActivities: ['actividad abierta', 'actividades abiertas'],
};

/** Bloqueos de un `409 OPPORTUNITY_HAS_DEPENDENCIES` como texto ("2 productos asociados activos"). */
export function describeDependencies(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== CODES.opportunityHasDependencies) {
    return null;
  }
  const parts = error.details.flatMap((detail) => {
    if (!isRecord(detail) || typeof detail.count !== 'number' || detail.count <= 0) {
      return [];
    }
    const labels = DEPENDENCY_LABELS[detail.dependency as OpportunityDependency];
    return labels ? [`${detail.count} ${detail.count === 1 ? labels[0] : labels[1]}`] : [];
  });
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Aviso `EXCHANGE_RATE_STALE` de una respuesta de alta o edición (RN-03.81,
 * AC-03.90) como texto para un aviso no bloqueante; `null` si no lo hay.
 */
export function staleRateMessage(warnings: readonly OpportunityWarning[] | undefined): string | null {
  const warning = warnings?.find((item) => item.code === EXCHANGE_RATE_STALE);
  if (!warning) {
    return null;
  }
  const { currencyCode, exchangeRateDate, ageDays, thresholdDays } = warning.details;
  return (
    `La estimación se guardó con el tipo de cambio de ${currencyCode} vigente desde el ${formatCalendarDate(exchangeRateDate)}, ` +
    `${ageDays} días antes de la fecha de la oportunidad (umbral de aviso: ${thresholdDays} días). ` +
    'Revisa si hay una tasa más reciente.'
  );
}
