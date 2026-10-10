# 07 — Módulo 7: Administración

- **Fuente del alcance:** [`ALCANCE-CRM.md`](../../requirements/crm/ALCANCE-CRM.md) §9 (9.1–9.5), con §1, §2, §10–§13
- **Contrato de datos:** [`00-modelo-de-datos.md`](00-modelo-de-datos.md) (decisiones `DM-n`)
- **Lo que ya está construido:** [`PLAN-ADMIN.md`](../PLAN-ADMIN.md) (D1–D14 y §10), [ADR-018](../../adr/ADR-018-identity-access-model.md),
  [ADR-019](../../adr/ADR-019-autenticacion-local-con-migracion-a-entra.md), [ADR-020](../../adr/ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md),
  [ADR-008](../../adr/ADR-008-authorization.md), [`docs/api/README.md`](../../api/README.md), [`AUTHENTICATION.md`](../../../AUTHENTICATION.md),
  [`frontend/src/features/admin/README.md`](../../../frontend/src/features/admin/README.md)
- **Funcionalidades:** F-43 Usuarios · F-44 Roles y permisos · F-45 Catálogos · F-46 Parámetros generales · F-47 Auditoría
- **Estado:** especificación. No se ha tocado código, esquema, migraciones ni seeds.
- **Skills aplicados:** `architecture`, `access-management`, `authorization`, `authentication`, `security`, `database`, `api-design`, `frontend-react`, `design-system`, `testing`, `documentation`

> **Naturaleza de este documento: especificación de brechas.** La administración del
> núcleo (usuarios, roles, permisos, menú, equipos, catálogos genéricos, parámetros,
> auditoría y aprobaciones) **ya está construida**
> (PLAN-ADMIN, pasos 1–9 completados). El alcance §9 dice "no duplicar ni reemplazar
> sus estructuras" y 00 §12 C3 lo resuelve: el Módulo 7 **extiende** lo existente.
> Cada apartado distingue **Existe** (con referencia a archivo), **Se añade**,
> **Se cambia** y **No se duplica**.

---

## A. Objetivo

Dar a los administradores del CRM el mantenimiento de los datos que gobiernan a los
otros seis módulos —usuarios comerciales con su código de colaborador, país, rol y
equipo; roles con permisos por módulo y operación y su ámbito de visibilidad;
catálogos `crm.*`; parámetros funcionales del CRM; y la consulta de auditoría a nivel
de campo— **sobre las mismas tablas, endpoints y pantallas que ya existen**, sin
crear un segundo sistema de accesos, de catálogos, de parámetros ni de autenticación.

Responsabilidades:

1. Ser la **única** vía de mantenimiento de usuarios, roles, permisos, catálogos y parámetros (ningún módulo comercial los escribe).
2. Proteger la **semántica** de los catálogos y la **validez** de los parámetros de los que dependen los demás módulos (00 §3.3, §8.2).
3. Mantener la regla de ADR-020: **solo un administrador cambia qué acceso tiene alguien**.
4. Ofrecer la consulta de auditoría con entidad, registro, acción, campo, valor anterior, valor nuevo, usuario y fecha, y garantizar que la bitácora no se modifica ni se borra.

Lo que **no** es responsabilidad de este módulo: aplicar el ámbito de visibilidad a las
consultas comerciales (lo hace cada caso de uso con `VisibilityScopeResolver`, 00 §4.2,
Fase 0), escribir los eventos de auditoría de clientes, proyectos, visitas, etc. (cada
módulo los emite; aquí se consultan) y los formularios comerciales que leen catálogos
(cada módulo los consume, ver G).

---

## B. Alcance completo (orientado a brechas)

### B.1 Usuarios (§9.1, F-43)

| Elemento del alcance | Existe | Se añade / se cambia |
|---|---|---|
| Código de colaborador | No | **Se añade** `users.employee_code` (00 §1.1, único global, nulo en base). Campo en alta, edición, detalle, lista, búsqueda y exportación |
| Nombres, Apellidos | Sí: `firstName`, `lastName` (`access/dto/user.dto.ts` `CreateUserDto`/`UpdateUserDto`) | — |
| Correo | Sí, único (`users.service.ts` `create` → `findUserByEmail`, `409`) | — |
| Teléfono | Sí: `phone` (5–40) | — |
| País | No | **Se añade** `users.country_id` → `countries` (00 §1.1). Selector de países activos. Cambiarlo es asignación de acceso (D-07.2) |
| Activo | Sí, como `status` (`INVITED`/`ACTIVE`/`SUSPENDED`/`LOCKED`) | **Se cambia solo la presentación**: "Activo" = `ACTIVE` o `INVITED`; "Inactivo" = `SUSPENDED`; `LOCKED` se muestra como "Bloqueado temporalmente". No se añade booleano |
| Rol | Sí: `roleIds` en el alta; `PUT /users/{id}/roles` (admin, ADR-020) | — (varios roles por usuario; alcance efectivo = el más amplio, `access.service.ts` `widestScope`) |
| Equipo | Sí: `teamIds` en el alta (exige `equipos.editar`); miembros desde Equipos (`PUT /teams/{id}/members`); el detalle del usuario los muestra **solo lectura** | **Se añade** la asignación desde la ficha del usuario (`PUT /users/{id}/teams`, D-07.4), con las mismas reglas del módulo de equipos |
| Crear | Sí: `POST /users` | Acepta `employeeCode` y `countryId` |
| Consultar | Sí: `GET /users` (filtros `status`, `roleCode`, `teamId`, `search`) y `GET /users/{id}` | Filtro `countryId`; `search` también por código de colaborador; columnas Código y País |
| Editar | Sí: `PATCH /users/{id}` | Acepta `employeeCode` (y `countryId` solo administrador) |
| Activar / Desactivar | Sí: `POST /users/{id}/reactivate` y `/suspend` (D3, D4: suspender cierra sesiones) | — |
| Asignar rol | Sí (ADR-020) | Valida el perfil comercial completo (D-07.3) |
| Asignar equipo | Parcial (ver "Equipo") | D-07.4 |
| Asignar país | No | `countryId` en `PATCH`, exclusivo del administrador (D-07.2) |
| Exportar (no pedido, existente) | Sí: `GET /users/export` (D13) | Columnas Código de colaborador y País |

**No se duplica:** no se crea tabla de "colaboradores" ni de "usuarios del CRM"; la
persona comercial es el `User` existente (00 P1). No se crea otro endpoint de estado
(PLAN-ADMIN §10: el estado solo cambia con `suspend`/`reactivate`).

### B.2 Roles y permisos (§9.2, F-44)

| Elemento del alcance | Existe | Se añade / se cambia |
|---|---|---|
| Mantenimiento de roles | Sí: `GET/POST/PATCH/DELETE /roles`, `POST /roles/{id}/duplicate` (`roles.controller.ts`, D1, D2) | — |
| Roles iniciales Asesor, Manager, Administrador | `administrador` (ORGANIZATION, `'*'`) existe; también `gestor-accesos`, `auditor`, `usuario` (`prisma/seed/access-catalog.ts`) | **Se siembran** `asesor` (OWN), `manager` (TEAM) y `responsable-pais` (COUNTRY) en la Fase 0 (00 §4.4, DM-11). Los existentes **no se tocan ni se borran**. Si son o no de sistema: D-07.1 |
| Permisos crear, editar, consultar, eliminar, exportar | Sí: acciones `ver`, `crear`, `editar`, `eliminar`, `exportar` (`ACTIONS` en `access-catalog.ts`); "consultar" = `ver` | — |
| Cerrar, Administrar | No | **Se añaden** las acciones `cerrar` y `administrar` a `ACTIONS`/`ACTION_LABELS` (00 §5.1, Fase 0). "Administrar" = operar sobre registros ajenos dentro del ámbito (DM-34), **no** el acceso al módulo de Administración, que sigue usando `usuarios.*`, `roles.*`, `catalogos.*`, `parametros.*`, `auditoria.*` |
| Asignar permisos por módulo y operación | Sí: matriz módulo × acción en la ficha del rol (`roles/roles-format.ts` `buildPermissionMatrix`, agrupa por `Permission.moduleKey`); `PUT /roles/{id}/permissions` (admin, ADR-020; `409 SYSTEM_RESOURCE_READ_ONLY` en roles de sistema, D1) | Columnas `cerrar` y `administrar` en `ACTION_ORDER`/`ACTION_LABEL`; nombres de los módulos del CRM (00 §5.3) en la cabecera de cada grupo |
| Ámbito de visibilidad: propios, equipo, país, administrativo | Sí: `Role.dataScope` = `OWN`/`TEAM`/`TERRITORY`/`ORGANIZATION`, selector en `RoleFormDialog.tsx`; cambiarlo es admin (ADR-020) | **Se cambia** `TERRITORY` → `COUNTRY` (DM-10: migración, contrato y addendum a ADR-018). Etiqueta "Su país" |
| Control en backend y frontend; no limitarse a ocultar botones | Sí: `PermissionsGuard` deny-by-default + `@RequirePermission`; menú desde `GET /me/menu`; `usePermission`/`useCan` solo UX (ADR-018 §2, README admin §4) | — (la aplicación del ámbito a datos comerciales es de cada módulo, 00 §4.2–4.3) |
| Opciones de menú por rol | Sí: `PUT /roles/{id}/menu-options` (admin) | Las opciones del CRM se siembran con cada módulo (DM-32) |

**No se duplica:** no se crea un modelo de "permisos por módulo" paralelo: el módulo
de un permiso ya es `Permission.moduleKey`. No se crean ni borran permisos desde la
interfaz (PLAN-ADMIN §1 "Fuera de alcance"): el catálogo de 41 permisos del CRM llega
por semilla en la Fase 0 (00 §5.2).

### B.3 Catálogos (§9.3, F-45)

| Elemento del alcance | Existe | Se añade / se cambia |
|---|---|---|
| Crear valores | Sí: `POST /catalogs/{id}/items` (`catalogs.service.ts` `createItem`) | Validación de `metadata` contra el registro de semántica y de invariantes (00 §3.3); prohibido en conjuntos cerrados |
| Consultar | Sí: `GET /catalogs`, `GET /catalogs/{id}` | El detalle devuelve también el esquema de `metadata` y si es conjunto cerrado, para pintar un formulario en lugar de JSON |
| Editar | Sí: `PATCH /catalogs/{id}/items/{itemId}` (etiqueta, `metadata`, orden, activo; `code` inmutable) | Mismas validaciones que el alta |
| Activar / Desactivar | Sí: `isActive` por `PATCH`; los elementos nunca se borran (D9) | Desactivar se rechaza si rompe un invariante o si un parámetro del CRM referencia el código (D-07.6) |
| Ordenar valores | Sí: `sortOrder` por `PATCH` (dos `PATCH` sucesivos, no atómico, PLAN-ADMIN §10); hueco de 10 entre elementos | — Se conserva. `metadata.order` (flujo de fases/etapas) se edita en el formulario de semántica |
| Consultar estado | Sí: `isActive` en la lista de elementos | Filtro "solo activos / todos" en el detalle si no existe |
| Aplicar a los catálogos de Clientes, Proyectos, Oportunidades, Productos, Forecast, Visitas, Actividades | El mantenimiento es genérico: cualquier `Catalog` | Los 17 catálogos `crm.*` se siembran en la Fase 0 (00 §3.2) con `isSystem = true` y aparecen solos en la pantalla. Las listas que son **tablas** (países, unidades, familias, productos, reglas de conversión) no son `catalog_items`: su mantenimiento se trata en B.4 y D-07.9 |
| No permitir duplicados | Parcial: `code` único por catálogo (`uq_catalog_items_catalog_code`, `existsItemCode`) | **Se añade** unicidad de la etiqueta normalizada dentro del catálogo (D-07.5) |
| No eliminar valores usados históricamente | Sí: no existe borrado de elementos; las FK del CRM a `catalog_items` son `Restrict` (00 §2) | — |
| Identificadores estables | Sí: UUID + `code` inmutable (PLAN-ADMIN §10) | — |
| Permitir desactivar | Sí | — |
| Auditar modificaciones | Sí: `catalog_item.created/updated`, `catalog.created/updated/deleted` | — |
| Reflejar cambios en los formularios | Los formularios comerciales aún no existen | Regla para los módulos: leen catálogos de la base en cada carga, sin caché en el cliente más allá de la de TanStack Query, y por un endpoint propio (D-07.12) |

