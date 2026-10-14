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
| PATCH | `/parameters/:key` | `parametros.editar` (+ `parametros.configurar` en `seguridad.*` y estructurales) | Solo el valor, validado por tipo, rango y registro de reglas. `crm.forecast.unidad_tonelaje` exige una unidad activa de masa con regla identidad `GLOBAL` activa (RN-07.33): si no, `422 INVALID_PARAMETER_VALUE` con `details[].reason` |
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

## Endpoints del CRM — Módulo 3 · Proyectos (E2a)

Contrato completo: [`03-proyectos.md`](../implementation-plans/crm/03-proyectos.md) §F.1, §F.4 y
"Precisiones de implementación" (E2a). Todos bajo `/api/v1`, con `@RequirePermission` en cada
handler. El servicio aplica la **visibilidad** de `proyectos.ver` (`owner_id` o `country_id` dentro
del alcance) y la **política** de `project-access-policy.ts` con el alcance de cada permiso
(`proyectos.administrar`, `proyectos.eliminar`…): fuera del alcance, inexistente o eliminado →
`404` idéntico; dentro sin poder operar → `403`. Todos responden además `401 UNAUTHENTICATED`,
`403 PERMISSION_DENIED` (el del guard, con `details: []`) y `429`. Un id de ruta que no es UUID →
`400 BAD_REQUEST`; un cuerpo o consulta que no cumple el DTO → `400 VALIDATION_FAILED`. Decimales
como cadena; fechas de calendario `YYYY-MM-DD`. Filtros de ids repetibles por comas.

### Proyectos (`Proyectos`, `Proyectos · Opciones`)

| Método | Ruta | Permiso | Request → respuesta | Errores propios |
|---|---|---|---|---|
| GET | `/projects` | `proyectos.ver` | `ProjectQueryDto` → `PaginatedProjectsDto` (`ProjectListItemDto` con `commercialStatus` y `capabilities`) | `422 INVALID_DATE_RANGE` |
| GET | `/projects/team-view` | `proyectos.ver` | `TeamViewQueryDto` → `PaginatedTeamProjectsDto` | `422 INVALID_DATE_RANGE` |
| GET | `/projects/form-options` | `proyectos.ver` | → `ProjectFormOptionsDto` | — |
| GET | `/projects/owner-options` | `proyectos.ver` | `OwnerOptionsQueryDto` (`purpose=ASSIGN\|FILTER`) → `PaginatedOwnerOptionsDto` | — |
| GET | `/projects/team-options` | `proyectos.ver` | → `TeamOptionsDto` | — |
| POST | `/projects` | `proyectos.crear` | `CreateProjectDto` → `201 ProjectDetailDto` + `Location` | `403 FIELD_NOT_EDITABLE`, `404` (cliente), `409 PROJECT_CODE_TAKEN`, `422 CUSTOMER_INACTIVE` / `REQUIRED_FIELD_MISSING` / `INVALID_DATE_RANGE` / `INVALID_OWNER` / `UNKNOWN_REFERENCE` |
| GET | `/projects/:id` | `proyectos.ver` | → `ProjectDetailDto` | `404` |
| PATCH | `/projects/:id` | `proyectos.editar` (+ `administrar` para ajenos, `ownerId`, `code`) | `UpdateProjectDto` → `ProjectDetailDto` | `403 PERMISSION_DENIED` / `FIELD_NOT_EDITABLE`, `404`, `409 PROJECT_CODE_TAKEN` / `PROJECT_CUSTOMER_LOCKED`, `422` como POST |
| DELETE | `/projects/:id` | `proyectos.eliminar` | → `204` (lógica) | `403`, `404`, `409 PROJECT_HAS_ACTIVE_CHILDREN` |
| POST | `/projects/:id/duplicate` | `proyectos.crear` + origen visible | `DuplicateProjectDto` → `201 ProjectDetailDto` + `Location` | `403 FIELD_NOT_EDITABLE`, `404`, `409`, `422` como POST |
| GET | `/projects/:id/history` | `proyectos.ver` | `ProjectHistoryQueryDto` (`kind`) → `PaginatedProjectHistoryDto` | `404` |

### Fase, clasificación y productos asociados

| Método | Ruta | Permiso | Request → respuesta | Errores propios |
|---|---|---|---|---|
| GET | `/projects/:id/phase-history` | `proyectos.ver` | paginación → `PaginatedPhaseHistoryDto` | `404` |
| POST | `/projects/:id/phase-changes` | `proyectos.editar` / `administrar` | `CreatePhaseChangeDto` → `201 ProjectPhaseDto` | `403`, `404`, `422 INVALID_PROGRESS` / `PHASE_PROGRESS_RULE` / `PHASE_UNCHANGED` / `INVALID_CATALOG_VALUE` |
| PUT | `/projects/:id/classification` | `proyectos.editar` / `administrar` | `UpdateClassificationDto` → `ProjectClassificationDto` | `403`, `404`, `422 REQUIRED_FIELD_MISSING` / `INVALID_QUANTITY` / `INVALID_CATALOG_VALUE` / `UNKNOWN_REFERENCE` / `CONVERSION_RULE_NOT_FOUND` / `INVALID_CONVERSION_RULE` |
| GET | `/projects/:id/products` | `proyectos.ver` | paginación → `ProjectProductsDto` (`{ data, pagination, totals }`) | `404` |
| POST | `/projects/:id/products` | `proyectos.editar` / `administrar` | `CreateProjectProductDto` → `201 ProjectProductDto` + `Location` | `403`, `404`, `409 PROJECT_PRODUCT_DUPLICATE`, `422 PRODUCT_INACTIVE` / `OPPORTUNITY_NOT_IN_PROJECT` / `INVALID_QUANTITY` / `INVALID_CATALOG_VALUE` / `UNKNOWN_REFERENCE` |
| PATCH | `/projects/:id/products/:projectProductId` | `proyectos.editar` / `administrar` | `UpdateProjectProductDto` → `ProjectProductDto` | como POST |
| DELETE | `/projects/:id/products/:projectProductId` | `proyectos.editar` / `administrar` | → `204` (lógica) | `403`, `404`, `409 PRODUCT_HAS_FORECAST` |

