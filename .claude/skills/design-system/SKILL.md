---
name: design-system
description: Aplica el sistema de diseño Grupo AG (tokens, tipografía, motion, responsive mobile-first y accesibilidad) al construir o modificar cualquier pantalla. Úsalo en todo cambio visual del frontend, antes de escribir el primer estilo.
---

# Sistema de diseño

## Purpose

Que cualquier pantalla nueva nazca dentro de la identidad visual sin que el
autor tenga que decidir colores, tamaños ni curvas de animación.

## When to use

- Cualquier pantalla, componente o layout nuevo en `frontend/`.
- Cualquier cambio que toque color, tipografía, espaciado, movimiento o
  comportamiento responsive.
- Antes de añadir una dependencia de UI (no se añade: ver Anti-patterns).

## Required context

- [`docs/design/DESIGN-SYSTEM.md`](../../../docs/design/DESIGN-SYSTEM.md) — la traducción vigente.
- [`docs/design/DESIGN-SPEC-SOURCE.md`](../../../docs/design/DESIGN-SPEC-SOURCE.md) — spec original del cliente.
- [ADR-017](../../../docs/adr/ADR-017-design-system-grupo-ag.md) y [ADR-009](../../../docs/adr/ADR-009-material-ui.md).
- `frontend/src/theme/` — tokens y tema.

## Inputs

Historia de usuario, estados de la interfaz (vacío, cargando, error, sin
permiso) y breakpoints donde debe funcionar.

## Standards

1. **Ningún hex, duración, radio ni píxel escrito a mano.** Todo sale del tema o
   de `tokens.ts`. Si falta un valor, se añade al token, se documenta en
   `DESIGN-SYSTEM.md` y entonces se usa.
2. **Nada de morado, teal ni naranja.** Azul AG y grises; los semánticos sólo
   para estado.
3. **Mobile first.** Se escribe para 360 px y se escala con `min-width`.
   Prohibido `max-width` salvo orientación o altura.
4. **Cero scroll horizontal de página.** Sólo scrollan en X los contenedores
   marcados con `scroll-x`.
5. **Movimiento:** sólo `transform`, `opacity` y `filter`; menos de 300 ms;
   nunca `ease-in`. Toda micro-interacción nueva añade su anulación bajo
   `prefers-reduced-motion`.
6. **Áreas táctiles ≥ 44 px** en móvil; los `<input>` nunca bajan de 16 px.
7. **El color nunca es el único indicador de estado**: badge = color + texto.
8. El menú y la navegación **no se declaran en el frontend**: vienen de
   `GET /me/menu` (ver skill `access-management`).

## Process

1. Leer `DESIGN-SYSTEM.md` §2 (mapa de traducción) y §5 (movimiento).
2. Componer con componentes de Material UI ya configurados por el tema. No
   restilizar primitivas localmente.
3. Usar `PageHeader` para el encabezado y `AppShell` para el marco.
4. Definir los cuatro estados de la pantalla: cargando, vacío, error y sin
   permiso.
5. Verificar en 360, 768, 1024 y 1440 px, en tema claro y oscuro.
6. Recorrer el checklist de accesibilidad de `DESIGN-SYSTEM.md` §7.

## Required checks

- [ ] Sin valores literales de color, duración o espaciado en el componente.
- [ ] Funciona en tema claro y oscuro.
- [ ] Sin scroll horizontal en ningún breakpoint.
- [ ] Foco visible y `aria-label` en botones de sólo icono.
- [ ] Contraste ≥ 4.5:1.
- [ ] `prefers-reduced-motion` respetado.
- [ ] Los cuatro estados de la pantalla están resueltos, no sólo el feliz.

## Expected output

Componente o pantalla que usa exclusivamente el tema, con sus estados
resueltos y verificada en los breakpoints indicados.

## Anti-patterns

- Añadir Bootstrap, Tailwind u otra librería de UI. ADR-009 lo prohíbe; si hay
  un motivo real, es un ADR nuevo, no una dependencia silenciosa.
- `style={{ color: '#29478D' }}` — es `color: 'primary.main'`.
- `height: '100vh'` — es `100dvh`.
- Declarar el menú en un array del frontend.
- Emojis como iconos.
- Cargar fuentes o iconos desde una CDN: rompe la Content-Security-Policy del
  borde y añade una dependencia externa en tiempo de ejecución.

## Definition of Done

Pasa los Required checks, no introduce tokens sin documentar y `pnpm verify`
está en verde.

## Related Skills

`frontend-react`, `access-management`, `documentation`.
