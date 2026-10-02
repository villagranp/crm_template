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