**No se duplica:** no se crean tablas de "estados", "tipos" ni "listas del CRM"; no se
añaden columnas a `catalog_items` (la semántica va en `code` + `metadata`, 00 §3.3); no
hay arreglos fijos de valores en el frontend (alcance §1 regla 8).

### B.4 Parámetros generales (§9.4, F-46)

Existe: `GET /parameters` (agrupados) y `PATCH /parameters/{key}` (solo el valor,
validado por tipo y rango en `parameters/parameter-value.ts`; `parametros.configurar`
para el grupo `seguridad`, D10). No se crean ni borran parámetros desde la interfaz.

| Elemento del alcance | Parámetros / estructura (00 §8.2) | Brecha |
|---|---|---|
| Reglas de duplicidad | `crm.clientes.unicidad_codigo`, `crm.clientes.unicidad_nit` (`PAIS`\|`GLOBAL`), `crm.clientes.reglas_duplicidad`, `crm.contactos.reglas_duplicidad` (JSON) | Validación de valores permitidos y del esquema JSON (D-07.7) |
| Campos obligatorios configurables | `crm.campos_obligatorios` (JSON por entidad) | Lista blanca de campos por entidad; solo **añade** obligatorios a los de la base (00 §8.2) |
| Valores predeterminados | `crm.valores_por_defecto` (códigos de catálogo), `crm.moneda_por_defecto`, `crm.visitas.duracion_por_defecto_minutos`, `crm.zona_horaria_negocio` | Los códigos deben existir y estar activos en el catálogo correspondiente |
| Alertas | `crm.alertas.oportunidad_sin_siguiente_accion`, `crm.alertas.prioridades` | Prioridades = códigos activos de `crm.prioridad` |
| Vencimientos | `crm.alertas.actividad_por_vencer_horas`, `crm.alertas.visita_sin_confirmar_horas`, `crm.alertas.proyecto_sin_actualizar_dias` | Rangos (D-07.7) |
| Reglas de avance | `crm.proyectos.reglas_avance`, `crm.oportunidades.transiciones_etapa` | Códigos de `crm.fase_cliente` / `crm.etapa_oportunidad`; porcentajes 0–100 |
| Configuración funcional de login | **Ya existe**: `seguridad.intentos_fallidos_maximos` (1–20), `seguridad.minutos_bloqueo` (1–1440), `seguridad.dias_caducidad_password` (0–365), leídos por `AuthRepository.getSecuritySettings` (ADR-019) | Ninguna funcional. Se presentan juntos en un bloque "Acceso" |
| Tipo de autenticación o ingreso permitido | Variable de despliegue `AUTH_PROVIDER` (`backend/src/config/env.schema.ts`, `local`\|`entra`\|`hybrid`) y `VITE_AUTH_PROVIDER` en el frontend (ADR-019) | **Solo lectura** en la pantalla (D-07.8, 00 §12 C6). No se crea parámetro editable |
| Conversiones y estimaciones comerciales | Reglas de conversión en la **tabla** `unit_conversion_rules` (00 §2.3); parámetros `crm.forecast.unidad_tonelaje`, `crm.forecast.horizonte_meses`, `crm.moneda_por_defecto` | Pantalla de mantenimiento de reglas de conversión (y de unidades, familias y productos, DM-23) sobre las tablas de la Fase 0 (D-07.9) |
| Otros del CRM (no listados, sembrados por 00) | `crm.visitas.validar_conflicto_horario`, `crm.importaciones.*`, `crm.adjuntos.*`, `sistema.permite_datos_demo` | Validación (D-07.7); los estructurales exigen `parametros.configurar` |

**No se duplica:** no se crea una tabla de "configuración del CRM" ni un segundo
mecanismo de parámetros; todo es `system_parameters` con `group = 'crm'`. No se crea
un sistema de autenticación paralelo ni un selector de proveedor en base de datos.

### B.5 Auditoría e historial de cambios (§9.5, F-47)

| Elemento del alcance | Existe | Se añade / se cambia |
|---|---|---|
| Entidad | `audit_logs.resource_type`; filtro texto "Tipo de recurso" (`AuditFilters.tsx`) | Etiqueta legible por tipo (`crm.customer` → "Cliente") y selector con los tipos conocidos (D-07.10) |
| Identificador del registro | `resource_id`; filtro "Id del recurso" | — |
| Acción | `event` (`recurso.accion`); filtro "Evento" con `GET /audit-logs/events` | — |
| Campo modificado, valor anterior, valor nuevo | `changes = {campo: {before, after}}` (`audit/audit-diff.ts`); el detalle (`AuditDetailDrawer.tsx`) lo muestra como tabla | **Vista por campo** (una fila por campo cambiado) y **filtro por campo** en `GET /audit-logs` y en la exportación (D-07.10). No se crea tabla nueva |
| Usuario | `subject_id`, `subject_email`; filtro "Actor" | — |
| Fecha y hora | `occurred_at`; filtros Desde/Hasta | — |
| Registrar clientes, contactos, proyectos, fases, oportunidades, resultados, productos asociados, forecast, visitas, actividades | No existen las entidades | Cada módulo emite sus eventos con `AuditService.record` y `resourceType` `crm.*` (00 §1.1). Este módulo fija la convención (RN-07.40) y la verifica en su consulta |
| Registrar usuarios, roles, permisos, catálogos, parámetros | Sí: `user.*`, `role.*` (incl. `role.permissions_replaced`, `user.permissions_replaced`), `catalog.*`, `catalog_item.*`, `parameter.updated` | Los campos nuevos (`employeeCode`, `countryId`, equipos desde el usuario) entran en el antes/después |
| Consultar el historial mediante filtros | Sí: `GET /audit-logs` + exportación CSV (`auditoria.exportar`, D13) | Filtro `field` |
| Restringir modificación y eliminación | **Solo en la aplicación**: no hay endpoint de escritura; el puerto `AuditRepository` solo tiene `record`; el de consulta es de lectura. **En la base no hay protección** y no existe tarea de purga | **Se añade** protección en la base (D-07.11) |
| Datos personales en la bitácora | `audit-diff.ts` omite campos cuyo nombre parece secreto (`pass|hash|token|secret|credential`); no enmascara PII | Enmascarado de PII de contactos (DM-29), necesario **antes** del Módulo 2 (K) |

**No se duplica:** el historial funcional (`project_phase_history`,
`opportunity_stage_history`, `visit_events`…) **no** es auditoría ni la sustituye
(00 P6); esta pantalla no lo muestra ni lo copia.

---

## C. Reglas de negocio

### Usuarios (F-43)

| ID | Regla |
|---|---|
| RN-07.1 | `employeeCode` es único en todo el sistema. Se guarda recortado y en mayúsculas (1–40, letras, dígitos, `-`, `_`). Colisión → `409 RESOURCE_CONFLICT` con `details[].field = "employeeCode"` (mismo patrón que el correo) |
| RN-07.2 | El correo sigue siendo único (`email_normalized`, existente). No cambia |
| RN-07.3 | Obligatorios siempre: correo, nombres, apellidos, al menos un rol (existente). Obligatorios para un **usuario comercial** (D-07.3): código de colaborador y país |
| RN-07.4 | El país debe existir y estar activo al asignarlo (`422 UNKNOWN_REFERENCE`, `issue: "inactive"` si está inactivo). Un usuario cuyo país se desactiva después lo conserva |
| RN-07.5 | Cambiar el país de un usuario es **exclusivo del administrador** (`403 ADMIN_ONLY`), porque con alcance `COUNTRY` cambia lo que el usuario ve (D-07.2). Fijarlo en el alta también lo es, salvo que el actor sea administrador |
| RN-07.6 | "Desactivar" = suspender (`SUSPENDED`); cierra todas sus sesiones al instante (D4). "Activar" = reactivar (`ACTIVE`, o `INVITED` si nunca fijó contraseña). No hay borrado de usuarios |
| RN-07.7 | Salvaguardas D3 vigentes: nadie se suspende a sí mismo, nadie se quita su propio rol de administrador y siempre queda al menos un administrador activo (`409 SELF_LOCKOUT`, `409 LAST_ADMIN`) |
| RN-07.8 | Referencias históricas: un usuario suspendido sigue apareciendo como responsable, autor o asesor en los registros donde figura (FK `Restrict`, 00 §2). Los selectores de responsable de registros **nuevos** ofrecen solo usuarios `ACTIVE`. Suspender no reasigna ni bloquea (D-07.14) |
| RN-07.9 | Asignar roles, permisos u opciones directas, editar/suspender/reactivar a un administrador y restablecer contraseñas siguen siendo exclusivos del administrador (ADR-020). En el alta, un no administrador solo asigna roles sin permisos |
| RN-07.10 | Equipos de un usuario: un único equipo principal; los equipos deben existir y no estar borrados; mismas reglas que `PUT /teams/{id}/members` (D8). Cambiar la pertenencia exige `equipos.editar` y, si se aprueba DM-12, ser administrador |
| RN-07.11 | Toda mutación queda en la bitácora con su diferencia: `employeeCode` y `countryId` (con el código ISO del país) se añaden al estado auditado del usuario (`userAuditView`) |

### Roles y permisos (F-44)

| ID | Regla |
|---|---|
| RN-07.12 | Las acciones válidas son `ver`, `crear`, `editar`, `eliminar`, `exportar`, `aprobar`, `configurar`, `cerrar`, `administrar`. "Consultar" del alcance = `ver` |
| RN-07.13 | Un permiso solo se asigna si existe en el catálogo sembrado; la interfaz no crea permisos (ADR-008, PLAN-ADMIN) |
| RN-07.14 | `administrar` sobre un recurso comercial permite actuar sobre registros **ajenos dentro del ámbito**; `editar` solo sobre los propios (DM-34, 00 §4.3). No concede acceso a Administración |
| RN-07.15 | El ámbito de visibilidad es uno por rol (`OWN`, `TEAM`, `COUNTRY`, `ORGANIZATION`); el efectivo de un usuario es el más amplio de sus roles vigentes (existente) |
| RN-07.16 | Cambiar permisos, opciones, ámbito o activación de un rol, y crear o duplicar roles, es exclusivo del administrador (ADR-020) |
| RN-07.17 | Roles de sistema: nombre, permisos y opciones de solo lectura en la interfaz; se personalizan con "Duplicar" (D1). Qué roles comerciales son de sistema: D-07.1 |
| RN-07.18 | Un rol con usuarios asignados no se elimina (`409 ROLE_IN_USE`, D2). Un rol desactivado deja de conceder acceso sin desasignarlo (ADR-018) |
| RN-07.19 | La autorización la decide siempre el backend; ocultar acciones en el frontend es solo experiencia de usuario. Fuera del ámbito → `404`; dentro del ámbito sin permiso → `403` (00 §4.3) |

