# Sistema de diseño

Identidad visual de los proyectos derivados de esta plantilla. La decisión de
por qué se porta el sistema del CRM a Material UI en lugar de adoptar Bootstrap
está en [ADR-017](../adr/ADR-017-design-system-grupo-ag.md).

| Documento | Qué es |
|---|---|
| [`DESIGN-SPEC-SOURCE.md`](DESIGN-SPEC-SOURCE.md) | Spec original entregado por el cliente. **No se edita**: es la referencia histórica |
| [`prototype/`](prototype/README.md) | Prototipo HTML de referencia visual (estructura y acabado). No es código de la app |
| Este archivo | Cómo se traduce ese spec a React + Material UI y qué cambió |
| `frontend/src/theme/tokens.ts` | Fuente única de verdad en código |

---

## 1. Regla de oro

**Ningún componente escribe un hex, una duración, un radio ni un píxel a mano.**
Todo sale del tema. Si hace falta un valor que no existe, se añade a
`tokens.ts`, se documenta aquí y entonces se usa.

La regla dura heredada del spec sigue vigente: **nada de morado, teal ni
naranja**. La identidad es azul AG más escala de grises; los únicos colores
ajenos a la marca son los semánticos de estado.

---

## 2. Mapa de traducción

| Spec original (Bootstrap + CSS) | En esta plantilla |
|---|---|
| `:root { --ag-blue: … }` | `tokens.ts` → `ag`, `brand`, `semantic`, `soft` |
| `html[data-theme="dark"]` | `darkPalette` + `getTheme(mode)`; el atributo se sigue poniendo en `<html>` para las capturas de prueba |
| `.btn-x`, `.badge-x`, `.card-x`… (sufijo `-x`) | Componentes de Material UI con `styleOverrides` en `components.ts` |
| Tabla de motion §4.2 | `defaultProps.transitionDuration` y `transition` en `components.ts` |
| `@media (min-width: 576/768/992/1200/1400)` | `breakpoints.values` del tema, con los mismos valores |
| `--tap: 44px` | `minHeight`/`width` de `MuiButton` y `MuiIconButton` |
| `assets/js/modules.js` (menú) | `GET /me/menu` desde la base de datos (ADR-018) |
| `localStorage: mcag-theme` | `localStorage: app-theme` en `ui.store.ts` |
| Google Fonts + CDNs de iconos | `@fontsource/poppins`, `@fontsource/inter`, `material-symbols` auto-alojados |
| Bootstrap, jQuery, SweetAlert2, Toastr, Sortable | No se adoptan. Se usa el equivalente de Material UI |
| Font Awesome / Simple Line Icons | `@mui/icons-material`, con registro explícito (ver §9b) |
| `.page-header`, `.page-title span`, `.breadcrumb-x` | `PageHeader` (§8c) |
| `.field-label`, `.req`, `.input-x` | Overrides globales de `MuiFormLabel`/`MuiInputLabel`/`MuiOutlinedInput` (§8d) |
| `.card-x`, `.card-x-header`, `.badge-x` | Overrides de `MuiCard`, `MuiCardHeader` y `MuiChip` (§8e) |
| `.hero-card`, `.stat-card`, `.grad-*` | `gradients`, `onBrand` y `layout.statIconSize` en `tokens.ts`; uso en `HomePage` (§8f) |
| `#snowCanvas` (`snow-canvas.js`) | `features/auth/SnowCanvas.tsx` (§8b) |

---

## 3. Color

### Corporativos (dados por el cliente, no se alteran)

| Token | Hex | Uso |
|---|---|---|
| `ag.blue` | `#29478D` | Marca principal: acciones primarias, navegación activa |
| `ag.black` | `#131517` | Texto de alto contraste |
| `ag.gray` | `#7C7C7C` | Texto de cuerpo secundario |
| `ag.gray2` | `#6C757D` | Acciones secundarias |
| `ag.bg` | `#EFF2F5` | Fondo de la aplicación |
| `ag.line` | `#C1C1C1` | Bordes marcados |
| `ag.white` | `#FFFFFF` | Superficie base |

### Escala de marca

`brand[900…50]`: `#101C38 · #16264B · #1E3569 · #29478D · #33559F · #3E60B0 ·
#6B86C9 · #A9B9E0 · #D5DEF1 · #EAEFF8`.

Se usa para jerarquía, gradientes y series de gráficas (`chartSeries`).

### Semánticos (sólo estado, nunca marca)

`success #1E8E4E` · `warning #C77700` · `danger #C62828` · `info #3E60B0`.

