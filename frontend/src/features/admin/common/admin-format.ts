/** Formatos de texto compartidos por las pantallas de administración. */

const MAX_INITIALS = 2;
const NUMBER_LOCALE = 'es-MX';

/** Iniciales de un nombre ("Dirección comercial" → "DC"); vacío si no hay letras ni dígitos. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => Array.from(word).find((char) => /\p{L}|\p{N}/u.test(char)) ?? '')
    .filter(Boolean)
    .slice(0, MAX_INITIALS)
    .join('')
    .toUpperCase();
}

/**
 * Subtítulo de una tarjeta de listado: "5 registros · Equipos y jerarquías…".
 * Sin total (cargando o error), sólo la descripción.
 */
export function recordsSubtitle(
  total: number | undefined,
  description: string,
  noun: readonly [singular: string, plural: string] = ['registro', 'registros'],
): string {
  if (total === undefined) {
    return description;
  }
  const count = `${total.toLocaleString(NUMBER_LOCALE)} ${total === 1 ? noun[0] : noun[1]}`;
  return description ? `${count} · ${description}` : count;
}
