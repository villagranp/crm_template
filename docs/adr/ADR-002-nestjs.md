# ADR-002 - NestJS como framework de backend

## Status
Accepted — 2026-09-22

## Context
Se requiere un backend en TypeScript con estructura opinada, inyección de dependencias,
soporte nativo para validación, guards, interceptores y generación de OpenAPI, que facilite
imponer controles transversales por defecto.

## Decision
NestJS 11 sobre Node.js 22 LTS, con REST y OpenAPI 3.x, `ValidationPipe` global,
filtro de excepciones global, guards globales de autenticación y permisos.

## Alternatives
- **Express puro**: máxima flexibilidad, pero cada proyecto reinventaría estructura, DI y
  controles transversales — exactamente lo que este template busca evitar.
- **Fastify puro**: mejor rendimiento bruto, misma falta de estructura.
- **.NET / Spring Boot**: sólidos en entorno empresarial, pero rompen la unificación de
  lenguaje con el frontend y el flujo de desarrollo asistido por IA en un solo stack.

## Consequences
- Estructura predecible que los agentes pueden seguir sin inventar convenciones.
- La DI permite sustituir adaptadores (auth, persistencia) sin tocar casos de uso.
- Costo: más ceremonia que Express en módulos triviales; se mitiga con módulos planos (ADR-014).

## Security Considerations
Los controles transversales (validación, guards, filtros) se aplican de forma global y
deny-by-default, reduciendo el riesgo de endpoints desprotegidos por olvido.
