import type { TypographyVariantsOptions } from '@mui/material';

import { fonts, fontSizes, letterSpacing } from './tokens';

/**
 * Tipografía del sistema Grupo AG: Poppins para títulos, Inter para cuerpo.
 *
 * Las fuentes se auto-alojan con `@fontsource` (ver `src/main.tsx`): así la
 * Content-Security-Policy del borde no necesita abrirse a Google Fonts y la
 * aplicación no depende de una CDN externa para renderizar texto.
 *
 * Reglas del spec que se respetan aquí:
 * - Base 16 px. Los `<input>` nunca bajan de 16 px (iOS hace zoom al enfocar).
 * - Títulos fluidos con `clamp()`, en mayúsculas y con `letter-spacing: .02em`
 *   cuando son títulos de página (variante `pageTitle` en el shell).
 * - `line-height` de cuerpo entre 1.5 y 1.75.
 */
export const typography: TypographyVariantsOptions = {
  fontFamily: fonts.body,
  fontSize: 16,
  h1: {
    fontFamily: fonts.heading,
    fontSize: 'clamp(1.5rem, 1.2rem + 1.4vw, 2.125rem)',
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: '-0.01em',
  },
  h2: {
    fontFamily: fonts.heading,
    fontSize: 'clamp(1.3rem, 1.1rem + 1vw, 1.75rem)',
    fontWeight: 600,
    lineHeight: 1.25,
  },
  h3: {
    fontFamily: fonts.heading,
    fontSize: 'clamp(1.15rem, 1rem + 0.6vw, 1.4rem)',
    fontWeight: 600,
    lineHeight: 1.3,
  },
  h4: { fontFamily: fonts.heading, fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.35 },
  h5: { fontFamily: fonts.heading, fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 },
  h6: { fontFamily: fonts.heading, fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.4 },
  subtitle1: { fontSize: '0.9375rem', fontWeight: 500, lineHeight: 1.5 },
  subtitle2: { fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.45, letterSpacing: '0.02em' },
  body1: { fontSize: '1rem', lineHeight: 1.6 },
  body2: { fontSize: '0.875rem', lineHeight: 1.6 },
  caption: { fontSize: '0.75rem', lineHeight: 1.45 },
  overline: {
    fontFamily: fonts.heading,
    fontSize: '0.6875rem',
    fontWeight: 600,
    letterSpacing: '0.09em',
    lineHeight: 1.4,
  },
  button: {
    fontFamily: fonts.heading,
    fontSize: '0.875rem',
    fontWeight: 600,
    textTransform: 'none',
  },
};

/**
 * Estilo del título de página del spec: Poppins 600, mayúsculas, tracking .02em.
 * Se aplica con `sx={pageTitleSx}` en el encabezado de página.
 */
export const pageTitleSx = {
  fontFamily: fonts.heading,
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: letterSpacing.title,
};

/**
 * Título del `PageHeader` (`.page-title` del prototipo): mismo estilo que
 * `pageTitleSx` pero en el tamaño compacto de la banda de encabezado.
 */
export const pageHeaderTitleSx = {
  ...pageTitleSx,
  fontSize: fontSizes.pageTitle,
  lineHeight: 1.35,
  margin: 0,
};

/** Etiqueta de sección en versalitas (`.stat-label`, títulos de bloque). */
export const sectionLabelSx = {
  fontSize: fontSizes.overline,
  fontWeight: 600,
  letterSpacing: letterSpacing.label,
  textTransform: 'uppercase' as const,
  lineHeight: 1.4,
};