El color **nunca** es el único indicador de estado: un badge lleva color y
texto.

### Modo oscuro

Base azul-negra (`#0C1424` / `#121C30` / `#0F1829`), nunca gris neutro. El color
primario sube a `brand[300]` para mantener contraste sobre fondo oscuro. Se
selecciona con `useUiStore.themeMode`, que arranca de la preferencia del sistema
y persiste en `localStorage`.

---

## 4. Tipografía

- **Títulos:** Poppins 400/500/600/700 (`fonts.heading`).
- **Cuerpo:** Inter 300–700 (`fonts.body`).
- Base 16 px. Los `<input>` nunca bajan de 16 px o iOS hace zoom al enfocarlos
  (está forzado en `MuiInputBase`).
- Títulos fluidos con `clamp()`.
- Los títulos de página van en mayúsculas con `letter-spacing: .02em`: se
  aplican con `sx={pageTitleSx}` o usando `PageHeader`.

---

## 5. Movimiento

Sólo `transform`, `opacity` y `filter`. Menos de 300 ms en interfaz. **Nunca
`ease-in`**: el tema lo mapea a la curva de salida para que ni siquiera esté
disponible por accidente.

| Situación | Qué hace el tema |
|---|---|
| Cualquier elemento presionable | `scale(0.97)` en `:active`, 160 ms |
| Diálogo | entra en 220 ms, sale en 160 ms |
| Menú desplegable | 180 ms, con origen anclado al disparador (los diálogos sí van centrados) |
| Acordeón / submenú del sidebar | 200 ms con `Collapse` y curva `ease-in-out` |
| Tarjeta en hover | `translateY(-2px)`, sólo bajo `@media (hover: hover)` |
| Barra de progreso | 400 ms; única excepción permitida a la regla "sólo transform" |
| `prefers-reduced-motion` | Bloque final de `MuiCssBaseline`: se anulan transformaciones y animaciones, se conservan opacidad y color a 200 ms |

**Toda micro-interacción nueva debe añadir su anulación al bloque de
`prefers-reduced-motion`.** Es la trampa en la que cayó el proyecto original más
de una vez.

---

## 6. Responsive — mobile first obligatorio

El CSS base es móvil; sólo se escala con `min-width`. Está prohibido `max-width`
salvo para orientación o altura.

| Breakpoint | Qué cambia |
|---|---|
| base ≤575 | Sidebar como cajón con velo · barra inferior de navegación · topbar compacta · tira de KPIs en carrusel con snap |
| ≥576 | Menús flotantes anclados |
| ≥768 | Sidebar fijo de 268 px (+ modo minificado de 76 px con tooltip) · topbar de 64 px · desaparece la barra inferior |
| ≥992 | Píldoras de módulo y pantalla completa en el topbar · hover · controles de 40 px en vez de 44 · tarjeta de acceso dividida |
| ≥1200 / ≥1400 | Márgenes mayores, contenido centrado a `1800 px` |

Reglas duras:
- **Cero scroll horizontal de página.** `body { overflow-x: hidden }` y sólo
  scrollan en X los contenedores con la clase `scroll-x`.
- Áreas táctiles ≥ 44 px en móvil.
- `env(safe-area-inset-*)` en topbar, sidebar y barra inferior.
- `100dvh` en lugar de `100vh`.

---

## 7. Accesibilidad — mínimos no negociables

- Contraste ≥ 4.5:1. Nunca texto en un gris más claro que `ag.gray`.
- Foco visible en todo interactivo (`:focus-visible` con anillo de 2 px del
  color primario, definido en `CssBaseline`).
- `aria-label` en botones de sólo icono; `aria-hidden` en iconos decorativos
  (`MaterialSymbol` ya lo pone).
- `<label>` asociado a cada campo; errores con `aria-describedby` y
  `aria-invalid`.
- Sin emojis como iconos: sólo Material Symbols.
- Verificar en 360, 390, 430, 768, 1024, 1280, 1440 y 1920 px, y en horizontal
  de móvil.

---

## 8. Shell de la aplicación

Estructura y acabado tomados del prototipo (`docs/design/prototype/index.html`).