### Adjuntos del proyecto (`Proyectos · Adjuntos`, ADR-021)

| Método | Ruta | Permiso | Request → respuesta | Errores propios |
|---|---|---|---|---|
| GET | `/projects/:id/attachments` | `proyectos.ver` | paginación → `PaginatedAttachmentsResponseDto` | `404` |
| POST | `/projects/:id/attachments` | `proyectos.editar` (+ proyecto editable, decidido antes de leer el cuerpo) | `multipart/form-data` (`file`, `description?`) → `201 AttachmentResponseDto` + `Location` | `400`, `403`, `404`, `413 ATTACHMENT_TOO_LARGE`, `422 ATTACHMENT_TYPE_NOT_ALLOWED` |
| GET | `/projects/:id/attachments/:attachmentId/content` | `proyectos.ver` | → flujo binario (`attachment`, `nosniff`, `no-store`) | `404` |
| DELETE | `/projects/:id/attachments/:attachmentId` | `proyectos.editar` (+ proyecto editable) | → `204` (lógica) | `403`, `404` |

### Maestro de productos y conversión (`Proyectos · Productos y unidades`, solo lectura)

| Método | Ruta | Permiso | Request → respuesta |
|---|---|---|---|
| GET | `/products` | `productos.ver` | `ProductsQueryDto` (`search`, `familyId`, `isActive` = `true`) → `PaginatedProductsDto` |
| GET | `/product-families` | `productos.ver` | → `ProductFamiliesDto` (activas) |
| GET | `/units-of-measure` | `proyectos.ver` | → `UnitsOfMeasureDto` (activas) |
| GET | `/unit-conversions/resolve` | `proyectos.ver` | `fromUnitId`, `productId?`, `projectTypeId?` → `ConversionPreviewDto` (`rule` o `null`) |

### Códigos de error nuevos (03 §L.6, E2a)

| Status | Código | `details[]` |
|---|---|---|
| 409 | `PROJECT_CODE_TAKEN` | `{ field: "code", code }` |
| 409 | `PROJECT_CUSTOMER_LOCKED` | `{ field: "customerId", dependency: "visits"\|"activities", count }` |
| 409 | `PROJECT_HAS_ACTIVE_CHILDREN` | `{ dependency: "openOpportunities"\|"productsWithForecast"\|"nonCancelledVisits"\|"openActivities", count }` |
| 409 | `PROJECT_PRODUCT_DUPLICATE` | `{ field: "productId", projectProductId, productId, opportunityId }` |
| 409 | `PRODUCT_HAS_FORECAST` | `{ productId, periods: ["AAAA-MM"] }` |
| 422 | `REQUIRED_FIELD_MISSING` · `INVALID_DATE_RANGE` · `INVALID_OWNER` · `INVALID_QUANTITY` · `PRODUCT_INACTIVE` · `OPPORTUNITY_NOT_IN_PROJECT` | `{ field, code, message }` (todas las incidencias del paso) |
| 422 | `INVALID_PROGRESS` | `{ field: "progress", code, message, min, max }` |
| 422 | `PHASE_PROGRESS_RULE` | `{ field: "progress", code, message, phaseCode, minimumProgress }` |
| 422 | `PHASE_UNCHANGED` | `{ field: "phaseId", code, message }` |

Reutilizados: `FIELD_NOT_EDITABLE` (403), `UNKNOWN_REFERENCE`, `CUSTOMER_INACTIVE`,
`INVALID_CATALOG_VALUE`, `CONVERSION_RULE_NOT_FOUND`, `INVALID_CONVERSION_RULE`,
`ATTACHMENT_TOO_LARGE`, `ATTACHMENT_TYPE_NOT_ALLOWED`.

## Endpoints del CRM — Módulo 3 · Oportunidades y Forecast (E2b)

Todos autenticados; `401 UNAUTHENTICATED`, `403 PERMISSION_DENIED` sin el permiso base, `429`, y
`404 RESOURCE_NOT_FOUND` idéntico para inexistente, eliminado o fuera del alcance del permiso de
**ver** del recurso (`oportunidades.ver` / `forecast.ver`). Una oportunidad es visible si su asesor
o su proyecto (asesor o país) están en el alcance (DM-13). Decimales como cadena; fechas
`YYYY-MM-DD`. Spec: `03-proyectos.md` F.2, F.3 y "Precisiones" E2b.

### Oportunidades (`Oportunidades`, F-17/F-18)

