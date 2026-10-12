# Modelo de datos — núcleo de gestión y CRM comercial

Esquema con el que arranca cualquier proyecto derivado de la plantilla. Las
decisiones de fondo están en [ADR-018](../adr/ADR-018-identity-access-model.md)
(identidad y acceso), [ADR-003](../adr/ADR-003-postgresql-prisma.md)
(PostgreSQL + Prisma) y [ADR-004](../adr/ADR-004-data-access-abstraction.md)
(el dominio no depende de Prisma).

Fuente de verdad: `backend/prisma/schema.prisma`. Este documento explica el
porqué; el esquema manda sobre los detalles.

Dónde vive esta base en cada entorno, con qué usuario y con qué permisos:
[`docs/deployment/environments.md`](../deployment/environments.md).

---

## 1. Mapa general

```mermaid
erDiagram
    User ||--o{ UserIdentity : "entra por"
    User ||--o| UserCredential : "credencial local"
    User ||--o{ UserSession : "sesiones"
    User ||--o{ UserRole : "tiene"
    Role ||--o{ UserRole : "asignado a"
    Role ||--o{ RolePermission : "concede"
    Permission ||--o{ RolePermission : ""
    User ||--o{ UserPermission : "excepción directa"
    Permission ||--o{ UserPermission : ""
    AppModule ||--o{ MenuOption : "agrupa"
    MenuOption ||--o{ MenuOption : "jerarquía"
    MenuOption }o--o| Permission : "exige"
    Role ||--o{ RoleMenuOption : "concede opción"
    MenuOption ||--o{ RoleMenuOption : ""
    User ||--o{ UserMenuOption : "opción directa"
    MenuOption ||--o{ UserMenuOption : ""
    Team ||--o{ TeamMember : "miembros"
    User ||--o{ TeamMember : ""
    Team ||--o{ Team : "jerarquía"
```

---

## 2. Identidad

| Tabla | Para qué |
|---|---|
| `users` | La cuenta. **No guarda contraseñas** |
| `user_identities` | Vínculo con un proveedor (`LOCAL`, `ENTRA_ID`) por `subject` |
| `user_credentials` | Hash Argon2id, caducidad, intentos fallidos, bloqueo |
| `user_sessions` | Refresh token **hasheado**, con cadena de rotación |
| `login_attempts` | Intentos correctos y fallidos: fuerza bruta e incidentes |
| `password_reset_tokens` | Restablecimiento de un solo uso, también hasheado |

Decisiones que conviene no deshacer sin pensarlo:

- **Identidad separada de credencial.** La misma persona puede entrar hoy por
  credencial local y mañana por Entra ID sin duplicar cuenta ni perder
  asignaciones.
- **Nunca se guarda un token, sólo su hash.** Una fuga de base de datos no se
  convierte en suplantación de sesión.
- **`login_attempts.user_id` es nulo si el correo no existe.** La API no debe
  permitir averiguar qué cuentas existen.
- **`email_normalized`** guarda el correo en minúsculas con índice único: evita
  que `Ana@x.com` y `ana@x.com` sean dos cuentas.

---

## 3. Autorización

| Tabla | Para qué |
|---|---|
| `permissions` | Catálogo `recurso.accion` (`usuarios.crear`) |
| `roles` | Agrupación de permisos + alcance de datos |
| `role_permissions` | Qué concede cada rol |
| `user_roles` | Roles del usuario, con caducidad opcional |
| `user_permissions` | Excepción directa `GRANT`/`DENY`, con razón obligatoria |

### Resolución del acceso efectivo

```
permisos = (permisos de roles vigentes y activos)
         + (GRANT directos vigentes)
         - (DENY directos vigentes)
```

`DENY` gana siempre, incluso sobre un permiso heredado de un rol. Está
implementado en `AccessService.resolvePermissions`, que es una función pura y
está cubierta por pruebas unitarias sin base de datos.

