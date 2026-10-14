import { Prisma } from '@prisma/client';

import type { VisibilityScope } from '@/modules/access/visibility-scope';

/**
 * Fragmentos SQL de texto compartidos por los adaptadores Prisma. Todo valor del
 * usuario viaja como parámetro; aquí solo hay SQL fijo.
 */

/**
 * Pares acentuado → sin acento que aplica `normalizedTextSql`. Mismo resultado que
 * `normalizeName` (NFD sin marcas) para el alfabeto latino que usa el CRM; se
 * traduce **antes** de `lower()` para no depender del `LC_CTYPE` de la base.
 */
const ACCENT_PAIRS: readonly (readonly [string, string])[] = [
  ['ÁÀÂÄÃÅ', 'A'],
  ['áàâäãå', 'a'],
  ['ÉÈÊË', 'E'],
  ['éèêë', 'e'],
  ['ÍÌÎÏ', 'I'],
  ['íìîï', 'i'],
  ['ÓÒÔÖÕ', 'O'],
  ['óòôöõ', 'o'],
  ['ÚÙÛÜ', 'U'],
  ['úùûü', 'u'],
  ['Ñ', 'N'],
  ['ñ', 'n'],
  ['Ç', 'C'],
  ['ç', 'c'],
  ['ÝŸ', 'Y'],
  ['ýÿ', 'y'],
];

const ACCENTED = ACCENT_PAIRS.map(([from]) => from).join('');
const PLAIN = ACCENT_PAIRS.map(([from, to]) => to.repeat([...from].length)).join('');
const WHITESPACE_PATTERN = '\\s+';

/**
 * Expresión equivalente a `normalizeName` (02 RN-02.17) sobre una columna:
 * sin acentos, minúsculas, espacios colapsados y recortada. Se usa en columnas
 * sin copia normalizada (nombre comercial, ciudad, nombre de contacto).
 */
export function normalizedTextSql(expression: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`btrim(regexp_replace(lower(translate(${expression}, ${ACCENTED}, ${PLAIN})), ${WHITESPACE_PATTERN}, ' ', 'g'))`;
}

/** Escapa `\`, `%` y `_` para usar el valor literal dentro de un patrón `LIKE` (escape por defecto `\`). */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** `col = ANY($ids::uuid[])`, o `FALSE` si la lista está vacía (no casa nada). */
export function uuidInSql(column: Prisma.Sql, ids: readonly string[]): Prisma.Sql {
  return ids.length === 0 ? Prisma.sql`FALSE` : Prisma.sql`${column} = ANY(${[...ids]}::uuid[])`;
}

/** `cond1 OR cond2 …` entre paréntesis; `FALSE` si no hay condiciones. */
export function orSql(conditions: readonly Prisma.Sql[]): Prisma.Sql {
  return conditions.length === 0 ? Prisma.sql`FALSE` : Prisma.sql`(${Prisma.join(conditions, ' OR ')})`;
}

/** `cond1 AND cond2 …` entre paréntesis; `TRUE` si no hay condiciones. */
export function andSql(conditions: readonly Prisma.Sql[]): Prisma.Sql {
  return conditions.length === 0 ? Prisma.sql`TRUE` : Prisma.sql`(${Prisma.join(conditions, ' AND ')})`;
}

/**
 * `owner IN (…) OR country IN (…)` de un alcance (`VisibilityScope`, 00 §4.2) sobre dos
 * columnas; `TRUE` si es `ALL`. Listas vacías no casan nada (un alcance `NONE` es `FALSE`).
 * Lo comparten los predicados de visibilidad de clientes y de actividad comercial.
 */
export function visibilityScopeSql(scope: VisibilityScope, ownerColumn: Prisma.Sql, countryColumn: Prisma.Sql): Prisma.Sql {
  if (scope.kind === 'ALL') return Prisma.sql`TRUE`;
  return orSql([uuidInSql(ownerColumn, scope.ownerIds), uuidInSql(countryColumn, scope.countryIds)]);
}

/** ¿El alcance no ve nada (`FILTERED` sin dueños ni países)? */
export function isEmptyScope(scope: VisibilityScope): boolean {
  return scope.kind === 'FILTERED' && scope.ownerIds.length === 0 && scope.countryIds.length === 0;
}
