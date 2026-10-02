# Mi Cliente AG — Especificación de Diseño y Réplica

Documento base del CRM de **ventas y servicio "Mi Cliente AG"**, construido sobre la estructura del template "Taxi CRM" (Bootstrap 5 Admin Dashboard) con la paleta corporativa **Grupo AG**, motion system propio y stack de iconos Material Icons + Font Awesome + Simple Line Icons. Las imágenes actuales son placeholders — se sustituirán más adelante.

> Nota: no existe una skill instalada llamada "Motion". Este spec usa como fuente la skill `emil-design-eng` (filosofía de motion de Emil Kowalski) y `ui-ux-pro-max` (paleta/tipografía/UX) para las reglas de animación e interacción.

> **Mandato de build:** al construir cada página del inventario (§6), invocar `ui-ux-pro-max` (stack `html-tailwind`→adaptar a Bootstrap 5, o buscar `--stack` más cercano) para checklist de pre-entrega por página, y `emil-design-eng` para revisar cada componente interactivo nuevo contra la tabla de §4.2 antes de darlo por terminado. Ninguna página se considera completa si no cumple el checklist de §8.

---

## 1. Stack técnico

- **Base:** HTML5 + Bootstrap 5.3.x
- **JS:** Vanilla JS / jQuery donde el template original lo use (dropdowns, sidebar toggle, kanban drag, calendar). Sin framework SPA — es un template multipágina.
- **CSS:** SCSS compilado a `assets/css/style.css` + variables CSS (`:root`) para theming (incluye modo oscuro).
- **Iconos (3 sistemas, uso segmentado):**
  | Sistema | Uso |
  |---|---|
  | **Material Symbols (Sharp)** | Iconografía de producto: sidebar, stat cards, acciones de tabla, dashboard widgets |
  | **Font Awesome 6** | Iconos sociales (login), badges de estado, iconos inline en texto/botones |
  | **Simple Line Icons** | Iconos ligeros en listados densos (tablas, breadcrumbs, UI kit "Simple Line Icons" page) |
- **Charts:** Morris.js, Chart.js, ECharts, AmCharts, Highcharts (una librería por vista de "Charts", como en el original)
- **Extras:** SweetAlert2, Toastr/propio sistema de notifications, FullCalendar (o similar) para el módulo Calendar, Sortable.js para Scrumboard/Kanban drag&drop

---

## 2. Paleta de color — Corporativa Grupo AG

**Regla dura: no se usa morado, teal ni naranja.** La identidad es azul AG + escala de grises; los únicos colores fuera de marca son los semánticos de estado.

### 2.1 Paleta corporativa (fuente de verdad)

| Token | Hex | Uso |
|---|---|---|
| `--ag-blue` | `#29478D` | Azul AG — marca principal: botones, textos destacados, acentos de timeline |
| `--ag-black` | `#131517` | Texto de alto contraste y estados activos |
| `--ag-gray` | `#7C7C7C` | Texto de cuerpo / párrafos |
| `--ag-gray-2` | `#6C757D` | Botones secundarios |
| `--ag-bg` | `#EFF2F5` | Fondos de sección alternos |
| `--ag-line` | `#C1C1C1` | Bordes y detalles sutiles |
| `--ag-white` | `#FFFFFF` | Fondo base y texto sobre azul/negro |

### 2.2 Escala derivada del azul AG

Necesaria para jerarquía, series de gráficas y estados. Todo sale del `#29478D`:

| Token | Hex | Uso |
|---|---|---|
| `--brand-900` | `#101C38` | Fondos oscuros, hero |
| `--brand-800` | `#16264B` | Superficies oscuras |
| `--brand-700` | `#1E3569` | Hover del primario, inicio de gradientes |
| `--brand-600` | `#29478D` | = `--ag-blue` |
| `--brand-500` | `#33559F` | Fin de gradientes |
| `--brand-400` | `#3E60B0` | Estados activos, `--info`, 2ª serie de gráficas |
| `--brand-300` | `#6B86C9` | 3ª serie, enlaces en dark mode |
| `--brand-200` | `#A9B9E0` | 4ª serie, iconos sobre fondo oscuro |
| `--brand-100 / 050` | `#D5DEF1` / `#EAEFF8` | Tintes de fondo |