### Alcance de datos

`Role.dataScope` ∈ `OWN | TEAM | COUNTRY | ORGANIZATION`. Declara **hasta
dónde ve** el usuario; no es un permiso. `/me` expone el alcance más amplio
entre sus roles (orden: `OWN` < `TEAM` < `COUNTRY` < `ORGANIZATION`).

`COUNTRY` se llamaba `TERRITORY` hasta la migración
`20261010100000_crm_data_scope_country` (`ALTER TYPE … RENAME VALUE`, addendum
de 2026-10-10 a ADR-018). Evalúa el país del usuario (`users.country_id`, un
país por usuario, DM-14). El valor forma parte del contrato público
(`dataScope` en `/me`, `/roles`, `/users`).

**Aplicarlo a las consultas es responsabilidad de cada caso de uso.** La
plantilla no puede filtrar entidades que todavía no existen; cuando un proyecto
cree su primera entidad con dueño, el filtro por alcance se implementa en su
repositorio y se prueba.

---

## 4. Módulos y opciones de menú

| Tabla | Para qué |
|---|---|
| `app_modules` | Primer nivel del menú (Inicio, Administración, y los del proyecto) |
| `menu_options` | La opción: clave, etiqueta, icono, ruta, orden, padre, permiso requerido |

> `menu_options.icon` guarda el nombre en snake_case de Material Symbols
> (`manage_accounts`). El frontend lo resuelve con el registro de
> `components/layout/MaterialSymbol.tsx`: un icono nuevo hay que darlo de alta
> ahí además de en la base de datos.
| `role_menu_options` | Opciones que concede un rol |
| `user_menu_options` | Asignación directa a una persona (`GRANT`/`DENY`) |

Reglas de visibilidad, en orden:

1. La opción debe estar activa y su módulo también.
2. Debe estar concedida (por rol o directamente) **o** ser `isPublic`.
3. Si declara `requiredPermission`, el usuario debe tenerlo.
4. Un nodo `GROUP` que se queda sin hijos visibles no se muestra.

Todo esto ocurre en el servidor (`GET /me/menu`). El frontend pinta lo que
recibe: por eso el menú no puede mostrar algo que el backend luego rechace.

**Para añadir una opción al menú no se toca el frontend:** se da de alta la
`MenuOption`, se asigna a un rol o a una persona, y se crea la ruta que
coincida con su `path`.

---

## 5. Organización

`teams` es jerárquico (`parent_id`) y tiene responsable (`manager_id`).
`team_members` permite pertenecer a varios equipos, con uno marcado como
principal para usarlo por defecto al crear registros.

El alcance `TEAM` debe incluir a los equipos descendientes: al implementarlo,
recorrer la jerarquía, no sólo el equipo directo.

---

## 6. Soporte transversal

| Tabla | Para qué | Nota |
|---|---|---|
| `system_parameters` | Configuración editable en caliente | **Nunca secretos**; van al almacén de secretos |
| `user_preferences` | Preferencias que siguen al usuario entre dispositivos | El tema del shell vive en `localStorage`; esto es para cuando eso no baste |
| `catalogs` / `catalog_items` | Listas cortas y estables (motivos, tipos) | Si necesita columnas propias, deja de ser catálogo |
| `sequences` | Folios (`COT-2026-00042`) | Asignar **en transacción con bloqueo de fila**, nunca con `MAX(n)+1` |
| `stored_files` | Metadatos de adjuntos | El binario vive en el almacenamiento de objetos |
| `notifications` | Avisos al usuario | |
| `approval_requests` / `approval_steps` | Aprobaciones genéricas en cadena | Guarda instantánea (`payload`) para que el historial no dependa del estado actual |
| `audit_logs` | Bitácora de seguridad y cambios | |

### Auditoría

