import { COMMON_ERROR_CODES } from '@/lib/api-error-view';

/**
 * Mensajes en español de los códigos del Forecast (03 §L.6, `docs/api/README.md`
 * E2b). Se pasan como `overrides` a `describeApiError`; nunca se muestra el
 * `message` del backend.
 */

export const FORECAST_ERROR_CODES = {
  lineStale: 'FORECAST_LINE_STALE',
  periodOutOfWindow: 'FORECAST_PERIOD_OUT_OF_WINDOW',
  duplicateInBatch: 'FORECAST_DUPLICATE_IN_BATCH',
  productNotAssociated: 'PRODUCT_NOT_ASSOCIATED',
  invalidQuantity: 'INVALID_QUANTITY',
  invalidOwner: 'INVALID_OWNER',
  unknownReference: 'UNKNOWN_REFERENCE',
  fieldNotEditable: 'FIELD_NOT_EDITABLE',
  invalidDateRange: 'INVALID_DATE_RANGE',
} as const;

const CODES = FORECAST_ERROR_CODES;

export const FORECAST_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  [CODES.lineStale]: 'Otro usuario modificó algunas de estas celdas mientras editabas.',
  [CODES.periodOutOfWindow]: 'Algún mes ya no está en la ventana editable (M+1 … M+6).',
  [CODES.duplicateInBatch]: 'Hay celdas repetidas en el guardado.',
  [CODES.productNotAssociated]: 'Algún producto ya no está asociado a su proyecto. Asócialo de nuevo para proyectarlo.',
  [CODES.invalidQuantity]: 'Las cantidades deben ser mayores o iguales que 0.',
  [CODES.invalidOwner]: 'El asesor de alguna línea no está activo o no está en tu alcance.',
  [CODES.unknownReference]: 'Alguna unidad elegida no existe o está inactiva.',
  [CODES.fieldNotEditable]: 'No tienes permiso para cambiar el asesor de las líneas.',
  [CODES.invalidDateRange]: 'El rango de meses no es válido (máximo 24 meses y "desde" anterior a "hasta").',
};

/** Mensaje bajo una celda por el `code` de su incidencia (`details[].field = "lines[i].campo"`). */
export const FORECAST_CELL_MESSAGES: Readonly<Record<string, string>> = {
  [CODES.invalidQuantity]: 'Debe ser mayor o igual que 0.',
  [CODES.periodOutOfWindow]: 'Este mes ya no se puede editar.',
  [CODES.duplicateInBatch]: 'Celda repetida en el guardado.',
  [CODES.productNotAssociated]: 'El producto ya no está asociado al proyecto.',
  [CODES.invalidOwner]: 'Asesor no válido.',
  [CODES.unknownReference]: 'La unidad no existe o está inactiva.',
  [COMMON_ERROR_CODES.validationFailed]: 'El valor no es válido.',
};
