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

/**
 * Tintes translúcidos en tema oscuro: sobre la base azul-negra el tinte negro
 * desaparece, así que el "gris suave" pasa a ser blanco al 7 % (prototipo,
 * `html[data-theme=dark]`).
 */
export const softDark = {
  success: 'rgba(76, 175, 125, 0.16)',
  warning: 'rgba(224, 160, 48, 0.16)',
  danger: 'rgba(239, 83, 80, 0.16)',
  info: 'rgba(107, 134, 201, 0.18)',
  brand: 'rgba(107, 134, 201, 0.18)',
  steel: 'rgba(168, 175, 184, 0.16)',
  navy: 'rgba(255, 255, 255, 0.07)',
} as const;

/** Juego de tintes del modo activo: `soft` en claro, `softDark` en oscuro. */
export function softTintsFor(mode: 'light' | 'dark'): {
  readonly [K in keyof typeof soft]: string;
} {
  return mode === 'dark' ? softDark : soft;
}

/** Tintes blancos sobre superficies de marca (hero, tarjetas con gradiente, panel del login). */
export const onBrand = {
  text: 'rgba(255, 255, 255, 0.9)',
  textMuted: 'rgba(255, 255, 255, 0.8)',
  iconTile: 'rgba(255, 255, 255, 0.18)',
  chip: 'rgba(255, 255, 255, 0.2)',
  glow: 'radial-gradient(circle at 85% 30%, rgba(255, 255, 255, 0.18), transparent 55%)',
} as const;

/** Gradientes de marca del prototipo (`.grad-*`, `.hero-card`). Sólo escala azul. */
export const gradients = {
  hero: `linear-gradient(120deg, ${brand[900]} 0%, ${brand[700]} 52%, ${brand[500]} 100%)`,
  brand: `linear-gradient(135deg, ${brand[700]}, ${brand[500]})`,
  brandSoft: `linear-gradient(135deg, ${brand[600]}, ${brand[300]})`,
  /** Botón principal de las pantallas de acceso (`.btn-auth`). */
  cta: `linear-gradient(120deg, ${brand[700]}, ${brand[500]})`,
  /** Cabecera de tarjeta: del gris sutil a transparente (`.card-x-header`). */
  cardHeaderLight: 'linear-gradient(180deg, #F6F8FA, transparent)',
  cardHeaderDark: 'linear-gradient(180deg, #172440, transparent)',
} as const;

/**
 * Campos de formulario (`.input-x`, `.field-label` del prototipo): etiqueta
 * encima del campo, nunca flotante, y anillo de foco de 3 px.
 */
export const formField = {
  labelFontSize: '0.82rem',
  labelGap: 6,
  /** Relleno vertical del campo: 44 px de alto en táctil, 40 px desde `lg`. */
  inputPaddingY: 10.5,
  inputPaddingYDesktop: 8.5,
  inputPaddingX: 13,
  focusRingWidth: 3,
  focusRingAlpha: 0.18,
  helperFontSize: '0.75rem',
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
  /** Ancho del cajón en móvil (`min(86vw, 300px)`). */
  sidebarWidth: 300,
  /** Ancho del sidebar fijo desde `md`; el bloque del logo del topbar mide lo mismo. */
  sidebarWidthDesktop: 268,
  sidebarWidthMini: 76,
  topbarHeight: 58,
  topbarHeightDesktop: 64,
  bottomNavHeight: 62,
  gutter: 16,
  /** Margen lateral del contenido por breakpoint (prototipo `--gutter`). */
  gutterBySize: { xs: 16, sm: 20, md: 24, xl: 28 },
  radius: 14,
  radiusSm: 10,
  /** Radio de los botones de icono (`.icon-btn`) y de las fichas de icono. */
  radiusIcon: 12,
  /** Píldoras: chips, badges y contadores. */
  radiusPill: 999,
  /** Píldoras de módulo del topbar y chips de filtro. */
  pillHeight: 36,
  /** Avatar del topbar y del pie del sidebar. */
  avatarSize: 38,
  avatarSizeSm: 34,
  /** Logotipo del topbar (30 px × 2.85 de proporción). */
  topbarLogoHeight: 30,
  /** Icono de la barra inferior de móvil. */
  bottomNavIconSize: 22,
  /** Viñeta de los sub-elementos del sidebar. */
  navDotSize: 6,
  /** Ficha de icono de las tarjetas de indicador (`.stat-icon`). */
  statIconSize: 42,
  /** Ilustración del hero del panel (sólo desde `xl`). */
  heroIllustrationSize: 150,
  /** Área táctil mínima; baja a 40 px en escritorio. */
  tap: 44,
  contentMaxWidth: 1800,
} as const;

