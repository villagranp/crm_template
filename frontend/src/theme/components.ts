import { alpha, type Components, type Theme } from '@mui/material';

import {
  darkSurfaces,
  duration,
  easing,
  fonts,
  formField,
  gradients,
  layout,
  lightSurfaces,
  soft,
  softDark,
  softTintsFor,
} from './tokens';

/** Superficies del modo activo que la paleta de MUI no expone (borde marcado, gris sutil). */
function surfacesOf(theme: Theme) {
  return theme.palette.mode === 'dark' ? darkSurfaces : lightSurfaces;
}

function navySoftOf(theme: Theme): string {
  return theme.palette.mode === 'dark' ? softDark.navy : soft.navy;
}

function brandSoftOf(theme: Theme): string {
  return theme.palette.mode === 'dark' ? softDark.brand : soft.brand;
}

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
      // La barra nativa de Windows es gruesa y con flechas: ocupa casi tanto
      // como el contenido en una tira de tarjetas. Se adelgaza sin ocultarla,
      // porque una zona que scrollea sin ninguna pista visible no se descubre.
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
      // `.card-x` del prototipo: borde, radio 14 y sombra corta.
      root: ({ theme }) => ({
        borderRadius: layout.radius,
        boxShadow: theme.shadows[1],
        // Sólo se realza una tarjeta que se puede pulsar, y sólo con puntero fino.
        '@media (hover: hover) and (pointer: fine)': {
          transition: `transform ${duration.hover}ms ease, box-shadow ${duration.hover}ms ease`,
          '&:has(.MuiCardActionArea-root):hover': {
            transform: 'translateY(-2px)',
            boxShadow: theme.shadows[4],
          },
        },
      }),
    },
  },

  MuiCardHeader: {
    styleOverrides: {
      // `.card-x-header`: franja con degradado sutil y borde inferior.
      root: ({ theme }) => ({
        paddingBlock: theme.spacing(1.75),
        borderBottom: `1px solid ${theme.palette.divider}`,
        backgroundImage:
          theme.palette.mode === 'dark' ? gradients.cardHeaderDark : gradients.cardHeaderLight,
      }),
      title: { fontFamily: fonts.heading, fontWeight: 600, fontSize: '0.96rem' },
      subheader: ({ theme }) => ({ fontSize: '0.78rem', color: theme.palette.text.secondary }),
    },
  },

  MuiAppBar: {
    styleOverrides: {
      // La barra superior sólo lleva borde inferior (lo pone el Topbar), sin sombra.
      root: { border: 0, borderRadius: 0, boxShadow: 'none' },
    },
  },

  MuiDialog: {
    defaultProps: { transitionDuration: { enter: duration.modalIn, exit: duration.modalOut } },
    styleOverrides: {
      paper: { borderRadius: layout.radius },
    },
  },

  MuiDialogTitle: {
    styleOverrides: {
      root: { fontFamily: fonts.heading, fontWeight: 600, fontSize: '1.02rem' },
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

  // ---- Campos de formulario (`.field-label` + `.input-x` del prototipo) ----
  // La etiqueta va SIEMPRE encima del campo, nunca flotando dentro: se fuerza
  // `shrink` y se saca la etiqueta del posicionamiento absoluto. Así todos los
  // formularios (incluidos los diálogos de administración) lo heredan sin
  // tocar su código. El `<label for>` se conserva: la accesibilidad y
  // `getByLabelText` no cambian.
  MuiFormLabel: {
    styleOverrides: {
      root: ({ theme }) => ({
        fontSize: formField.labelFontSize,
        fontWeight: 600,
        lineHeight: 1.4,
        color: theme.palette.text.primary,
        '&.Mui-focused': { color: theme.palette.text.primary },
        '&.Mui-disabled': { color: theme.palette.text.secondary },
      }),
      // Asterisco rojo de campo obligatorio.
      asterisk: ({ theme }) => ({ color: theme.palette.error.main }),
    },
  },

  MuiInputLabel: {
    defaultProps: { shrink: true },
    styleOverrides: {
      root: {
        // Gana a `.MuiInputLabel-outlined.MuiInputLabel-shrink` (posición absoluta + escala).
        '&, &.MuiInputLabel-shrink, &.MuiInputLabel-sizeSmall': {
          position: 'relative',
          transform: 'none',
          maxWidth: '100%',
          whiteSpace: 'normal',
          pointerEvents: 'auto',
          marginBottom: formField.labelGap,
        },
      },
    },
  },

  MuiInputBase: {
    styleOverrides: {
      // 16 px mínimo: por debajo, iOS hace zoom al enfocar el campo.
      input: {
        fontSize: '1rem',
        // El anillo de foco lo pinta el contenedor; el contorno global de
        // `:focus-visible` sobre el `<input>` interno sería un segundo anillo.
        '&:focus-visible': { outline: 'none' },
      },
    },
  },

  MuiOutlinedInput: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: layout.radiusSm,
        backgroundColor: theme.palette.background.paper,
        transition: `box-shadow ${duration.hover}ms ease`,
        '&:hover:not(.Mui-disabled):not(.Mui-error):not(.Mui-focused) .MuiOutlinedInput-notchedOutline':
          {
            borderColor: surfacesOf(theme).borderStrong,
          },
        '&.Mui-focused': {
          boxShadow: `0 0 0 ${formField.focusRingWidth}px ${alpha(theme.palette.primary.main, formField.focusRingAlpha)}`,
        },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1 },
        '&.Mui-error.Mui-focused': {
          boxShadow: `0 0 0 ${formField.focusRingWidth}px ${alpha(theme.palette.error.main, formField.focusRingAlpha)}`,
        },
        '&.Mui-disabled': { backgroundColor: surfacesOf(theme).subtle },
      }),
      // Sin "muesca": la etiqueta ya no vive sobre el borde.
      notchedOutline: ({ theme }) => ({
        top: 0,
        borderColor: theme.palette.divider,
        '& legend': { display: 'none' },
      }),
      input: ({ theme }) => ({
        padding: `${formField.inputPaddingY}px ${formField.inputPaddingX}px`,
        [theme.breakpoints.up('lg')]: {
          padding: `${formField.inputPaddingYDesktop}px ${formField.inputPaddingX}px`,
        },
        '&::placeholder': { color: theme.palette.text.secondary, opacity: 0.8 },
      }),
      inputSizeSmall: {
        paddingTop: formField.inputPaddingYDesktop,
        paddingBottom: formField.inputPaddingYDesktop,
      },
      multiline: { padding: `${formField.inputPaddingY}px ${formField.inputPaddingX}px` },
      inputMultiline: { padding: 0 },
      adornedStart: { paddingLeft: formField.inputPaddingX },
      inputAdornedStart: { paddingLeft: 0 },
    },
  },

  MuiInputAdornment: {
    styleOverrides: {
      root: ({ theme }) => ({ color: theme.palette.text.secondary }),
    },
  },

  MuiFormHelperText: {
    styleOverrides: {
      root: { marginLeft: 0, marginRight: 0, marginTop: 5, fontSize: formField.helperFontSize },
    },
  },

  MuiAutocomplete: {
    styleOverrides: {
      // Misma altura que un campo normal (Autocomplete trae su propio relleno de 56 px).
      inputRoot: ({ theme }) => ({
        '&.MuiOutlinedInput-root:not(.MuiInputBase-sizeSmall)': {
          paddingTop: 3,
          paddingBottom: 3,
          [theme.breakpoints.up('lg')]: { paddingTop: 1, paddingBottom: 1 },
        },
      }),
    },
  },

  MuiChip: {
    styleOverrides: {
      // Los badges de estado usan tinte translúcido + texto del color, no el
      // relleno sólido de MUI, que compite con las acciones primarias.
      // MUI no expone una ranura `filled<Color>` para los semánticos, así que
      // la variante se resuelve con `ownerState`.
      // `.badge-x` del prototipo: píldora, 600 y tinte suave. En tema oscuro el
      // texto toma el `main` de la paleta oscura, que ya es el tono aclarado.
      root: ({ ownerState, theme }) => {
        const filled = ownerState.variant !== 'outlined';
        const tint = (background: string, color: string) =>
          filled ? { backgroundColor: background, color } : {};
        const tints = softTintsFor(theme.palette.mode);
        return {
          borderRadius: layout.radiusPill,
          fontWeight: 600,
          ...(!ownerState.color || ownerState.color === 'default'
            ? tint(navySoftOf(theme), theme.palette.text.primary)
            : {}),
          ...(ownerState.color === 'primary'
            ? tint(brandSoftOf(theme), theme.palette.primary.main)
            : {}),
          ...(ownerState.color === 'secondary'
            ? tint(tints.steel, theme.palette.secondary.main)
            : {}),
          ...(ownerState.color === 'success'
            ? tint(tints.success, theme.palette.success.main)
            : {}),
          ...(ownerState.color === 'warning'
            ? tint(tints.warning, theme.palette.warning.main)
            : {}),
          ...(ownerState.color === 'error' ? tint(tints.danger, theme.palette.error.main) : {}),
          ...(ownerState.color === 'info' ? tint(tints.info, theme.palette.info.main) : {}),
          ...(!filled && (!ownerState.color || ownerState.color === 'default')
            ? { borderColor: theme.palette.divider, color: theme.palette.text.secondary }
            : {}),
        };
      },
      sizeSmall: { fontSize: '0.72rem' },
      // El icono de borrar hereda el color del chip: el gris de MUI desaparece sobre el tinte.
      deleteIcon: { color: 'inherit', opacity: 0.7, '&:hover': { color: 'inherit', opacity: 1 } },
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
