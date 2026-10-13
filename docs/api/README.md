# API documentation

The binding rules for every endpoint are in the root `API-STANDARDS.md`.
This folder holds the contract of the concrete API of this project.

| File | Contents |
|---|---|
| `endpoints.md` | Catalogue of resources and endpoints, with permissions |
| `error-codes.md` | Project error codes and their meaning |
| `openapi.json` | Snapshot exported from the running application (generated) |

## Generating the OpenAPI snapshot

The specification is generated from the NestJS decorators, never written by
hand. With the backend running and `SWAGGER_ENABLED=true`:

```bash
curl -s http://localhost:3000/api/docs-json > docs/api/openapi.json
```

Swagger UI is disabled in production (see `backend/src/main.ts` and the edge
NGINX configuration).

## Endpoints del núcleo de gestión

Todos bajo `/api/v1`. Colecciones paginadas con `{ data, pagination }` salvo
donde se indica. Detalle de reglas y códigos de error:
[`PLAN-ADMIN`](../implementation-plans/PLAN-ADMIN.md) §3 y
[`PLAN-AUTH-LOCAL`](../implementation-plans/PLAN-AUTH-LOCAL.md) §3.

### Sistema y sesión

| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| GET | `/health` · `/ready` | público | Liveness · readiness (base de datos) |
| POST | `/auth/login` | público | Inicia sesión; fija la cookie de refresco |
| POST | `/auth/refresh` | público (cookie) | Renueva el access token y rota la cookie |
| POST | `/auth/logout` | público (cookie) | Revoca la sesión de la cookie. Siempre `204` |
| POST | `/auth/password/change` | sesión | Cambia la propia contraseña; cierra las demás sesiones |
| GET | `/me` · `/me/menu` | sesión | Perfil y permisos efectivos · menú concedido |

### Usuarios

| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| GET | `/users` | `usuarios.ver` | Lista con filtros (`status`, `roleCode`, `teamId`, `search`) |
| GET | `/users/export` | `usuarios.exportar` | CSV con los filtros activos (máx. 10 000; `X-Export-Truncated`) |
| GET | `/users/:id` | `usuarios.ver` | Detalle: roles, equipos, asignaciones directas |
| POST | `/users` | `usuarios.crear` | Alta (`INVITED`, con `AUTH_DEFAULT_PASSWORD` si está configurada) |
| PATCH | `/users/:id` | `usuarios.editar` | Datos personales. **No** cambia el estado |
| POST | `/users/:id/suspend` · `/reactivate` | `usuarios.editar` | Suspender (cierra sesiones) · reactivar |
| PUT | `/users/:id/roles` | `usuarios.editar` | Reemplaza sus roles |
| PUT | `/users/:id/permissions` | `usuarios.editar` | Excepciones de permiso (razón ≥ 10, caducidad opcional) |
| PUT | `/users/:id/menu-options` | `opciones.configurar` | Excepciones de menú |
| GET | `/users/:id/access` · `/menu` | `usuarios.ver` | Acceso efectivo con el origen de cada permiso · menú |
| POST | `/users/:id/password/reset` | `usuarios.editar` + administrador | Vuelve a la contraseña inicial con cambio obligatorio (ADR-020) |

### Roles, permisos, menú

| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| GET | `/roles` · `/roles/:id` | `roles.ver` | Lista paginada · detalle |
| POST | `/roles` · `/roles/:id/duplicate` | `roles.crear` | Alta · copia editable (también de un rol de sistema) |
| PATCH · DELETE | `/roles/:id` | `roles.editar` · `roles.eliminar` | Solo roles propios; borrar exige que no tenga usuarios |
| PUT | `/roles/:id/permissions` | `roles.editar` | Reemplaza permisos (solo roles propios) |
| PUT | `/roles/:id/menu-options` | `opciones.configurar` | Reemplaza opciones (solo roles propios) |
| GET | `/permissions` | `permisos.ver` | Catálogo completo (sin paginar) |
| GET | `/modules` | `opciones.ver` | Módulos del menú (sin paginar) |
| GET | `/menu-options` · `/menu-options/:id` | `opciones.ver` | Árbol completo, incluidas inactivas · detalle |
| GET | `/menu-options/routes` | `opciones.ver` | Rutas registradas a las que puede apuntar una opción |
| POST | `/menu-options` | `opciones.crear` | Alta; una `LINK` solo hacia una ruta registrada |
| PATCH · DELETE | `/menu-options/:id` | `opciones.editar` · `opciones.eliminar` | Las de sistema no cambian ruta ni se eliminan |
| PUT | `/menu-options/order` | `opciones.editar` | Orden y padre en bloque, sin ciclos |