/**
 * Pantallas de acceso (inicio de sesión y cambio de contraseña): panel de marca
 * a la izquierda y tarjeta con el formulario a la derecha.
 */
export const authLayout = {
  /** Tarjeta de una columna (móvil y tablet). */
  cardMaxWidthCompact: 470,
  /** Tarjeta dividida desde `lg`. */
  cardMaxWidth: 1000,
  cardMinHeight: 580,
  cardRadius: 20,
  cardShadow: '0 24px 60px rgba(16, 28, 56, 0.45)',
  /** Proporción del panel de marca dentro de la tarjeta dividida. */
  asideBasis: '46%',
  asideBackground: `radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.16), transparent 55%), linear-gradient(150deg, ${brand[900]} 0%, ${brand[700]} 55%, ${brand[500]} 100%)`,
  asideTextMaxWidth: '40ch',
  logoHeightPanel: 42,
  logoHeightMobile: 34,
  /** Color de respaldo mientras carga la foto, y velo encima de ella para que el pie blanco se lea. */
  backgroundFallback: `linear-gradient(160deg, #0B1424 0%, ${brand[800]} 48%, ${brand[600]} 100%)`,
  backgroundOverlay:
    'linear-gradient(180deg, rgba(16, 28, 56, 0.28) 0%, rgba(16, 28, 56, 0.22) 45%, rgba(16, 28, 56, 0.78) 100%)',
  submitMinHeight: 50,
  submitShadow: '0 8px 20px rgba(41, 71, 141, 0.3)',
  submitShadowHover: '0 10px 26px rgba(41, 71, 141, 0.4)',
  footerText: 'rgba(255, 255, 255, 0.72)',
  /** Partículas de nieve decorativas: densidad por área y tope. */
  snow: { minParticles: 28, maxParticles: 110, areaPerParticle: 16000, color: ag.white },
} as const;

export const shadows = {
  light: {
    sm: '0 1px 2px rgba(19, 21, 23, .07), 0 1px 3px rgba(19, 21, 23, .06)',
    md: '0 4px 12px rgba(19, 21, 23, .09)',
    lg: '0 12px 32px rgba(19, 21, 23, .16)',
    /** Sombra hacia arriba de la barra inferior de móvil. */
    up: '0 -2px 12px rgba(19, 21, 23, .07)',
  },
  dark: {
    sm: '0 1px 2px rgba(0, 0, 0, .4)',
    md: '0 4px 14px rgba(0, 0, 0, .45)',
    lg: '0 16px 40px rgba(0, 0, 0, .55)',
    up: '0 -2px 12px rgba(0, 0, 0, .4)',
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

/**
 * Escala tipográfica del shell tomada del prototipo (`docs/design/prototype`).
 * Los componentes del shell usan estos nombres en vez de escribir `rem` sueltos.
 */
export const fontSizes = {
  /** Etiquetas de sección del menú y textos de la barra inferior. */
  micro: '0.68rem',
  /** Etiquetas de indicador (`.stat-label`). */
  overline: '0.7rem',
  caption: '0.75rem',
  /** Migas de pan y pies de tarjeta. */
  small: '0.8rem',
  /** Sub-elementos del menú lateral. */
  subnav: '0.87rem',
  /** Píldoras de módulo del topbar. */
  topnav: '0.9rem',
  /** Elementos del menú lateral y subtítulos de acceso. */
  nav: '0.92rem',
  pageTitle: 'clamp(0.95rem, 0.85rem + 0.6vw, 1.05rem)',
  cardTitle: '0.96rem',
  heroTitle: 'clamp(1.4rem, 1rem + 2vw, 1.9rem)',
  statValue: 'clamp(1.5rem, 1.1rem + 1.6vw, 1.85rem)',
  authTitle: 'clamp(1.5rem, 1.1rem + 1.6vw, 1.85rem)',
  authAsideTitle: '2.1rem',
  authSubmit: '0.98rem',
} as const;

export const letterSpacing = {
  /** Títulos de página en mayúsculas. */
  title: '0.02em',
  /** Etiquetas de indicador. */
  label: '0.08em',
  /** Etiquetas de sección del menú lateral. */
  section: '0.1em',
} as const;

export const fonts = {
  heading: "'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif",
  body: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

/** Identidad textual del producto: cambia con el cliente igual que los logotipos. */
export const brandIdentity = {
  productName: 'Mi Cliente AG',
} as const;

export const brandAssets = {
  logoLight: '/brand/logo_azul.png',
  logoDark: '/brand/logo_blanco.png',
  mark: '/brand/favico.webp',
  authBackground: '/brand/grupo-ag-login-bg.webp',
} as const;
