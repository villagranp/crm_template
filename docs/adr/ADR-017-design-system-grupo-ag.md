# ADR-017 - Sistema de diseño Grupo AG sobre Material UI

## Status
Accepted — 2026-09-24

## Context
El cliente entregó una plantilla visual de referencia (`CRM.rar`, producto "Mi
Cliente AG") con un sistema de diseño ya definido: paleta corporativa, tipografía,
sistema de movimiento, estrategia responsive mobile-first, reglas de
accesibilidad e inventario de componentes. La instrucción es que los proyectos
derivados de esta plantilla **se vean así**.

El problema es que esa referencia está construida sobre un stack incompatible
con el de la plantilla:

| Aspecto | CRM de referencia | Plantilla |
|---|---|---|
| Framework de UI | Bootstrap 5.3 + CSS propio | React + Material UI (ADR-001, ADR-009) |
| Arquitectura | Multipágina, sin bundler | SPA con Vite |
| JavaScript | Vanilla, IIFE con `initX()` | React con hooks |
| Menú | `assets/js/modules.js` como fuente única | Pendiente de definir |
| Estilos | Variables CSS en `:root` | Tema de Material UI |

Adoptar los dos stacks a la vez significaría mantener dos sistemas de
componentes, dos sistemas de temas y dos formas de escribir una pantalla.

## Decision
Se porta el **sistema de diseño**, no el código.

1. Los tokens del CRM (`:root` de `style.css`) se traducen a
   `frontend/src/theme/tokens.ts` como fuente única de verdad.
2. El tema de Material UI (`palette`, `typography`, `components`, `breakpoints`,
   `transitions`) se construye a partir de esos tokens. Ningún componente
   escribe un hex, una duración o un píxel a mano.
3. La tabla "componente → duración / easing / transform" del spec §4.2 se
   implementa en los `styleOverrides` y `defaultProps` del tema, no en cada
   pantalla.
4. Los breakpoints se fijan en 576 / 768 / 992 / 1200 / 1400 —los de Bootstrap—
   en lugar de los de Material UI, para que la traducción del spec sea literal
   y revisable línea por línea.
5. Los activos de marca (logotipos, marca cuadrada, fondo de acceso) se copian
   tal cual a `frontend/public/brand/`.
6. Las fuentes (Poppins, Inter) y los iconos (Material Symbols Sharp) se
   **auto-alojan** con `@fontsource` y `material-symbols` en lugar de cargarse
   desde Google Fonts y CDNs, como hace el original.
7. El spec original se archiva íntegro en `docs/design/DESIGN-SPEC-SOURCE.md` y
   la traducción se documenta en `docs/design/DESIGN-SYSTEM.md`.

Material UI sigue siendo la única librería de UI (ADR-009). Bootstrap, jQuery y
las librerías del CRM (SweetAlert2, Sortable, Toastr) **no** entran en la
plantilla; cuando haga falta su función, se resuelve con el equivalente de
Material UI o con una decisión propia documentada.

## Alternatives
- **Adoptar Bootstrap y descartar Material UI.** Habría dado un parecido visual
  inmediato y sin trabajo de traducción, pero obliga a reescribir ADR-001 y
  ADR-009, deja el proyecto sin una librería de componentes accesibles y
  probados, y convierte cada formulario, tabla y diálogo en CSS a mano.
- **Convivencia de ambos.** Dos sistemas de tema, colisión de estilos base
  (`reboot` de Bootstrap contra `CssBaseline`), doble peso en el bundle y una
  pregunta en cada pull request: ¿con cuál se escribe esto?
- **Copiar el CRM como aplicación y conectarle el backend.** Es el camino más
  corto a una demo y el más caro después: se pierden el tipado, las pruebas, el
  enrutado y el modelo de estado que justifican todo lo demás de esta plantilla.

## Consequences
- El parecido visual es alto pero **no es idéntico al píxel**. Los componentes
  son de Material UI, con su marcado y su comportamiento; lo que se conserva es
  el lenguaje visual: color, tipografía, ritmo, movimiento y densidad.
- Una pantalla nueva hereda la identidad sin esfuerzo: usa los componentes del
  tema y ya está dentro del sistema.
- Cambiar la identidad (otro cliente, otra marca) es editar `tokens.ts`, no
  perseguir hex por los componentes.
- Se pierde el inventario de páginas del CRM (dashboards, kanban, calendario,
  UI kit). Eran páginas de demostración de un producto concreto, no parte de
  una plantilla sin funcionalidad de negocio.
- Queda una deuda conocida: los logotipos pesan ~80 KB cada uno (3679 px). El
  propio CRM lo tenía anotado como pendiente. Conviene exportarlos a SVG o a
  ~400 px en el primer proyecto.

## Security Considerations
Auto-alojar fuentes e iconos evita abrir la Content-Security-Policy del borde a
`fonts.googleapis.com`, `fonts.gstatic.com` y `cdnjs.cloudflare.com`. El CRM
original cargaba Bootstrap, Font Awesome, Simple Line Icons, Chart.js y
SweetAlert2 desde CDN **sin `integrity`/SRI** —él mismo lo listaba como
pendiente—, lo que significa que un compromiso de esa CDN ejecuta código
arbitrario en la sesión de cada usuario. La plantilla no hereda ese riesgo.
