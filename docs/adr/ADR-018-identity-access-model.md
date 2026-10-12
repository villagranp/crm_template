# ADR-018 - Modelo de identidad, acceso y opciones de menú

## Status
Accepted — 2026-09-24

## Context
La plantilla necesitaba un núcleo de gestión utilizable desde el primer día:
usuarios, roles, permisos, opciones de menú y la asignación de esas opciones a
roles y a personas. Hasta este punto, ADR-008 definía el modelo de autorización
(RBAC + permisos `resource.action`) pero el resolutor de permisos era un mapa
estático vacío, y el menú del frontend no existía.

La plantilla visual de referencia resolvía el menú con un archivo de JavaScript
(`modules.js`) que declaraba módulos, entidades y opciones, y lo pintaba en cada
página. Ese enfoque tiene una consecuencia que en una aplicación real es un
problema de seguridad: **el menú y la autorización son dos fuentes de verdad
distintas**, y divergen. Una opción retirada del menú sigue siendo alcanzable
escribiendo la URL; una opción añadida al menú sin su permiso lleva a una
pantalla que el servidor rechaza.

## Decision

### 1. Las opciones de menú son datos, no código
`MenuOption` es una tabla: clave, etiqueta, icono, ruta, orden, jerarquía,
módulo y **permiso requerido**. Dar de alta una opción es una migración de datos
o un alta desde la pantalla de administración, no un despliegue del frontend.

### 2. El menú se calcula en el servidor
`GET /me/menu` devuelve únicamente las opciones que el usuario tiene
concedidas y cuyo permiso requerido posee. El frontend pinta lo que recibe y no
filtra por su cuenta. Menú y autorización dejan de poder divergir.

### 3. Tres niveles de asignación, con precedencia explícita
```
permisos efectivos = (permisos de sus roles vigentes)
                   + (concesiones directas GRANT)
                   - (denegaciones directas DENY)
```
`DENY` gana siempre, incluso sobre un permiso heredado de un rol. Es la única
forma de que una excepción de seguridad sea fiable: si un `GRANT` de rol pudiera
sobreponerse, retirar un acceso puntual exigiría auditar todos los roles del
usuario.

Las opciones de menú siguen exactamente la misma regla, con las mismas tablas
espejo (`RoleMenuOption`, `UserMenuOption`).

### 4. Toda asignación directa lleva razón y puede caducar
`UserPermission` y `UserMenuOption` exigen `reason` (no nulo, mínimo 10
caracteres en el DTO) y admiten `expiresAt`. Una excepción sin justificación
escrita es deuda de seguridad: el día de la auditoría nadie recuerda por qué se
concedió.

### 5. Los permisos no salen del token
`DatabasePermissionResolver` traduce la identidad autenticada a una cuenta local
y lee sus asignaciones. Un rol que llegue en un claim de Entra ID no concede
nada por sí mismo (ADR-008). Si la identidad no tiene cuenta local habilitada,
el conjunto de permisos es vacío: el token es válido pero no autoriza nada.

### 6. Identidad separada de credencial
`User` no guarda contraseñas. `UserIdentity` vincula la cuenta con un proveedor
(`LOCAL`, `ENTRA_ID`) y `UserCredential` guarda el hash local. Así la misma
persona puede entrar hoy por credencial local y mañana por Entra ID sin
duplicar la cuenta ni perder sus asignaciones.

### 7. Las sesiones guardan el hash del refresh token
`UserSession.refreshTokenHash` con cadena de rotación (`replacedById`). Una fuga
de la base de datos no se convierte en suplantación de sesión.

## Alternatives
- **Sólo roles, sin excepciones directas.** Más simple de razonar, pero en la
  práctica cada caso particular ("este usuario además exporta") acaba creando un
  rol nuevo, y el catálogo de roles se vuelve ingobernable.
- **Permisos en el token (claims).** Evita una lectura por petición, pero un
  cambio de permisos no surte efecto hasta que el token caduca, y retirar un
  acceso deja de ser inmediato. Inaceptable para el control de accesos.