### Organización y sistema

| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| GET · POST | `/teams` | `equipos.ver` · `equipos.crear` | Lista · alta |
| GET · PATCH · DELETE | `/teams/:id` | `equipos.ver` · `equipos.editar` · `equipos.eliminar` | Sin ciclos; borrar solo sin miembros ni subequipos |
| PUT | `/teams/:id/members` | `equipos.editar` | Reemplaza miembros; un equipo principal por usuario |
| GET · POST | `/catalogs` | `catalogos.ver` · `catalogos.crear` | Lista · alta |
| GET · PATCH · DELETE | `/catalogs/:id` | `catalogos.ver` · `catalogos.editar` · `catalogos.eliminar` | Borrar solo si no es de sistema y está vacío |
| POST · PATCH | `/catalogs/:id/items[/:itemId]` | `catalogos.editar` | Elementos: se desactivan, nunca se borran |
| GET | `/parameters` | `parametros.ver` | Agrupados (sin paginar) |
| PATCH | `/parameters/:key` | `parametros.editar` (+ `parametros.configurar` en `seguridad.*`) | Solo el valor, validado por tipo y rango |
| GET | `/audit-logs` · `/audit-logs/events` | `auditoria.ver` | Bitácora con filtros · nombres de evento |
| GET | `/audit-logs/export` | `auditoria.exportar` | CSV (la exportación también se audita) |
| GET | `/approvals` · `/approvals/:id` | `aprobaciones.ver` | Bandeja de solo lectura |

**Asignación de accesos (ADR-020).** Además del permiso de cada endpoint,
asignar roles o excepciones a un usuario, crear o duplicar roles, cambiar sus
permisos, opciones, alcance o activación, restablecer la contraseña de cualquier usuario, y editar, suspender o
reactivar a un administrador exigen el rol `administrador`
(`403 ADMIN_ONLY`). En el alta, un no administrador solo asigna roles sin
permisos. Ver [ADR-020](../adr/ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md).

Los endpoints de `/auth` son públicos por diseño: o no hay sesión todavía
(`login`) o la credencial es la cookie y no el access token (`refresh`,
`logout`). Cada uno lleva su razón en `@Public(...)`.

Con una contraseña inicial pendiente de cambiar, todo endpoint salvo
`/auth/password/change` responde `403 PASSWORD_CHANGE_REQUIRED`.

`/me` y `/me/menu` usan `@AuthenticatedOnly`: exigen sesión pero no un permiso,
porque el recurso es el propio usuario. Es la única excepción admitida a la
regla de que todo endpoint declara permiso, y lleva razón escrita en el código.

## Endpoints del CRM — Módulo 2 · Clientes

Contrato completo (DTO, reglas y decisiones):
[`02-clientes-cuentas.md`](../implementation-plans/crm/02-clientes-cuentas.md) §F. Todos bajo
`/api/v1`, con `@RequirePermission` en cada handler. Además del permiso, el servicio aplica la
**visibilidad** (02 H.1: alcance OWN/TEAM/COUNTRY/ORGANIZATION del usuario y herencia por un
proyecto visible) y la **política de edición** (`CustomerAccessPolicy`, DM-34): un cliente fuera del
alcance, inexistente o eliminado (sin `clientes.eliminar`) es `404` sin distinguir el caso; dentro
del alcance sin poder operar, `403`.

### Clientes (`Clientes`)