Alias estructurales: `--blue-cta` → `--ag-blue`, `--blue-accent` → `--brand-400`, `--text-primary` → `--ag-black`, `--text-muted` → `--ag-gray`, `--bg-app` → `--ag-bg`, `--border-strong` → `--ag-line`.

### 2.3 Semánticos (sólo estado, nunca marca)

| Token | Hex | Uso |
|---|---|---|
| `--success` | `#1E8E4E` | Activo, aprobado, ganado |
| `--warning` | `#C77700` | Pendiente, en espera, prioridad media |
| `--danger` | `#C62828` | Rechazado, cancelado, SLA vencido |
| `--info` | `#3E60B0` | Informativo (= `--brand-400`, dentro de marca) |

Badges disponibles: `badge-brand`, `badge-steel`, `badge-navy`, `badge-success`, `badge-warning`, `badge-danger`, `badge-info`.

### 2.4 Dark mode

Base azul-negra derivada de la marca, nunca gris neutro:
- `--bg-app: #0C1424`, `--bg-surface: #121C30`, `--bg-subtle: #172440`, `--bg-sidebar/topbar: #0F1829`
- `--text-primary: #F2F4F7`, `--text-muted: #A8AFB8`, `--border: #23314C`
- `--blue-cta` y `--blue-accent` suben a `--brand-300` para mantener contraste sobre fondo oscuro.
- El toggle de luna del topbar alterna `data-theme` y persiste en `localStorage` (`mcag-theme`).

### 2.5 Gradientes disponibles

- `.grad-brand` → `--brand-700 → --brand-500` (stat card principal)
- `.grad-brand-soft` → `--brand-600 → --brand-300` (stat card secundaria)
- `.grad-brand-deep` → `--ag-black → --ag-blue` (cabeceras de alto contraste)
- `.grad-steel` → `#3F474F → --ag-gray-2` (métricas neutras)
- `.grad-success` / `.grad-danger` → sólo para KPIs de estado
- Hero → `linear-gradient(120deg, --brand-900, --brand-700, --brand-500)`
- Fondo de login → radiales de `--ag-blue` / `--brand-400` / `--brand-300` sobre base `#0B1424 → #29478D`

### 2.6 Series de gráficas

Monocromía azul AG descendente + verde sólo para "completado":
`#29478D → #33559F → #3E60B0 → #6B86C9 → #A9B9E0`, y `--success` / `--warning` / `--danger` cuando la serie representa un estado.

---

## 3. Tipografía

Recomendación `ui-ux-pro-max` → pairing **"Modern Professional"** (SaaS/dashboards):

- **Heading:** `Poppins` (500/600/700)
- **Body:** `Inter` (alternativa validada a Open Sans, más cercana al look del template original; pesos 400/500/600)

```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');

:root {
  --font-heading: 'Poppins', sans-serif;
  --font-body: 'Inter', sans-serif;
}
```

Reglas:
- `line-height: 1.5–1.75` en body.
- Tamaño base 16px, nunca menos de 14px en tablas densas.
- Títulos de página (breadcrumb header, ej. "DASHBOARD V1") en `Poppins 600`, uppercase, letter-spacing 0.02em, tal como en las capturas.

---

## 4. Motion System

Reglas base (`emil-design-eng`): usar siempre `transform`/`opacity`, easing custom, nunca `ease-in` en UI, animaciones < 300ms salvo modales/drawers.

### 4.1 Curvas base

```css
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}
```

### 4.2 Tabla de componente → duración/easing/transform

