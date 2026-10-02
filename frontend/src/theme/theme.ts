import { createTheme, type Theme } from '@mui/material';

import { components } from './components';
import { darkPalette, lightPalette } from './palette';
import { breakpoints, easing, layout, shadows, zIndex } from './tokens';
import { typography } from './typography';

/**
 * Tema Material UI del sistema de diseño Grupo AG.
 *
 * ADR-009 fija Material UI como única librería de UI; ADR-017 explica por qué
 * el sistema visual del CRM (Bootstrap + CSS propio) se porta a este tema en
 * lugar de arrastrar Bootstrap al proyecto.
 *
 * Base de espaciado: 8 px. Usa `theme.spacing(n)` o las props de `sx`, nunca
 * píxeles a mano.
 */
const BASE_SPACING_PX = 8;

function createAppTheme(mode: 'light' | 'dark'): Theme {
  const isDark = mode === 'dark';

  return createTheme({
    palette: isDark ? darkPalette : lightPalette,
    typography,
    components,
    spacing: BASE_SPACING_PX,
    shape: { borderRadius: layout.radiusSm },
    breakpoints: { values: breakpoints },
    zIndex: {
      appBar: zIndex.topbar,
      drawer: zIndex.sidebar,
      modal: zIndex.dropdown + 10,
      snackbar: zIndex.toast,
      tooltip: zIndex.toast + 10,
    },
    transitions: {
      easing: {
        easeOut: easing.out,
        easeInOut: easing.inOut,
        // `ease-in` está prohibido en UI: se mapea a la curva de salida.
        easeIn: easing.out,
        sharp: easing.inOut,
      },
    },
    shadows: buildShadows(isDark),
  });
}

/**
 * MUI exige exactamente 25 niveles de sombra. El sistema sólo define tres, así
 * que se reparten en bloques en lugar de inventar veintidós valores.
 */
function buildShadows(isDark: boolean): Theme['shadows'] {
  const set = isDark ? shadows.dark : shadows.light;
  const list = ['none', ...Array.from({ length: 24 }, (_, index) => (index < 4 ? set.sm : index < 12 ? set.md : set.lg))];
  return list as unknown as Theme['shadows'];
}

export const lightTheme = createAppTheme('light');
export const darkTheme = createAppTheme('dark');

/** Tema por defecto para pruebas y para contextos sin selector de modo. */
export const appTheme = lightTheme;

export function getTheme(mode: 'light' | 'dark'): Theme {
  return mode === 'dark' ? darkTheme : lightTheme;
}
