# Plan de implementación — Administración del sistema

- **Decisiones que lo enmarcan:** [ADR-018](../adr/ADR-018-identity-access-model.md) (modelo de acceso),
  [ADR-008](../adr/ADR-008-authorization.md) (autorización), [ADR-017](../adr/ADR-017-design-system-grupo-ag.md) (diseño)
- **Estado:** aprobado (2026-10-08)
- **Skills aplicables:** `api-design`, `authorization`, `access-management`, `backend-nestjs`,
  `database`, `prisma`, `frontend-react`, `design-system`, `security`, `testing`, `documentation`

> Infraestructura de gestión, no negocio del CRM: da forma a las tablas que la
> plantilla ya trae. No introduce entidades del dominio comercial.

---

## 1. Entendimiento

El módulo **Administración** ya existe en datos: 8 opciones de menú sembradas
(`/administracion/...`), sus permisos y 4 roles de sistema. El backend cubre
parte de usuarios y roles; **no hay ninguna pantalla**.

### Decisiones del responsable (2026-10-08)

| Pregunta | Respuesta |
|---|---|
| Alcance | Las 8 opciones del módulo en esta iteración |
| Opciones de menú | Alta completa desde la pantalla, con la ruta validada |
| Baja de usuarios | Suspender y reactivar; sin borrado |

### Qué existe y qué falta

| Área | Backend hoy | Falta |
|---|---|---|
| Usuarios | Listar, alta, editar, asignar roles / permisos / opciones, restablecer contraseña | Suspender/reactivar con cierre de sesiones, salvaguardas, exportar, pantallas |
| Roles y permisos | Listar, detalle, reemplazar permisos y opciones | Crear, editar, duplicar, eliminar; pantallas |
| Opciones de menú | Listar | Crear, editar, mover, activar; registro de rutas; pantallas |
| Equipos | — (solo `teamIds` en el alta de usuario) | Todo |
| Catálogos | — | Todo |
| Parámetros | — | Todo |
| Auditoría | Solo escribe la autenticación | Auditar toda mutación de administración; consulta y exportación |
| Aprobaciones | — | Ver D12 |

### Fuera de alcance

- Crear o borrar **permisos**: el catálogo es de datos y llega por migración (ADR-008).
- Crear **módulos** del menú: cada módulo llega con su funcionalidad.
- Importación masiva de usuarios.

---

## 2. Decisiones que requieren aprobación

Se proponen valores; si no se objetan, se implementan tal cual.

