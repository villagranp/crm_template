import type { Components, Theme } from '@mui/material';

import { duration, easing, layout, semantic, soft } from './tokens';

/**
 * Overrides de componentes: aquí vive el motion system del spec.
 *
 * Cada regla corresponde a una fila de la tabla "componente → duración /
 * easing / transform" de `docs/design/DESIGN-SPEC-SOURCE.md` §4.2. Si se añade
 * una micro-interacción nueva, se añade también su anulación bajo
 * `prefers-reduced-motion` en `MuiCssBaseline`.
 *
 * Las features no restilizan estas primitivas localmente: si hace falta un
 * comportamiento compartido nuevo, se cambia aquí.
 */
export const components: Components<Omit<Theme, 'components'>> = {
  MuiCssBaseline: {
    styleOverrides: (theme) => ({
      'html, body, #root': { height: '100%' },
      html: { WebkitTextSizeAdjust: '100%' },
      body: {
        WebkitFontSmoothing: 'antialiased',
        // Cero scroll horizontal de página: sólo scrollan contenedores dedicados.
        overflowX: 'hidden',
      },
      // Foco visible en todo interactivo (requisito de accesibilidad del spec).
      ':focus-visible': {
        outline: `2px solid ${theme.palette.primary.main}`,
        outlineOffset: '2px',
      },
      // Contenedores que sí pueden scrollar en X.
      '.scroll-x': {
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'thin',
        scrollbarColor: `${theme.palette.divider} transparent`,
        '&::-webkit-scrollbar': { height: 6 },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: theme.palette.divider,
          borderRadius: 999,
        },
        '&::-webkit-scrollbar-button': { display: 'none' },
      },
      '@media (prefers-reduced-motion: reduce)': {
        '*, *::before, *::after': {
          animationDuration: '0.01ms !important',
          animationIterationCount: '1 !important',
          transitionDuration: '200ms !important',
          transitionProperty: 'opacity, color, background-color, border-color !important',
          transform: 'none !important',
          scrollBehavior: 'auto !important',
        },
      },
    }),
  },

  MuiButtonBase: {
    defaultProps: { disableRipple: false },
  },

  MuiButton: {
    defaultProps: { disableElevation: true, variant: 'contained' },
    styleOverrides: {
      root: {
        borderRadius: layout.radiusSm,
        minHeight: layout.tap,
        paddingInline: 18,
        transition: `transform ${duration.press}ms ${easing.out}, box-shadow ${duration.hover}ms ${easing.out}`,
        // Regla transversal: todo elemento presionable se hunde un 3%.
        '&:active': { transform: 'scale(0.97)' },
        '@media (min-width: 992px)': { minHeight: 40 },
      },
      sizeSmall: { minHeight: 36, paddingInline: 12 },
    },
  },

  MuiIconButton: {
    styleOverrides: {
      root: {
        width: layout.tap,
        height: layout.tap,
        borderRadius: layout.radiusSm,
        transition: `transform ${duration.press}ms ${easing.out}, background-color ${duration.hover}ms ${easing.out}`,
        '&:active': { transform: 'scale(0.97)' },
        '@media (min-width: 992px)': { width: 40, height: 40 },
      },
    },
  },

  MuiPaper: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundImage: 'none',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: layout.radius,
      }),
    },
  },

  MuiCard: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: {
        borderRadius: layout.radius,
        // El realce en hover sólo existe con puntero fino.
        '@media (hover: hover)': {
          transition: `transform ${duration.hover}ms ease, box-shadow ${duration.hover}ms ease`,
          '&:hover': { transform: 'translateY(-2px)' },
        },
      },
    },
  },

  MuiDialog: {
    defaultProps: { transitionDuration: { enter: duration.modalIn, exit: duration.modalOut } },
    styleOverrides: {
      paper: { borderRadius: layout.radius },
    },
  },

  MuiMenu: {
    defaultProps: {
      transitionDuration: duration.dropdownIn,
      // Origen anclado al disparador: los desplegables no se abren desde el centro.
      transformOrigin: { vertical: 'top', horizontal: 'right' },
      anchorOrigin: { vertical: 'bottom', horizontal: 'right' },
    },
    styleOverrides: {
      paper: { borderRadius: layout.radiusSm, marginTop: 6 },
      list: { paddingBlock: 6 },
    },
  },

  MuiMenuItem: {
    styleOverrides: {
      root: { minHeight: layout.tap, borderRadius: 8, marginInline: 6 },
    },
  },

  MuiAccordion: {
    defaultProps: { disableGutters: true, elevation: 0 },
    styleOverrides: {
      root: { '&::before': { display: 'none' } },
    },
  },

  MuiTextField: {
    defaultProps: { size: 'medium', fullWidth: true, variant: 'outlined' },
  },

  MuiInputBase: {
    styleOverrides: {
      // 16 px mínimo: por debajo, iOS hace zoom al enfocar el campo.
      input: { fontSize: '1rem' },
    },
  },

  MuiOutlinedInput: {
    styleOverrides: {
      root: { borderRadius: layout.radiusSm },
    },
  },

    MuiChip: {
    styleOverrides: {
      // Los badges de estado usan tinte translúcido + texto del color, no el
      // relleno sólido de MUI, que compite con las acciones primarias.
      // MUI no expone una ranura `filled<Color>` para los semánticos, así que
      // la variante se resuelve con `ownerState`.
      root: ({ ownerState }) => ({
        borderRadius: 8,
        fontWeight: 600,
        ...(ownerState.variant === 'filled' && ownerState.color === 'success'
          ? { backgroundColor: soft.success, color: semantic.success }
          : {}),
        ...(ownerState.variant === 'filled' && ownerState.color === 'warning'
          ? { backgroundColor: soft.warning, color: semantic.warning }
          : {}),
        ...(ownerState.variant === 'filled' && ownerState.color === 'error'
          ? { backgroundColor: soft.danger, color: semantic.danger }
          : {}),
        ...(ownerState.variant === 'filled' && ownerState.color === 'info'
          ? { backgroundColor: soft.info, color: semantic.info }
          : {}),
      }),
    },
  },

  MuiTableCell: {
    styleOverrides: {
      root: ({ theme }) => ({ borderColor: theme.palette.divider }),
      head: ({ theme }) => ({
        fontWeight: 600,
        fontSize: '0.8125rem',
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        color: theme.palette.text.secondary,
        backgroundColor: theme.palette.background.default,
      }),
    },
  },

  MuiTabs: {
    styleOverrides: {
      root: { minHeight: layout.tap },
      indicator: { height: 3, borderRadius: 3 },
    },
  },

  MuiTab: {
    styleOverrides: {
      root: {
        minHeight: layout.tap,
        textTransform: 'none',
        fontWeight: 600,
        transition: `color ${duration.tabSwitch}ms ease`,
      },
    },
  },

  MuiTooltip: {
    defaultProps: { arrow: true, enterDelay: 300 },
    styleOverrides: {
      tooltip: { fontSize: '0.75rem', borderRadius: 8 },
    },
  },

  MuiLinearProgress: {
    styleOverrides: {
      // Única excepción permitida a la regla "sólo transform": es una barra real.
      bar: { transition: `transform ${duration.progress}ms ${easing.inOut}` },
    },
  },

  MuiDrawer: {
    styleOverrides: {
      paper: { borderRadius: 0 },
    },
  },

  MuiLink: {
    defaultProps: { underline: 'hover' },
  },

  MuiAlert: {
    styleOverrides: {
      root: { borderRadius: layout.radiusSm },
    },
  },
};