```
┌───────────────┬──────────────────────────────────────────────┐
│ logo (268 px) │ ☰ · [Inicio] Administración …   ⛶ ☾ 🔍 🔔 (JR) │  Topbar
├───────────────┼──────────────────────────────────────────────┤
│ PRINCIPAL     │ TÍTULO — contexto                  [acciones] │  PageHeader
│  ▣ Panel      │ Inicio / Módulo / Pantalla                   │  (banda blanca)
│ MÓDULOS       ├──────────────────────────────────────────────┤
│  ▢ Ventas   › │                                              │
│ SISTEMA       │  Contenido (fondo ag.bg, margen --app-gutter) │
│  ▣ Admin    ⌄ │                                              │
│    • Usuarios │                                              │
├───────────────┤                                              │
│ (JR) Nombre   │ © año Mi Cliente AG                          │  Footer (≥md)
└───────────────┴──────────────────────────────────────────────┘
        Móvil (<md): BottomNav [Inicio] [Administración] [Menú]
```

| Componente | Archivo |
|---|---|
| Shell | `components/layout/AppShell.tsx` |
| Barra superior | `components/layout/Topbar.tsx` |
| Menú lateral (cajón / fijo / minificado) | `components/layout/Sidebar.tsx` + `SidebarNav.tsx` |
| Clasificación y recorrido del menú (lógica pura, probada) | `components/layout/menu-navigation.ts` |
| Navegación inferior de móvil | `components/layout/BottomNav.tsx` |
| Encabezado de página | `components/layout/PageHeader.tsx` |
| Avatar con iniciales | `components/layout/UserAvatar.tsx` + `user-initials.ts` |
| Pantalla completa | `components/layout/use-fullscreen.ts` |
| Logo e iconos | `BrandLogo.tsx`, `MaterialSymbol.tsx` |

**El menú no se escribe en el código.** Sale de `GET /me/menu`, es decir, de las
opciones que el backend concede al usuario (ADR-018). Para añadir una entrada al
menú se da de alta una `MenuOption` y se asigna a un rol o a una persona; el
frontend sólo tiene que tener una ruta que coincida con la de la opción. El
topbar, el sidebar, la barra inferior y los accesos del panel salen todos de esa
misma respuesta.

### Topbar

- Desde `md` el bloque del logo mide lo mismo que el sidebar
  (`layout.sidebarWidthDesktop` = 268 px, o 76 px minificado con la marca
  cuadrada), para que el logo quede alineado con los iconos del menú.
- ☰ alterna el modo minificado en escritorio y abre el cajón en móvil.
- Desde `lg`, una **píldora por módulo** de `/me/menu`: lleva a la primera
  opción navegable del módulo; la del módulo que contiene la ruta actual es
  sólida en el color primario (`aria-current`).
- A la derecha, sólo controles con función real: pantalla completa (Fullscreen
  API, desde `lg`, oculto si el navegador no la soporta), tema claro/oscuro,
  búsqueda, notificaciones (sin globo cuando no hay ninguna) y avatar con
  iniciales, cuyo menú ofrece **Cambiar contraseña** (sólo proveedor local) y
  **Cerrar sesión**.
- **No se replican** (decisión del responsable, 2026-10-09): idioma, cuadrícula
  de aplicaciones, mensajes, contadores ficticios ni el punto de "en línea".

### Sidebar

- Tres secciones con etiqueta en versalitas: **Principal** (opciones del módulo
  `inicio`, sueltas), **Módulos** (módulos de negocio) y **Sistema** (módulos con
  `isSystem: true` en `/me/menu`). Una sección vacía no se pinta.
- Cada módulo fuera de `inicio` es un **grupo desplegable** (icono con contorno,
  texto y chevrón que gira 90°). Sus opciones son sub-elementos con viñeta.
- Activo: el elemento o el grupo que contiene la ruta es una **píldora sólida**
  del color primario con texto en contraste; el sub-elemento activo va en
  negrita primaria con la viñeta rellena.
- El grupo de la ruta actual **se despliega solo** al navegar.
- Tarjeta del usuario fija al pie (iniciales, nombre, correo). Es informativa:
  las acciones de cuenta están en el avatar del topbar.
- **Minificado** (≥ md, preferencia en `localStorage: app-sidebar-mini` con
  `try/catch`): sólo iconos con tooltip; las etiquetas de sección se vuelven un
  separador y un grupo abre un menú flotante con sus opciones.
- **Móvil**: cajón de `min(86vw, 300px)` por encima del topbar y de la barra
  inferior, con velo.

### Barra inferior (móvil, < md)

Un elemento por módulo de `/me/menu` (hasta tres; lleva a su primera opción) y
**Menú** al final, que abre el cajón con todo lo demás. El botón flotante "+"
central del prototipo **se omite** mientras no exista una acción principal real
por ruta. Se oculta en horizontal de poca altura.

### 8c. Encabezado de página (`PageHeader`)