| # | Decisión | Propuesta | Razón |
|---|---|---|---|
| D1 | Roles de sistema (`isSystem`) | Nombre, permisos y opciones **de solo lectura** en la interfaz. Botón "Duplicar" para crear una variante editable | La semilla repone sus asignaciones en cada ejecución (`docs/database/data-model.md`): un cambio desde la UI se perdería en el siguiente despliegue sin avisar |
| D2 | Roles propios | Crear, editar, duplicar y eliminar (borrado lógico). Eliminar con usuarios asignados → `409` | Un rol borrado con usuarios dejaría accesos sin explicación |
| D3 | Salvaguardas de acceso | Nadie se suspende a sí mismo ni se quita su propio rol de administrador. Siempre queda **al menos un administrador activo** (`409 LAST_ADMIN`) | Sin esto, un error de un clic deja el sistema sin nadie que pueda administrarlo |
| D4 | Suspender | `SUSPENDED` revoca todas sus sesiones al instante. Reactivar → `ACTIVE` (o `INVITED` si nunca fijó contraseña) | Hoy cambiar el estado no cierra sesiones: el refresh seguiría funcionando |
| D5 | Asignaciones directas | Razón obligatoria (≥ 10) y caducidad opcional, como dicta ADR-018 §4. La interfaz muestra de dónde viene cada permiso efectivo (rol, concesión, denegación) | Una excepción sin motivo es deuda de seguridad |
| D6 | Alta de opciones de menú | Una opción `LINK` solo puede apuntar a una **ruta registrada**. El registro es `backend/src/modules/access/app-routes.registry.json` (dentro del backend porque la imagen de producción solo empaqueta `backend/`); el backend lo usa para validar y una prueba del frontend falla si el router y el registro divergen. `GROUP` no lleva ruta | Una opción hacia una ruta sin pantalla lleva a un 404. Es la validación que pediste, sin dependencias nuevas |
| D7 | Opciones de sistema | `key` inmutable; las de sistema no se eliminan ni cambian de ruta. Eliminar = borrado lógico, solo sin hijas | Las rutas de sistema las usa el propio código |
| D8 | Equipos | Jerarquía con prevención de ciclos, responsable y miembros (uno principal por usuario). Eliminar = borrado lógico, solo sin miembros ni subequipos | El alcance `TEAM` incluye descendientes: un ciclo rompería el cálculo |
| D9 | Catálogos | Crear y editar catálogos y elementos; los elementos se **desactivan**, no se borran. Un catálogo solo se elimina si no es de sistema y está vacío | No hay forma genérica de saber si un elemento está en uso: desactivar es lo seguro |
| D10 | Parámetros | Solo editar el valor, validado según su tipo. No se crean ni se borran desde la UI. `parametros.configurar` se exige para los del grupo `seguridad` | Un parámetro existe porque el código lo lee; uno creado a mano no lo leería nadie. Los de seguridad (bloqueo) merecen un permiso más fuerte |
| D11 | Auditoría | **Toda** mutación de administración escribe en `audit_logs` con la diferencia `{campo: {antes, después}}`. Pantalla de consulta con filtros (evento, actor, recurso, fechas) y exportación CSV | Una administración de accesos sin rastro no es auditable |
| D12 | Aprobaciones | Bandeja **de solo lectura** con solicitudes y su historial. Resolver (aprobar/rechazar) llega con el primer flujo de negocio que cree solicitudes | Hoy nada crea solicitudes, y qué ocurre al aprobar es una regla de negocio que no está escrita (CLAUDE.md §11) |
| D13 | Exportación | CSV de usuarios (`usuarios.exportar`) y de auditoría (`auditoria.exportar`), generado en el servidor, con los filtros activos y máximo 10 000 filas | Exportar es un permiso propio porque extrae datos personales en bloque |
| D14 | Tablas | `Table` de MUI con paginación, orden y filtros en el servidor. Sin librería nueva | MUI X DataGrid requeriría ADR y no aporta lo bastante para estas pantallas |

---

## 3. Contrato de API

Todos bajo `/api/v1`, con el formato de error de `API-STANDARDS.md`. Las listas
son paginadas (`page`, `pageSize` ≤ 100) y aceptan `search` y `sort`.

### Usuarios

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| GET | `/users` | `usuarios.ver` | Existe |
| GET | `/users/{id}` | `usuarios.ver` | **Nuevo**: detalle con roles, equipos y asignaciones directas |
| POST | `/users` | `usuarios.crear` | Existe |
| PATCH | `/users/{id}` | `usuarios.editar` | Existe; **el estado sale de aquí** |
| POST | `/users/{id}/suspend` | `usuarios.editar` | **Nuevo** (D3, D4) |
| POST | `/users/{id}/reactivate` | `usuarios.editar` | **Nuevo** (D4) |
| PUT | `/users/{id}/roles` · `/permissions` · `/menu-options` | existentes | Añaden auditoría (D11) y salvaguardas (D3) |
| GET | `/users/{id}/access` · `/menu` | `usuarios.ver` | Existen; `access` añade el origen de cada permiso (D5) |
| POST | `/users/{id}/password/reset` | `usuarios.editar` | Existe |
| GET | `/users/export` | `usuarios.exportar` | **Nuevo**, `text/csv` (D13) |

