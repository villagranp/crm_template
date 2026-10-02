# ADR-005 - Estándar REST y contrato de API

## Status
Accepted — 2026-09-22

## Context
Sin una norma única, cada proyecto y cada agente inventa su propio dialecto de API:
verbos en la ruta, errores con `200 OK`, paginación distinta por endpoint, modelos de base
expuestos como contrato.

## Decision
Se adopta el estándar completo de `API-STANDARDS.md`: semántica REST estricta, rutas plurales
en kebab-case versionadas bajo `/api/v1/`, status codes correctos, formato único de error con
`correlationId`, paginación `page`/`pageSize` con tope, DTOs propios y `camelCase` en JSON.
Contract first: el contrato se define antes de implementar y se documenta en OpenAPI.

## Alternatives
- **GraphQL**: potente para consumo flexible, pero cambia el modelo de autorización, caché y
  versionado, y añade complejidad no justificada para las aplicaciones objetivo.
- **RPC sobre HTTP**: simple de implementar, pierde la semántica de recursos, la cacheabilidad
  y la interoperabilidad esperada por consumidores empresariales.

## Consequences
- Predictibilidad: cualquier endpoint se comporta como los demás.
- Los clientes pueden manejar errores de forma genérica gracias al formato único.
- Coste: operaciones no CRUD requieren modelarse como sub-recursos, lo que exige diseño previo.

## Security Considerations
El formato único de error evita fugas de información interna. La paginación con tope y la
whitelist de ordenamiento previenen abuso de recursos e inyección.
