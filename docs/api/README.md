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

## Contract rules

1. Breaking a published contract requires a new URI version (`/api/v2/...`)
   and an ADR.
2. Error responses use the single shape defined in `API-STANDARDS.md`.
3. Every endpoint declares a permission or an explicit, justified `@Public()`.