| # | Método | Ruta | Permiso | Request → respuesta | Errores propios |
|---|---|---|---|---|---|
| F1 | GET | `/customers` | `clientes.ver` | `ListCustomersQueryDto` → `PaginatedCustomersResponseDto` | `400 VALIDATION_FAILED` (`sortBy` fuera de lista blanca), `403` con `deleted=true` sin `clientes.eliminar` |
| F2 | GET | `/customers/form-options` | `clientes.ver` | → `CustomerFormOptionsDto` | — |
| F3 | GET | `/customers/sales-owner-options` | `clientes.ver` | `SalesOwnerOptionsQueryDto` → `PaginatedSalesOwnerOptionsDto` | — |
| F4 | GET | `/customers/:id` | `clientes.ver` | → `CustomerResponseDto` (con `access` y `capabilities`) | `404` |
| F5 | POST | `/customers` | `clientes.crear` | `CreateCustomerDto` → `201 CustomerResponseDto` + `Location` | `403 FIELD_NOT_EDITABLE`, `409 CUSTOMER_CODE_TAKEN` / `POSSIBLE_DUPLICATE` / `DUPLICATE_BLOCKED`, `422` de validación |
| F6 | PATCH | `/customers/:id` | `clientes.editar` (+ `clientes.administrar` para ajenos y campos reservados) | `UpdateCustomerDto` → `CustomerResponseDto` | como F5 + `403 PERMISSION_DENIED`, `404` |
| F7 | DELETE | `/customers/:id` | `clientes.eliminar` | → `204` (lógica) | `404`, `409 CUSTOMER_HAS_DEPENDENCIES` |
| F8 | POST | `/customers/:id/restore` | `clientes.eliminar` | → `CustomerResponseDto` | `404`, `409 CUSTOMER_NOT_DELETED` / `CUSTOMER_CODE_TAKEN` |

### Contactos (`Clientes · Contactos`)

| # | Método | Ruta | Permiso | Request → respuesta | Errores propios |
|---|---|---|---|---|---|
| F9 | GET | `/customers/:customerId/contacts` | `contactos.ver` | `ListContactsQueryDto` → `PaginatedContactsResponseDto` | `404`; `403` con `deleted=true` sin `contactos.eliminar` |
| F10 | GET | `/customers/:customerId/contacts/:contactId` | `contactos.ver` | → `ContactResponseDto` | `404` |
| F11 | POST | `/customers/:customerId/contacts` | `contactos.crear` | `CreateContactDto` → `201 ContactResponseDto` + `Location` | `403`, `404`, `409 CONTACT_EMAIL_TAKEN` / `POSSIBLE_DUPLICATE` / `DUPLICATE_BLOCKED`, `422 INVALID_PHONE_FORMAT` / `CONTACT_INACTIVE` |
| F12 | PATCH | `/customers/:customerId/contacts/:contactId` | `contactos.editar` | `UpdateContactDto` → `ContactResponseDto` | como F11 |
| F13 | PUT | `/customers/:customerId/primary-contact` | `contactos.editar` | `SetPrimaryContactDto` → `PrimaryContactResponseDto` | `403`, `404`, `422 CONTACT_INACTIVE` |
| F14 | DELETE | `/customers/:customerId/primary-contact` | `contactos.editar` | → `204` | `403`, `404` |
| F15 | DELETE | `/customers/:customerId/contacts/:contactId` | `contactos.eliminar` | → `204` (lógica) | `403`, `404`, `409 CONTACT_HAS_HISTORY` |
| F16 | POST | `/customers/:customerId/contacts/:contactId/restore` | `contactos.eliminar` | → `ContactResponseDto` | `403`, `404`, `409 CONTACT_NOT_DELETED` / `CONTACT_EMAIL_TAKEN` |

### Adjuntos del cliente (`Clientes · Adjuntos`, ADR-021)

| # | Método | Ruta | Permiso | Request → respuesta | Errores propios |
|---|---|---|---|---|---|
| F17 | GET | `/customers/:customerId/attachments` | `clientes.ver` | paginación → `PaginatedAttachmentsResponseDto` | `404` |
| F18 | POST | `/customers/:customerId/attachments` | `clientes.editar` (+ cliente editable) | `multipart/form-data` (`file`, `description?`) → `201 AttachmentResponseDto` + `Location` | `400`, `403`, `404`, `413 ATTACHMENT_TOO_LARGE`, `422 ATTACHMENT_TYPE_NOT_ALLOWED`, `429` |
| F19 | GET | `/customers/:customerId/attachments/:attachmentId/content` | `clientes.ver` | → flujo binario (`Content-Disposition: attachment`, `nosniff`, `no-store`) | `404` |
| F20 | DELETE | `/customers/:customerId/attachments/:attachmentId` | `clientes.editar` (+ cliente editable) | → `204` (lógica) | `403`, `404` |

