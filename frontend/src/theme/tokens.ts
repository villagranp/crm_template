/**
 * Design tokens — sistema de diseño Grupo AG.
 *
 * Fuente de verdad: `docs/design/DESIGN-SPEC-SOURCE.md` (spec original del CRM
 * "Mi Cliente AG") y `docs/design/DESIGN-SYSTEM.md` (traducción a este stack).
 *
 * Regla dura heredada del spec: **nada de morado, teal ni naranja**. La
 * identidad es azul AG + escala de grises; los únicos colores fuera de marca
 * son los semánticos de estado.
 *
 * Ningún componente escribe un hex directo. Si hace falta un tono que no
 * existe, se añade aquí y se documenta en DESIGN-SYSTEM.md.
 */

/** Paleta corporativa dada por el cliente. No se altera. */
export const ag = {
  blue: '#29478D',
  black: '#131517',
  gray: '#7C7C7C',
  gray2: '#6C757D',
  bg: '#EFF2F5',
  line: '#C1C1C1',
  white: '#FFFFFF',
} as const;

/** Escala derivada del azul AG: jerarquía, gradientes y series de gráficas. */
export const brand = {
  900: '#101C38',
  800: '#16264B',
  700: '#1E3569',
  600: '#29478D', // = ag.blue
  500: '#33559F',
  400: '#3E60B0',
  300: '#6B86C9',
  200: '#A9B9E0',
  100: '#D5DEF1',
  50: '#EAEFF8',
} as const;

/** Semánticos: sólo estado, nunca marca. */
export const semantic = {
  success: '#1E8E4E',
  warning: '#C77700',
  danger: '#C62828',
  info: brand[400],
} as const;

/** Tintes translúcidos para fondos de badge y chips. */
export const soft = {
  success: 'rgba(30, 142, 78, 0.12)',
  warning: 'rgba(199, 119, 0, 0.13)',
  danger: 'rgba(198, 40, 40, 0.12)',
  info: 'rgba(62, 96, 176, 0.12)',
  brand: 'rgba(41, 71, 141, 0.10)',
  steel: 'rgba(108, 117, 125, 0.14)',
  navy: 'rgba(19, 21, 23, 0.06)',
} as const;

/** Superficies en tema claro. */
export const lightSurfaces = {
  app: ag.bg,
  surface: ag.white,
  subtle: '#F6F8FA',
  sidebar: ag.white,
  topbar: ag.white,
  textPrimary: ag.black,
  textMuted: ag.gray,
  border: '#DBDFE4',
  borderStrong: ag.line,
} as const;

/** Superficies en tema oscuro: base azul-negra, nunca gris neutro. */
export const darkSurfaces = {
  app: '#0C1424',
  surface: '#121C30',
  subtle: '#172440',
  sidebar: '#0F1829',
  topbar: '#0F1829',
  textPrimary: '#F2F4F7',
  textMuted: '#A8AFB8',
  border: '#23314C',
  borderStrong: '#35456A',
} as const;

/**
 * Motion. Filosofía: sólo `transform`, `opacity` y `filter`; curvas propias;
 * menos de 300 ms en UI; nunca `ease-in`.
 */
export const easing = {
  out: 'cubic-bezier(0.23, 1, 0.32, 1)',
  inOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
  drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
} as const;

export const duration = {
  press: 160,
  tabSwitch: 150,
  hover: 150,
  dropdownIn: 180,
  accordion: 200,
  modalOut: 160,
  modalIn: 220,
  drawer: 250,
  toastIn: 280,
  toastOut: 180,
  progress: 400,
} as const;

/** Escalonado de listas, kanban y rejillas de tarjetas (ms entre elementos). */
export const stagger = { min: 30, max: 80 } as const;

/** Layout. Los valores base son los de móvil; el tema los escala por breakpoint. */
export const layout = {
  sidebarWidth: 300,
  sidebarWidthMini: 76,
  topbarHeight: 58,
  topbarHeightDesktop: 64,
  bottomNavHeight: 62,
  gutter: 16,
  radius: 14,
  radiusSm: 10,
  /** Área táctil mínima; baja a 40 px en escritorio. */
  tap: 44,
  contentMaxWidth: 1800,
} as const;

/**
 * Pantallas de acceso (inicio de sesión y cambio de contraseña): panel de marca
 * a la izquierda y tarjeta con el formulario a la derecha.
 */
export const authLayout = {
  brandPanelMaxWidth: 460,
  formCardMaxWidth: 420,
  logoHeightPanel: 36,
  logoHeightMobile: 32,
  /** Velo sobre la foto de fondo: `brand[900]` al 90 % y `brand[700]` al 80 %. */
  backgroundOverlay: 'linear-gradient(120deg, rgba(16, 28, 56, 0.9), rgba(30, 53, 105, 0.8))',
} as const;

export const shadows = {
  light: {
    sm: '0 1px 2px rgba(19, 21, 23, .07), 0 1px 3px rgba(19, 21, 23, .06)',
    md: '0 4px 12px rgba(19, 21, 23, .09)',
    lg: '0 12px 32px rgba(19, 21, 23, .16)',
  },
  dark: {
    sm: '0 1px 2px rgba(0, 0, 0, .4)',
    md: '0 4px 14px rgba(0, 0, 0, .45)',
    lg: '0 16px 40px rgba(0, 0, 0, .55)',
  },
} as const;

/**
 * Breakpoints del spec (mobile first). Coinciden con los de Bootstrap 5 para
 * que la traducción del CRM original sea literal y revisable.
 */
export const breakpoints = { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400 } as const;

/** Orden de apilamiento. Se declara una vez para evitar la guerra de z-index. */
export const zIndex = {
  sidebar: 30,
  topbar: 40,
  bottomNav: 45,
  dropdown: 50,
  toast: 60,
} as const;

/** Serie monocromática para gráficas; verde/ámbar/rojo sólo si la serie ES un estado. */
export const chartSeries = [brand[600], brand[500], brand[400], brand[300], brand[200]] as const;

export const fonts = {
  heading: "'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif",
  body: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

export const brandAssets = {
  logoLight: '/brand/logo_azul.png',
  logoDark: '/brand/logo_blanco.png',
  mark: '/brand/favico.webp',
  authBackground: '/brand/grupo-ag-login-bg.webp',
} as const;
