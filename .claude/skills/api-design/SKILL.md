---
name: api-design
description: Define el contrato completo de un endpoint antes de implementarlo (método, ruta, request, response, status codes, autorización, errores, OpenAPI). Obligatorio al crear o modificar cualquier endpoint.
---

# API Design

## Purpose

Que toda la API sea predecible, consistente y compatible hacia atrás, y que ningún endpoint
exista sin contrato.

## When to use

**Obligatorio** siempre que se cree, modifique o elimine un endpoint, o cambie un payload.

## Required context

`API-STANDARDS.md` (norma completa), user story, OpenAPI actual, endpoints del mismo recurso.

## Inputs

Caso de uso, datos de entrada y salida, reglas de negocio, permiso requerido.

## Standards

### Métodos

| Método | Uso | Éxito |
|---|---|---|
| `GET` | consultar/listar/buscar — nunca modifica estado | `200` |
| `POST` | crear / operación no idempotente | `201` + `Location`, o `202` |
| `PUT` | reemplazo completo, idempotente | `200`/`204` |
| `PATCH` | actualización parcial | `200`/`204` |
| `DELETE` | eliminar (incl. soft delete) | `204` |

### Status codes

`200 201 202 204` · `400 401 403 404 409 422 429` · `500 502 503`.
`400` sintáctico, `422` semántico, `401` no autenticado, `403` sin permiso.
**Prohibido** `200` con `{"success": false}`.

### Rutas

`/api/v1/<recurso-plural-kebab-case>`; el verbo lo da el método. Operaciones no CRUD como
sub-recurso: `POST /api/v1/orders/{id}/approval`.

### Colecciones

`?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc&search=&<filtros>`; `pageSize` máximo 100;
`sortBy` contra whitelist. Respuesta `{ "data": [], "pagination": {...} }`.
Recurso único: objeto plano sin envoltorio.

### Errores

```json
{ "statusCode": 400, "code": "CUSTOMER_INVALID", "message": "...", "details": [], "correlationId": "..." }
```

### Payload

`camelCase`; fechas ISO-8601 UTC; dinero `{ "amount": "1500.25", "currency": "GTQ" }`;
IDs públicos UUID/ULID; enums `UPPER_SNAKE_CASE`.

## Process

1. Escribe el contrato **antes** de tocar el controller:
   propósito → método → ruta → request → response → status codes → autorización → validación →
   escenarios de error → pruebas.
2. Revisa si el recurso ya existe: mantén coherencia con sus endpoints hermanos.
3. Define DTOs: `Create*Dto`, `Update*Dto`, `*QueryDto`, `*ResponseDto`. Nunca expongas el modelo de DB.
4. Declara el permiso: `@RequirePermission('<recurso>.<acción>')`.
5. Define validación por campo: tipo, obligatoriedad, longitud, formato, rango, whitelist.
6. Enumera todos los errores posibles con su `code` estable.
7. Documenta en Swagger: `@ApiOperation`, `@ApiResponse` por status, ejemplos.
8. Evalúa compatibilidad: si el cambio rompe, plantea versión nueva y ADR.

## Required checks

- [ ] Método semánticamente correcto (`GET` no modifica nada)
- [ ] Ruta plural, kebab-case, versionada
- [ ] Status codes correctos, incluido el caso de error
- [ ] DTOs propios, validados, sin campos extra permitidos
- [ ] Permiso declarado; si es público, justificado
- [ ] Paginación con tope y `sortBy` por whitelist
- [ ] Formato de error estándar con `correlationId`
- [ ] `camelCase`, fechas UTC, dinero como string + moneda
- [ ] OpenAPI actualizado con ejemplos
- [ ] Compatibilidad hacia atrás evaluada
- [ ] Pruebas: happy path, validación, 401, 403, 404, conflicto

## Expected output

Contrato escrito en la user story o el implementation plan, decoradores Swagger completos y
OpenAPI regenerado.

## Anti-patterns

- `GET /api/v1/deleteCustomer/{id}`
- `POST /api/v1/customers/search` cuando `GET` con query params basta
- Devolver la entidad Prisma tal cual
- `200 OK` con error dentro del body
- Paginación sin límite máximo
- Mensajes de error que exponen SQL, rutas o nombres de tablas
- Cambiar el tipo de un campo existente "porque es menor"

## Definition of Done

El endpoint cumple `API-STANDARDS.md`, está documentado en OpenAPI y probado en sus caminos
de éxito, validación, autenticación, autorización y error.

## Related Skills

`backend-nestjs`, `authorization`, `security`, `testing`, `documentation`, `adr`
