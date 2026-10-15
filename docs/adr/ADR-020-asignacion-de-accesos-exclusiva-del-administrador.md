# ADR-020 - La asignación de accesos es exclusiva del administrador

## Status
Accepted — 2026-10-09

Proyecto: Mi Cliente AG. Complementa ADR-008 (autorización) y ADR-018 (modelo
de identidad y acceso). Origen: revisión de código de PLAN-ADMIN.

## Context

Los permisos de ADR-008 dicen **qué operación** puede invocar alguien
(`usuarios.editar`, `roles.editar`), pero no **qué puede conceder** con ella.
La revisión de PLAN-ADMIN encontró que quien tiene `usuarios.editar` podía
concederse cualquier cosa. Con el rol sembrado `gestor-accesos`, descrito como
"sin tocar parámetros del sistema", había cuatro caminos hasta administrador:

1. Asignarse el rol `administrador`.
2. Concederse un permiso directo que no tiene (`parametros.configurar`).
3. Crear un usuario con rol `administrador` y entrar con la contraseña inicial.
4. Añadir permisos a un rol propio y asignárselo.

Y uno más, indirecto: restablecer la contraseña de un usuario a
`AUTH_DEFAULT_PASSWORD`, que es conocida, entrar como él y quedarse sus
permisos. La segunda revisión mostró que no basta con proteger a los
administradores: cualquier cuenta con un permiso que el actor no tenga sirve.
Por eso restablecer es exclusivo del administrador sea quien sea el usuario
(decisión del responsable, 2026-10-09).

## Decision

**Solo un usuario con el rol `administrador` vigente puede cambiar qué acceso
tiene alguien.** El resto de permisos de administración gestionan datos, no
accesos.

Exigen ser administrador (`403 ADMIN_ONLY`):

| Operación | Endpoint |
|---|---|
| Asignar roles a un usuario | `PUT /users/{id}/roles` |
| Excepciones directas de permiso o de menú | `PUT /users/{id}/permissions`, `/menu-options` |
| Crear o duplicar un rol | `POST /roles`, `POST /roles/{id}/duplicate` |
| Cambiar lo que concede un rol | `PUT /roles/{id}/permissions`, `/menu-options`; `PATCH /roles/{id}` si cambia `dataScope` o `isActive` |
| Restablecer la contraseña de **cualquier** usuario | `POST /users/{id}/password/reset` |
| Actuar sobre un usuario que es administrador | `PATCH`, `suspend` y `reactivate` de ese usuario |

Además, **en el alta de usuarios** (`POST /users`) un no administrador solo
puede asignar roles que **no conceden ningún permiso** (hoy, `usuario`). Todo
usuario nace con un rol; sin esta excepción el gestor no podría dar de alta a
nadie, y un rol sin permisos no da acceso a nada.

Lo que sigue igual: el permiso de cada endpoint (`usuarios.editar`,
`roles.editar`…) se sigue exigiendo; esta regla se suma, no lo sustituye. Y el
backend es quien decide: la interfaz oculta las acciones, pero no es la
protección.

### Roles sembrados

`gestor-accesos` queda como "administra los datos de usuarios y equipos; la
asignación de accesos es del administrador". Gana `equipos.crear` y
`equipos.eliminar` (decisión del responsable, 2026-10-09).

## Alternatives

- **"Solo concedes lo que tienes"** (la concesión ⊆ permisos efectivos del
  actor). Más flexible: un gestor podría repartir su propio alcance. Rechazada
  por el responsable en favor de una regla más simple de explicar y auditar.
- **Aceptar el riesgo** y considerar de confianza a quien tenga
  `usuarios.editar`. Rechazada: la descripción del rol prometía algo que el
  sistema no cumplía.

## Consequences

- Toda la delegación de accesos pasa por los administradores; un equipo grande
  puede necesitar más de uno.
- `gestor-accesos` conserva `roles.editar` y `opciones.configurar` sin efecto
  práctico: se dejan para no reordenar el catálogo y por si se adopta más
  adelante "solo concedes lo que tienes".