| Método | Ruta | Permiso base | Respuesta | Errores propios |
|---|---|---|---|---|
| GET | `/opportunities` | `oportunidades.ver` | 200 `PaginatedOpportunitiesDto` | 400, 422 `INVALID_DATE_RANGE` |
| GET | `/opportunities/form-options[?projectId=]` | `oportunidades.ver` | 200 `OpportunityFormOptionsDto` (`currencies` solo con `projectId`) | 400, 404 |
| GET | `/opportunities/stage-summary` | `oportunidades.ver` | 200 `{ stages: [{ stage, count }] }` | 400, 422 |
| GET | `/opportunities/{id}` | `oportunidades.ver` | 200 `OpportunityDetailDto` (+ `allowedTransitions`, `capabilities`) | 404 |
| PATCH | `/opportunities/{id}` | `oportunidades.editar` (propia) / `administrar` | 200 `OpportunityMutationResponseDto` (+ `warnings?`) | 403 `FIELD_NOT_EDITABLE`, 404, 422 `CURRENCY_REQUIRED`, `REQUIRED_FIELD_MISSING`, `CURRENCY_NOT_ALLOWED`, `EXCHANGE_RATE_NOT_FOUND`, `INVALID_OWNER` |
| POST | `/opportunities/{id}/stage-changes` | `oportunidades.editar`; cerrar + `cerrar`; reabrir + `administrar` | 201 `OpportunityDetailDto` | 403, 404, 422 `INVALID_STAGE_TRANSITION`, `STAGE_UNCHANGED`, `COMMENT_REQUIRED`, `RESULT_*`, `INVALID_PROGRESS`, `INVALID_CATALOG_VALUE` |
| PUT | `/opportunities/{id}/result` | `oportunidades.cerrar` (propia) / `administrar` | 200 `OpportunityResultDto` | 403, 404, 409 `OPPORTUNITY_NOT_CLOSED`, 422 `RESULT_*`, `INVALID_PROGRESS`, `INVALID_CATALOG_VALUE` |
| GET | `/opportunities/{id}/history` | `oportunidades.ver` | 200 `{ stages[], results[] }` (más reciente primero) | 404 |
| DELETE | `/opportunities/{id}` | `oportunidades.eliminar` (en su alcance) | 204 | 404, 409 `OPPORTUNITY_CLOSED`, `OPPORTUNITY_HAS_DEPENDENCIES` |
| GET | `/projects/{projectId}/opportunities` | `oportunidades.ver` | 200 `PaginatedOpportunitiesDto` (mismos filtros salvo `projectId`; `?status=OPEN` para el Módulo 4) | 404 (proyecto) |
| POST | `/projects/{projectId}/opportunities` | `oportunidades.crear` + proyecto propio o `administrar` | 201 `OpportunityMutationResponseDto` + `Location` | 403 `PERMISSION_DENIED`/`FIELD_NOT_EDITABLE`, 404, 422 `INVALID_INITIAL_STAGE`, `INVALID_CATALOG_VALUE`, estimación, `INVALID_OWNER` |

Filtros de `GET /opportunities`: `search` (código o nombre de proyecto), `projectId`, `customerId`,
`stageId`, `ownerId` (repetibles por comas), `status=OPEN|CLOSED`, `outcome=WON,PARTIAL,LOST`,
`decisionFrom`/`decisionTo`, `dateField ∈ opportunityDate|nextActionDate|updatedAt` + `dateFrom`/`dateTo`;
`sortBy ∈ code|opportunityDate|stageOrder|nextActionDate|updatedAt|estimatedAmountUsd` (defecto
`updatedAt desc`, nulos al final). Aviso no bloqueante en `warnings[]` de POST/PATCH:
`EXCHANGE_RATE_STALE` con `details` objeto `{ currencyCode, exchangeRateDate, referenceDate, ageDays, thresholdDays }`.

### Forecast M+6 (`Forecast`, F-20)

| Método | Ruta | Permiso base | Respuesta | Errores propios |
|---|---|---|---|---|
| GET | `/forecast/window` | `forecast.ver` | 200 `{ timeZone, current, periods: [{ offset, year, month, label }] }` | — |
| GET | `/forecast/rows` | `forecast.ver` | 200 `Paginated<ForecastRowDto>` | 400, 422 `FORECAST_PERIOD_OUT_OF_WINDOW`, `INVALID_DATE_RANGE` |
| GET | `/forecast/totals` | `forecast.ver` | 200 `ForecastTotalsDto` (todas las líneas filtradas) | 400, 422 |
| PUT | `/forecast/lines` | `forecast.editar` (proyecto propio) / `forecast.administrar` | 200 `ForecastSaveResultDto { created, updated, unchanged, lines }` | 400 (> 500 líneas), 403 `PERMISSION_DENIED`/`FIELD_NOT_EDITABLE`, 404, 409 `FORECAST_LINE_STALE`, 422 `INVALID_QUANTITY`, `FORECAST_PERIOD_OUT_OF_WINDOW`, `FORECAST_DUPLICATE_IN_BATCH`, `PRODUCT_NOT_ASSOCIATED`, `INVALID_OWNER`, `UNKNOWN_REFERENCE` |

Consulta: `mode=WINDOW|HISTORY`, `projectId`, `productId`, `ownerId` (repetibles), `periods`
(`YYYY-MM`, solo `WINDOW`), `from`/`to` (solo `HISTORY`, máx. 24 meses), `search`, paginación,
`sortBy ∈ projectCode|productSku|updatedAt`.

### Códigos de error nuevos (03 §L.6, E2b)

| Status | Código | `details[]` |
|---|---|---|
| 409 | `OPPORTUNITY_NOT_CLOSED` · `OPPORTUNITY_CLOSED` | `{ stageId, stageCode }` |
| 409 | `OPPORTUNITY_HAS_DEPENDENCIES` | `{ dependency: "activeProducts"\|"openActivities", count }` (solo los > 0) |
| 409 | `FORECAST_LINE_STALE` | `{ index, lineId, updatedAt }` por cada línea en conflicto |
| 422 | `INVALID_INITIAL_STAGE` · `STAGE_UNCHANGED` | `{ field: "stageId"\|"toStageId", code, message, stageCode }` |
| 422 | `INVALID_STAGE_TRANSITION` | `{ field: "toStageId", code, message, fromStageCode, toStageCode }` |
| 422 | `COMMENT_REQUIRED` · `CURRENCY_REQUIRED` | `{ field: "comment"\|"currencyCode", code, message }` |
| 422 | `RESULT_REQUIRED` · `RESULT_NOT_ALLOWED` | `{ field: "result", code, message, stageCode }` |
| 422 | `RESULT_STAGE_MISMATCH` | `{ field: "[result.]outcome", code, message, stageCode, allowedOutcomes }` |
| 422 | `RESULT_REASON_REQUIRED` · `RESULT_PERCENT_REQUIRED` · `RESULT_PERCENT_NOT_ALLOWED` | `{ field: "[result.]reasonId"\|"[result.]awardedPercent", code, message }` |
| 422 | `FORECAST_PERIOD_OUT_OF_WINDOW` | `{ field: "lines[i].month"\|"periods[i]", code, message, index?, period }` |
| 422 | `FORECAST_DUPLICATE_IN_BATCH` | `{ field: "lines[i].month", code, message, index, duplicateOfIndex }` |
| 422 | `PRODUCT_NOT_ASSOCIATED` · `INVALID_QUANTITY` · `INVALID_OWNER` · `UNKNOWN_REFERENCE` (forecast) | `{ field: "lines[i].<campo>", code, message, index }` |

