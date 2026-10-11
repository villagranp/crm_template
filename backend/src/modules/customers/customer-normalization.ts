/**
 * Normalización única de los datos de clientes y contactos (02 RN-02.17, 00 §6.2.4).
 *
 * Funciones puras de dominio compartidas por el alta, la edición, la búsqueda,
 * la detección de duplicados y la importación (Módulo 6). Cambiar una regla aquí
 * cambia a la vez lo que se guarda y lo que se compara: las columnas
 * `*_normalized` de la base se escriben con estas funciones.
 *
 * Ninguna lanza: un valor vacío tras normalizar devuelve `null` (el campo no se informa).
 */

/** Marcas diacríticas combinantes que deja `normalize('NFD')` (acentos, diéresis, virgulilla). */
const COMBINING_MARKS = /[̀-ͯ]/g;
const WHITESPACE_RUN = /\s+/g;
/** Código de cliente: se quitan espacios y guiones (00 §6.2.4). */
const CUSTOMER_CODE_SEPARATORS = /[\s-]+/g;
/** NIT: se quitan espacios, guiones y puntos (DM-3). */
const TAX_ID_SEPARATORS = /[\s.-]+/g;
const NON_DIGITS = /\D+/g;

/**
 * Prefijos de fórmula de hoja de cálculo (D-06.11, RN-02.32): un texto libre que,
 * tras recortar, empieza por `=`, `@`, tabulador o retorno de carro se rechaza.
 * `+` y `-` no se incluyen: un teléfono `+502 …` o un texto `- nota` son legítimos.
 */
const FORMULA_PREFIX = /^[=@\t\r]/;

/** `AB-12 x` → `AB12X`. Mayúsculas, sin espacios ni guiones. */
export function normalizeCustomerCode(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.replace(CUSTOMER_CODE_SEPARATORS, '').toUpperCase();
  return normalized === '' ? null : normalized;
}

/** `12.345-6 k` → `123456K`. Mayúsculas, sin espacios, guiones ni puntos. */
export function normalizeTaxId(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.replace(TAX_ID_SEPARATORS, '').toUpperCase();
  return normalized === '' ? null : normalized;
}

/**
 * Razón social, nombre comercial, ciudad y nombres de contacto:
 * `  Constructora  PEÑA S.A. ` → `constructora pena s.a.`. Minúsculas, sin
 * acentos, espacios colapsados y recortado.
 */
export function normalizeName(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(WHITESPACE_RUN, ' ')
    .trim();
  return normalized === '' ? null : normalized;
}

/** Correo para comparar: minúsculas y recortado. */
export function normalizeEmail(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  return normalized === '' ? null : normalized;
}

/** Teléfono para comparar: solo los dígitos (`+502 2222-3333` → `50222223333`). */
export function phoneDigits(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const digits = value.replace(NON_DIGITS, '');
  return digits === '' ? null : digits;
}

/**
 * Términos de una búsqueda libre sobre nombres normalizados: cada palabra debe
 * aparecer (AND). `"construc  PEÑA"` → `['construc', 'pena']`.
 */
export function searchTerms(value: string | null | undefined): string[] {
  const normalized = normalizeName(value);
  return normalized ? [...new Set(normalized.split(' '))] : [];
}

/** ¿El texto libre empieza, tras recortar los espacios, por un prefijo de fórmula (RN-02.32)? */
export function startsWithFormula(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  // Se recortan solo espacios: el tabulador y el retorno de carro iniciales son justamente lo que se busca.
  return FORMULA_PREFIX.test(value.replace(/^ +/, ''));
}

/** Nombre completo de un contacto para mostrar. */
export function contactFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.replace(WHITESPACE_RUN, ' ').trim();
}
