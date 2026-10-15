---
name: access-management
description: Da de alta o modifica usuarios, roles, permisos y opciones de menú, y sus asignaciones. Úsalo siempre que una funcionalidad necesite aparecer en el menú, exigir un permiso nuevo o cambiar quién ve qué.
---

# Gestión de accesos

## Purpose

Que una funcionalidad nueva sea alcanzable por quien debe y sólo por quien debe,
sin que el menú y la autorización se separen.

## When to use

- Una pantalla nueva debe aparecer en el menú.
- Hace falta un permiso nuevo.
- Cambia quién puede ver o hacer algo.
- Se crea o ajusta un rol.

## Required context

- [ADR-018](../../../docs/adr/ADR-018-identity-access-model.md) y [ADR-008](../../../docs/adr/ADR-008-authorization.md).
- [`docs/database/data-model.md`](../../../docs/database/data-model.md) §3 y §4.
- `backend/prisma/seed/access-catalog.ts` — catálogo declarativo.
- `backend/src/modules/access/` — servicios y contratos.

## Inputs

Historia de usuario con sus actores, y qué debe poder hacer cada uno.

## Standards

1. **Un permiso es `recurso.accion`**, en español y en minúsculas
   (`cotizaciones.aprobar`). Acciones del catálogo (`ACTIONS` en
   `access-catalog.ts`): `ver`, `crear`, `editar`, `eliminar`, `exportar`,
   `aprobar`, `configurar`, `cerrar` y `administrar`. `administrar` es operar
   sobre registros **ajenos** dentro del alcance (DM-34), no el acceso al módulo
   de Administración.
2. **Todo endpoint declara permiso.** La única excepción es `@AuthenticatedOnly`
   para autoservicio (el recurso es el propio usuario), y lleva razón escrita.
3. **Las opciones de menú son datos.** Se dan de alta en el catálogo o desde la
   pantalla de administración, nunca en un array del frontend.
4. **La opción declara el permiso que exige.** Si el usuario no lo tiene, no la
   ve, aunque se la hayan asignado.
5. **`DENY` directo gana siempre** sobre lo heredado del rol.
6. **Toda asignación directa lleva razón** y, si es temporal, `expiresAt`.
7. **Los permisos nunca salen de los claims del token.**
8. La comprobación de permisos en el frontend es sólo de experiencia de usuario.
   El backend verifica siempre.
9. **Cambiar qué acceso tiene alguien es exclusivo del administrador**
   ([ADR-020](../../../docs/adr/ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md)
   y su addendum de 2026-10-10): roles, permisos y opciones directas, el país del
   usuario y sus equipos, y la composición de un equipo (miembros, responsable,
   equipo padre, borrar uno con miembros o subequipos). Además del permiso del
   endpoint, responden `403 ADMIN_ONLY` a quien no lo es.

## Process

1. Listar los permisos que la funcionalidad necesita, uno por operación real.
   No inventar acciones que nadie va a usar.
2. Añadirlos a `PERMISSIONS` en `prisma/seed/access-catalog.ts`.
3. Si aparece en el menú, añadir la `MenuOption` a `MENU_OPTIONS` con su
   `requiredPermission`, su icono y su `path`.
4. Decidir qué roles la reciben y actualizar `ROLES`.
5. Crear la migración y ejecutar la semilla.
6. Declarar `@RequirePermission('recurso.accion')` en cada endpoint.
7. Crear la ruta del frontend con el **mismo** `path` de la opción, envuelta en
   `RequirePermission` con el mismo permiso, y registrar ese `path` en
   `backend/src/modules/access/app-routes.registry.json` (PLAN-ADMIN, D6): sin
   registro, la opción no se puede crear desde la pantalla de administración y
   la prueba `route-registry.spec.ts` del frontend falla.
8. Probar con un usuario que **no** tenga el permiso: no debe ver la opción y
   debe recibir 403 si escribe la URL.

## Required checks

- [ ] Cada endpoint nuevo declara permiso o `@AuthenticatedOnly` con razón.
- [ ] La ruta del frontend coincide exactamente con el `path` de la opción.
- [ ] El `path` está en `app-routes.registry.json`.
- [ ] Toda mutación de administración escribe en la bitácora (`AuditService`).
- [ ] El permiso de la ruta coincide con el `requiredPermission` de la opción.
- [ ] Existe una prueba con un usuario sin el permiso.
- [ ] Ninguna asignación directa se creó sin razón escrita.
- [ ] La semilla sigue siendo idempotente.

## Expected output

Permisos y opciones en el catálogo, migración aplicada, endpoints decorados,
ruta protegida y pruebas de acceso denegado.

## Anti-patterns

- Declarar el menú en el frontend "mientras tanto": ya no se quita.
- Un permiso por pantalla (`pantalla_clientes.ver`) en vez de por operación.
- Resolver un caso particular creando un rol nuevo en lugar de una asignación
  directa con razón.
- Conceder permisos leyendo grupos o roles del token de Entra ID.
- Confiar en que el frontend oculte la opción como control de seguridad.

## Definition of Done

Un usuario con el permiso ve la opción y la usa; uno sin él no la ve y recibe
403 al forzar la URL. Ambas situaciones están cubiertas por pruebas.

## Related Skills

`authorization`, `authentication`, `database`, `prisma`, `design-system`,
`api-design`.