### Códigos de error nuevos (02 L.7)

| Status | Código | Cuándo |
|---|---|---|
| 403 | `FIELD_NOT_EDITABLE` | `customerCode`, `salesOwnerId` o `countryId` con valor distinto sin `clientes.administrar` (`details[].field`) |
| 409 | `CUSTOMER_CODE_TAKEN` | Código de cliente ocupado en el país (o en cualquiera con `unicidad_codigo = GLOBAL`), incluidos eliminados (`details[0].isDeleted`, `customerId` solo si es visible) |
| 409 | `POSSIBLE_DUPLICATE` | Aviso de duplicado; se confirma reenviando `acknowledgedDuplicateIds` (presencia + todos los candidatos visibles). NIT repetido = `reason: TAX_ID` |
| 409 | `DUPLICATE_BLOCKED` | Regla en `BLOQUEAR` (nunca por NIT) |
| 409 | `CUSTOMER_HAS_DEPENDENCIES` | Proyectos, actividades abiertas o visitas pendientes (`details[].dependency`, `count`) |
| 409 | `CUSTOMER_NOT_DELETED` · `CONTACT_NOT_DELETED` | Restaurar algo que no está eliminado |
| 409 | `CONTACT_EMAIL_TAKEN` | Correo repetido en el cliente, incluidos eliminados |
| 409 | `CONTACT_HAS_HISTORY` | El contacto participa en visitas o actividades: se desactiva, no se elimina |
| 422 | `REQUIRED_FIELD_MISSING` | Obligatorio de `crm.campos_obligatorios` |
| 422 | `INVALID_CATALOG_VALUE` | Elemento de otro catálogo o inactivo (`details[].catalogKey`, `reason`) |
| 422 | `INVALID_COUNTRY` · `INVALID_SALES_OWNER` | País inexistente o inactivo · responsable no elegible (D-02.2) |
| 422 | `INVALID_PHONE_FORMAT` · `INVALID_TAX_ID_FORMAT` | Formato por país (DM-3) |
| 422 | `FORMULA_NOT_ALLOWED` | Razón social, nombre comercial, ciudad o dirección que empieza por `=`, `@`, tabulador o retorno de carro (D-06.11) |
| 422 | `CONTACT_INACTIVE` · `INVALID_CONTACT` · `CUSTOMER_INACTIVE` | Contacto inactivo como principal o participante · contacto de otro cliente · cliente inactivo como destino de un registro nuevo (guardas para Módulos 3 y 4) |
| 413 / 422 | `ATTACHMENT_TOO_LARGE` / `ATTACHMENT_TYPE_NOT_ALLOWED` | Adjuntos (DC-4) |

Los `422` de validación devuelven **todas** las incidencias en `details[]` (`field`, `code`,
`message`); el `code` de la respuesta es el de la primera. Ningún mensaje repite el valor recibido.

## Endpoints del CRM — Módulo 4 · Actividad comercial (actividades)

Especificación: [`04-actividad-comercial.md`](../implementation-plans/crm/04-actividad-comercial.md) §F.2, §F.3.
Etiqueta OpenAPI `commercial-activity`. Primera entrega del backend: actividades, bandeja y
opciones. Visitas, agenda, interacciones, seguimiento y adjuntos llegan en la siguiente etapa.
Todos exigen sesión (`401` sin token). Fuera del alcance o inexistente → `404` idéntico.