`INVALID_CATALOG_VALUE` admite `reason: "NOT_APPLICABLE"` para un motivo cuyo `appliesTo` no
incluye el resultado. `RESULT_PERCENT_NOT_ALLOWED` es nuevo respecto de §L.6 (ver "Precisiones" E2b).

**Revisión E5 (03 "Precisiones", Revisión E5):**

- Rutas de campo: el `400 VALIDATION_FAILED` de `PUT /forecast/lines` usa el mismo formato que sus
  `422` (`lines[i].campo`, p. ej. `lines[0].quantity`); antes era `lines.0.quantity`. Aplica a todo
  `400` del `ValidationPipe` con listas (API-STANDARDS §8).
- `PATCH /opportunities/{id}` puede responder `409 RESOURCE_CONFLICT` (`details[0].field =
  "estimatedAmount"`) si las entradas de la tasa (monto, moneda, fecha o país) cambian de forma
  concurrente en los 3 intentos; nada se guarda y el cliente reintenta.
- `PATCH /projects/{id}/products/{ppId}` responde `404` (no `500`) si otra petición quitó la
  asociación mientras esperaba; solo escribe las columnas que cambian y, sin cambios efectivos, no
  escribe ni audita.
- `GET /forecast/rows`: `ForecastRowDto.hasActiveAssociation` (propiedad adicional compatible). Sin
  asociación activa, ninguna celda de la fila es `editable` (guardarla daría `422
  PRODUCT_NOT_ASSOCIATED`).
- Política, estimación, rango de fechas y cambios de las escrituras de proyectos, productos
  asociados, oportunidades, etapas, resultados y forecast se deciden sobre la fila bloqueada: un
  `403`, `404` o `422 INVALID_DATE_RANGE` puede deberse a un cambio concurrente.

## CRM — Piezas transversales del Módulo 3 (sin endpoints propios)