### Roles y permisos

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/roles`, `/roles/{id}` | `roles.ver` (existen) |
| POST | `/roles` | `roles.crear` |
| POST | `/roles/{id}/duplicate` | `roles.crear` |
| PATCH | `/roles/{id}` | `roles.editar` (`409` si es de sistema) |
| DELETE | `/roles/{id}` | `roles.eliminar` (`409` si es de sistema o tiene usuarios) |
| PUT | `/roles/{id}/permissions` | `roles.editar` (existe; `409` si es de sistema) |
| PUT | `/roles/{id}/menu-options` | `opciones.configurar` (existe; `409` si es de sistema) |
| GET | `/permissions` | `permisos.ver` (existe) |

### Opciones de menú y módulos

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/menu-options` | `opciones.ver` (existe; añade inactivas) |
| GET | `/menu-options/routes` | `opciones.ver` — rutas registradas disponibles (D6) |
| GET | `/modules` | `opciones.ver` |
| POST | `/menu-options` | `opciones.crear` |
| PATCH | `/menu-options/{id}` | `opciones.editar` |
| PUT | `/menu-options/order` | `opciones.editar` — orden y padre en bloque |
| DELETE | `/menu-options/{id}` | `opciones.eliminar` |

### Equipos, catálogos, parámetros, auditoría, aprobaciones

| Método | Ruta | Permiso |
|---|---|---|
| GET / POST | `/teams` | `equipos.ver` / `equipos.crear` |
| GET / PATCH / DELETE | `/teams/{id}` | `equipos.ver` / `equipos.editar` / `equipos.eliminar` |
| PUT | `/teams/{id}/members` | `equipos.editar` |
| GET / POST | `/catalogs` | `catalogos.ver` / `catalogos.crear` |
| GET / PATCH / DELETE | `/catalogs/{id}` | `catalogos.ver` / `catalogos.editar` / `catalogos.eliminar` |
| POST / PATCH | `/catalogs/{id}/items`, `/catalogs/{id}/items/{itemId}` | `catalogos.editar` |
| GET | `/parameters` | `parametros.ver` |
| PATCH | `/parameters/{key}` | `parametros.editar` (+ `parametros.configurar` en `seguridad.*`) |
| GET | `/audit-logs` | `auditoria.ver` |
| GET | `/audit-logs/export` | `auditoria.exportar` |
| GET | `/approvals`, `/approvals/{id}` | `aprobaciones.ver` |

### Códigos de error nuevos

`SYSTEM_RESOURCE_READ_ONLY` (409), `ROLE_IN_USE` (409), `LAST_ADMIN` (409),
`SELF_LOCKOUT` (409), `ROUTE_NOT_REGISTERED` (422), `MENU_CYCLE` / `TEAM_CYCLE` (422),
`HAS_CHILDREN` (409), `CATALOG_NOT_EMPTY` (409), `INVALID_PARAMETER_VALUE` (422).

---

## 4. Modelo de datos

Ninguna tabla nueva. Se usan las de la plantilla. Si algún índice para los
filtros de auditoría o de usuarios hace falta, va en una migración aditiva.

## 5. Autorización

Ningún permiso nuevo: todos existen en el catálogo sembrado. Cada endpoint
declara el suyo; el frontend protege cada ruta con el mismo permiso que la
opción de menú (ADR-018) y oculta las acciones que el usuario no tiene, pero
**la decisión es siempre del backend**.

## 6. Frontend

- Rutas bajo `/administracion/*`, hijas del shell, cada una protegida con el
  permiso de su opción.
- Componentes compartidos en `features/admin/common`: tabla paginada con
  filtros en la URL, diálogo de confirmación, selector de asignaciones con
  razón y caducidad, vista de diferencias para auditoría.
- Estado de servidor con TanStack Query; formularios con React Hook Form + Zod.
- Mobile-first según el sistema de diseño: en pantallas estrechas las tablas
  pasan a lista de tarjetas.

## 7. Plan de pruebas

- **Unitarias (backend):** salvaguardas D3, ciclos D8, validación de rutas D6 y
  de parámetros D10, cálculo de diferencias D11.
