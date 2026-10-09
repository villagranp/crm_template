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

Los trae la plantilla; los de negocio los añade cada proyecto.

| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| GET | `/api/v1/health` | público | Liveness, sin tocar dependencias |
| GET | `/api/v1/ready` | público | Readiness, verifica la base de datos |
| POST | `/api/v1/auth/login` | público | Inicia sesión; fija la cookie de refresco |
| POST | `/api/v1/auth/refresh` | público (cookie) | Renueva el access token y rota la cookie |
| POST | `/api/v1/auth/logout` | público (cookie) | Revoca la sesión de la cookie. Siempre `204` |
| POST | `/api/v1/auth/password/change` | sesión | Cambia la propia contraseña; cierra las demás sesiones |
| POST | `/api/v1/users/:id/password/reset` | `usuarios.editar` | Vuelve a la contraseña inicial con cambio obligatorio |
| GET | `/api/v1/me` | sesión | Perfil y permisos efectivos |
| GET | `/api/v1/me/menu` | sesión | Opciones de menú concedidas |
| GET | `/api/v1/users` | `usuarios.ver` | Lista paginada con filtros |
| POST | `/api/v1/users` | `usuarios.crear` | Alta (nace `INVITED`, con `AUTH_DEFAULT_PASSWORD` si está configurada) |
| PATCH | `/api/v1/users/:id` | `usuarios.editar` | Actualiza datos |
| GET | `/api/v1/users/:id/access` | `usuarios.ver` | Acceso efectivo de un usuario |
| GET | `/api/v1/users/:id/menu` | `usuarios.ver` | Menú que verá ese usuario |
| PUT | `/api/v1/users/:id/roles` | `usuarios.editar` | Reemplaza sus roles |
| PUT | `/api/v1/users/:id/permissions` | `usuarios.editar` | Reemplaza sus excepciones de permiso |
| PUT | `/api/v1/users/:id/menu-options` | `opciones.configurar` | Reemplaza sus opciones directas |
| GET | `/api/v1/roles` | `roles.ver` | Roles con permisos y opciones |
| GET | `/api/v1/roles/:id` | `roles.ver` | Detalle de un rol |
| PUT | `/api/v1/roles/:id/permissions` | `roles.editar` | Reemplaza los permisos del rol |
| PUT | `/api/v1/roles/:id/menu-options` | `opciones.configurar` | Reemplaza las opciones del rol |
| GET | `/api/v1/permissions` | `permisos.ver` | Catálogo de permisos |
| GET | `/api/v1/menu-options` | `opciones.ver` | Catálogo de opciones |

Las asignaciones se reemplazan en bloque con `PUT`: es idempotente y evita el
estado intermedio de un "quitar" y un "poner" separados.

Los endpoints de `/auth` son públicos por diseño: o no hay sesión todavía
(`login`) o la credencial es la cookie y no el access token (`refresh`,
`logout`). Cada uno lleva su razón en `@Public(...)`. Códigos de error y
detalles del flujo: [`AUTHENTICATION.md`](../../AUTHENTICATION.md) y
[`PLAN-AUTH-LOCAL`](../implementation-plans/PLAN-AUTH-LOCAL.md) §3.

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