| Método | Ruta | Permiso | Entrada → salida | Errores |
|---|---|---|---|---|
| GET | `/activities` | `actividades.ver` | `ListActivitiesQueryDto` → `PaginatedActivitiesDto` | `400` (`sortBy` fuera de lista blanca, filtros) |
| GET | `/activities/pending` | `actividades.ver` | `ListPendingActivitiesQueryDto` (`bucket` repetible) → `PendingActivitiesResponseDto` (`data`, `pagination`, `counts`) | `400` |
| GET | `/activities/form-options` | `actividades.ver` | → `ActivityFormOptionsDto` | — |
| GET | `/activities/:id` | `actividades.ver` | → `ActivityDetailDto` (con `access` y `allowedActions`) | `400` (UUID), `404` |
| POST | `/activities` | `actividades.crear` (+ `actividades.cerrar` con `completion`; + `actividades.administrar` con `ownerId` ajeno) | `CreateActivityDto` → `201 ActivityDetailDto` + `Location` | `400`, `403`, `404` (cliente), `422` |
| PATCH | `/activities/:id` | `actividades.editar` (propia) / + `actividades.administrar` (ajena) | `UpdateActivityDto` → `ActivityDetailDto` | `403`, `404`, `409 RECORD_READ_ONLY` / `INVALID_STATUS_TRANSITION`, `422` |
| POST | `/activities/:id/completion` | `actividades.cerrar` (propia) / + `actividades.administrar` (ajena) | `ActivityCompletionDto` → `ActivityDetailDto` | `403`, `404`, `409 INVALID_STATUS_TRANSITION`, `422 RESULT_REQUIRED` / `ACTUAL_DATE_IN_FUTURE` |
| POST | `/activities/:id/cancellation` | `actividades.editar` (propia) / + `actividades.administrar` (ajena) | `ActivityCancellationDto` → `ActivityDetailDto` | `403`, `404`, `409 INVALID_STATUS_TRANSITION` |
| DELETE | `/activities/:id` | `actividades.eliminar` (en su alcance) | → `204` (lógica) | `403`, `404`, `409 RECORD_READ_ONLY` (completada) |
| GET | `/commercial-activity/owner-options` | `actividades.ver` **o** `visitas.ver` (`@RequireAnyPermission`) | `OwnerOptionsQueryDto` → `PaginatedOwnerOptionsDto` | `400`, `403` sin ninguno |

`@RequireAnyPermission` (addendum de ADR-008) se publica en OpenAPI con la extensión
`x-required-permissions-any-of: { permissions, semantics: "ANY_OF" }`.

### Códigos de error nuevos (04 F.5, parte de actividades)

| Status | Código | Cuándo |
|---|---|---|
| 409 | `RECORD_READ_ONLY` | Editar una actividad completada o cancelada; eliminar una completada |
| 409 | `INVALID_STATUS_TRANSITION` | Completar o cancelar fuera de un estado abierto; otro usuario cambió el estado o la eliminó entretanto (`details[0].reason = CONCURRENT_CHANGE`) |
| 422 | `REQUIRED_FIELD_MISSING` | Base + `crm.campos_obligatorios.activity` (todos en `details[]`) |
| 422 | `FIELD_NOT_APPLICABLE` | Campo específico que el tipo no admite (`metadata.fields`), todos en `details[]` |
| 422 | `USE_LIFECYCLE_OPERATION` | `statusId` no abierto en el alta o la edición, o junto a `completion` |
| 422 | `RESULT_REQUIRED` · `ACTUAL_DATE_IN_FUTURE` | Completar sin resultado · fecha de finalización futura |
| 422 | `UNKNOWN_REFERENCE` · `INACTIVE_REFERENCE` | Proyecto, oportunidad o usuario participante inexistente o no visible · eliminado / inactivo en un vínculo nuevo |
| 422 | `PROJECT_CUSTOMER_MISMATCH` · `OPPORTUNITY_PROJECT_MISMATCH` · `OPPORTUNITY_REQUIRES_PROJECT` | RN-04.1 |
| 422 | `OWNER_NOT_ELIGIBLE` | Responsable inactivo, fuera del alcance de `actividades.administrar` o sin `actividades.ver` |
| 422 | `INVALID_CONTACT` | Además del uso de 02: cambiar el cliente con contactos del anterior como participantes |

## Contract rules

1. Breaking a published contract requires a new URI version (`/api/v2/...`)
   and an ADR.
2. Error responses use the single shape defined in `API-STANDARDS.md`.
3. Every endpoint declares a permission or an explicit, justified `@Public()`.
