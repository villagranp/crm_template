# ADR-013 - Estrategia y herramientas de pruebas

## Status
Accepted — 2026-09-22

## Context
El prompt fundacional admitía Jest o Vitest en backend. Unificar herramienta en todo el monorepo
es atractivo, pero NestJS trae soporte y documentación de primera clase para Jest, y usar Vitest
exige configuración adicional (SWC/transformers) y soporte parcial de utilidades del ecosistema.

## Decision
- **Frontend**: Vitest + React Testing Library para unit/componente; Playwright para E2E.
- **Backend**: Jest + `@nestjs/testing` para unit e integración; Supertest para pruebas de endpoint.

Cobertura orientada a riesgo: umbral de referencia del 80 % en `application/` y `domain/`,
sin perseguir porcentajes artificiales en el resto.

## Alternatives
- **Vitest también en backend**: unifica herramienta y es más rápido, pero añade configuración
  propia y se aleja del camino soportado por NestJS. Revisable por ADR si el soporte madura.
- **Jest también en frontend**: posible, pero Vitest se integra de forma nativa con Vite y evita
  duplicar la configuración de transformación.

## Consequences
- Dos runners en el monorepo, cada uno en el camino mejor soportado por su framework.
- Comandos unificados a nivel de workspace (`pnpm test`), aunque el runner difiera.
- Coste: dos configuraciones de cobertura y de reportes en CI.

## Security Considerations
Se exigen pruebas de `401` y `403` por endpoint protegido, y pruebas de validación de entrada.
Los fixtures no contienen datos reales ni PII.
