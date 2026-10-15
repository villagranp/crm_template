/**
 * Transformaciones de entrada compartidas por los DTO de varios módulos
 * (class-transformer / class-validator). Sin reglas de negocio.
 */

/** `'true'`/`'false'` de la query a booleano; otro valor llega tal cual y falla `IsBoolean` (`400`). */
export function toOptionalBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/** Texto opcional recortado; una cadena vacía equivale a `null` (quitar el valor). */
export function trimToNull({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function trim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Campo no anulable de un PATCH: omitirlo es "sin cambio", pero `null` no se admite. */
export function isPresent(_object: object, value: unknown): boolean {
  return value !== undefined;
}