### Catálogos (F-45)

| ID | Regla |
|---|---|
| RN-07.20 | `code` único por catálogo e inmutable (existente) |
| RN-07.21 | La etiqueta normalizada (recortada, minúsculas, sin acentos, espacios colapsados) es única dentro del catálogo, **contando los inactivos**: si ya existe un valor inactivo con esa etiqueta, se reactiva en lugar de crear otro (D-07.5). Colisión → `409 RESOURCE_CONFLICT`, `details[].field = "label"` |
| RN-07.22 | Los elementos no se borran nunca; se desactivan. Un catálogo de sistema no cambia de `key` ni se elimina (D9) |
| RN-07.23 | El `metadata` de un elemento de un catálogo `crm.*` debe cumplir el esquema del registro de semántica (claves, tipos, obligatoriedad) → si no, `422 INVALID_CATALOG_METADATA` |
| RN-07.24 | Invariantes por catálogo (00 §3.3): `crm.etapa_oportunidad` conserva al menos una etapa activa abierta, una con `outcome="WON"` y una con `outcome="LOST"`, y `outcome` solo en etapas cerradas; `crm.estado_actividad` y `crm.estado_visita`: exactamente un indicador verdadero por elemento y al menos un elemento activo por indicador; `crm.fase_cliente`: al menos una fase activa no final y una final; `crm.estado_cliente`: `isActive` obligatorio. Romperlo → `409 CATALOG_INVARIANT` |
| RN-07.25 | `crm.resultado_oportunidad` es un **conjunto cerrado**: no se crean ni desactivan elementos; solo cambian etiqueta y orden (`409 CATALOG_INVARIANT`, `reason: "closed_set"`) |
| RN-07.26 | No se desactiva un elemento cuyo `code` usa un parámetro del CRM (`crm.valores_por_defecto`, `crm.alertas.prioridades`, `crm.oportunidades.transiciones_etapa`, `crm.proyectos.reglas_avance`) → `409 CATALOG_INVARIANT`, `reason: "referenced_by_parameter"`, con las claves. Primero se cambia el parámetro (D-07.6) |
| RN-07.27 | Desactivar un valor no altera los registros que ya lo usan; solo deja de ofrecerse en altas. En una edición que no cambia el valor, el valor inactivo se conserva (00 §3.5) |
| RN-07.28 | Los catálogos que no son `crm.*` (si los hubiera) conservan el comportamiento actual: sin esquema de `metadata` ni invariantes |

### Parámetros (F-46)

| ID | Regla |
|---|---|
| RN-07.29 | Solo se edita el valor; claves, tipos y grupos no cambian desde la interfaz (D10) |
| RN-07.30 | Cada parámetro `crm.*` tiene una regla en el registro de parámetros: rango numérico, lista de valores permitidos o esquema JSON, y referencias a catálogos o unidades que deben existir y estar activas. Incumplir → `422 INVALID_PARAMETER_VALUE` con `details[].issue` legible (D-07.7) |
| RN-07.31 | `crm.campos_obligatorios` solo admite campos de la lista blanca de cada entidad (`customer`, `project`, `visit`, `activity`…) y nunca quita los obligatorios de la base: los que exige el esquema se añaden siempre aunque el valor no los incluya |
| RN-07.32 | Parámetros estructurales exigen además `parametros.configurar`: `crm.forecast.unidad_tonelaje`, `crm.forecast.horizonte_meses`, `crm.zona_horaria_negocio`, `crm.importaciones.habilitada`, `sistema.permite_datos_demo` (y el grupo `seguridad`, existente). Sin él → `403 PERMISSION_DENIED` |
| RN-07.33 | `crm.forecast.unidad_tonelaje` solo admite una unidad activa de dimensión `MASS` que tenga regla identidad activa |
| RN-07.34 | El proveedor de autenticación **no** es un parámetro: se muestra en solo lectura desde la configuración de despliegue. Cambiarlo es un despliegue (ADR-019) |
| RN-07.35 | Los módulos leen los parámetros en el servidor en cada operación (sin caché o con caché invalidada al editar); un valor ilegible en la base hace que el lector use el valor por defecto documentado y registre un aviso estructurado, nunca un `500` |
| RN-07.36 | Reglas de conversión: única por (unidad origen, unidad destino, ámbito) (`409`); factor > 0; la unidad destino es la de tonelaje configurada; no se borran, se desactivan; la regla identidad `TON→TON` no se desactiva ni cambia de factor; cambiar un factor no reescribe líneas existentes (el factor se copia en cada línea, 00 §2.3) |
| RN-07.37 | Unidades de medida: `code` inmutable; `dimension` inmutable una vez referenciada por un producto, una regla o una línea (`409`) |

### Auditoría (F-47)

| ID | Regla |
|---|---|
| RN-07.38 | La bitácora es de solo inserción: ningún endpoint la modifica ni la borra, y la base rechaza `UPDATE`, `TRUNCATE` y `DELETE` de filas dentro del periodo de retención (D-07.11) |
| RN-07.39 | Consultar exige `auditoria.ver`; exportar, `auditoria.exportar`. Cada exportación queda auditada (existente) |
| RN-07.40 | Convención para los módulos comerciales: `resourceType` = `crm.<entidad>` (`crm.customer`, `crm.contact`, `crm.project`, `crm.opportunity`, `crm.opportunity_result`, `crm.project_product`, `crm.forecast_line`, `crm.visit`, `crm.activity`, `crm.customer_import`, y los maestros `crm.product`, `crm.product_family`, `crm.unit_of_measure`, `crm.unit_conversion_rule`); `event` = `<resourceType>.<acción en pasado>` (p. ej. `crm.project.phase_changed`, `crm.opportunity.result_recorded`); `changes` con los nombres de campo del DTO. Si una especificación de módulo fija otro nombre, prevalece la suya y se actualiza el mapa de etiquetas |
| RN-07.41 | Datos personales de contactos (nombre, correo, teléfono) se registran enmascarados en `changes` (DM-29). Nunca contraseñas, hashes ni tokens (existente) |
| RN-07.42 | La vista por campo es una presentación de `changes`; no se almacena nada adicional. Registros antiguos sin la forma `{before, after}` se muestran como JSON (existente) |
| RN-07.43 | Retención: `auditoria.dias_retencion` (30–3650, defecto 365, existente). La purga física, cuando exista, solo puede borrar filas más antiguas que la retención |

---

## D. Modelo de datos

**Ninguna entidad nueva en este módulo.** Todo lo que usa está en el contrato 00 y
se crea en la Fase 0.

| Entidad (tabla) | Uso en el Módulo 7 | Origen |
|---|---|---|
| `User` (`users`) | `employee_code` (único, nulo), `country_id` (FK `Restrict`, nulo) | 00 §1.1, migración 2 |
| `Country` (`countries`) | Selector del usuario; solo lectura aquí (D-07.13) | 00 §2.2 |
| `Team`, `TeamMember` | Equipos del usuario (D-07.4) | Existentes |
| `Role`, `Permission`, `RolePermission`, `UserRole`, `UserPermission`, `AppModule`, `MenuOption`, `RoleMenuOption`, `UserMenuOption` | Sin cambios de estructura; filas del CRM por semilla | Existentes + 00 §5 |
| Enum `DataScope` | `TERRITORY` → `COUNTRY` | 00 §4.1, DM-10, migración 1 |
| `Catalog`, `CatalogItem` | 17 catálogos `crm.*` de sistema; semántica en `metadata` | 00 §3.2 |
| `SystemParameter` | Parámetros `crm.*` y `sistema.permite_datos_demo` | 00 §8.2 |
| `UnitOfMeasure`, `ProductFamily`, `Product`, `UnitConversionRule` | Mantenimiento de maestros comerciales (D-07.9) | 00 §2.3 |
| `AuditLog` (`audit_logs`) | Consulta; protección en base (D-07.11) | Existente |

Restricciones de integridad que el módulo usa (todas de 00): `users.employee_code`
único; `uq_catalog_items_catalog_code`; FK `Restrict` desde las entidades comerciales a
`catalog_items`, `users`, `countries`, unidades y reglas; `uq_unit_conversion_rules_from_to_scope`
y los `CHECK` de reglas (`factor > 0`, identidad, ámbito).

Cambios de base **propios de este módulo** (no son tablas):

1. Migración `…_audit_logs_append_only` (D-07.11): función y disparadores en SQL escrito a mano con `--create-only`, igual que los `CHECK` de 00 (Prisma no gestiona disparadores, así que no los detecta como deriva). Script inverso en `backend/prisma/rollbacks/`.
2. Ningún índice nuevo obligatorio. El filtro por campo (`changes ? 'campo'`) se sirve con los índices existentes de `audit_logs` combinado con fecha/tipo; si el volumen lo exige, un índice GIN sobre `changes` sería una migración aditiva **en SQL** (no expresable en Prisma: mismo riesgo de deriva que PLAN-ADMIN §10), por lo que se deja como mejora medida, no como parte del alcance.

---

## E. Pantallas y componentes

Todas bajo `/administracion/*`, con el shell, `PageHeader` + `adminBreadcrumbs`, los
cuatro estados (cargando, vacío, error, sin permiso), tablas `DataTable` con filtros
en la URL y tarjetas por debajo de `sm`, y formularios RHF + Zod (README de admin). Sin
hex, duraciones ni píxeles a mano (ADR-017).

### E.1 Usuarios — `/administracion/usuarios` (existe: `features/admin/users/`)

| Componente | Cambio |
|---|---|
| `UsersPage.tsx` | Columnas **Código** (`hideOnMobile`) y **País**; filtro **País** (selector); el buscador indica "nombre, correo o código"; la columna Estado muestra Activo/Inactivo/Bloqueado/Invitado |
| `UserFormDialog.tsx` (alta) | Campos **Código de colaborador** y **País** (selector de países activos, deshabilitado con explicación si el actor no es administrador, RN-07.5); equipos y equipo principal; los roles con permisos solo para administrador (existente) |
| `UserDetailDialog.tsx` | Muestra código, país y equipos; edición de código; edición de país solo administrador; nuevo panel **Equipos** (`UserTeamsPanel`) con alta/baja de equipos y elección del principal, visible con `equipos.editar` |
| `users.schemas.ts` | `employeeCode` (patrón RN-07.1), `countryId` (uuid); regla de perfil comercial como ayuda (el backend decide) |
| Mensajes de error | `CRM_PROFILE_INCOMPLETE` → "Para asignar un rol comercial el usuario necesita código de colaborador y país."; conflicto de código → "Ya existe un usuario con ese código de colaborador." |

Estados: lista vacía con filtros → "Ningún usuario coincide"; sin `usuarios.ver` → la
ruta no carga (guard de ruta existente).

### E.2 Roles y permisos — `/administracion/roles` (existe: `features/admin/roles/`)