- **Menú en el frontend, permisos en el backend.** Es lo que hacía la referencia.
  Rechazado por la divergencia descrita.
- **ACL por registro (Casbin, OPA).** Potente y con un coste de operación que no
  se justifica antes de tener un caso que lo exija. Si aparece, es un ADR nuevo;
  el modelo actual no lo impide.

## Consequences
- Cada petición autorizada hace una lectura del acceso del usuario. Es una
  consulta indexada por `user_id`, pero es una lectura: si el perfil de carga lo
  exige, se añade caché con invalidación al cambiar una asignación **y se
  documenta**, porque una caché mal invalidada en autorización es un fallo de
  seguridad, no de rendimiento.
- La pantalla de administración es obligatoria en el primer proyecto: sin ella,
  asignar opciones exige tocar la base de datos a mano.
- El alcance de datos (`DataScope`: propios / equipo / territorio / organización)
  queda declarado en el rol, pero **aplicarlo a las consultas es responsabilidad
  de cada caso de uso**. La plantilla expone el alcance efectivo en `/me`; no
  puede filtrar consultas de entidades que todavía no existen.
- No hay aprovisionamiento automático de usuarios desde el token. Un usuario de
  Entra ID sin cuenta local autentica pero no entra. Habilitar el alta
  automática es una decisión de proyecto que necesita su propio ADR.

## Security Considerations
- Deny-by-default en las dos capas: el guard rechaza endpoints sin declaración
  de permiso, y el menú sólo muestra lo concedido explícitamente.
- La comprobación de permisos del frontend (`usePermission`, `RequireAuth`) es
  únicamente de experiencia de usuario. El backend vuelve a verificar siempre.
- `LoginAttempt` registra los intentos con `userId` nulo cuando el correo no
  existe: la API no debe permitir distinguir si una cuenta existe.
- Los roles desactivados dejan de conceder acceso sin necesidad de
  desasignarlos usuario por usuario.

## Addendum 2026-10-10 — `DataScope.TERRITORY` pasa a llamarse `COUNTRY`

**Estado:** Accepted — 2026-10-10. Origen: DM-10 del CRM (contradicción C5 del
alcance), aprobada por el responsable con su valor recomendado. Cambia un
**contrato público**.

**Contexto.** El alcance del CRM define la visibilidad "por país" (ALCANCE
§9.2). El enum `DataScope` de este ADR trae `TERRITORY`, que ningún rol sembrado
usa y que en este proyecto siempre significa país (`users.country_id`).

**Decisión.** Se renombra el valor: `ALTER TYPE data_scope RENAME VALUE
'TERRITORY' TO 'COUNTRY';` en una migración escrita a mano (la única no aditiva
de la Fase 0; reversible con el `RENAME` inverso, sin pérdida de datos). El
alcance `COUNTRY` filtra por el país del usuario (`users.country_id`), un país
por usuario (DM-14). Un usuario con alcance `COUNTRY` sin país se degrada a
`OWN` y se registra una advertencia (D-02.8).

**Contrato afectado.** `dataScope` aparece como enum en los DTOs de perfil,
roles y usuarios (`profile.dto.ts`, `role.dto.ts`, `user.dto.ts`), en el
frontend (`roles.api.ts`, `roles-format.ts`, `users.api.ts`, `access.types.ts`,
`HomePage.tsx`) y en `access.service.ts` / `access-catalog.ts`. Cambian a la vez
en la misma entrega, con OpenAPI y CHANGELOG. No hay consumidores externos ni
producción, por lo que no se versiona la API.

**Alternativa descartada.** Mantener `TERRITORY` e interpretarlo como país (solo
etiquetas): sin migración, pero con un nombre que no dice lo que hace como
deuda permanente.

La sección Consequences de este ADR, donde dice "propios / equipo / territorio /
organización" debe leerse "propios / equipo / país / organización".
