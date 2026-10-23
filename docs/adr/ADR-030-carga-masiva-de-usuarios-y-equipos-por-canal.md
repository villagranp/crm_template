# ADR-030 - Carga masiva de usuarios por script y equipos por canal en la semilla

## Status

Accepted — 2026-10-23

Proyecto: Mi Cliente AG. Decisiones del responsable del proyecto (2026-10-23): crear a todos los asesores del
listado comercial, sembrar los equipos por canal, país de todos Ecuador y código de colaborador correlativo
`EC-00001`. Revierte, para los usuarios, la exclusión de la carga inicial del 2026-10-15 (`CARGA-INICIAL.md`,
«Tipos de cambio y usuarios no entran»). Se apoya en [ADR-020](ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md)
(solo el administrador da accesos) y [ADR-027](ADR-027-sso-entra-id-alta-primer-ingreso-y-corte-directo.md)
(vinculación por `oid`).

## Context

La carga de clientes necesita **responsables comerciales** que existan como usuarios activos, y el SSO necesita
usuarios que luego se puedan vincular por `oid`. El negocio tiene un listado de asesores (nombre, correo, canal) y
no hay forma de darlos de alta en lote: Administración los crea de uno en uno. Además, un usuario con rol comercial
exige código de colaborador y país (D-07.3), y no hay equipos sembrados (los equipos eran «datos de negocio
no entregados», DM-12).

## Decision

1. **Nueva entidad `users` en la carga inicial por scripts** (`load:data`): una plantilla con **correo, nombre,
   apellido, código de colaborador, país, rol y equipo (opcional)**. Cada fila se da de alta con el **mismo caso de uso
   que Administración** (`UsersService.create`): nace `INVITED`, sin vínculo con Entra ID, con su rol y equipo, y deja
   auditoría `user.created`. La carga se ejecuta con un administrador con `usuarios.crear` y `equipos.editar`.
2. **Un solo rol por fila.** Más roles se asignan después desde Administración.
3. **Idempotente:** un correo que ya existe se omite («ya existe») sin modificarlo; un código de colaborador que ya es
   de otro usuario es un error. Todo o nada: con un error de validación no se crea ninguna fila.
4. **El vínculo con Entra ID sigue siendo aparte** (`entra-identities`, por `oid`, ADR-027). Los usuarios se cargan primero
   y se vinculan después con la plantilla de vínculos.
5. **Los datos reales no entran al repositorio.** El repositorio solo lleva la plantilla vacía; el archivo con personas
   reales vive fuera del repositorio.
6. **La semilla esencial crea un equipo por canal**: `CONST` (Construcción), `DISTR` (Distribución) e `INDST` (Industria),
   sin responsable ni jerarquía. Al re-ejecutar solo se refrescan nombre y descripción, nunca el estado ni el responsable.
7. **Código de colaborador:** el archivo trae un correlativo `EC-00001`… (el que el negocio decidió); la herramienta no lo
   genera.

## Consequences

- Los asesores existen como usuarios y ya son elegibles como responsables en la carga de clientes (por correo).
- Hay que ejecutar la semilla (`prisma:seed`) en cada entorno para crear los tres equipos, y luego `load:data apply users`.
- Quien entre por SSO sin estar vinculado ve «tu cuenta aún no está vinculada» hasta que se cargue su `oid`.
- La plantilla fija un único rol y un único equipo por fila: lo demás es manual.
- Se amplía el puerto de lectura de la carga inicial (roles y equipos por código) y `AccessModule` exporta `UsersService`.

## Alternatives Considered

- **Crear los 20 usuarios a mano en Administración:** sin desarrollo, pero lento y propenso a errores de captura.
- **Dejar que se creen solos al primer ingreso por SSO:** nacen sin rol, país ni código y sin ser elegibles como
  responsables hasta que alguien los complete.
- **Una columna `oid` en la misma plantilla:** vincularía en un paso, pero mezcla dos decisiones de seguridad distintas
  y duplica el flujo ya probado de vínculos; se descarta por ahora.