| Componente | Cambio |
|---|---|
| `roles-format.ts` | `DATA_SCOPE_LABEL.COUNTRY = 'Su país'` (se retira `TERRITORY`); `ACTION_ORDER` y `ACTION_LABEL` con `cerrar` ("Cerrar") y `administrar` ("Administrar"); etiqueta de módulo por `moduleKey` (Clientes, Proyectos, Actividad comercial, Reportes, Integraciones, Inicio, Administración) |
| `RoleDetailDialog.tsx` (matriz) | Matriz **módulo × operación** ya existente con las dos columnas nuevas; celdas sin permiso en el catálogo se muestran vacías (no "no concedido"); explicación de "Administrar" en un `Tooltip` |
| `RoleFormDialog.tsx` | Selector de ámbito con `COUNTRY`; descripción breve de cada ámbito (propios / equipo y subequipos / país del usuario / toda la organización) |
| Roles de sistema | Aviso existente "de solo lectura; usa Duplicar" se aplica a los roles comerciales si D-07.1 se queda en `isSystem` |

### E.3 Catálogos — `/administracion/catalogos` (existe: `features/admin/catalogs/`)

| Componente | Cambio |
|---|---|
| `CatalogsPage.tsx` | Filtro rápido "Catálogos del CRM" (búsqueda por prefijo `crm.`); insignia "Sistema" (existente) |
| `CatalogDetailDialog.tsx` | Lista con columnas Código, Etiqueta, Orden, Estado; filtro activos/todos; indicador **Conjunto cerrado** (sin botón "Nuevo" ni "Desactivar"); acciones subir/bajar (existente, dos `PATCH`) |
| `CatalogItemForm.tsx` | Si el detalle trae `metadataSchema`, **formulario generado** (casillas para booleanos, número para `order`/`rank`/`weight`/`defaultProgress`, selector para `outcome`, selección múltiple para `appliesTo` y `fields`); si no, editor JSON actual |
| `catalogs.errors.ts` | `INVALID_CATALOG_METADATA` (muestra el campo), `CATALOG_INVARIANT` con mensaje según `reason` (`closed_set`, `referenced_by_parameter` con las claves, invariante concreto), etiqueta duplicada |

### E.4 Parámetros — `/administracion/parametros` (existe: `features/admin/parameters/`)

| Componente | Cambio |
|---|---|
| `ParametersPage.tsx` | Grupos con etiqueta: **Acceso** (`seguridad.*` + tarjeta de autenticación), **CRM — Duplicidad**, **Campos y valores por defecto**, **Alertas y vencimientos**, **Reglas de avance**, **Forecast y conversiones**, **Importaciones y adjuntos**. La agrupación visual se deriva del prefijo de la clave; no cambia `group` en base |
| `AuthenticationSettingsCard` (nuevo) | Solo lectura: proveedor vigente (Local / Microsoft Entra ID / Híbrido) desde `GET /parameters/authentication`, más los tres parámetros de login local editables (si el proveedor es `entra`, se indica que no aplican) |
| `ParameterEditDialog.tsx` | Selector cuando el parámetro trae `allowedValues` (`PAIS`/`GLOBAL`, `NO`/`AVISAR`/`BLOQUEAR`); editores estructurados para los JSON con `editor` conocido: `required-fields` (casillas por entidad, las de base marcadas y bloqueadas), `catalog-defaults` (un selector por campo con los valores activos del catálogo), `stage-transitions` (matriz etapa × etapa), `priority-map`, `progress-rules`; resto: JSON con validación del servidor |
| Aviso de permiso | Parámetros con `requiresConfigure` deshabilitados con explicación si falta `parametros.configurar` |

### E.5 Maestros comerciales (nuevas, D-07.9)

| Ruta | Opción de menú (`administracion`) | Permiso | Contenido |
|---|---|---|---|
| `/administracion/productos` | `admin-productos` "Productos y unidades" | `productos.ver` (ruta) · `productos.configurar` (acciones) | Pestañas **Familias**, **Productos** (SKU, descripción, familia, unidad base, activo), **Unidades** (código, nombre, símbolo, dimensión, activo). Alta, edición, activar/desactivar; sin borrado |
| `/administracion/conversiones` | `admin-conversiones` "Conversiones" | `productos.ver` · `productos.configurar` | Reglas de conversión: origen, destino (fijo: unidad de tonelaje), factor, ámbito (Global / Familia / Producto / Tipo de proyecto) con su referencia, descripción, activo. Filtros por ámbito y unidad. Indicador de la regla identidad protegida |

Cada ruta se registra en `app-routes.registry.json`, `admin-routes.ts` y
`route-paths.ts`; la opción se siembra con el módulo (DM-32) y se concede a
`administrador` automáticamente (`'*'`).

### E.6 Auditoría — `/administracion/auditoria` (existe: `features/admin/audit/`)

| Componente | Cambio |
|---|---|
| `AuditFilters.tsx` | **Entidad**: selector con etiquetas de los tipos conocidos (RN-07.40 y los de administración), que admite texto libre; **Campo**: texto (nombre del campo, p. ej. `phaseId`) |
| `AuditPage.tsx` | Conmutador **Vista por evento** (actual) / **Vista por campo**: en la segunda, cada fila es Fecha y hora · Usuario · Entidad · Registro · Acción · Campo · Valor anterior · Valor nuevo. La paginación sigue siendo por evento; los campos de un evento se agrupan visualmente |
| `audit-format.ts` | Mapa `resourceType → etiqueta` y `field → etiqueta` para los campos más comunes; valores enmascarados se muestran tal cual |
| Exportación | Botón con opción "por campo" (`layout=fields`) |
| Sin acciones de edición ni borrado | Se mantiene: la pantalla no ofrece ninguna |

---

## F. Servicios y contratos

Todos bajo `/api/v1`, formato de error de `API-STANDARDS.md`, documentados en OpenAPI.
Solo se listan los **cambios** y los **nuevos**; el resto de PLAN-ADMIN §3 sigue igual.

### F.1 Usuarios (cambios)

| Método | Ruta | Permiso | Cambio |
|---|---|---|---|
| GET | `/users` | `usuarios.ver` | Query `countryId` (uuid); `search` incluye `employeeCode`. `UserListItemDto` gana `employeeCode: string \| null` y `country: { id, isoCode, name } \| null` |
| GET | `/users/{id}` | `usuarios.ver` | `UserDetailResponseDto` gana `employeeCode`, `country` |
| POST | `/users` | `usuarios.crear` | `CreateUserDto` gana `employeeCode?` (1–40, patrón) y `countryId?` (uuid). `countryId` por un no administrador → `403 ADMIN_ONLY` |
| PATCH | `/users/{id}` | `usuarios.editar` | `UpdateUserDto` gana `employeeCode?` y `countryId?` (este último, solo administrador). No se admite vaciar `employeeCode`/`countryId` de un usuario comercial (`422 CRM_PROFILE_INCOMPLETE`) |
| PUT | `/users/{id}/roles` | `usuarios.editar` + admin | Si un rol resultante es comercial y faltan código o país → `422 CRM_PROFILE_INCOMPLETE` (D-07.3) |
| GET | `/users/export` | `usuarios.exportar` | Columnas "Código de colaborador" y "País" |
| GET | `/users/{id}/access` | `usuarios.ver` | `dataScope` con `COUNTRY` (DM-10) |

### F.2 Equipos del usuario (nuevo, D-07.4)

`PUT /users/{id}/teams` — servido por el módulo `teams` (no por `access`), que es el
dueño de las reglas de pertenencia.

- Permiso: `equipos.editar`; además `ADMIN_ONLY` si se aprueba DM-12.
- Cuerpo: `{ "teams": [{ "teamId": "uuid", "isPrimary": true }] }` (≤ 50, únicos, como mucho un principal; lista vacía permitida).
- Respuesta `200`: `{ "teams": [{ "id", "name", "isPrimary" }] }`.
- Errores: `400` validación; `401`; `403 PERMISSION_DENIED` / `ADMIN_ONLY`; `404` usuario; `422 UNKNOWN_REFERENCE` (equipo inexistente o borrado); `409` si dos principales.
- Auditoría: `team.members_replaced` por cada equipo afectado (mismo evento que `PUT /teams/{id}/members`) y `user.teams_replaced` sobre el usuario.

### F.3 Roles (cambios)

- `DataScope` en `role.dto.ts`, `profile.dto.ts`, `user.dto.ts`: `OWN | TEAM | COUNTRY | ORGANIZATION` (rompe el contrato: DM-10, CHANGELOG, addendum ADR-018).
- `GET /permissions`: incluye las acciones `cerrar` y `administrar` (datos).

### F.4 Catálogos (cambios)

| Método | Ruta | Cambio |
|---|---|---|
| GET | `/catalogs/{id}` | `CatalogDetailResponseDto` gana `metadataSchema: { key, type: 'boolean'\|'number'\|'string'\|'enum'\|'enum[]', required, values? }[] \| null` y `closedSet: boolean` (del registro de semántica) |
| POST | `/catalogs/{id}/items` | Nuevos errores: `422 INVALID_CATALOG_METADATA`, `409 CATALOG_INVARIANT` (`reason`: `closed_set`, `invariant`), `409 RESOURCE_CONFLICT` por etiqueta |
| PATCH | `/catalogs/{id}/items/{itemId}` | Igual, más `409 CATALOG_INVARIANT` `reason: "referenced_by_parameter"` con `details[].keys` |

### F.5 Parámetros (cambios y nuevo)

| Método | Ruta | Permiso | Cambio |
|---|---|---|---|
| GET | `/parameters` | `parametros.ver` | Cada parámetro gana `requiresConfigure: boolean`, `allowedValues: string[] \| null`, `editor: string \| null`, `range: {min,max} \| null` (del registro; metadatos de presentación, no datos nuevos) |
| PATCH | `/parameters/{key}` | `parametros.editar` (+ `parametros.configurar` si `requiresConfigure`) | Validación por registro (D-07.7); `422 INVALID_PARAMETER_VALUE` con `issue` |
| GET | `/parameters/authentication` | `parametros.ver` | **Nuevo**, solo lectura: `{ "provider": "local"\|"entra"\|"hybrid", "localLoginEnabled": boolean, "securityParameterKeys": ["seguridad.intentos_fallidos_maximos", …] }`. Nunca expone secretos, ids de tenant ni configuración de JWT |

### F.6 Auditoría (cambios)

| Método | Ruta | Cambio |
|---|---|---|
| GET | `/audit-logs` | Query `field` (1–100, `[A-Za-z0-9_.]`): solo eventos cuyo `changes` contiene ese campo |
| GET | `/audit-logs/export` | Query `field` y `layout=events\|fields` (defecto `events`, compatible). Con `fields`, una fila por campo: Fecha, Usuario, Entidad, Registro, Acción, Campo, Valor anterior, Valor nuevo. Mismo tope de 10 000 filas **de eventos** y `X-Export-Truncated` |
| PUT/PATCH/DELETE | `/audit-logs/**` | **No existen** y no se crean (`404`) |

### F.7 Maestros comerciales (nuevos, D-07.9)

Recursos con lista paginada (`page`, `pageSize`, `search`, `sort`, `isActive`), detalle,
alta y edición; **sin `DELETE`** (se desactiva con `PATCH isActive`).

