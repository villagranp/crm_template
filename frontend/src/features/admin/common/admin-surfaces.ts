import type { Theme } from '@mui/material';

import { layout, softTintsFor } from '@/theme/tokens';

/**
 * Superficies y tintes del CRUD del prototipo (`docs/design/prototype`),
 * derivados del tema activo para que funcionen en claro y en oscuro.
 *
 * No hay valores a mano (CLAUDE.md §8.12): los tonos salen de la paleta
 * (`background.subtle`) y del juego de tintes del modo activo (`softTintsFor`,
 * `soft`/`softDark` de `tokens.ts`).
 */

/** Fondo sutil (`--bg-subtle`): cabecera de tabla y degradado de la cabecera de tarjeta. */
export function subtleSurface(theme: Theme): string {
  return theme.palette.background.subtle;
}

/** Tinte de marca (`--brand-soft`): mosaico de icono, número de sección, estado vacío. */
export function brandSoft(theme: Theme): string {
  return softTintsFor(theme.palette.mode).brand;
}

/** Tinte neutro (`--navy-soft`): avatar de iniciales y contador de chip. */
export function neutralSoft(theme: Theme): string {
  return softTintsFor(theme.palette.mode).navy;
}

/** Lado del mosaico de icono de la cabecera de tarjeta (40 px). */
export const ICON_TILE_SIZE = 5;
/** Diámetro del avatar de iniciales de una fila (36 px). */
export const ROW_AVATAR_SIZE = 4.5;
/** Diámetro del círculo del estado vacío (56 px). */
export const EMPTY_ICON_SIZE = 7;
/** Diámetro del número de sección de un formulario (24 px). */
export const SECTION_NUMBER_SIZE = 3;

/** Radio de los mosaicos y botones de icono del CRUD. */
export const TILE_RADIUS = `${layout.radiusSm}px`;
/** Radio de píldora de los chips de filtro (`layout.radiusPill`). */
export const PILL_RADIUS = `${layout.radiusPill}px`;