| Componente | Trigger | Duración | Easing | Transform |
|---|---|---|---|---|
| Botón (cualquiera) | `:active` | 160ms | `--ease-out` | `scale(0.97)` |
| Botón con loading | click → async | — | — | swap contenido con `filter: blur(2px); opacity:.7` durante transición 200ms |
| Modal (Bootstrap) | open | 220ms | `--ease-out` | de `scale(0.95) opacity:0` centrado (`transform-origin:center`) a `scale(1) opacity:1` |
| Modal | close | 160ms | `--ease-out` | inverso, más rápido que el open |
| Dropdown / Megamenú | open | 180ms | `--ease-out` | `scale(0.96)` desde el trigger (`transform-origin` dinámico, NO center) |
| Sidebar collapse ↔ minified | toggle | 250ms | `--ease-in-out` | `width` vía CSS var + `transform: translateX()` en labels que hacen fade |
| Sidebar submenu (accordion) | expand | 200ms | `--ease-in-out` | `grid-template-rows: 0fr → 1fr` (evita animar `height` real) |
| Toast / Notification | enter | 280ms | `ease` (no ease-out, más elegante estilo Sonner) | `translateY(-100%) → 0` + opacity |
| Toast | exit | 180ms | `--ease-out` | `translateX(100%)`, o swipe con velocidad (dismiss si velocity > 0.11) |
| Stat card (hover) | hover | 150ms | `ease` | `translateY(-2px)` + shadow, solo bajo `@media (hover:hover)` |
| Kanban card (drag) | drag start | instantáneo | — | `scale(1.03)` + shadow elevada, sin transition (drag debe ser 1:1 con el puntero) |
| Kanban card (drop) | drop | 200ms | `--ease-out` | settle a posición final |
| Chat widget popup | open | 220ms | `--ease-drawer` | `translateY(100%) → 0` (igual que drawer) |
| Tabs (UI kit) | switch | 150ms | `ease` | técnica `clip-path` de dos copias para crossfade de color perfecto (ver §4.4) |
| Badge / Toast icon check | aparición | 200ms | `--ease-out` | `scale(0.9)→1` + opacity, nunca desde `scale(0)` |
| Accordion (UI Elements) | expand/collapse | 200ms | `--ease-in-out` | `grid-template-rows` |
| Progress bar | valor cambia | 400ms | `--ease-in-out` | `width` (única excepción permitida a la regla transform-only, es barra de progreso real) |
| Gauge chart (Morris/donut) | carga inicial | 600ms stagger | `--ease-out` | animación nativa de la librería de charts |
| Lightbox / galería | open | 220ms | `--ease-out` | `scale(0.95)+opacity` centrado |
| Sweet Alert | open | 200ms | `--ease-out` | `scale(0.95)→1`, backdrop fade 150ms |
| Sparkline mini-chart (topbar RESERVAS/CONDUCTORES/INGRESOS) | render | 500ms stagger 30ms por barra | `--ease-out` | `scaleY(0→1)` con `transform-origin: bottom` |
| Card de gráfica (Analítica) | hover (sólo puntero fino) | 200ms | `--ease-out` | `translateY(-2px)` + `--shadow-md` |
| Elemento de gráfica (barra, segmento, punto) | hover / hover del chip de leyenda | nativo de Chart.js (~400ms) | nativo | segmento se separa 10px (`hoverOffset`), barra con borde de realce, punto crece; datos nuevos tras un CRUD animan la transición |

### 4.3 Reglas transversales

- **Nunca** animar acciones de teclado (atajos, navegación con flechas en tablas).
- **Stagger** en listas/kanban/grids de stat cards: 30–80ms entre items, nunca bloquear interacción mientras el stagger corre.
- **Botones de icono** (`aria-label` obligatorio) reciben el mismo `scale(0.97)` en `:active`.
- **Popovers/dropdowns** siempre origin-aware (excepto modales, que permanecen centrados).
- **`prefers-reduced-motion: reduce`**: se elimina todo movimiento/escala, se conservan solo transiciones de opacidad/color a 200ms.
- Transiciones CSS (`transition`), no `@keyframes`, en todo elemento que pueda dispararse repetidamente (toasts, kanban, badges) — permite interrupción/retarget.