| Recurso | Rutas | Leer | Escribir | Errores propios |
|---|---|---|---|---|
| Familias | `/product-families`, `/product-families/{id}` | `productos.ver` | `productos.configurar` | `409 RESOURCE_CONFLICT` (`code`) |
| Productos | `/products`, `/products/{id}` | `productos.ver` | `productos.configurar` | `409` (`sku`), `422 UNKNOWN_REFERENCE` (familia, unidad) |
| Unidades | `/units-of-measure`, `/units-of-measure/{id}` | `productos.ver` | `productos.configurar` | `409` (`code`), `409 UNIT_DIMENSION_LOCKED` |
| Reglas de conversión | `/unit-conversion-rules`, `/unit-conversion-rules/{id}` | `productos.ver` | `productos.configurar` | `409` (origen, destino, ámbito), `409 CONVERSION_RULE_PROTECTED` (identidad), `422 INVALID_CONVERSION_TARGET` (destino ≠ unidad de tonelaje), `422` ámbito incoherente |

DTOs: nunca el modelo Prisma (CLAUDE.md §8.9). `factor` viaja como cadena decimal
(precisión `Decimal(19,8)`). Si la especificación de Proyectos (03) ya define la
**lectura** de productos para sus formularios, este módulo añade solo la escritura y
reutiliza su puerto.

### F.8 Códigos de error nuevos

`CRM_PROFILE_INCOMPLETE` (422), `INVALID_CATALOG_METADATA` (422), `CATALOG_INVARIANT`
(409), `UNIT_DIMENSION_LOCKED` (409), `CONVERSION_RULE_PROTECTED` (409),
`INVALID_CONVERSION_TARGET` (422). Se reutilizan `RESOURCE_CONFLICT`,
`UNKNOWN_REFERENCE`, `ADMIN_ONLY`, `PERMISSION_DENIED`, `INVALID_PARAMETER_VALUE`,
`SYSTEM_RESOURCE_READ_ONLY`. Todos con mensaje en español en `describeApiError`.

### F.9 Operaciones que ofrece a otros módulos (no endpoints de administración)

| Pieza | Tipo | Consumidor | Nota |
|---|---|---|---|
| `SystemParameterReader` | Puerto de lectura tipado (`get(key)` validado con la misma regla del registro, con valor por defecto) | Todos los módulos | Fase 0. Hoy cada lector consulta por su cuenta (`AuthRepository.getSecuritySettings`) |
| `CatalogReferenceValidator` | Puerto transaccional | Todos los que escriben `*_id` a `catalog_items` | Fase 0 (00 §3.5) |
| `CatalogLookupService` | Servicio de lectura de elementos activos por `key` | Los endpoints de opciones de formulario de cada módulo (D-07.12) | Fase 0 |
| Registro de semántica de catálogos | Código (`catalog-semantics.registry.ts`) | Catálogos (validación) y módulos (consultan indicadores, no etiquetas) | Fase 0 |

---

## G. Relaciones internas

Administración **suministra** maestros, permisos y parámetros al resto del CRM desde la
Fase 0 (por semilla); las pantallas de este módulo solo cambian **valores**, nunca las
relaciones (§9 "Relaciones del módulo").

| Módulo | Lee de Administración | Parámetros que lee |
|---|---|---|
| Todos | Permisos efectivos y alcance (`/me`, guard), menú (`/me/menu`), `users.country_id` y equipos (para `VisibilityScopeResolver`) | `crm.zona_horaria_negocio` |
| 1 Inicio | Catálogos de prioridad y estados (indicadores) | `crm.alertas.*` (umbrales, prioridades, habilitación) |
| 2 Clientes | `crm.tipo_empresa`, `crm.estado_cliente`, `crm.calificacion_cliente`; países; usuarios activos como responsable | `crm.clientes.unicidad_codigo`, `crm.clientes.unicidad_nit`, `crm.clientes.reglas_duplicidad`, `crm.contactos.reglas_duplicidad`, `crm.campos_obligatorios.customer`, `crm.valores_por_defecto["customer.*"]` |
| 3 Proyectos | `crm.tipo_proyecto`, `crm.sector_proyecto`, `crm.fase_cliente`, `crm.etapa_oportunidad`, `crm.resultado_oportunidad`, `crm.motivo_resultado`, `crm.estado_producto_asociado`; productos, familias, unidades y reglas de conversión | `crm.proyectos.reglas_avance`, `crm.oportunidades.transiciones_etapa`, `crm.forecast.horizonte_meses`, `crm.forecast.unidad_tonelaje`, `crm.moneda_por_defecto`, `crm.campos_obligatorios.project`, `crm.valores_por_defecto["project.*","opportunity.*"]`, `crm.adjuntos.*` |
| 4 Actividad comercial | `crm.tipo_actividad`, `crm.estado_actividad`, `crm.estado_visita`, `crm.prioridad`, `crm.motivo_reprogramacion`, `crm.motivo_cancelacion`, `crm.resultado_interaccion` | `crm.visitas.validar_conflicto_horario`, `crm.visitas.duracion_por_defecto_minutos`, `crm.alertas.actividad_por_vencer_horas`, `crm.alertas.visita_sin_confirmar_horas`, `crm.campos_obligatorios.visit/activity`, `crm.valores_por_defecto["activity.*"]`, `crm.adjuntos.*` |
| 5 Reportes | Los mismos catálogos (etiquetas, `metadata.inFunnel`, `order`); permisos `reportes.*` | `crm.forecast.*`, `crm.zona_horaria_negocio` |
| 6 Integraciones | Catálogos por `code`, países por `isoCode`, usuarios por correo o `employeeCode` (responsable de la importación) | `crm.importaciones.*`, `crm.clientes.*` (mismas reglas que el alta) |

Lo que Administración **consume**: los eventos de auditoría que emiten los módulos
(solo lectura) y los códigos de catálogo que referencian los parámetros (para
RN-07.26).

Identificadores: UUID para FK; `Catalog.key` + `CatalogItem.code` como referencia
estable desde código, parámetros e importaciones; `Country.isoCode`; `User.employeeCode`
como clave natural para importaciones (Módulo 6).

**Cuando un módulo aún no existe:** sus parámetros y catálogos ya están sembrados y son
editables (con validación) aunque nadie los lea todavía; la pantalla de auditoría
muestra sus tipos en el selector pero sin registros; la opción de menú del módulo no
existe hasta que se entrega (DM-32). Añadir una etapa nueva a `crm.etapa_oportunidad`
no la hace alcanzable hasta que se incluye en `crm.oportunidades.transiciones_etapa`:
la pantalla lo advierte tras crear el elemento (regla de transiciones: Proyectos, DM-6).

---

## H. Seguridad

### H.1 Permisos por operación

| Operación | Permiso | Regla adicional |
|---|---|---|
| Ver / crear / editar usuarios | `usuarios.ver` / `.crear` / `.editar` | ADR-020 sobre administradores; país solo administrador (D-07.2) |
| Suspender / reactivar | `usuarios.editar` | D3, D4; ADR-020 si el objetivo es administrador |
| Asignar roles, permisos, opciones directas; restablecer contraseña | `usuarios.editar` / `opciones.configurar` | `ADMIN_ONLY` (ADR-020) |
| Equipos de un usuario | `equipos.editar` | `ADMIN_ONLY` si DM-12 |
| Exportar usuarios | `usuarios.exportar` | Auditado, ≤ 10 000 filas |
| Roles: crear, duplicar, permisos, ámbito, activación | `roles.crear` / `roles.editar` | `ADMIN_ONLY` |
| Catálogos | `catalogos.ver` / `.crear` / `.editar` / `.eliminar` | Registro de semántica |
| Parámetros | `parametros.ver` / `.editar` | `parametros.configurar` en `seguridad.*` y estructurales (RN-07.32) |
| Maestros comerciales | `productos.ver` / `productos.configurar` | — |
| Auditoría | `auditoria.ver` / `auditoria.exportar` | Sin escritura posible |

Ningún permiso nuevo: los de administración existen; `productos.ver/configurar` y las
acciones `cerrar`/`administrar` llegan con la Fase 0 (00 §5).

### H.2 ADR-020

Se mantiene sin excepciones. Se **amplía** (addendum, junto con DM-12) para incluir:
cambiar el país de un usuario y cambiar su pertenencia a equipos, porque con los
alcances `COUNTRY` y `TEAM` ambas cambian lo que el usuario ve. El gestor de accesos
sigue pudiendo dar de alta usuarios con el rol `usuario` y editar sus datos
personales y su código de colaborador.

### H.3 Inmutabilidad de la auditoría — estado actual y cierre

| Control | Estado hoy | Cierre |
|---|---|---|
| Sin endpoints de modificación o borrado | Cumple (`audit-logs.controller.ts` solo `GET`) | Prueba e2e que lo fija |
| Puertos de solo inserción / solo lectura | Cumple (`AuditRepository.record`, `AuditQueryRepository` de lectura) | — |
| Base de datos | **No cumple**: el usuario de la aplicación puede `UPDATE`/`DELETE` en `audit_logs` | Disparadores (D-07.11) + recomendación de `REVOKE UPDATE, DELETE` al rol de la aplicación en `docs/deployment/environments.md` (00 §4.5) |
| Atomicidad mutación + auditoría | Compromiso aceptado (PLAN-ADMIN §10): la fila se escribe tras la mutación | Sin cambio en este módulo; queda el seguimiento de unidad de trabajo de PLAN-ADMIN. Los módulos comerciales heredan el mismo compromiso |
| Datos sensibles | Se omiten secretos por nombre de campo | Enmascarado de PII (DM-29) |

### H.4 Otros controles

- Validación de entrada en DTO (`class-validator`) y de nuevo en el caso de uso; listas blancas de orden y filtros.
- `GET /parameters/authentication` no expone secretos ni identificadores de tenant.
- La vista por campo no muestra valores enmascarados en claro: el enmascarado ocurre al escribir.
- Exportaciones: tope, permiso propio y auditoría (D13).
- Registro estructurado sin PII; correlation ID en cada error (existente).

---

## I. Criterios de aceptación

### Usuarios (F-43)

- **AC-07.1** Given un administrador, When crea un usuario con código de colaborador, nombres, apellidos, correo, teléfono, país, rol y equipo, Then el usuario queda `INVITED`, con esos datos visibles en el detalle y un evento `user.created` que incluye `employeeCode` y el país.
- **AC-07.2** Given un usuario existente con código `E-001`, When se crea o edita otro con `e-001 `, Then responde `409 RESOURCE_CONFLICT` con `field = employeeCode`.
- **AC-07.3** Given un correo ya registrado, When se crea otro usuario con él, Then `409` (comportamiento existente conservado).
- **AC-07.4** Given un gestor de accesos (no administrador), When intenta fijar o cambiar `countryId`, Then `403 ADMIN_ONLY` y nada cambia; When edita `employeeCode` o el teléfono, Then se guarda.
- **AC-07.5** Given un usuario sin código o sin país, When el administrador le asigna `asesor`, Then `422 CRM_PROFILE_INCOMPLETE`; con ambos datos, Then se asigna.
- **AC-07.6** Given un usuario activo, When se desactiva, Then pasa a `SUSPENDED`, sus sesiones se revocan y la lista lo muestra "Inactivo"; When se activa, Then vuelve a `ACTIVE` (o `INVITED`).
- **AC-07.7** Given un asesor suspendido responsable de registros, When se consulta uno de esos registros, Then sigue mostrando su nombre; When se abre un selector de responsable para un alta, Then no aparece.
- **AC-07.8** Given `equipos.editar`, When se asignan dos equipos con uno principal desde la ficha del usuario, Then el detalle del usuario y la pantalla de Equipos muestran lo mismo; con dos principales, Then `409`.
- **AC-07.9** Given la lista de usuarios, When se filtra por país o se busca por código, Then solo aparecen los coincidentes; la exportación incluye las columnas Código y País.
- **AC-07.10** Sin `usuarios.ver` → `403` en la API y la ruta no se muestra en el menú; sin token → `401`.

