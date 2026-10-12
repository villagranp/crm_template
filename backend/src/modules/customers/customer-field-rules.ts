/**
 * Reglas de formato por país (02 RN-02.6, RN-02.7, DM-3). Puras: las usan la
 * validación de clientes y la de contactos (el teléfono del contacto sigue el
 * patrón del país de su cliente).
 */

/** Teléfono genérico: dígitos, espacios, `+`, `-`, `(`, `)`. */
const GENERIC_PHONE_CHARACTERS = /^[0-9+\-() ]+$/;
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 20;
/** NIT genérico tras normalizar: alfanumérico de 4 a 30 (DM-3). */
const GENERIC_TAX_ID = /^[A-Z0-9]{4,30}$/;

/**
 * Compila un patrón de `countries.tax_id_pattern` / `phone_pattern` anclado a
 * todo el valor. `null` si no hay patrón o no es una expresión válida (el
 * llamador cae entonces a la regla genérica y lo registra).
 */
export function compileCountryPattern(pattern: string | null): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch {
    return null;
  }
}

/** ¿El patrón del país existe pero no compila? (para la advertencia en el log). */
export function isBrokenCountryPattern(pattern: string | null): boolean {
  return pattern !== null && pattern !== '' && compileCountryPattern(pattern) === null;
}

/** RN-02.6: patrón del país si existe; si no, caracteres permitidos y entre 7 y 20 dígitos. */
export function isValidPhone(phone: string, countryPattern: string | null): boolean {
  const compiled = compileCountryPattern(countryPattern);
  if (compiled) return compiled.test(phone);
  if (!GENERIC_PHONE_CHARACTERS.test(phone)) return false;
  const digits = phone.replace(/\D/g, '').length;
  return digits >= MIN_PHONE_DIGITS && digits <= MAX_PHONE_DIGITS;
}

/** RN-02.7: el NIT **normalizado** cumple el patrón del país; si no hay, alfanumérico de 4 a 30. */
export function isValidTaxId(normalizedTaxId: string, countryPattern: string | null): boolean {
  const compiled = compileCountryPattern(countryPattern);
  return compiled ? compiled.test(normalizedTaxId) : GENERIC_TAX_ID.test(normalizedTaxId);
}
