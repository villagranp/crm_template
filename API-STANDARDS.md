# API-STANDARDS.md

Normas **obligatorias** para toda API REST del proyecto. Aplicación operativa en
[`.claude/skills/api-design/SKILL.md`](.claude/skills/api-design/SKILL.md).

---

## 1. Contract first

Antes de escribir un controller se define, en la user story o el implementation plan:

1. Propósito del endpoint  2. Método HTTP  3. Ruta  4. Request (params/query/body)
5. Response y forma  6. Status codes  7. Autorización (permiso requerido)
8. Validación  9. Escenarios de error  10. Pruebas

OpenAPI se actualiza **antes o junto con** la implementación, nunca después.

---

## 2. Métodos HTTP

| Método | Uso | Idempotente | Body | Éxito típico |
|---|---|---|---|---|
| `GET` | consultar, listar, buscar | Sí | No | `200` |
| `POST` | crear, operaciones no idempotentes | No | Sí | `201` (+ `Location`) / `202` |
| `PUT` | reemplazo completo | Sí | Sí | `200` / `204` |
| `PATCH` | actualización parcial | No garantizado | Sí | `200` / `204` |
| `DELETE` | eliminar (incl. soft delete) | Sí | No | `204` |

- `GET` **nunca** modifica estado, ni siquiera "por conveniencia".
- Filtros en `GET` siempre por query parameters.
- Soft delete es detalle de implementación: el verbo público sigue siendo `DELETE`.
- Operaciones que no son CRUD se modelan como sub-recurso:
  `POST /api/v1/orders/{id}/approval` — no `POST /approveOrder`.

---

## 3. Status codes

```text
200 OK                  204 No Content           409 Conflict
201 Created             400 Bad Request          422 Unprocessable Entity
202 Accepted            401 Unauthorized         429 Too Many Requests
                        403 Forbidden            500 / 502 / 503
                        404 Not Found
```

- `400` = petición malformada o inválida sintácticamente.
- `422` = sintaxis correcta, regla de negocio/semántica violada.
- `401` = no autenticado o token inválido. `403` = autenticado sin permiso.
- **Prohibido** devolver `200` con `{"success": false}` para representar un error.

---

## 4. Naming de recursos

```text
✅ /api/v1/customers            ❌ /getCustomers
✅ /api/v1/purchase-orders      ❌ /Customer
✅ /api/v1/payment-terms        ❌ /customer_list
```

Plural, minúsculas, `kebab-case`. El verbo lo aporta el método HTTP.

## 5. Rutas estándar

```text
GET    /api/v1/customers
GET    /api/v1/customers/{id}
POST   /api/v1/customers
PUT    /api/v1/customers/{id}
PATCH  /api/v1/customers/{id}
DELETE /api/v1/customers/{id}
```

## 6. Versionado

Prefijo obligatorio `/api/v{n}/`, default `/api/v1/`.
Cambio incompatible (quitar campo, cambiar tipo, cambiar semántica, endurecer validación)
→ evaluar nueva versión y documentarlo con ADR. Agregar un campo opcional es compatible.

---

## 7. Colecciones: filtros, paginación, orden, búsqueda

```http
GET /api/v1/customers?status=ACTIVE&search=acme&page=1&pageSize=20&sortBy=createdAt&sortOrder=desc
```

- Paginación por defecto: `page` (base 1) y `pageSize` (default 20, máximo 100).
- `sortOrder` ∈ `asc|desc`. `sortBy` validado contra **whitelist** de campos ordenables.
- `search` documenta explícitamente qué campos abarca.
- Nunca construir SQL dinámico concatenando valores recibidos.
- Cursor pagination solo para alto volumen y mediante ADR.

Respuesta de colección:

```json
{
  "data": [],
  "pagination": { "page": 1, "pageSize": 20, "totalItems": 125, "totalPages": 7 }
}
```

Respuesta de recurso único (sin envoltorio):

```json
{ "id": "018f...", "name": "Example", "createdAt": "2026-09-22T18:30:00Z" }
```

**Field selection** (`?fields=id,name`) no se implementa salvo necesidad real; si se implementa,
requiere whitelist.

---

## 8. Formato de error

Único para toda la API:

```json
{
  "statusCode": 400,
  "code": "CUSTOMER_INVALID",
  "message": "Customer data is invalid",
  "details": [{ "field": "email", "issue": "must be a valid email" }],
  "correlationId": "01HXYZ..."
}
```

- `code` es estable y accionable por el cliente (`UPPER_SNAKE_CASE`).
- `message` es legible, **sin** datos internos.
- Prohibido exponer: stack traces, SQL, nombres de tablas, tokens, secretos, PII de terceros.
- `correlationId` siempre presente para trazabilidad.

---

## 9. DTOs

Los modelos de base de datos **no** son contrato. Por recurso:

```text
CreateCustomerDto     UpdateCustomerDto     PatchCustomerDto
CustomerQueryDto      CustomerResponseDto   CustomerListItemDto
```

Todo DTO de entrada se valida (`class-validator` + `ValidationPipe` con `whitelist: true`
y `forbidNonWhitelisted: true`).

---

## 10. Convenciones de payload

| Elemento | Regla |
|---|---|
| Claves JSON | `camelCase` (nunca `snake_case` de la DB) |
| Fechas | ISO 8601 en UTC: `2026-09-22T18:30:00Z` |
| Dinero | `{ "amount": "1500.25", "currency": "GTQ" }` — string decimal, nunca float |
| Identificadores públicos | UUID v7 / ULID; no exponer secuenciales sin evaluación |
| Enums | valores `UPPER_SNAKE_CASE` estables |
| Ausencia | `null` = ausente explícito; campo omitido = sin cambio (en `PATCH`) |
| Booleanos | `isActive`, `hasPermission`, `canEdit` |

---

## 11. Cabeceras

| Cabecera | Uso |
|---|---|
| `Authorization: Bearer <jwt>` | Autenticación |
| `X-Correlation-ID` | Se preserva si llega; si no, se genera y se devuelve |
| `Location` | En `201 Created` |
| `Idempotency-Key` | Opcional en `POST` no idempotentes críticos |

---

## 12. Seguridad del contrato

- Todo endpoint declara autenticación y permiso (`@RequirePermission('customers.read')`).
- Un endpoint público requiere `@Public()` + justificación en el código y en la documentación.
- Rate limiting activo; `429` documentado.
- Nunca aceptar campos no declarados en el DTO (mass assignment).
- La paginación tiene tope duro; no se permite `pageSize` ilimitado.

---

## 13. Compatibilidad hacia atrás

| Cambio | ¿Compatible? |
|---|---|
| Agregar campo opcional en respuesta | Sí |
| Agregar query param opcional | Sí |
| Quitar o renombrar campo | No → nueva versión |
| Cambiar tipo o formato | No → nueva versión |
| Endurecer validación | No → nueva versión |
| Cambiar status code de un caso existente | No → nueva versión |

Toda ruptura se documenta en `CHANGELOG.md` y se evalúa con ADR.