### Roles y permisos (F-44)

- **AC-07.11** Given la Fase 0 aplicada, When se listan roles, Then existen `asesor` (OWN), `manager` (TEAM), `responsable-pais` (COUNTRY) y `administrador` (ORGANIZATION), y siguen `gestor-accesos`, `auditor` y `usuario`.
- **AC-07.12** Given la ficha de un rol, When se abre la matriz, Then los permisos se agrupan por módulo del CRM con columnas Ver, Crear, Editar, Cerrar, Eliminar, Exportar, Administrar (y las de administración), y solo las celdas existentes en el catálogo son seleccionables.
- **AC-07.13** Given un administrador y un rol editable, When marca `oportunidades.cerrar` y guarda, Then `PUT /roles/{id}/permissions` lo persiste, queda `role.permissions_replaced` y un usuario con ese rol obtiene el permiso en `/me` sin volver a iniciar sesión.
- **AC-07.14** Given un no administrador con `roles.editar`, When cambia permisos o ámbito de un rol, Then `403 ADMIN_ONLY`.
- **AC-07.15** Given un rol, When el administrador elige el ámbito "Su país", Then se guarda `COUNTRY` y `/me` del usuario lo devuelve como alcance efectivo si es el más amplio.
- **AC-07.16** Given un rol de sistema, When se intenta cambiar sus permisos, Then `409 SYSTEM_RESOURCE_READ_ONLY` y la interfaz ofrece "Duplicar".
- **AC-07.17** Given un usuario sin un permiso, When llama al endpoint que lo exige aunque la interfaz no muestre el botón, Then `403` (la seguridad no depende de ocultar).

### Catálogos (F-45)

- **AC-07.18** Given la Fase 0 aplicada, When se abre Catálogos, Then aparecen los 17 catálogos `crm.*` marcados como de sistema, con sus valores sembrados.
- **AC-07.19** Given `crm.tipo_empresa`, When se crea un valor, se edita su etiqueta, se reordena y se desactiva, Then cada operación queda auditada y el valor desactivado deja de aparecer en el endpoint de opciones de formulario pero sigue en los registros que lo usan.
- **AC-07.20** Given un valor "Constructora", When se crea otro "constructora " o "Constructóra", Then `409` por etiqueta duplicada; si el existente está inactivo, el mensaje propone reactivarlo.
- **AC-07.21** Given `crm.etapa_oportunidad` con una sola etapa `outcome = "WON"`, When se desactiva, Then `409 CATALOG_INVARIANT`.
- **AC-07.22** Given `crm.resultado_oportunidad`, When se intenta crear o desactivar un valor, Then `409 CATALOG_INVARIANT` (`closed_set`); cambiar la etiqueta sí se permite.
- **AC-07.23** Given un elemento con `metadata` que no cumple el esquema (p. ej. `isClosed: "sí"`), When se guarda, Then `422 INVALID_CATALOG_METADATA` con el campo.
- **AC-07.24** Given `crm.valores_por_defecto` que usa `PROSPECTO`, When se desactiva `PROSPECTO`, Then `409 CATALOG_INVARIANT` (`referenced_by_parameter`) con la clave del parámetro.
- **AC-07.25** No existe forma (API ni interfaz) de borrar un elemento de catálogo; `DELETE /catalogs/{id}` de un catálogo `crm.*` → `409 SYSTEM_RESOURCE_READ_ONLY`.

### Parámetros (F-46)

- **AC-07.26** Given la pantalla de parámetros, Then se ven agrupados duplicidad, obligatorios, valores por defecto, alertas, vencimientos, reglas de avance, acceso, forecast/conversiones, con sus valores sembrados.
- **AC-07.27** Given `crm.clientes.unicidad_nit`, When se guarda `NACIONAL`, Then `422 INVALID_PARAMETER_VALUE`; con `GLOBAL`, Then se guarda y queda `parameter.updated` con antes/después.
- **AC-07.28** Given `crm.campos_obligatorios`, When se añade `customer.taxId`, Then se guarda; When se envía un campo desconocido, Then `422`; When se omite un obligatorio de base, Then el valor guardado lo sigue incluyendo.
- **AC-07.29** Given `crm.valores_por_defecto` con un código inexistente o inactivo en su catálogo, When se guarda, Then `422` con el campo.
- **AC-07.30** Given un usuario con `parametros.editar` sin `parametros.configurar`, When edita `crm.forecast.unidad_tonelaje` o `seguridad.minutos_bloqueo`, Then `403`.
- **AC-07.31** Given el bloque Acceso, Then muestra el proveedor vigente en solo lectura y los parámetros de login local editables; no existe ningún control que cambie el proveedor.
- **AC-07.32** Given `productos.configurar`, When se crea una regla `KG→TON` duplicada para el mismo ámbito, Then `409`; When se intenta desactivar `TON→TON`, Then `409 CONVERSION_RULE_PROTECTED`; When se cambia el factor de una regla usada, Then las líneas existentes conservan su factor y tonelaje.
- **AC-07.33** Given un parámetro con un valor ilegible en la base (introducido por fuera de la API), When un módulo lo lee, Then usa el valor por defecto y registra un aviso; la operación no falla.

### Auditoría (F-47)

- **AC-07.34** Given eventos de varios tipos, When se filtra por entidad, registro, acción, usuario, campo y rango de fechas, Then solo aparecen los eventos que cumplen todos los filtros.
- **AC-07.35** Given la vista por campo, Then cada fila muestra entidad, identificador, acción, campo, valor anterior, valor nuevo, usuario y fecha y hora.
- **AC-07.36** Given la exportación con `layout=fields`, Then el CSV tiene una fila por campo con esas columnas y la exportación queda auditada.
- **AC-07.37** Given cualquier usuario (incluido el administrador), When intenta modificar o borrar un registro de auditoría por la API, Then no existe la ruta (`404`); When la aplicación ejecuta `UPDATE` o `DELETE` de un registro dentro de la retención en la base, Then la base lo rechaza.
- **AC-07.38** Given cambios en usuarios, roles, permisos, catálogos y parámetros, Then cada uno aparece en la consulta con su antes/después; given cambios en un contacto, Then su correo y teléfono aparecen enmascarados.
- **AC-07.39** Sin `auditoria.ver` → `403`; sin `auditoria.exportar` → `403` al exportar; sin token → `401`.

---

## J. Pruebas funcionales

Niveles según TESTING.md: unitarias (Jest, backend y Vitest/RTL frontend), integración
contra PostgreSQL efímera (`backend/test/*.e2e.spec.ts`) y E2E (Playwright,
`frontend/tests/e2e`).

### Positivas

| ID | Caso | Nivel | AC |
|---|---|---|---|
| PF-07.1 | Alta de usuario completo por administrador; detalle y evento con `employeeCode`/país | Integración | AC-07.1 |
| PF-07.2 | Edición del código por gestor de accesos | Integración | AC-07.4 |
| PF-07.3 | Suspender y reactivar: sesiones revocadas, estado presentado | Integración + RTL | AC-07.6 |
| PF-07.4 | `PUT /users/{id}/teams` y coherencia con `GET /teams/{id}` | Integración | AC-07.8 |
| PF-07.5 | Filtro por país, búsqueda por código, CSV con columnas nuevas | Integración | AC-07.9 |
| PF-07.6 | Semilla: roles comerciales y existentes presentes, idempotente en dos ejecuciones | Integración | AC-07.11 |
| PF-07.7 | Matriz con `cerrar`/`administrar` agrupada por módulo | Unitaria (`roles-format.spec.ts`) + RTL | AC-07.12 |
| PF-07.8 | Conceder `oportunidades.cerrar` a un rol propio y verlo en `/me` | Integración | AC-07.13 |
| PF-07.9 | Ámbito `COUNTRY` en rol y alcance efectivo en `/me` | Integración | AC-07.15 |
| PF-07.10 | Ciclo de vida de un valor de `crm.tipo_empresa` con auditoría | Integración | AC-07.19 |
| PF-07.11 | Formulario de `metadata` generado desde `metadataSchema` | RTL | AC-07.23 |
| PF-07.12 | Guardar `GLOBAL` en `crm.clientes.unicidad_nit` | Integración | AC-07.27 |
| PF-07.13 | Editor de campos obligatorios: añadir campo; base bloqueada | Unitaria (registro) + RTL | AC-07.28 |
| PF-07.14 | Tarjeta de autenticación en solo lectura con proveedor `local` | RTL + integración `GET /parameters/authentication` | AC-07.31 |
| PF-07.15 | Alta de familia, producto, unidad y regla de conversión | Integración | AC-07.32 |
| PF-07.16 | Cambio de factor sin reescritura de líneas (cuando exista Proyectos) | Integración | AC-07.32 |
| PF-07.17 | Filtros de auditoría combinados, incluido `field` | Unitaria (`audit-filter.spec.ts`) + integración | AC-07.34 |
| PF-07.18 | Vista por campo y exportación `layout=fields` | Unitaria (`audit-format.spec.ts`) + integración | AC-07.35, AC-07.36 |

### Negativas

| ID | Caso | Esperado | AC |
|---|---|---|---|
| PF-07.19 | Código de colaborador duplicado (distinto caso y espacios) | `409` `employeeCode` | AC-07.2 |
| PF-07.20 | Correo duplicado | `409` | AC-07.3 |
| PF-07.21 | No administrador fija `countryId` en alta y en edición | `403 ADMIN_ONLY` | AC-07.4 |
| PF-07.22 | País inexistente / inactivo | `422 UNKNOWN_REFERENCE` | RN-07.4 |
| PF-07.23 | Asignar `asesor` sin código o sin país; vaciar el país de un asesor | `422 CRM_PROFILE_INCOMPLETE` | AC-07.5 |
| PF-07.24 | Suspenderse a sí mismo; dejar el sistema sin administrador | `409 SELF_LOCKOUT` / `LAST_ADMIN` | RN-07.7 |
| PF-07.25 | No administrador cambia permisos o ámbito de un rol | `403 ADMIN_ONLY` | AC-07.14 |
| PF-07.26 | Cambiar permisos de un rol de sistema | `409 SYSTEM_RESOURCE_READ_ONLY` | AC-07.16 |
| PF-07.27 | Llamar endpoints sin permiso con el botón oculto | `403` | AC-07.17 |
| PF-07.28 | Etiqueta duplicada en catálogo (incluido inactivo) | `409` `label` | AC-07.20 |
| PF-07.29 | Romper cada invariante de 00 §3.3 (una prueba por invariante) | `409 CATALOG_INVARIANT` | AC-07.21 |
| PF-07.30 | Crear/desactivar en conjunto cerrado | `409` `closed_set` | AC-07.22 |
| PF-07.31 | `metadata` inválido por tipo y por clave obligatoria ausente | `422 INVALID_CATALOG_METADATA` | AC-07.23 |
| PF-07.32 | Desactivar un código referenciado por parámetro | `409` `referenced_by_parameter` | AC-07.24 |
| PF-07.33 | Borrar catálogo `crm.*` | `409 SYSTEM_RESOURCE_READ_ONLY` | AC-07.25 |
| PF-07.34 | Valores fuera de lista, rango o esquema; códigos inactivos en JSON | `422 INVALID_PARAMETER_VALUE` | AC-07.27, AC-07.29 |
| PF-07.35 | Editar estructural sin `parametros.configurar` | `403` | AC-07.30 |
| PF-07.36 | Regla de conversión duplicada, identidad desactivada, destino distinto de tonelaje, dimensión de unidad usada | `409` / `422` | AC-07.32 |
| PF-07.37 | `UPDATE`/`DELETE`/`TRUNCATE` sobre `audit_logs` dentro de retención desde la conexión de la aplicación | Error de la base | AC-07.37 |
| PF-07.38 | `PATCH`/`DELETE /audit-logs/{id}` | `404` | AC-07.37 |
| PF-07.39 | `401` y `403` en cada endpoint nuevo o cambiado (`/users` con filtros, `/users/{id}/teams`, `/parameters/authentication`, maestros, `/audit-logs?field=`) | `401` / `403` | AC-07.10, AC-07.39 |