- Si se habilita Entra ID, la regla no cambia: se evalúa sobre los roles de la
  cuenta local (ADR-018 §5), no sobre los del token.

## Open questions

- **Pertenencia a equipos y alcance `TEAM`.** *Resuelta el 2026-10-10: ver el addendum al final.* Quien tiene `equipos.editar`
  (hoy `gestor-accesos`) cambia miembros, responsable y jerarquía, y con ello
  lo que ve un usuario con alcance `TEAM` (incluye subequipos). Hoy ningún
  módulo de negocio aplica ese alcance, así que no concede nada todavía. Debe
  decidirse si cuenta como "asignar acceso" **antes** de que el primer módulo
  del CRM filtre datos por equipo.

## Addendum 2026-10-10 — Equipos y país del usuario son asignación de acceso

**Estado:** Accepted — 2026-10-10. Origen: DM-12 y D-07.2 del CRM, aprobadas por
el responsable con su valor recomendado. **Cierra la pregunta abierta** de este
ADR ("Pertenencia a equipos y alcance `TEAM`") antes de que el primer módulo del
CRM (Clientes) filtre datos por equipo o por país.

**Contexto.** En el CRM el alcance `TEAM` ve los registros de los miembros y del
responsable de sus equipos **incluidos los subequipos**, y el alcance `COUNTRY`
ve los del país del usuario. Cambiar la pertenencia a un equipo, su responsable,
su jerarquía o el país de un usuario cambia, por tanto, **lo que otra persona
ve**: es conceder o retirar acceso a datos por otra vía.

**Decisión.** Estas operaciones exigen ser administrador (`403 ADMIN_ONLY`),
además del permiso propio del endpoint:

| Operación | Endpoint |
|---|---|
| Añadir o quitar miembros de un equipo | `PUT /teams/{id}/members` (y equivalentes) |
| Asignar equipos a un usuario | `PUT /users/{id}/teams` (D-07.4) |
| Cambiar el responsable de un equipo | `PATCH /teams/{id}` si cambia `managerId` |
| Cambiar la jerarquía (equipo padre) | `PATCH /teams/{id}` si cambia `parentId` |
| Eliminar un equipo con miembros o subequipos | `DELETE /teams/{id}` |
| Fijar o cambiar el país de un usuario | `POST /users` con `countryId` (salvo administrador), `PATCH /users/{id}` si cambia `countryId` |

Siguen con sus permisos `equipos.*` y `usuarios.*` de siempre: crear un equipo
sin miembros, editar nombre, código o descripción, y editar datos del usuario
que no cambian su acceso. Cambiar el equipo principal (`isPrimary`) no cambia la
visibilidad (el alcance `TEAM` usa todas las pertenencias) y no se considera
asignación de acceso.

**Alternativa descartada.** Que quien tenga `equipos.editar` (hoy
`gestor-accesos`) también pueda: un no administrador podría ampliar lo que otro
ve, que es justo lo que este ADR prohíbe para roles y permisos.

**Consecuencias.** `gestor-accesos` conserva la gestión de los datos de equipos
pero no su composición. La regla se evalúa en el backend; la interfaz oculta las
acciones. No se guarda foto histórica del equipo en los registros comerciales
(DM-12): si un asesor cambia de equipo, sus registros se ven desde el nuevo.

**Nota 2026-10-14 (decisión del responsable, D1).** Se añade a la tabla de
operaciones exclusivas del administrador: **activar o desactivar un equipo con
miembros o subequipos** (`PATCH /teams/{id}` si cambia `isActive`, `403
ADMIN_ONLY`), con el mismo criterio que eliminar un equipo con miembros o
subequipos: afecta a un equipo con composición y, con ello, a otros usuarios.
Un equipo vacío (sin miembros ni subequipos) lo sigue activando o desactivando
cualquiera con `equipos.editar`. Lo anterior de este addendum no cambia.
