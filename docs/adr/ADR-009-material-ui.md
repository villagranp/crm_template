# ADR-009 - Material UI como librería de UI

## Status
Accepted — 2026-09-22

## Context
Sin una librería de UI única, cada proyecto y cada agente introduce su propio sistema de
estilos, produciendo interfaces inconsistentes y difíciles de mantener.

## Decision
Material UI (MUI) es la librería de UI estándar y obligatoria, con un theme centralizado en
`frontend/src/theme/` que define palette, typography, spacing, breakpoints y overrides de
componentes. No se introducen Tailwind, Bootstrap, Ant Design u otras librerías sin ADR.

## Alternatives
- **Tailwind + headless (Radix/shadcn)**: mayor libertad visual, pero exige construir y mantener
  un sistema de componentes propio y accesible desde cero.
- **Ant Design**: muy completo para aplicaciones de datos; menor alineación con el lenguaje visual
  y menor experiencia previa del equipo.
- **CSS propio**: máximo control, coste de accesibilidad y consistencia inasumible.

## Consequences
- Accesibilidad y comportamiento consistentes de base.
- La identidad visual de cada proyecto se define en el theme, no en estilos dispersos.
- Coste: el peso del bundle y la personalización profunda requieren disciplina de theming.

## Security Considerations
Ninguna directa. Se evita `dangerouslySetInnerHTML` en componentes; el contenido dinámico se
renderiza como texto para prevenir XSS.