### Integración entre módulos

| ID | Caso | Nivel |
|---|---|---|
| PF-07.40 | Un valor desactivado en `crm.estado_cliente` deja de ofrecerse en el formulario de Clientes y un cliente que lo tiene sigue editándose sin cambiarlo | Integración (con Módulo 2) |
| PF-07.41 | Cambiar `crm.alertas.proyecto_sin_actualizar_dias` cambia el recuento de alertas en Inicio sin reiniciar | Integración (con Módulo 1) |
| PF-07.42 | Un parámetro ilegible inyectado en la base: el lector usa el defecto y registra aviso | Integración |
| PF-07.43 | Cambiar el país de un responsable de país cambia los clientes que ve (alcance `COUNTRY`) | Integración (con Módulo 2) |
| PF-07.44 | Mutación de un contacto: evento `crm.contact.updated` con PII enmascarada visible en la vista por campo | Integración (con Módulo 2) |
| PF-07.45 | E2E: administrador crea un asesor con código y país, le asigna equipo y rol `asesor`; el asesor entra y su menú muestra solo las opciones comerciales concedidas; se suspende y no puede entrar | Playwright |
| PF-07.46 | E2E: administrador desactiva un valor de catálogo y lo ve ausente en un formulario comercial; la auditoría muestra el cambio por campo | Playwright |

---

## K. Dependencias y orden

**Este módulo se implementa al final** (alcance §9, §11). Pero sus **tablas, semillas y
protecciones** existen desde la Fase 0, y varias capacidades administrativas se
necesitan antes. Regla aplicada: *la protección viaja con los datos; las pantallas y
mejoras de experiencia, al final* (D-07.6).

### K.1 Necesario antes del Módulo 7 y cómo se cubre

| Capacidad | Cuándo se necesita | Cobertura |
|---|---|---|
| Roles `asesor`/`manager`/`responsable-pais`, 41 permisos, acciones `cerrar`/`administrar` | Fase 0 | Semilla esencial (`access-catalog.ts`, 00 §8.2) |
| `DataScope.COUNTRY` (backend, DTO, `roles-format.ts`, `access.types.ts`, `HomePage.tsx`) | Fase 0 (migración 1) | Cambio de contrato y de etiquetas **en la Fase 0**, no en este módulo: el enum no puede quedar a medias |
| `users.employee_code`/`country_id` con datos | Desde Clientes (alcance `COUNTRY`, responsable) | Semilla de demostración (`DEMO-E…`) en desarrollo; script versionado para usuarios reales. Si hay un **lanzamiento productivo antes del Módulo 7**, se adelanta la parte de usuarios de F.1/E.1 (es extensión de una pantalla existente) |
| Catálogos `crm.*` y su registro de semántica con invariantes | Fase 0 | La pantalla genérica de catálogos **ya está en producción**: sin el registro, un administrador podría romper `crm.etapa_oportunidad` el día que se siembra. El registro se entrega con la semilla |
| Parámetros `crm.*` y su registro de validación; `SystemParameterReader` | Fase 0 | Igual: la pantalla de parámetros ya los mostraría editables |
| `CatalogReferenceValidator`, `CatalogLookupService` | Antes de Clientes | Fase 0 (00 §11) |
| Pertenencia a equipos exclusiva del administrador | Antes de Clientes (bloqueante, DM-12) | Addendum ADR-020 + guarda en `teams.service.ts` |
| Enmascarado de PII en auditoría | Antes de Clientes (contactos) | DM-29 en `audit-diff.ts`/`audit.service.ts` |
| Países | Fase 0 | Semilla (`crm-masters.ts`), sin pantalla (D-07.13) |
| Unidades, reglas genéricas de conversión | Fase 0 | Semilla; familias/productos/reglas de negocio por script hasta las pantallas de E.5 (DM-23, DM-24) |
| Opciones de menú del CRM | Con cada módulo | DM-32 |

### K.2 Lo que entrega el Módulo 7 (al final)

1. Usuarios: campos, filtros, columnas, panel de equipos, reglas D-07.2/D-07.3 (si no se adelantaron).
2. Roles: columnas y etiquetas de la matriz; decisión D-07.1 aplicada.
3. Catálogos: formulario de `metadata`, mensajes de invariantes, unicidad de etiqueta.
4. Parámetros: metadatos de presentación, editores estructurados, tarjeta de autenticación.
5. Maestros comerciales (E.5, F.7).
6. Auditoría: filtro y vista por campo, exportación por campo, disparadores de inmutabilidad.
7. Documentación y E2E.

### K.3 Dependencias futuras

Los módulos posteriores no dependen de las pantallas del Módulo 7, solo de los datos.
Si se habilita Entra ID (ADR-019), la tarjeta de autenticación mostrará `entra` sin
cambios y los parámetros de login local se indicarán como no aplicables.

---

## L. Archivos de código

### Backend — modificar

| Archivo | Cambio |
|---|---|
| `backend/src/modules/access/dto/user.dto.ts` | `employeeCode`, `countryId` en alta/edición; `employeeCode`, `country` en respuestas; filtro `countryId`; `COUNTRY` |
| `backend/src/modules/access/users.service.ts` | Unicidad de código, país solo administrador, perfil comercial, auditoría ampliada, columnas de exportación |
| `backend/src/modules/access/users.controller.ts` | Query y OpenAPI de los cambios |
| `backend/src/modules/access/ports/access.repository.port.ts` | Campos y filtro nuevos; `findUserByEmployeeCode` |
| `backend/src/infrastructure/database/prisma/repositories/prisma-access.repository.ts` | Implementación |
| `backend/src/modules/access/access.service.ts`, `dto/role.dto.ts`, `dto/profile.dto.ts`, `access-rules.ts` | `COUNTRY` (Fase 0, DM-10) |
| `backend/src/modules/teams/teams.service.ts`, `teams.module.ts` | Reemplazo de equipos de un usuario; `ADMIN_ONLY` si DM-12 |
| `backend/src/modules/teams/ports/teams.repository.port.ts`, `.../prisma-teams.repository.ts` | Método por usuario |
| `backend/src/modules/catalogs/catalogs.service.ts` | Registro de semántica, invariantes, conjunto cerrado, unicidad de etiqueta, referencias desde parámetros |
| `backend/src/modules/catalogs/dto/catalog.dto.ts` | `metadataSchema`, `closedSet` |
| `backend/src/modules/catalogs/ports/catalogs.repository.port.ts`, `.../prisma-catalogs.repository.ts` | `existsItemLabel` normalizada, lectura por `key` |
| `backend/src/modules/parameters/parameter-value.ts` | Delegar en el registro de reglas (conserva `PARAMETER_RANGES`) |
| `backend/src/modules/parameters/parameters.service.ts` | Validación con referencias, `requiresConfigure` |
| `backend/src/modules/parameters/parameters.controller.ts`, `dto/parameter.dto.ts` | `GET /parameters/authentication`; metadatos de presentación |
| `backend/src/modules/audit/audit-diff.ts`, `audit.service.ts` | Enmascarado (DM-29) |
| `backend/src/modules/audit/audit-filter.ts`, `dto/audit-log.dto.ts`, `audit-logs.controller.ts`, `audit-query.service.ts`, `ports/audit-query.repository.port.ts`, `.../prisma-audit.repository.ts` | Filtro `field`, `layout=fields` |
| `backend/src/modules/access/app-routes.registry.json` | `/administracion/productos`, `/administracion/conversiones` |
| `backend/prisma/seed/access-catalog.ts` | Acciones, roles comerciales, opciones `admin-productos`/`admin-conversiones` (Fase 0 salvo las opciones) |

### Backend — nuevos

| Archivo | Contenido |
|---|---|
| `backend/src/modules/catalogs/catalog-semantics.registry.ts` (+ `.spec.ts`) | Esquemas e invariantes por `key` (00 §3.3) — Fase 0 |
| `backend/src/modules/catalogs/catalog-lookup.service.ts` (+ `.spec.ts`) | Lectura de activos por `key` para los módulos — Fase 0 |
| `backend/src/modules/parameters/parameter-rules.registry.ts` (+ `.spec.ts`) | Reglas por clave con `zod` (dependencia ya presente en `env.schema.ts`): rangos, valores, esquemas JSON, referencias, `requiresConfigure`, `editor` — Fase 0 |
| `backend/src/modules/parameters/ports/system-parameter-reader.port.ts` + adaptador | Lector tipado con defecto — Fase 0 |
| `backend/src/modules/access/crm-profile.ts` (+ `.spec.ts`) | Regla pura de perfil comercial (D-07.3) |
| `backend/src/modules/teams/user-teams.controller.ts` | `PUT /users/{id}/teams` |
| `backend/src/modules/crm-masters/` (`crm-masters.module.ts`, `product-families.controller.ts`, `products.controller.ts`, `units-of-measure.controller.ts`, `unit-conversion-rules.controller.ts`, servicios, `dto/`, `ports/`, specs) | F.7. Si 03 crea antes el puerto de lectura de productos, se reutiliza |
| `backend/src/infrastructure/database/prisma/repositories/prisma-crm-masters.repository.ts` | Adaptador |
| `backend/prisma/migrations/<ts>_audit_logs_append_only/migration.sql` + `backend/prisma/rollbacks/<ts>_audit_logs_append_only.down.sql` | D-07.11 |

### Frontend — modificar

| Archivo | Cambio |
|---|---|
| `frontend/src/features/admin/users/{UsersPage.tsx, users.api.ts, users.schemas.ts, users-format.ts, users.queries.ts}` | Campos, columnas, filtro, estados |
| `frontend/src/features/admin/users/components/{UserFormDialog.tsx, UserDetailDialog.tsx}` | Código, país, panel de equipos |
| `frontend/src/features/admin/roles/{roles-format.ts, roles.api.ts}`, `components/{RoleDetailDialog.tsx, RoleFormDialog.tsx}` | `COUNTRY`, `cerrar`, `administrar`, etiquetas de módulo |
| `frontend/src/services/access/access.types.ts`, `frontend/src/routes/pages/HomePage.tsx` | `COUNTRY` (Fase 0) |
| `frontend/src/features/admin/catalogs/{CatalogsPage.tsx, catalogs.api.ts, catalogs.errors.ts}`, `components/{CatalogDetailDialog.tsx, CatalogItemForm.tsx}` | Formulario de semántica, errores, conjunto cerrado |
| `frontend/src/features/admin/parameters/{ParametersPage.tsx, parameters.api.ts, parameters.schemas.ts}`, `components/ParameterEditDialog.tsx` | Grupos, selectores, editores |
| `frontend/src/features/admin/audit/{AuditPage.tsx, audit.api.ts, audit-format.ts}`, `components/AuditFilters.tsx` | Entidad, campo, vista por campo |
| `frontend/src/features/admin/admin-routes.ts`, `frontend/src/routes/route-paths.ts` | Rutas nuevas |
| `frontend/src/features/admin/common/admin-api.ts` | Mensajes de los códigos nuevos |

