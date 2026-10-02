import type { PaletteOptions } from '@mui/material';

import { ag, brand, darkSurfaces, lightSurfaces, semantic } from './tokens';

/**
 * Paleta Material UI derivada de los tokens de Grupo AG.
 *
 * `primary` es el azul AG y se reserva para navegación y acciones primarias.
 * En tema oscuro el CTA sube a `brand-300` para mantener contraste sobre el
 * fondo azul-negro, exactamente como hace el CSS original.
 */
export const lightPalette: PaletteOptions = {
  mode: 'light',
  primary: {
    main: ag.blue,
    light: brand[400],
    dark: brand[700],
    contrastText: ag.white,
  },
  secondary: {
    main: ag.gray2,
    light: ag.gray,
    dark: '#3F474F',
    contrastText: ag.white,
  },
  error: { main: semantic.danger, contrastText: ag.white },
  warning: { main: semantic.warning, contrastText: ag.white },
  info: { main: semantic.info, contrastText: ag.white },
  success: { main: semantic.success, contrastText: ag.white },
  background: {
    default: lightSurfaces.app,
    paper: lightSurfaces.surface,
  },
  text: {
    primary: lightSurfaces.textPrimary,
    secondary: lightSurfaces.textMuted,
    disabled: '#9AA0A6',
  },
  divider: lightSurfaces.border,
  grey: {
    50: brand[50],
    100: brand[100],
    200: brand[200],
    300: brand[300],
    400: brand[400],
    500: brand[500],
    600: brand[600],
    700: brand[700],
    800: brand[800],
    900: brand[900],
  },
};

export const darkPalette: PaletteOptions = {
  mode: 'dark',
  primary: {
    main: brand[300],
    light: brand[200],
    dark: brand[500],
    contrastText: darkSurfaces.app,
  },
  secondary: {
    main: '#A8AFB8',
    light: '#C6CBD2',
    dark: ag.gray2,
    contrastText: darkSurfaces.app,
  },
  error: { main: '#EF5350', contrastText: darkSurfaces.app },
  warning: { main: '#E0A030', contrastText: darkSurfaces.app },
  info: { main: brand[300], contrastText: darkSurfaces.app },
  success: { main: '#4CAF7D', contrastText: darkSurfaces.app },
  background: {
    default: darkSurfaces.app,
    paper: darkSurfaces.surface,
  },
  text: {
    primary: darkSurfaces.textPrimary,
    secondary: darkSurfaces.textMuted,
    disabled: '#6F7885',
  },
  divider: darkSurfaces.border,
};