### 4.4 Detalle: Tabs con technique clip-path

Para el módulo "Tabs" del UI kit (pestañas básicas, pills, verticales, subrayadas): duplicar la lista de tabs, la copia activa se clip-a con `clip-path: inset()` animado — evita el parpadeo de transición de color de fondo/texto simultáneos.

---

## 5. Fondo animado de Login — "nieve cayendo"

Pantalla de login (captura final): panel izquierdo con imagen/gradiente + fondo de partículas cayendo estilo nieve.

**Implementación recomendada:** `<canvas>` full-bleed detrás del panel izquierdo, JS con partículas simples (posición, velocidad Y, leve drift X con `sin(time)`, tamaño 1–3px, opacity 0.4–0.9, color `#FFFFFF` sobre el gradiente navy/magenta existente).

```js
// pseudocódigo — assets/js/snow-canvas.js
const particles = Array.from({length: 80}, () => ({
  x: Math.random() * width,
  y: Math.random() * height,
  r: Math.random() * 2 + 1,
  vy: Math.random() * 0.6 + 0.2,
  drift: Math.random() * 0.5,
}));

function tick() {
  ctx.clearRect(0, 0, width, height);
  particles.forEach(p => {
    p.y += p.vy;
    p.x += Math.sin(p.y * 0.01) * p.drift;
    if (p.y > height) { p.y = -5; p.x = Math.random() * width; }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random()*0.5})`;
    ctx.fill();
  });
  requestAnimationFrame(tick);
}
```

- Respeta `prefers-reduced-motion`: si está activo, renderizar solo 1 frame estático (sin `requestAnimationFrame`).
- Pausar el canvas cuando `document.hidden` (tab en background) para performance.
- El resto del login (inputs, botón "Iniciar sesión", iconos sociales Apple/Google/Facebook/LinkedIn/X) sigue las reglas de §4 (botón `scale(0.97)` en active, focus ring `--blue-cta`).

---

## 6. Inventario de páginas/módulos a replicar

> **Actualización (sep 2026):** el cliente fijó el alcance funcional en 6 módulos — Catálogos, Ventas, Servicio, Marketing, Analítica y Administración — con 40 opciones. Todas se sirven desde `pages/modulo.html?e=<entidad>` con el CRUD genérico descrito en CLAUDE.md §8b; el menú se genera desde `assets/js/modules.js`. El inventario de abajo (heredado del template "Taxi CRM") queda como referencia visual, **no** como lista de páginas a construir.

Según las 38 capturas provistas:

1. **Dashboard v1** — hero saludo + revenue/bookings chart + calendario compacto + búsqueda de vehículo + tablas de disponibilidad + timeline "Today's Timeline" + recent bookings + trip analytics/fleet status (gauge charts) + top drivers/active customers
2. **Dashboard v2** — grid de 8 stat cards con ilustración 3D + fare collection/driver performance/customer satisfaction (donut gauge)
3. **Page Layouts → Minified Sidebar** — sidebar solo-iconos
4. **Registration → Owner** — tabla de propietarios con filtros múltiples, badges de tipo/estado, acciones (ver/editar/vehículos)
5. **Applications → Scrumboard** — kanban 5 columnas (Cartera de pedidos / Tareas pendientes / En curso / Para revisión / Finalizado), tarjetas con avatar, comentarios, adjuntos, labels de prioridad
6. **Applications → Chat Widget** — ventanas de chat flotantes múltiples + lista de contactos con status dot
7. **Applications → Contact Applications** — vista maestro-detalle de solicitudes de conductor (aprobar/entrevistar/rechazar, documentos, tabs Documents/History/Driver Info/Interviews)
8. **Applications → Calendar** — FullCalendar mensual con eventos arrastrables desde panel lateral (New Booking, Airport Transfer, VIP Service, etc.), quick-add event
9. **UI Elements (HTML)** — Accordion, Alert, Badges, Buttons, Carousel, Dropdown, Lightbox, Modals, Pagination, Progress, Notifications (toast), Tabs, Tree View, Typography, Sweet Alert, Spinner Buttons
10. **Tables** — data tables con búsqueda/paginación/filtros
11. **Charts** — Morris Charts, Flot Charts, Chart.js, ECharts, AM Charts, Highcharts (4 gráficos por vista: trend, comparación, distribución zonal, stacked status)
12. **Forms** — Form Elements, Form Plugins, Form Validation, Inline Editable, Editors
13. **Widget page** — banners hero + gauge triplet + 4 stat cards degradados + 4 stat cards con sparkline
14. **Error Pages** — 404 ilustrado
15. **Invoice** — builder de factura con vista previa en vivo (split-pane)
16. **Icons** — Material Icon (2131 iconos buscables), Font Awesome, Simple Line Icons
17. **Authentication** — Login (con fondo de nieve), Sign up, Forgot password
18. **Email Templates, Cookies, FAQ Page** — páginas de contenido estático estilizado

---

## 7. Estructura de layout (shell común a todas las páginas)

```
┌────────────────────────────────────────────────────────────┐
│ Topbar: logo | ☰ | Inicio | Acceso rápido | Reservas |      │
│ Megamenú | Panel de control      [lang][🌙][🔍][⊞][🔔][💬][⛶][avatar] │
├────────────────────────────────────────────────────────────┤
│ Page header: TÍTULO - subtítulo   breadcrumb   [RESERVAS][CONDUCTORES][INGRESOS] + sparkline│
├───────────┬────────────────────────────────────────────────┤
│ Sidebar   │  Contenido de la página (cards en grid)         │
│ (colapsable/minified) │                                     │
├───────────┴────────────────────────────────────────────────┤
│ Footer: Inicio | Página web | Portafolio | Términos | Licencia | Política  © año  │
└────────────────────────────────────────────────────────────┘
```

- Sidebar: soporta 3 estados — expandido, colapsado (solo iconos, con tooltip origin-aware al hover) y "minified" como page-layout alterno.
- Topbar: badge rojo de notificaciones (contador), avatar con status dot (verde = online).
- Header de página siempre trae 3 mini sparklines (bar chart) sincronizados con datos reales via JS.

---

## 7b. Estrategia responsive — MOBILE FIRST (obligatoria)

El CSS se escribe **primero para móvil** (360–575 px) y sólo escala con `@media (min-width: …)`. Está prohibido usar `max-width` salvo para casos de orientación/altura.

| Breakpoint | Qué cambia |
|---|---|
| **base (≤575)** | Sidebar off-canvas con scrim · bottom nav fija con FAB central · topbar compacta (marca, menú, tema, búsqueda, notificaciones, avatar) · KPI strip = carrusel horizontal con snap · tablas = tarjetas apiladas con etiqueta por celda (`td::before { content: attr(data-label) }`) · kanban = 1 columna por pantalla con `scroll-snap` · dropdowns anclados al ancho de pantalla · chat = hoja inferior full-width · modales `modal-fullscreen-sm-down` · inputs a 16px (evita el zoom de iOS) · touch targets 44px |
| **≥576** | Dropdowns flotantes origin-aware · toasts y chat anclados a la derecha · command palette centrado · marca con texto |
| **≥768** | Sidebar pasa a `sticky` dentro del layout (+ modo minified con tooltips) · desaparece la bottom nav · la tabla vuelve a ser `<table>` real · kanban en fila con columnas flexibles · header de página en una línea · ilustración del hero visible |
| **≥992** | Nav de texto en el topbar · extras (idioma, apps, pantalla completa) · KPI strip inline · efectos `:hover` (bajo `@media (hover:hover)`) |
| **≥1200 / ≥1400** | Gutters mayores, alturas de gráfico fijas, contenido centrado con `max-width: 1800px` |

Reglas duras:
- `body { overflow-x: hidden }` + ningún elemento con `min-width` mayor al viewport: **cero scroll horizontal de página**. Sólo scrollan en X contenedores dedicados (kanban, filtros, tablas ≥768).
- Alturas de gráfico con `clamp()`, nunca `height` fijo inline.
- Safe areas iOS (`env(safe-area-inset-*)`) en topbar, sidebar, bottom nav, chat y footer.
- Unidades `svh` en lugar de `vh` para evitar el salto de la barra del navegador móvil.
- Tipografía fluida con `clamp()` en títulos, hero y valores de KPI.
- Variables de layout (`--topbar-h`, `--gutter`, `--tap`) se redefinen por breakpoint, no se duplican reglas.

---

## 8. Checklist de accesibilidad y calidad (ui-ux-pro-max)

- [ ] Contraste texto mínimo 4.5:1 (usar `--text-primary`/`--text-muted`, nunca gray-400 en light mode)
- [ ] `cursor-pointer` en todo elemento clicable (kanban card, stat card, fila de tabla con acción)
- [ ] Focus ring visible (`outline: 2px solid var(--blue-cta)`) en todos los interactivos
- [ ] Iconos decorativos con `aria-hidden`, iconos funcionales con `aria-label`
- [ ] Touch targets ≥ 44×44px (botones de acción en tablas, iconos del topbar)
- [ ] `prefers-reduced-motion` respetado en TODO el motion system (§4.3) y en el canvas de nieve (§5)
- [ ] Sin emojis como iconos — solo Material Symbols / Font Awesome / Simple Line Icons
- [ ] Responsive verificado en 360, 390, 430, 768, 1024, 1280, 1440 y 1920px + landscape de móvil
- [ ] Sin scroll horizontal de página en ningún breakpoint
- [ ] Inputs a 16px mínimo (sin zoom automático en iOS)
- [ ] Modo oscuro probado en todas las páginas del inventario (§6)

---

## 9. Estructura de carpetas propuesta

```
F:\dev\CRM
├── DESIGN_SPEC.md          (este archivo)
├── index.html               (Dashboard v1)
├── dashboard-v2.html
├── pages\
│   ├── layouts\minified-sidebar.html
│   ├── registration\owner.html | vehicle.html | driver.html
│   ├── applications\scrumboard.html | chat-widget.html | contact-applications.html | calendar.html
│   ├── ui-elements\ (accordion, alert, badges, buttons, carousel, dropdown, lightbox, modals, pagination, progress, notifications, tabs, tree-view, typography, sweet-alert, spinner-buttons).html
│   ├── tables\index.html
│   ├── charts\ (morris, flot, chartjs, echarts, amcharts, highcharts).html
│   ├── forms\ (elements, plugins, validation, inline-editable, editors).html
│   ├── widget.html
│   ├── invoice.html
│   ├── icons\ (material-icon, font-awesome, simple-line-icons).html
│   ├── auth\ (login, signup, forgot-password).html
│   ├── error-404.html
│   └── email-templates.html | cookies.html | faq.html
├── assets\
│   ├── css\ (style.css, variables.css, dark-mode.css)
│   ├── js\ (main.js, snow-canvas.js, kanban.js, calendar.js, charts-init.js)
│   ├── img\ (placeholders — se reemplazan después)
│   └── fonts\ (Poppins, Inter vía Google Fonts o self-hosted)
└── partials\ (topbar.html, sidebar.html, footer.html — si se arma un include system)
```

---

## 10. Próximos pasos

1. Confirmar esta paleta/tipografía/motion antes de generar código.
2. Elegir sistema de includes (PHP include / 11ty / Handlebars / copy-paste) para topbar+sidebar+footer compartidos entre ~35 páginas.
3. Construir shell (`topbar` + `sidebar` + `footer`) y Dashboard v1 como página piloto del motion system completo.
4. Iterar página por página siguiendo el inventario de §6.