### Frontend — nuevos

| Archivo | Contenido |
|---|---|
| `frontend/src/features/admin/users/components/UserTeamsPanel.tsx` (+ spec) | Equipos del usuario |
| `frontend/src/features/admin/parameters/components/AuthenticationSettingsCard.tsx` (+ spec) | Solo lectura |
| `frontend/src/features/admin/parameters/components/editors/{RequiredFieldsEditor, CatalogDefaultsEditor, StageTransitionsEditor, PriorityMapEditor, ProgressRulesEditor}.tsx` | Editores estructurados |
| `frontend/src/features/admin/products/` (`ProductsPage.tsx`, `products.api.ts`, `products.queries.ts`, `products.schemas.ts`, `products.permissions.ts`, `components/…`, specs) | E.5 |
| `frontend/src/features/admin/conversions/` (misma estructura) | E.5 |

### Pruebas

- Backend unitarias: `*.spec.ts` junto a cada archivo citado.
- Integración: `backend/test/{access-users, access-roles, catalogs, parameters, audit, teams}.e2e.spec.ts` (ampliar) y `backend/test/crm-masters.e2e.spec.ts`, `backend/test/audit-immutability.e2e.spec.ts` (nuevos).
- Frontend: specs RTL de las pantallas citadas; `src/routes/route-registry.spec.ts` (rutas nuevas).
- E2E: `frontend/tests/e2e/admin-crm.spec.ts` (PF-07.45, PF-07.46).

### Documentación

`docs/api/README.md` (endpoints y códigos), addendum a ADR-018 (DM-10) y a ADR-020
(D-07.2, DM-12), `docs/database/data-model.md` (disparadores de auditoría, columnas de
usuario), `docs/deployment/environments.md` (`REVOKE` sobre `audit_logs`),
`frontend/src/features/admin/README.md` (áreas nuevas), skill `access-management`
(acciones nuevas), CHANGELOG, y esta especificación y la matriz al cerrar.

---

## Decisiones pendientes del módulo

Se reutilizan de 00: **DM-6** (transiciones), **DM-7** (umbrales), **DM-10**
(`COUNTRY`), **DM-11** (roles), **DM-12** (equipos y ADR-020, bloqueante antes de
Clientes), **DM-14** (un país por usuario), **DM-23** (productos), **DM-24**
(conversiones), **DM-29** (PII en auditoría), **DM-30** (obligatoriedad de código y
país, refinada por D-07.3), **DM-32** (menú), **DM-34** (`editar` vs `administrar`).

| # | Pregunta | Recomendación por defecto | Impacto si cambia |
|---|---|---|---|
| **D-07.1** | ¿Los roles `asesor`, `manager` y `responsable-pais` son de sistema? Con `isSystem` (00 §4.4) su matriz es de solo lectura (D1) y el alcance §9.2 pide "asignar permisos por módulo y operación" | Sembrarlos con `isSystem = false` y **solo en el alta** (la semilla no repone sus asignaciones), para que el administrador ajuste la matriz. Es seguro porque todos los permisos del CRM se siembran en la Fase 0 (DM-32): no aparecerán permisos nuevos que haya que repartir después. **Requiere enmendar 00 §4.4**; mientras no se enmiende rige 00 y la personalización se hace con "Duplicar" | Con `isSystem = true`: la matriz de los iniciales solo cambia por semilla; los administradores trabajan con copias |
| **D-07.2** | ¿Cambiar el país de un usuario es "asignar acceso"? | Sí: exclusivo del administrador (addendum a ADR-020, junto con DM-12), porque con `COUNTRY` cambia lo que ve | Si no, el gestor de accesos podría ampliar la visibilidad de un responsable de país |
| **D-07.3** | ¿Cuándo se exigen código de colaborador y país? (refina DM-30) | A todo usuario con un **rol comercial** = rol vigente que concede algún permiso de recursos del CRM (00 §5.2), excepto `administrador`. Se comprueba al asignar roles, en el alta con roles y al editar (no se pueden vaciar) | Si se exige a todos, hay que rellenar los usuarios existentes y el administrador sembrado |
| **D-07.4** | ¿Cómo se asigna equipo desde Usuarios sin duplicar Equipos? | `PUT /users/{id}/teams` servido por el módulo `teams` con las mismas reglas y eventos | Alternativa: solo desde Equipos (el alcance §9.1 pide "asignar equipo" en usuarios) |
| **D-07.5** | ¿Qué es "duplicado" en un catálogo? | Mismo `code` (existe) o misma etiqueta normalizada, contando inactivos | Si se permite la misma etiqueta, solo `code` protege; el formulario mostraría opciones iguales |
| **D-07.6** | ¿Cuándo se entregan las protecciones de catálogos y parámetros, si las pantallas ya existen? | Con la semilla en la Fase 0 (registro de semántica, reglas de parámetros, bloqueo de desactivación de códigos referenciados). Las mejoras de pantalla, al final | Si se esperan al final, durante las fases 1–6 un administrador puede romper invariantes desde las pantallas ya publicadas |
| **D-07.7** | ¿Cómo se validan los parámetros JSON y de lista? | Registro por clave con `zod` (ya dependencia del backend), referencias a catálogos validadas en el servicio, `requiresConfigure` para los estructurales (RN-07.32) | Sin registro, un valor mal formado rompe al módulo que lo lee |
| **D-07.8** | "Tipo de autenticación o ingreso permitido" | Solo lectura desde `AUTH_PROVIDER` (`GET /parameters/authentication`); la configuración funcional de login son los `seguridad.*` existentes. Sin parámetro editable (00 C6, ADR-019) | Hacerlo editable sería un sistema paralelo prohibido por §9.4 y requeriría ADR |
| **D-07.9** | ¿Dónde se mantienen conversiones, unidades, familias y productos? | Pantallas de Administración "Productos y unidades" y "Conversiones" sobre las tablas de 00 §2.3, con `productos.ver`/`productos.configurar` (reutiliza DM-23/DM-24). Destino fijo: unidad de tonelaje | Si se cargan solo por script, el alcance "conversiones y estimaciones comerciales" quedaría sin mantenimiento |
| **D-07.10** | Vista de auditoría por campo | Presentación de `changes` + filtro `field` en `GET /audit-logs` y `layout=fields` en la exportación; sin tabla nueva | Una tabla por campo duplicaría la bitácora y su retención |
| **D-07.11** | ¿Cómo se garantiza en la base que la auditoría no se modifica ni se borra? | Disparadores: `BEFORE UPDATE` y `BEFORE TRUNCATE` siempre rechazan; `BEFORE DELETE` rechaza filas con `occurred_at` dentro de `auditoria.dias_retencion` (la futura purga sigue siendo posible). Además `REVOKE UPDATE, DELETE` al rol de la aplicación como recomendación de despliegue | Sin ello, la restricción depende solo del código. Un `REVOKE` total sin disparador impediría la purga desde la aplicación |
| **D-07.12** | ¿Cómo leen los formularios comerciales catálogos, países, usuarios y parámetros si `/catalogs`, `/users` y `/parameters` exigen permisos de administración? | Cada módulo expone sus opciones de formulario bajo su propio permiso (p. ej. `clientes.ver`), implementadas con `CatalogLookupService`/`SystemParameterReader` compartidos. Los endpoints de administración no se abren. Si la Fase 0 o el Módulo 2 ya fijan otro mecanismo, prevalece el suyo | Un endpoint genérico de consulta exigiría `@AuthenticatedOnly` (hoy reservado a `/me`) o un guard "cualquiera de" (addendum a ADR-008) |
| **D-07.13** | ¿Mantenimiento de países? | No en este alcance: semilla esencial (DM-2); el usuario solo los selecciona | Añadir pantalla es aditivo (tabla ya existe) |
| **D-07.14** | ¿Desactivar un asesor con registros abiertos se bloquea o reasigna? | No bloquea ni reasigna; los registros conservan al responsable y se reasignan en cada módulo con `administrar` | Bloquear exigiría que Administración consulte a todos los módulos |

---

## Filas para la matriz

| ID | Módulo | Funcionalidad | Alcance | Especificación | Entidades | Dependencias | Criterios | Pruebas | Estado | Decisión pendiente |
|---|---|---|---|---|---|---|---|---|---|---|
| F-43 | 7 Administración | Usuarios | §9.1 | [07](07-administracion.md) | `users` (+`employee_code`, `country_id`), `countries`, `teams`, `team_members`, `user_roles`, `audit_logs` | Fase 0 (migración 2, semilla de países); PLAN-ADMIN usuarios; ADR-020 | AC-07.1–AC-07.10 | PF-07.1–PF-07.5, PF-07.19–PF-07.24, PF-07.39, PF-07.43, PF-07.45 | especificada | DM-12, DM-14, DM-30, D-07.2, D-07.3, D-07.4, D-07.14 |
| F-44 | 7 Administración | Roles y permisos | §9.2 | [07](07-administracion.md) | `roles`, `permissions`, `role_permissions`, `role_menu_options`, enum `data_scope` | Fase 0 (migración 1, semilla de roles/permisos); PLAN-ADMIN roles; ADR-018, ADR-020 | AC-07.11–AC-07.17 | PF-07.6–PF-07.9, PF-07.25–PF-07.27, PF-07.45 | especificada | DM-10, DM-11, DM-32, DM-34, D-07.1 |
| F-45 | 7 Administración | Catálogos | §9.3 | [07](07-administracion.md) | `catalogs`, `catalog_items` (17 `crm.*`), `system_parameters` (referencias) | Fase 0 (semilla, registro de semántica); PLAN-ADMIN catálogos | AC-07.18–AC-07.25 | PF-07.10, PF-07.11, PF-07.28–PF-07.33, PF-07.40, PF-07.46 | especificada | D-07.5, D-07.6, D-07.12 |
| F-46 | 7 Administración | Parámetros generales | §9.4 | [07](07-administracion.md) | `system_parameters` (`crm.*`, `seguridad.*`), `units_of_measure`, `product_families`, `products`, `unit_conversion_rules` | Fase 0 (semilla de parámetros y maestros); PLAN-ADMIN parámetros; ADR-019 | AC-07.26–AC-07.33 | PF-07.12–PF-07.16, PF-07.34–PF-07.36, PF-07.41, PF-07.42 | especificada | DM-6, DM-7, DM-23, DM-24, D-07.7, D-07.8, D-07.9 |
| F-47 | 7 Administración | Auditoría e historial de cambios | §9.5 | [07](07-administracion.md) | `audit_logs` | PLAN-ADMIN auditoría; eventos emitidos por los módulos 2–6 | AC-07.34–AC-07.39 | PF-07.17, PF-07.18, PF-07.37–PF-07.39, PF-07.44, PF-07.46 | especificada | DM-29, D-07.10, D-07.11 |
