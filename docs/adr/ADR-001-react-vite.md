# ADR-001 - React + TypeScript + Vite

## Status
Accepted — 2026-09-22

## Context
El template necesita un stack de frontend con tipado estricto, ecosistema amplio, buen soporte
para desarrollo asistido por IA y arranque rápido en desarrollo. El equipo trabaja con SPAs
empresariales desacopladas del backend.

## Decision
React con TypeScript, empaquetado con Vite. Routing con React Router, estado de servidor con
TanStack Query, estado de cliente con Zustand solo cuando se justifique, formularios con
React Hook Form + Zod.

**Versión fijada: React 18.3.** Es la línea que Material UI v6 (ADR-009) declara soportada de
forma estable; React 19 se adopta cuando MUI lo soporte sin advertencias de compatibilidad.
El código del template no usa API removidas ni patrones legacy, por lo que la migración a
React 19 es un cambio de dependencia, no de arquitectura.

## Alternatives
- **Next.js**: aporta SSR y rutas de servidor que este template no necesita, e introduce un
  backend paralelo al de NestJS, contradiciendo el desacoplamiento buscado.
- **Angular**: alineado con entornos Microsoft y opinado, pero con menor disponibilidad de
  patrones para desarrollo asistido por IA en el equipo y mayor costo de entrada.
- **Vue + Vite**: técnicamente válido; se descarta por menor base de conocimiento interno.

## Consequences
- Arranque y HMR rápidos; build de producción estático servible por NGINX.
- Sin SSR: el SEO no es un objetivo de estas aplicaciones internas.
- Obliga a mantener la disciplina de que las reglas de negocio vivan en el backend.
- Quedar una versión mayor por detrás de React es deliberado: la alternativa era arrastrar
  advertencias de compatibilidad de la librería de UI en cada proyecto derivado.

## Security Considerations
Todo lo que entra al bundle es público: solo variables `VITE_*` con valores no sensibles.
La validación del frontend es de UX; la autoritativa es del backend.
