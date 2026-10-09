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

## Contract rules

1. Breaking a published contract requires a new URI version (`/api/v2/...`)
   and an ADR.
2. Error responses use the single shape defined in `API-STANDARDS.md`.
3. Every endpoint declares a permission or an explicit, justified `@Public()`.