Banda blanca (`background.paper`, borde inferior) pegada al topbar que ocupa
todo el ancho del área de contenido: se sale del margen del contenido con la
variable `--app-gutter` que define `AppShell` (fuera del shell vale 0).

| Prop | Uso |
|---|---|
| `title` | `h1` en Poppins 600, mayúsculas, `fontSizes.pageTitle` |
| `context` *(nueva, opcional)* | Sufijo `— contexto` en gris, sin mayúsculas, dentro del mismo `h1` |
| `breadcrumbs` | **Debajo** del título; enlaces en color primario salvo la última (`aria-current="page"`) |
| `subtitle` | Descripción breve bajo las migas, en texto secundario |
| `actions` | A la derecha desde `md`; debajo en móvil |
| `metrics` | Tira con scroll horizontal propio (se conserva por compatibilidad; ninguna página pone KPIs ficticios) |

### 8d. Campos de formulario

Etiqueta **encima** del campo, nunca flotante, como `.field-label` + `.input-x`
del prototipo. Se resuelve en el tema, así que **todo** formulario lo hereda sin
tocar su código (`TextField`, `select`, `Autocomplete`, `FormLabel`):

- `MuiInputLabel.defaultProps.shrink = true` y la etiqueta sale del
  posicionamiento absoluto (`position: relative`, sin `transform`).
- `MuiFormLabel`: `formField.labelFontSize`, 600, color de texto (no cambia al
  enfocar); el asterisco de obligatorio va en `error.main`.
- `MuiOutlinedInput`: sin muesca (la `legend` se oculta), borde `divider`, borde
  marcado al pasar, alto de 44 px táctil y 40 px desde `lg`, radio 10 y **anillo
  de foco de 3 px** del primario al 18 % (`formField.focusRingAlpha`), rojo con
  error. El contorno global de `:focus-visible` se quita del `<input>` interno
  para no pintar dos anillos.
- `MuiFormHelperText` sin sangría. `MuiAutocomplete` ajustado al mismo alto.
- Iconos al inicio del campo con `InputAdornment position="start"` (correo y
  candado en acceso); `PasswordField` lleva candado y botón de mostrar.

El `<label for>` se conserva: `getByLabelText` y los lectores de pantalla no
cambian (`theme/form-fields.spec.tsx`).

### 8e. Superficie de la aplicación

- Contenido sobre `background.default` (`ag.bg`), con margen `--app-gutter`
  (`layout.gutterBySize`: 16 / 20 / 24 / 28 px) y ancho máximo de 1800 px.
- `MuiCard`: borde, radio 14 y `shadows[1]` (sombra corta). Sólo se eleva al
  pasar una tarjeta **pulsable** (con `CardActionArea`), y sólo con puntero fino.
- `MuiCardHeader`: franja con degradado sutil (`gradients.cardHeader*`) y borde
  inferior. `MuiDialogTitle` en Poppins 600.
- `MuiChip`: píldora (`layout.radiusPill`), 600, **tinte suave + texto del
  color** para todos los colores (incluidos `default` y `primary`); en oscuro
  los tintes usan `softDark` y el texto, el `main` aclarado de la paleta oscura.
- Etiquetas de sección en versalitas con `sectionLabelSx` (`typography.ts`).
- Modo oscuro: el primario activo es `brand[300]` con texto `primary.contrastText`
  (azul-negro). El prototipo pone texto blanco sobre ese azul, pero no llega a
  4.5:1; aquí manda el contraste.

### 8f. Panel de control (`HomePage`)

Estilo del prototipo con **datos reales únicamente**: tarjeta de saludo con la
fecha ("Buenos días, Javier." según la hora local) y cuántas opciones y módulos
concede el menú; cuatro tarjetas de indicador (roles, permisos efectivos,
alcance de datos y equipos, de `GET /me`) y **accesos rápidos** a cada opción del
menú. Sin KPIs de negocio, gráficas ni botones de acción inventados.

### 8b. Pantallas de acceso

Inicio de sesión (`/acceso`) y cambio de contraseña (`/cambiar-contrasena`)
viven **fuera** del shell: no hay menú hasta que la sesión es plena. Comparten
`features/auth/AuthLayout.tsx`, réplica de `pages/auth/login.html`:

- Foto corporativa a sangre (`brandAssets.authBackground`) con velo
  (`authLayout.backgroundOverlay`) y nieve decorativa (`SnowCanvas`: sólo se
  monta si el sistema declara `prefers-reduced-motion: no-preference` y se
  pausa con la pestaña oculta).