Códigos que emiten `CurrencyConversionService` y `UnitConversionResolver` (03 "Precisiones de
implementación (2026-10-11)"). Los endpoints de Proyectos y Oportunidades que los devuelven se
documentan con el backend del módulo.

| Status | Código | Cuándo | `details[0]` |
|---|---|---|---|
| 422 | `CURRENCY_NOT_ALLOWED` | Moneda distinta de USD y de la del país del proyecto, inexistente o inactiva (RN-03.78) | `{ field, code, currencyCode, allowedCurrencyCodes[] }` |
| 422 | `EXCHANGE_RATE_NOT_FOUND` | Sin tasa de la moneda con vigencia ≤ la fecha de la oportunidad (RN-03.79) | `{ field, code, currencyCode, date }` |
| 422 | `CONVERSION_RULE_NOT_FOUND` | Sin regla activa hacia la unidad de tonelaje (RN-03.27) | `{ field, code, fromUnitId, toUnitCode }` |
| 422 | `INVALID_CONVERSION_RULE` | Una regla concreta no es aplicable (RN-03.28) | `{ field, code, ruleId, reasons[] }` |

**Aviso no bloqueante** (no es un error; viaja en `warnings[]` de una respuesta `200`/`201`):
`EXCHANGE_RATE_STALE` con `details: { currencyCode, exchangeRateDate, referenceDate, ageDays,
thresholdDays }` cuando la tasa aplicada es anterior a la fecha de referencia en más de
`crm.tipos_cambio.dias_aviso_antiguedad` días (RN-03.81).
## Endpoints del CRM — Módulo 4 · Actividad comercial

Especificación: [`04-actividad-comercial.md`](../implementation-plans/crm/04-actividad-comercial.md) §F.1–§F.5.
Etiqueta OpenAPI `commercial-activity`. Backend completo (actividades, visitas, agenda,
interacciones, seguimiento, adjuntos y opciones) y frontend.
Todos exigen sesión (`401` sin token). Fuera del alcance o inexistente → `404` idéntico
(ADR-008). Los ids de ruta usan `ParseUUIDPipe` (`400` si no son UUID).

### Actividades (F.2)

| Método | Ruta | Permiso | Entrada → salida | Errores |
|---|---|---|---|---|
| GET | `/activities` | `actividades.ver` | `ListActivitiesQueryDto` → `PaginatedActivitiesDto` | `400` (`sortBy` fuera de lista blanca, filtros) |
| GET | `/activities/pending` | `actividades.ver` | `ListPendingActivitiesQueryDto` (`bucket` repetible) → `PendingActivitiesResponseDto` (`data`, `pagination`, `counts`) | `400` |
| GET | `/activities/form-options` | `actividades.ver` | → `ActivityFormOptionsDto` (catálogos, `defaults`, `requiredFields`, `dueSoonHours` y el contexto común `timeZone`, `businessTimeZone`, `attachments`) | — |
| GET | `/activities/:id` | `actividades.ver` | → `ActivityDetailDto` (con `access` y `allowedActions`) | `400` (UUID), `404` |
| POST | `/activities` | `actividades.crear` (+ `actividades.cerrar` con `completion`; + `actividades.administrar` con `ownerId` ajeno) | `CreateActivityDto` → `201 ActivityDetailDto` + `Location` | `400`, `403`, `404` (cliente), `422` |
| PATCH | `/activities/:id` | `actividades.editar` (propia) / + `actividades.administrar` (ajena) | `UpdateActivityDto` → `ActivityDetailDto` | `403`, `404`, `409 RECORD_READ_ONLY` / `INVALID_STATUS_TRANSITION`, `422` |
| POST | `/activities/:id/completion` | `actividades.cerrar` (propia) / + `actividades.administrar` (ajena) | `ActivityCompletionDto` → `ActivityDetailDto` | `403`, `404`, `409 INVALID_STATUS_TRANSITION`, `422 RESULT_REQUIRED` / `ACTUAL_DATE_IN_FUTURE` |
| POST | `/activities/:id/cancellation` | `actividades.editar` (propia) / + `actividades.administrar` (ajena) | `ActivityCancellationDto` → `ActivityDetailDto` | `403`, `404`, `409 INVALID_STATUS_TRANSITION` |
| DELETE | `/activities/:id` | `actividades.eliminar` (en su alcance) | → `204` (lógica) | `403`, `404`, `409 RECORD_READ_ONLY` (completada) |

### Visitas (F.1)

No existe `DELETE /visits/:id` (RN-04.20): la ruta no se declara y responde `404`.

| Método | Ruta | Permiso | Entrada → salida | Errores |
|---|---|---|---|---|
| GET | `/visits` | `visitas.ver` | `ListVisitsQueryDto` (`from`, `to`, `statusId[]`, `statusGroup[]`, `ownerId[]`, `customerId`, `projectId`, `countryId`, `unregistered`, `pendingConfirmation`, `search`) → `PaginatedVisitsDto` | `400` |
| GET | `/visits/form-options` | `visitas.ver` | → `VisitFormOptionsDto` (`statuses`, `rescheduleReasons`, `cancellationReasons`, `results`, `conflictMode`, `defaultDurationMinutes`, `requiredFields`, `completionRequiredFields` y el contexto común `timeZone`, `businessTimeZone`, `attachments`) | — |
| GET | `/visits/schedule-conflicts` | `visitas.crear` **o** `visitas.editar` | `ScheduleConflictsQueryDto` (`start`, `end?`, `ownerId?`, `excludeVisitId?`) → `ScheduleConflictsResponseDto` (`mode`, `conflicts[]`) | `400`, `403` (`ownerId` ajeno sin `visitas.administrar`), `422 INVALID_DATE_RANGE` / `OWNER_NOT_ELIGIBLE` |
| GET | `/visits/:id` | `visitas.ver` | → `VisitDetailDto` (`access`, `allowedActions`, `effectiveEndAt`, `reminderAt`, `isUnregistered`, `completion`, `confirmation`) | `400`, `404` |
| GET | `/visits/:id/events` | `visitas.ver` | → `VisitEventDto[]` (cronológico, sin paginar; `canAttachFiles` = el usuario puede adjuntar al evento ahora, D-04.18) | `400`, `404` |
| POST | `/visits` | `visitas.crear` (+ `visitas.administrar` con `ownerId` ajeno) | `CreateVisitDto` → `201 VisitDetailDto` + `Location` (+ `scheduleConflicts`) | `400`, `403`, `404` (cliente), `409 SCHEDULE_CONFLICT` (solo `BLOQUEAR`), `422` |
| PATCH | `/visits/:id` | `visitas.editar` (propia) / + `visitas.administrar` (ajena) | `UpdateVisitDto` → `VisitDetailDto` | `403`, `404`, `409 RECORD_READ_ONLY` / `SCHEDULE_CONFLICT` / `INVALID_STATUS_TRANSITION`, `422 USE_RESCHEDULE` y los de planificación |
| POST | `/visits/:id/completion` | `visitas.editar` (propia) / + `visitas.administrar` (ajena) | `VisitCompletionDto` → `VisitDetailDto` | `403`, `404`, `409 INVALID_STATUS_TRANSITION`, `422 ACTUAL_DATE_IN_FUTURE` / `INVALID_DATE_RANGE` / `REQUIRED_FIELD_MISSING` |
| PUT | `/visits/:id/completion` | ídem | `VisitCompletionDto` (sustituye) → `VisitDetailDto` | ídem |
| POST | `/visits/:id/confirmation` | `visitas.cerrar` y **solo el dueño** (DM-20) | `VisitConfirmationDto` → `VisitDetailDto` | `403 PERMISSION_DENIED` / `VISIT_CONFIRMATION_OWNER_ONLY`, `404`, `409`, `422 CONFIRMATION_SUMMARY_REQUIRED` |
| POST | `/visits/:id/rescheduling` | `visitas.editar` (propia) / + `visitas.administrar` (ajena) | `VisitReschedulingDto` → `VisitDetailDto` (+ `scheduleConflicts`) | `403`, `404`, `409`, `422 RESCHEDULE_SAME_DATE` / `DATE_IN_PAST` / `REASON_REQUIRED` / `INVALID_CATALOG_VALUE` |
| POST | `/visits/:id/cancellation` | ídem | `VisitCancellationDto` → `VisitDetailDto` | `403`, `404`, `409`, `422 REASON_REQUIRED` / `INVALID_CATALOG_VALUE` |

### Modelos de lectura y opciones (F.3)

Los de "uno de varios" usan `@RequireAnyPermission` (addendum de ADR-008, se publica en
OpenAPI como `x-required-permissions-any-of: { permissions, semantics: "ANY_OF" }`); cada
fuente se filtra por **su** permiso de ver y su alcance. Agenda, historial, seguimiento y las
listas de adjuntos del módulo **no** admiten `search` (no buscan por texto): enviarlo responde
`400 VALIDATION_FAILED`.

Contexto común de los dos `form-options` (aditivo, RN-04.9, D-04.17, D.5): `timeZone` (zona del
perfil del usuario, `users.time_zone`, para los instantes), `businessTimeZone`
(`crm.zona_horaria_negocio`, para las fechas sin hora y "hoy") y `attachments`
(`{ enabled, maxMb, allowedTypes }`, el mismo esquema que `/customers/form-options`).

| Método | Ruta | Permiso | Entrada → salida | Errores |
|---|---|---|---|---|
| GET | `/agenda` | `actividades.ver` **o** `visitas.ver` | `AgendaListQueryDto` (`from`, `to`, `ownerId[]`, `countryId[]`, `kind[]`, `activityTypeId[]`, `statusGroup[]`, `statusId[]`, `customerId`, `projectId`) → `PaginatedAgendaDto` | `400` |
| GET | `/agenda/calendar` | ídem | `AgendaCalendarQueryDto` (`from` y `to` obligatorios) → `AgendaCalendarDto` (`data` ≤ 500, `truncated`) | `400 VALIDATION_FAILED` / `RANGE_TOO_WIDE` (> 42 días) |
| GET | `/interactions` | ídem | `ListInteractionsQueryDto` (`from`, `to`, `customerId`, `projectId`, `opportunityId`, `userId[]`, `sourceType[]`, `typeId[]`, `resultId[]`) → `PaginatedInteractionsDto` | `400` |
| GET | `/follow-ups` | ídem | `ListFollowUpsQueryDto` (`groupBy`, `customerId`, `projectId`, `ownerId[]`, `countryId[]`, `withoutNextAction`, `lastInteractionFrom`, `lastInteractionTo`) → `PaginatedFollowUpsDto` | `400` |
| GET | `/follow-ups/trace` | ídem | `customerId` **o** `projectId` → `FollowUpTraceDto` (`row`, `interactions` ≤ 50, `upcoming` ≤ 20, `attachments` ≤ 50 con `contentPath` relativa a la API) | `400`, `404` (sin registros visibles) |
| GET | `/commercial-activity/owner-options` | ídem | `OwnerOptionsQueryDto` (`search`, `id[]` para resolver nombres con el mismo filtro de alcance) → `PaginatedOwnerOptionsDto` | `400`, `403` sin ninguno |

### Adjuntos por dueño (F.4, DC-2, ADR-021)

Respuesta `AttachmentResponseDto` (mismo esquema que 02). Descarga siempre `attachment`,
`X-Content-Type-Options: nosniff`, `Cache-Control: no-store`. Un adjunto de otro dueño en la
ruta → `404`. Subida: `multipart/form-data` (`file` + `description?` ≤ 300); el guard del
módulo autoriza **antes** de leer el cuerpo. No hay rutas genéricas `/attachments/:id` ni
`DELETE` de adjuntos de eventos.

| Método | Ruta | Permiso | Errores |
|---|---|---|---|
| GET | `/visits/:id/attachments` · `/visits/:id/events/:eventId/attachments` · `/activities/:id/attachments` | `visitas.ver` · `visitas.ver` · `actividades.ver` | `400`, `404` |
| POST | `/visits/:id/attachments` · `/activities/:id/attachments` | `visitas.editar` · `actividades.editar` (ajena con `administrar`) | `400`, `403`, `404`, `409 RECORD_READ_ONLY` (visita confirmada/cancelada; actividad completada/cancelada), `413 ATTACHMENT_TOO_LARGE`, `422 ATTACHMENT_TYPE_NOT_ALLOWED` |
| POST | `/visits/:id/events/:eventId/attachments` | `visitas.editar` **o** `visitas.cerrar`; solo quien ejecutó el evento, 15 min (D-04.18) | `403` (`details[0].reason = NOT_EVENT_PERFORMER`), `404`, `409 RECORD_READ_ONLY` (`EVENT_ATTACHMENT_WINDOW_EXPIRED`), `413`, `422` |
| GET | `…/attachments/:attachmentId/content` (visita, evento, actividad) | permiso de ver del dueño | `400`, `404` |
| DELETE | `/visits/:id/attachments/:attachmentId` · `/activities/:id/attachments/:attachmentId` | permiso de editar del dueño | `403`, `404`, `409 RECORD_READ_ONLY` |

### Códigos de error nuevos (04 F.5)

| Status | Código | Cuándo |
|---|---|---|
| 400 | `RANGE_TOO_WIDE` | Calendario de más de 42 días (`details[0] = { field: "to", maxDays: 42 }`) |
| 403 | `VISIT_CONFIRMATION_OWNER_ONLY` | Confirmar una visita ajena, aunque se tenga `visitas.administrar` o el comodín del administrador (DM-20) |
| 409 | `RECORD_READ_ONLY` | Editar una actividad completada/cancelada o una visita no pendiente; eliminar una actividad completada; adjuntos de un dueño de solo lectura; ventana de un evento vencida |
| 409 | `INVALID_STATUS_TRANSITION` | Operación no permitida desde el estado actual; otro usuario cambió el registro entretanto (`details[0].reason = CONCURRENT_CHANGE`) |
| 409 | `SCHEDULE_CONFLICT` | Solape con otra visita del responsable con `crm.visitas.validar_conflicto_horario = BLOQUEAR` (`details[]` con los solapes, sin datos de las que el usuario no ve) |
| 422 | `REQUIRED_FIELD_MISSING` | Base + `crm.campos_obligatorios.activity` / `.visit` / `.visitCompletion` (todos en `details[]`) |
| 422 | `FIELD_NOT_APPLICABLE` | Campo específico que el tipo de actividad no admite (`metadata.fields`), todos en `details[]` |
| 422 | `USE_LIFECYCLE_OPERATION` · `USE_RESCHEDULE` | `statusId` no abierto en una actividad · fecha de inicio de una visita por `PATCH` |
| 422 | `RESULT_REQUIRED` · `ACTUAL_DATE_IN_FUTURE` | Completar sin resultado · fecha real o de finalización futura |
| 422 | `INVALID_DATE_RANGE` · `DATE_IN_PAST` · `RESCHEDULE_SAME_DATE` | Fin anterior al inicio · reprogramar al pasado · a la misma fecha |
| 422 | `REASON_REQUIRED` · `CONFIRMATION_SUMMARY_REQUIRED` | Reprogramar o cancelar sin motivo · confirmar sin resumen ni resultado/comentarios previos |
| 422 | `UNKNOWN_REFERENCE` · `INACTIVE_REFERENCE` | Proyecto, oportunidad o usuario inexistente o no visible · eliminado / inactivo en un vínculo nuevo |
| 422 | `PROJECT_CUSTOMER_MISMATCH` · `OPPORTUNITY_PROJECT_MISMATCH` · `OPPORTUNITY_REQUIRES_PROJECT` | RN-04.1 |
| 422 | `OWNER_NOT_ELIGIBLE` | Responsable inactivo, fuera del alcance de `administrar` o sin el permiso de ver del recurso |
| 422 | `INVALID_CONTACT` | Además del uso de 02: cambiar el cliente de una actividad con contactos del anterior como participantes |

### Servicios para otros módulos (F.6)

`CommercialActivityModule` exporta el token `COMMERCIAL_ACTIVITY_USAGE_QUERY`
(`CommercialActivityUsageQuery`: `countOpenByCustomer`, `countOpenByProject`,
`countByContact`, con `tx` opcional). Hoy no lo consume nadie: 03 cuenta los bloqueos de
eliminación y de cambio de cliente con su propia consulta (03 §F.4, con su regla: visitas no
canceladas y actividades abiertas) y 02 no lo usa.

### Integración con el Módulo 3 (2026-10-13)

Sin cambios de contrato. Lo que el Módulo 4 consume del 03 coincide con lo implementado:
`GET /projects?customerId=` (`ProjectListItemDto`), `GET /projects/{id}` (preselección),
`GET /projects/{projectId}/opportunities?status=OPEN` (`OpportunityListItemDto`),
`GET /opportunities/{id}` (preselección) y la ruta `/proyectos/:projectId` del frontend. Dentro
de la transacción de un alta o edición, el proyecto vinculado se bloquea con
`lockProject(id, 'UPDATE')` y `projects.last_activity_at` se escribe con
`touchLastActivity` del repositorio de proyectos (`PROJECTS_REPOSITORY`, exportado por
`ProjectsModule`): una sola escritura de `last_activity_at` en el CRM. La guarda de cliente
(`CustomerReferenceGuard.assertUsableCustomer`) recibe los alcances resueltos antes de la
transacción (`accessScopes`), como exige ahora con `tx`.

## Endpoints del CRM — Módulo 1 · Inicio / Panel de control

Contrato completo: [`01-inicio-dashboard.md`](../implementation-plans/crm/01-inicio-dashboard.md) §F
y "Precisiones de implementación (2026-10-13)". Todos `GET` bajo `/api/v1/dashboard`, solo lectura
(sin `404`, `409` ni `422`). Cifras, eventos y alertas se calculan en cada consulta con el alcance del
permiso de su fuente (00 §4.2). Las fórmulas viven en `CommercialMetricsService` (fuente única con
Reportes, RN-01.10).

| # | Ruta | Permiso | Respuesta | Errores propios |
|---|---|---|---|---|
| 1 | `/indicators/projects` | `proyectos.ver` | `ProjectIndicatorsResponseDto` (KPI-01) | — |
| 2 | `/indicators/opportunities` | `oportunidades.ver` | `OpportunityIndicatorsResponseDto` (KPI-02…04) | `400` período inválido |
| 3 | `/indicators/forecast` | `forecast.ver` | `ForecastIndicatorsResponseDto` (KPI-05) | — |
| 4 | `/indicators/visits` | `visitas.ver` | `VisitIndicatorsResponseDto` (KPI-06/07) | — |
| 5 | `/indicators/activities` | `actividades.ver` | `ActivityIndicatorsResponseDto` (KPI-08/09) | — |
| 6 | `/indicators/targets` | `metas.ver` | `TargetIndicatorsResponseDto` (KPI-10) | `400` período inválido |
| 7 | `/upcoming-visits` | `visitas.ver` | `{ data: UpcomingVisitDto[], pagination }` | `400` |
| 8 | `/recent-activity` | **uno de** `actividades.ver`, `visitas.ver`, `oportunidades.ver`, `proyectos.ver` | `{ data: RecentActivityItemDto[], pagination }` | `400` |
| 9 | `/alerts` | igual que 8 | `{ data: DashboardAlertDto[], pagination }` | `400` |
| 10 | `/alerts/summary` | igual que 8 | `AlertsSummaryResponseDto` | — |

Los endpoints 8–10 usan `@RequireAnyPermission` (addendum de ADR-008) y filtran cada fuente o tipo de
alerta por su propio permiso. Período (2 y 6): `period=MONTH|QUARTER|YEAR` (mes en curso por defecto) o
`from`/`to` (fechas de calendario, `from ≤ to`, ≤ 366 días); si no, `400 VALIDATION_FAILED` con
`details[0] = { field, issue }`. No hay códigos de error nuevos.

## Endpoints del CRM — Módulo 6 · Carga masiva de clientes

Contrato completo: [`06-integraciones.md`](../implementation-plans/crm/06-integraciones.md) §F y
"Precisiones de implementación (2026-10-13)". Todos bajo `/api/v1`, con `@RequirePermission` en
cada handler (se exigen **todos** los listados). Una carga es visible para quien la inició y, con
alcance `ORGANIZATION` de `importaciones.ver`, para todos; fuera de eso, `404` igual que
inexistente (06 H.4). Confirmar y cancelar exigen además ser el autor o tener alcance
`ORGANIZATION` de `importaciones.crear` (`403`, RN-06.19). Subir, confirmar y cancelar responden
`409 IMPORTS_DISABLED` mientras `crm.importaciones.habilitada = false` (RN-06.1).

| # | Método | Ruta | Permiso | Request → respuesta | Errores propios |
|---|---|---|---|---|---|
| 1 | GET | `/customer-imports/settings` | `importaciones.ver` | → `CustomerImportSettingsResponseDto` (habilitación, límites efectivos, columnas) | — |
| 2 | GET | `/customer-imports/template?format=CSV\|XLSX` | `importaciones.crear` | → archivo `plantilla-clientes-v1.<ext>` (`no-store`) | `400` |
| 3 | POST | `/customer-imports` | `importaciones.ver` + `importaciones.crear` + `clientes.crear` | `multipart/form-data` (`file`) → `201 CustomerImportResponseDto` (`VALIDATED`) + `Location` | `400`, `409 IMPORTS_DISABLED` / `IMPORT_IN_PROGRESS`, `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE`, `422 INVALID_IMPORT_FILE`, `429` |
| 4 | GET | `/customer-imports` | `importaciones.ver` | `CustomerImportQueryDto` → `PaginatedCustomerImportsDto` | `400` |
| 5 | GET | `/customer-imports/:id` | `importaciones.ver` | → `CustomerImportResponseDto` (con `canConfirm`, `canCancel`, `hasErrorFile`) | `400`, `404` |
| 6 | GET | `/customer-imports/:id/rows` | `importaciones.ver` | `CustomerImportRowQueryDto` → `PaginatedCustomerImportRowsDto` | `400`, `404` |
| 7 | POST | `/customer-imports/:id/confirmation` | `importaciones.crear` + `clientes.crear` | `ConfirmCustomerImportDto` → `202 CustomerImportResponseDto` (`IMPORTING`) + `Location` | `403`, `404`, `409 IMPORTS_DISABLED` / `IMPORT_IN_PROGRESS` / `INVALID_IMPORT_STATUS` / `IMPORT_CHANGED` / `IMPORT_DATA_PURGED`, `422 NO_VALID_ROWS`, `429` |
| 8 | POST | `/customer-imports/:id/cancellation` | `importaciones.crear` | → `200 CustomerImportResponseDto` (`CANCELLED`) | `403`, `404`, `409 IMPORTS_DISABLED` / `INVALID_IMPORT_STATUS` |
| 9 | GET | `/customer-imports/:id/error-file` | `importaciones.ver` | → archivo `errores-<código>.<ext>` (`no-store`; la descarga se audita) | `404` (sin filas no importadas), `409 IMPORT_DATA_PURGED`, `429` |

### Códigos de error nuevos (06 F.1)

| Status | Código | Cuándo | `details` |
|---|---|---|---|
| 409 | `IMPORTS_DISABLED` | `crm.importaciones.habilitada = false` | — |
| 409 | `IMPORT_IN_PROGRESS` | El usuario ya tiene una carga validándose o importándose (RN-06.30) | — |
| 409 | `INVALID_IMPORT_STATUS` | La carga no está `VALIDATED` (o perdió la transición condicional) | `[{ field: "status", status }]` |
| 409 | `IMPORT_CHANGED` | `expectedValidRows` no coincide con las filas válidas actuales | `[{ field: "expectedValidRows", validRows }]` |
| 409 | `IMPORT_DATA_PURGED` | Los datos de las filas se purgaron por retención (RN-06.29) | — |
| 413 | `FILE_TOO_LARGE` | Supera `crm.importaciones.max_mb` (≤ 10 MB) | `[{ field: "file", maxBytes }]` |
| 415 | `UNSUPPORTED_FILE_TYPE` | Extensión distinta de `.csv`/`.xlsx`, tipo real incoherente, `.xls`, XLSX cifrada o con macros | `[{ field: "file", allowedFormats }]` |
| 422 | `INVALID_IMPORT_FILE` | Estructura o columnas inválidas; la carga queda `FAILED` en el historial | `[{ field: "file" \| "columns" \| "rows", issue, column? }]` |
| 422 | `NO_VALID_ROWS` | Confirmar una carga sin filas válidas | — |

`issue` de `INVALID_IMPORT_FILE`: `MISSING_COLUMN`, `UNKNOWN_COLUMN`, `DUPLICATE_COLUMN`,
`TOO_MANY_COLUMNS`, `EMPTY_FILE`, `NO_DATA_ROWS`, `TOO_MANY_ROWS`, `INVALID_ENCODING`,
`MALFORMED_CSV`, `SHEET_NOT_FOUND`, `ARCHIVE_LIMITS_EXCEEDED`, `UNSAFE_CONTENT`,
`UNREADABLE_FILE`, `PARSE_TIMEOUT`.

**Incidencias de fila** (no son errores HTTP; viajan en `issues[]` de `/rows` y en el archivo de
errores, con `severity` `ERROR` o `WARNING` y mensaje en español que nunca repite el valor):
propias del archivo `MAX_LENGTH`, `INVALID_CELL_TYPE`, `FORMULA_NOT_ALLOWED`, `DUPLICATE_IN_FILE`,
`POSSIBLE_DUPLICATE_IN_FILE` (aviso), `DUPLICATE_TAX_ID` (aviso; error si se rechaza al
confirmar), `IMPORT_INTERRUPTED`, `CREATE_FAILED`; y las del Módulo 2 sin cambio de código
(`REQUIRED_FIELD_MISSING`, `INVALID_CATALOG_VALUE`, `INVALID_COUNTRY`, `INVALID_SALES_OWNER`,
`INVALID_PHONE_FORMAT`, `INVALID_TAX_ID_FORMAT`, `VALIDATION_FAILED`, `CUSTOMER_CODE_TAKEN`,
`DUPLICATE_BLOCKED`, `POSSIBLE_DUPLICATE`). `field` es la clave de la columna de la plantilla
(`legalName`, `country`, `salesOwner`…) o `row`.

## Contract rules

1. Breaking a published contract requires a new URI version (`/api/v2/...`)
   and an ADR.
2. Error responses use the single shape defined in `API-STANDARDS.md`.
3. Every endpoint declares a permission or an explicit, justified `@Public()`.