`audit_logs.subject_id` es texto, no clave foránea: el registro debe sobrevivir
al borrado del usuario. `changes` guarda la diferencia
(`{campo: {antes, despues}}`), no una copia del registro, y **nunca** datos
sensibles ni contraseñas.

La retención está en `system_parameters` (`auditoria.dias_retencion`, 365 días
por defecto) y debe cuadrar con la política del proyecto
(`docs/security/retention.md`).

---

## 7. Convenciones del esquema

- Tablas en `snake_case` plural; columnas en `snake_case`.
- Claves primarias UUID.
- **Instantes** `timestamptz(6)`; **fechas de calendario** sin hora (fecha de
  oportunidad, inicio/fin estimados, fecha de decisión, siguiente acción,
  vigencia de un tipo de cambio) `date` (`@db.Date`, DM-31): un `timestamptz`
  las desplazaría de día según la zona horaria.
- Dinero `NUMERIC(19,4)` con su moneda; porcentajes `NUMERIC(5,2)` con CHECK
  0–100; cantidades y tonelajes `NUMERIC(19,4)`; factores de conversión y tipos
  de cambio `NUMERIC(19,8)`.
- Borrado lógico (`deleted_at`) en lo que necesita historial: usuarios, roles,
  equipos, opciones, archivos. Lo demás se borra de verdad.
- Trazabilidad con `created_at`, `updated_at`, `created_by_id`, `updated_by_id`.
- Índices nombrados explícitamente (`idx_tabla_columnas`, únicos `uq_tabla_columnas`).
- `CHECK` nombrados `ck_tabla_regla`, escritos a mano en la migración (Prisma
  no los expresa ni los detecta como deriva).
- **Sin índices únicos parciales** (`WHERE deleted_at IS NULL`): `migrate dev`
  los borraría como deriva. Se usan diseños estructurales (FK compuestas,
  columna `scope_key`).

---

## 8. Semilla

`backend/prisma/seed.ts` con el catálogo declarativo en
`prisma/seed/access-catalog.ts`. Es idempotente: se puede ejecutar cuantas veces
haga falta.

Crea 2 módulos, 30 permisos, 9 opciones de menú, 4 roles
(`administrador`, `gestor-accesos`, `auditor`, `usuario`), 6 parámetros del
sistema y el usuario administrador inicial.

Dos comportamientos a tener presentes:

- **Los valores de los parámetros no se pisan** al re-ejecutar: pueden haber
  sido ajustados por un administrador.
- **Las asignaciones de los roles de sistema sí se reponen enteras.** Si alguien
  le quitó un permiso al administrador, el seed lo devuelve. Un proyecto que
  necesite un administrador distinto crea su propio rol.

El administrador inicial nace en estado `INVITED` y **sin credencial
utilizable**: la plantilla no implementa el login local. Con Entra ID basta con
que exista la cuenta y su `UserIdentity`.

```bash
pnpm --filter @app/backend run prisma:migrate
pnpm --filter @app/backend run prisma:seed
# Correo configurable: SEED_ADMIN_EMAIL=ana@empresa.com pnpm … run prisma:seed
```

---

## 9. Lo que este esquema deliberadamente NO trae

- **Entidades de negocio genéricas.** Las aporta cada proyecto; las de este,
  en la §10 (CRM).
- **Multi-inquilino.** Si el producto lo necesita, es un ADR y afecta a casi
  todas las tablas: mejor decidirlo antes de la primera migración que después.
- **Versionado de registros.** `audit_logs` guarda quién cambió qué, no permite
  reconstruir un registro a una fecha.
- **ACL por registro.** El modelo actual no lo impide, pero tampoco lo
  implementa.

---

## 10. CRM comercial (Fase 0)

Contrato completo, con cada decisión y su porqué:
[`00-modelo-de-datos.md`](../implementation-plans/crm/00-modelo-de-datos.md)
(DM-1…DM-36 resueltas el 2026-10-10; ADR-021, ADR-024 y addendum de ADR-018).
Esta sección resume lo que hay en la base y cómo se protege. Los repositorios,
seeds y servicios del CRM llegan después; la Fase 0 solo crea el esquema.

