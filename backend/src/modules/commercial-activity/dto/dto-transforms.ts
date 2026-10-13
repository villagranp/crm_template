/**
 * Transformaciones y patrones de entrada de los DTO del módulo (class-transformer / class-validator).
 */

/** Instante ISO 8601 **con zona** (`Z` u `±hh:mm`): sin ella, `Date` lo interpretaría en la hora local del servidor. */
export const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Fecha de calendario `YYYY-MM-DD` (columnas `date`, RN-04.9). */
export const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const INSTANT_MESSAGE = 'must be an ISO 8601 date-time with time zone (e.g. 2026-10-12T15:00:00Z)';
export const DATE_MESSAGE = 'must be a calendar date YYYY-MM-DD';

/** Parámetro de query repetible (`?typeId=a&typeId=b`): siempre lista. */
export function toArray({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return Array.isArray(value) ? value : [value];
}

/** `'true'`/`'false'` de la query a booleano; otro valor llega tal cual y falla `IsBoolean` (`400`). */
export function toOptionalBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/** Campo no anulable de un PATCH: omitirlo es "sin cambio", pero `null` no se admite. */
export function isPresent(_object: object, value: unknown): boolean {
  return value !== undefined;
}

/** Máximo de valores por filtro repetible. */
export const MAX_FILTER_VALUES = 50;