- Tarjeta centrada de radio 20 y sombra profunda: una columna (máx. 470 px) en
  móvil; **dividida desde `lg`** (máx. 1000 × 580 px) con el panel azul de marca
  (logo blanco, nombre del producto, descripción y viñetas con icono) a la
  izquierda y el formulario blanco a la derecha.
- Las viñetas describen sólo lo que existe hoy: acceso por roles y permisos,
  administración centralizada y auditoría de cambios.
- Formulario: "Bienvenido de nuevo" + subtítulo, etiquetas encima, icono al
  inicio de cada campo, mostrar contraseña y botón principal a todo el ancho con
  degradado y sombra (`AuthSubmitButton`).
- **No se replican**: "Recordarme", el enlace "¿Olvidaste tu contraseña?" (no hay
  flujo de recuperación: se mantiene el texto de ayuda) ni los enlaces legales
  del pie. El pie sólo dice `© año Mi Cliente AG` (`brandIdentity.productName`).

| Token (`authLayout`) | Valor | Uso |
|---|---|---|
| `cardMaxWidthCompact` / `cardMaxWidth` | 470 / 1000 | Ancho de la tarjeta en una columna / dividida |
| `cardMinHeight`, `cardRadius`, `cardShadow` | 580, 20, sombra azul profunda | Tarjeta dividida |
| `asideBasis`, `asideBackground` | 46 %, degradado `brand` 900→700→500 con brillo | Panel de marca |
| `logoHeightPanel` / `logoHeightMobile` | 42 / 34 | Logotipo en el panel y en móvil |
| `backgroundFallback`, `backgroundOverlay` | degradado azul, velo `brand[900]` | Fondo |
| `submitMinHeight`, `submitShadow(Hover)` | 50, sombra azul | Botón principal |
| `snow` | 28–110 partículas, blanco | Nieve decorativa |

### Tokens añadidos con este shell

`softDark`, `onBrand`, `gradients`, `formField`, `fontSizes`, `letterSpacing`,
`brandIdentity`; en `layout`: `sidebarWidthDesktop`, `gutterBySize`,
`radiusIcon`, `radiusPill`, `pillHeight`, `avatarSize(Sm)`, `topbarLogoHeight`,
`bottomNavIconSize`, `navDotSize`, `statIconSize`, `heroIllustrationSize`; en
`shadows.*`: `up` (sombra de la barra inferior); y el bloque `authLayout`
rehecho (sustituye a `brandPanelMaxWidth`/`formCardMaxWidth`). Los presets
`pageHeaderTitleSx` y `sectionLabelSx` viven en `typography.ts`.

---

## 9b. Iconos

Los iconos vienen de `@mui/icons-material`, que se empaqueta por árbol: sólo
entra en el bundle el icono que se importa, en torno a 1 kB cada uno.

Las opciones de menú guardan el nombre del icono como texto en la base de datos
(`MenuOption.icon`, en snake_case de Material Symbols: `manage_accounts`), así
que `components/layout/MaterialSymbol.tsx` lo resuelve con un **registro
explícito**.

**Para usar un icono nuevo hay que añadirlo a ese registro.** Es deliberado: la
alternativa era cargar la fuente completa de Material Symbols, que pesa ~3 MB y
se descargaría entera para pintar diez iconos. Un nombre que no esté en el
registro no rompe nada: cae en el icono por defecto.

## 9. Activos de marca

En `frontend/public/brand/`:

| Archivo | Uso |
|---|---|
| `logo_azul.png` | Logotipo sobre fondos claros |
| `logo_blanco.png` | Logotipo sobre fondos oscuros y tema oscuro |
| `favico.webp` | Marca cuadrada: favicon y sidebar minificado |
| `grupo-ag-login-bg.webp` | Fondo de la pantalla de acceso |

**Deuda conocida:** los dos logotipos pesan ~80 KB y miden 3679 px. Conviene
exportarlos a SVG o a ~400 px en el primer proyecto; el propio CRM lo tenía
anotado como pendiente.

---

## 10. Cómo cambiar la identidad para otro cliente

1. Sustituir los archivos de `frontend/public/brand/`.
2. Editar `ag`, `brand` y `lightSurfaces`/`darkSurfaces` en `tokens.ts`.
3. Cambiar `fonts` en `tokens.ts` y los `import` de `@fontsource` en `main.tsx`.
4. Ejecutar las pruebas del tema (`theme.spec.ts`) y ajustar las que fijan
   valores concretos de la paleta anterior.

No debería hacer falta tocar ningún componente. Si hace falta, es que ese
componente se saltó la regla de oro.