### 10.1 Tablas

| Bloque | Tablas | Notas |
|---|---|---|
| Monedas y países | `currencies`, `exchange_rates`, `countries` | Moneda base USD (ADR-024). `currencies` usa el código ISO 4217 como PK. Una tasa por moneda y fecha de vigencia; el USD no tiene tasa |
| Usuarios (extensión) | `users.employee_code` (único), `users.country_id` | Ambos nulos en la base (DM-30). Defaults de usuarios **nuevos**: `es-GT` / `America/Guatemala` (DM-2) |
| Productos | `units_of_measure`, `product_families`, `products`, `unit_conversion_rules` | Regla única por (origen, destino, `scope_key`); `scope_key` = `GLOBAL` o el UUID del ámbito |
| Clientes | `customers`, `contacts` | Código de cliente único por país; **NIT sin único** (DM-4: establecimientos que comparten NIT) |
| Proyectos | `projects`, `project_phase_history`, `opportunities`, `opportunity_stage_history`, `opportunity_results`, `opportunity_result_history`, `project_products`, `forecast_lines` | Resultado 0..1 por oportunidad; forecast único por proyecto, producto, año y mes |
| Actividad comercial | `visits`, `visit_events`, `activities`, `interaction_participants` | Una visita es una fila toda su vida (sin `deleted_at`); `visit_events` es su historial |
| Soporte | `attachments`, `customer_imports`, `customer_import_rows`, `sales_targets` | `attachments` enlaza un `stored_files` con exactamente un dueño; `sales_targets` nace vacía (DM-9) |
| Vista | `crm_interactions_v` | `UNION ALL` de visitas y actividades no eliminadas, una fila por origen. Se lee con `$queryRaw` parametrizado |

Las FK hacia entidades comerciales son `Restrict` (nada comercial se borra
físicamente; borrado lógico con `deleted_at`). `created_by_id`/`updated_by_id`
son UUID sin FK, como en el núcleo.

### 10.2 Integridad en la base

- **FK compuestas "pertenece a"**: proyecto del cliente (`visits`, `activities`),
  oportunidad del proyecto (`project_products`, `activities`), contacto del
  cliente (`interaction_participants`, contacto principal), regla que convierte
  desde la unidad de la línea (`projects`, `project_products`, `forecast_lines`).
  Destinos: los únicos `uq_<tabla>_id_<columna>`.
- **Contacto principal** = `customers.primary_contact_id` con la FK compuesta
  circular `(primary_contact_id, id) → contacts(id, customer_id)`: como máximo
  uno (es una columna) y siempre de ese cliente. "Activo" lo garantiza el caso de uso.
- **Cambiar el cliente de un proyecto** con visitas, actividades o participantes
  falla por `ON UPDATE RESTRICT` de esas FK.
- **56 CHECK** `ck_<tabla>_<regla>` (lista completa en las migraciones
  `20261010100100…100600` y en 00 §2): rangos (porcentajes 0–100, mes 1–12,
  cantidades ≥ 0), coherencia (código ⇔ normalizado, tonelaje ⇔ regla, LOST ⇒
  motivo, PARTIAL ⇒ porcentaje, confirmar ⇒ realización previa y ser el dueño),
  "exactamente uno" (`num_nonnulls`: dueño de un adjunto, padre y sujeto de un
  participante, sujeto de una meta) y la estimación en moneda (monto, moneda,
  tasa y USD juntos; en USD tasa 1 y equivalente = monto).
- Lo que la base **no** puede comprobar y queda en los casos de uso: a qué
  catálogo pertenece un `*_id` hacia `catalog_items` (`CatalogReferenceValidator`,
  00 §3.5), que la regla aplicada convierta a la unidad de tonelaje configurada,
  las transiciones de etapa y la unicidad endurecida por parámetro.