- **Integración (PostgreSQL):** por endpoint, éxito + `401` + `403` + validación +
  conflicto; que cada mutación deje su registro de auditoría; que suspender
  cierre las sesiones.
- **Frontend:** formularios, mapeo de errores, ocultación de acciones sin permiso.
- **E2E:** un recorrido por área crítica: crear rol propio → asignarlo a un
  usuario nuevo → ese usuario ve solo su menú; suspender → no puede entrar.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Alcance amplio (8 áreas) | Pasos independientes, cada uno en verde y revisable; se puede pausar entre áreas |
| El registro de rutas se desincroniza del router | Prueba del frontend que compara ambos y falla el CI |
| Exportaciones con datos personales | Permiso propio, límite de filas y registro en auditoría de cada exportación |

## 9. Pasos

1. ✅ Base común: servicio de auditoría con diferencias (D11), registro de rutas (D6), andamiaje del frontend
2. ✅ Usuarios: backend pendiente (D3, D4, D5, D13) y pantallas
3. ✅ Roles y permisos (D1, D2)
4. ✅ Opciones de menú (D6, D7)
5. ✅ Equipos (D8)
6. ✅ Catálogos (D9)
7. ✅ Parámetros (D10)
8. ✅ Auditoría: consulta y exportación (D11, D13)
9. ✅ Aprobaciones: bandeja de solo lectura (D12)
10. E2E y documentación (`docs/api/README.md`, `access-management`, CHANGELOG)

## 10. Desviaciones de la implementación

Decididas al implementar; ninguna cambia una decisión aprobada.

| Tema | Qué se hizo | Por qué |
|---|---|---|
| Estado del usuario | `PATCH /users/{id}` ya no acepta `status`; solo `suspend`/`reactivate` | Un único camino aplica siempre D3 y D4 |
| Códigos nuevos | `INVALID_STATUS_TRANSITION` (409), `UNKNOWN_REFERENCE` (422), `INVALID_MENU_STRUCTURE` (422) | Un id inexistente daba 500 por la clave foránea; estructuras inválidas necesitaban un código propio |
| Opciones de sistema | Además de la ruta, tampoco cambian tipo, permiso, padre ni visibilidad pública | La semilla las repone; la UI avisa de que etiqueta y orden también se reponen |
| Exportación sobre el tope | Se corta en 10 000 filas con `X-Export-Truncated: true` | Mismo comportamiento en usuarios y auditoría |
| Listas sin paginar | `/permissions`, `/modules`, `/menu-options`, `/parameters` | Catálogos pequeños que la pantalla dibuja enteros |
| Códigos inmutables | `teams.code` y `catalog_items.code` | Pueden usarse como referencia estable desde otros módulos |
| Reordenar elementos de catálogo | Dos `PATCH` sucesivos, no atómicos | No había endpoint de orden en bloque en el contrato |
| Índices | Solo `audit_logs(occurred_at)` | Índices parciales y de prefijo no se expresan en Prisma: `migrate dev` los borraría como deriva. El equipo principal único lo garantiza un bloqueo de fila |
| Registro de rutas | Vive en `backend/src/modules/access/` | La imagen de producción solo empaqueta `backend/` |
| Escalada de privilegios | Asignar accesos es exclusivo del administrador ([ADR-020](../adr/ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md)) | Hallazgo bloqueante de la revisión; decisión del responsable |
| D3 ampliada | `SELF_LOCKOUT`/`LAST_ADMIN` evalúan los permisos efectivos (también con DENY) y se comprueban bajo bloqueo consultivo | Una denegación directa saltaba la salvaguarda; dos cambios simultáneos podían dejar el sistema sin administrador |
| Alta con equipos | `teamIds` exige `equipos.editar` y equipos válidos | Con solo `usuarios.crear` se podía añadir gente a cualquier equipo |
| Auditoría fuera de la transacción | La fila de auditoría se escribe tras la mutación, en otra sentencia | Aceptado: si falla, la petición da 500 con el cambio aplicado y queda en el log con su correlation ID. Pendiente: pasar la transacción (unidad de trabajo) |

