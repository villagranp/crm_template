# ADR-008 - RBAC + autorización basada en permisos

## Status
Accepted — 2026-09-22

## Context
La autorización por rol comprobada en línea (`if (user.role === 'ADMIN')`) se dispersa, se
duplica y se vuelve imposible de auditar. Se necesita un modelo que soporte cambios de política
sin tocar código en todas partes.

## Decision
Modelo `User → Roles → Permissions`, con permisos nombrados `resource.action`
(`customers.read`, `orders.approve`). La decisión se toma en guards y policies de NestJS,
con `@RequirePermission('...')` por handler y **deny-by-default**. Además del permiso, los
casos de uso verifican propiedad/tenencia del recurso.

## Alternatives
- **Solo RBAC por rol**: simple, pero cada cambio de política requiere tocar código y no
  distingue matices por operación.
- **ABAC/ReBAC completo**: más expresivo, con coste de complejidad e infraestructura que no se
  justifica en la fase inicial. Puede adoptarse por proyecto mediante ADR.

## Consequences
- Los permisos se auditan como catálogo, independiente del código.
- El frontend puede consultar permisos para ocultar UI, sin que eso sea un control de seguridad.
- Coste: mantener el catálogo de permisos y su mapeo a roles.

## Security Considerations
Deny-by-default evita endpoints desprotegidos por olvido. La verificación de propiedad previene
IDOR. Se distingue `401` (no autenticado) de `403` (sin permiso) sin revelar información sensible
sobre la existencia de recursos ajenos.

## Addendum 2026-10-10 — Permisos alternativos: `@RequireAnyPermission`

**Estado:** Accepted — 2026-10-10. Origen: D-01.1 del CRM
(`docs/implementation-plans/crm/decisiones-pendientes.md`), aprobada por el
responsable con su valor recomendado. No sustituye nada de lo anterior.

**Contexto.** `@RequirePermission('a', 'b')` exige **todos** los permisos
indicados. Varios endpoints del CRM mezclan fuentes con permisos distintos: la
agenda, el historial de interacciones, el seguimiento y las opciones de
responsable del Módulo 4 (`actividades.ver` **o** `visitas.ver`), y la actividad
reciente y las alertas de Inicio (cualquiera de `actividades.ver`,
`visitas.ver`, `proyectos.ver`, `oportunidades.ver`). Con el decorador actual,
quien solo ve visitas recibiría `403` en una agenda que debería mostrarle sus
visitas.

**Decisión.** Se añade `@RequireAnyPermission(...permisos)` en
`backend/src/common/decorators/`, con soporte en `PermissionsGuard`:

- El guard concede el acceso si el usuario tiene **al menos uno** de los
  permisos listados; si no tiene ninguno, `403`. Deny-by-default se mantiene: un
  handler sin `@RequirePermission`, `@RequireAnyPermission` ni una declaración
  explícita de público o autenticado sigue rechazado.
- Un handler no puede combinar `@RequirePermission` y `@RequireAnyPermission`
  (el guard lo trata como error de configuración y deniega).
- **El caso de uso filtra por fuente**: cada tipo de dato solo se incluye si el
  usuario tiene su propio permiso (`visitas.ver` para visitas, etc.), además del
  alcance de datos. El decorador abre la puerta; no concede ver todo lo que hay
  detrás.
- Se documenta en OpenAPI (extensión con la lista y la semántica "uno de").

**Alternativa descartada.** Un endpoint por fuente con `@RequirePermission` y
fusión en el frontend: mismo resultado funcional, pero más peticiones, una
paginación por tipo y ordenación en el cliente.

**Consecuencias.** Pruebas obligatorias por endpoint: con solo uno de los
permisos se recibe solo esa fuente; con ninguno, `403`; sin token, `401`.