Todo ello está probado contra PostgreSQL en `backend/test/crm-schema.e2e.spec.ts`.

### 10.3 Migraciones y reversibilidad

| Migración | Contenido |
|---|---|
| `20261010100000_crm_data_scope_country` | `RENAME VALUE 'TERRITORY' TO 'COUNTRY'` (única no aditiva; sin pérdida) |
| `20261010100100_crm_countries_users` | Monedas, tasas, países; columnas y defaults de `users` |
| `20261010100200_crm_products_units` | Unidades, familias, productos, reglas de conversión |
| `20261010100300_crm_customers_contacts` | Clientes, contactos y FK circular del contacto principal |
| `20261010100400_crm_projects_opportunities` | Proyectos, oportunidades, resultados, productos asociados, forecast |
| `20261010100500_crm_commercial_activity` | Visitas, eventos, actividades, participantes |
| `20261010100600_crm_attachments_imports_targets` | Adjuntos, importaciones, metas; FK `customers.source_import_id` |
| `20261010100700_crm_interactions_view` | Vista `crm_interactions_v` |

El SQL de tablas, índices y FK lo generó `prisma migrate diff`; los CHECK, la
vista y el `RENAME VALUE` se escribieron a mano. Prisma no genera *down*: cada
migración tiene su inverso en `backend/prisma/rollbacks/<migración>.down.sql`.

**Procedimiento de rollback** (desde `backend/`, con `DATABASE_URL` apuntando a
la base y esquema que se revierten; respaldo previo obligatorio si hay datos
reales, ver aviso abajo). Para revertir hasta la migración N, por cada
migración de la **más reciente a la N, en orden inverso** (vista primero,
`RENAME VALUE` al final):

```bash
# 1. Aplicar el script inverso
pnpm exec prisma db execute --file prisma/rollbacks/<migración>.down.sql --schema prisma/schema.prisma
# 2. Retirar la migración del historial de Prisma
pnpm exec prisma db execute --stdin --schema prisma/schema.prisma <<'SQL'
DELETE FROM "_prisma_migrations" WHERE migration_name = '<migración>';
SQL
```

Después se despliega el código anterior (DTOs y frontend incluidos: el enum
`data_scope` es parte del contrato). Un `prisma migrate deploy` posterior vuelve
a aplicar lo retirado.

> `prisma migrate resolve --rolled-back <migración>` **no sirve** aquí: solo
> acepta migraciones en estado *fallido* y, con una aplicada, responde `P3012`
> (comprobado con Prisma 6.19). Por eso el paso 2 borra la fila del historial.

Verificado por `backend/test/crm-rollbacks.e2e.spec.ts`: en un esquema propio
aplica las ocho, ejecuta los ocho `.down.sql` en orden inverso con
`prisma db execute`, retira sus filas y comprueba que no queda ninguna tabla ni
la vista del CRM, que `data_scope` vuelve a `TERRITORY` y que `users` pierde
`employee_code` y `country_id`; después `migrate deploy` las aplica de nuevo.

> **Revertir los pasos 2–8 borra datos comerciales.** Mientras no haya datos
> del CRM es inocuo; tras el primer uso real queda **prohibido sin respaldo
> previo** de la base y de `ATTACHMENTS_STORAGE_PATH`.

La migración 9 de 00 §9 (disparadores de inmutabilidad de `audit_logs`,
ADR-025) la entrega el Módulo 7, no la Fase 0.

### 10.4 Datos sensibles

`contacts` (nombre, cargo, teléfono, correo), `customers` (teléfono, correo) y
`customer_import_rows.raw_data` contienen datos personales de terceros:
no se registran en logs, se enmascaran en `audit_logs` (DM-29) y `raw_data` se
purga a los `crm.importaciones.dias_retencion_filas` días (90, DM-28).
