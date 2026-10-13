# CRM comercial — convenciones del frontend

Pantallas del CRM ([planes por módulo](../../../../docs/implementation-plans/crm/)). Mismo
espíritu que [`features/admin/README.md`](../admin/README.md): cada submódulo tiene su carpeta
y nadie toca archivos de otro submódulo para construir el suyo.

## 1. Estructura: una carpeta por submódulo

```text
features/crm/
  crm-routes.ts            ruta + permiso + página lazy de cada pantalla del CRM
  common/                  piezas propias del CRM compartidas por varios submódulos
  customers/               Módulo 2 (Clientes): CustomersPage.tsx, customers.api.ts, …, components/, index.ts
  commercial-activity/     Módulo 4 (Actividad comercial): common/, activities/, pending/, visits/, agenda/,
                           follow-up/, interactions/, entry-points/ (barril para 02/03)
  projects/                (llega con el Módulo 3)
```

| Pantalla | Carpeta | Ruta | Permiso de la ruta | ¿Opción de menú? |
|---|---|---|---|---|
| Búsqueda de clientes | `customers/` | `/clientes` | `clientes.ver` | Sí: `clientes-buscar` |
| Alta de cliente | `customers/` | `/clientes/nuevo` | `clientes.crear` | No (botón "Nuevo cliente") |
| Ficha del cliente | `customers/` | `/clientes/:customerId` | `clientes.ver` | No (ruta con parámetro, D-02.12) |
| Bandeja de pendientes | `commercial-activity/pending/` | `/actividad/pendientes` | `actividades.ver` | Sí: `actividad-pendientes` |
| Listado de actividades | `commercial-activity/activities/` | `/actividad/actividades` | `actividades.ver` | Sí: `actividad-actividades` |
| Alta de actividad | `commercial-activity/activities/` | `/actividad/actividades/nueva` | `actividades.crear` | No (preselección `?customerId=&projectId=&opportunityId=&typeId=`) |
| Detalle y edición de actividad | `commercial-activity/activities/` | `/actividad/actividades/:activityId` | `actividades.ver` | No (ruta con parámetro, D-04.13) |
| Agenda (calendario y listado) | `commercial-activity/agenda/` | `/actividad/agenda` | `actividades.ver` | Sí: `actividad-agenda` |
| Seguimiento comercial | `commercial-activity/follow-up/` | `/actividad/seguimiento` | `actividades.ver` | Sí: `actividad-seguimiento` |
| Historial de interacciones | `commercial-activity/interactions/` | `/actividad/historial` | `actividades.ver` | Sí: `actividad-historial` (acepta `?customerId=&projectId=&opportunityId=`) |
| Listado de visitas | `commercial-activity/visits/` | `/actividad/visitas` | `visitas.ver` | Sí: `actividad-visitas` |
| Planificar visita | `commercial-activity/visits/` | `/actividad/visitas/nueva` | `visitas.crear` | No (preselección `?customerId=&projectId=`) |
| Detalle de visita | `commercial-activity/visits/` | `/actividad/visitas/:visitId` | `visitas.ver` | No (ruta con parámetro, D-04.13) |

Las rutas de Actividad comercial viven en `commercial-activity/commercial-activity-routes.ts`
(agregadas en `crm-routes.ts`); todas las pantallas de 04 §E.1 están entregadas (ya no hay
marcador provisional).

- La página (`<Pantalla>Page.tsx`) conserva su **export con nombre**: `crm-routes.ts` la carga con
  `React.lazy` por ese nombre.
- Lo que sólo usa un submódulo vive en su carpeta. Un submódulo **no importa** de otro salvo por
  su barril público (`customers/index.ts`: p. ej. `CustomerPicker` para Proyectos y Actividad).
  Si algo hace falta en dos, se propone para `crm/common/`.
- El CRM **no importa** de `features/admin`. Lo genérico vive fuera de las áreas (D-02.11):

  | Pieza | Dónde |
  |---|---|
  | `DataTable`, `ConfirmDialog`, `ListToolbar`/`FilterChips`, `EmptyState`, `FormSection`/`DetailList`, `EntityDialog`/`DialogFooter`/`RequiredNote`, `EntityDrawer`, `useTableQueryState` | `@/components/data` |
  | `describeApiError`, `ApiErrorView` | `@/lib/api-error-view` |
  | `createScopedQueryKeys`, `ListQuery` | `@/lib/query-keys` |
  | `saveFile` | `@/lib/save-file` |
  | `PaginatedResponse<T>` | `@/types/api` |

## 2. API y estado de servidor

- `<submódulo>.api.ts`: funciones sobre `httpClient` (`@/services/api`). Nunca `fetch` ni
  `XMLHttpRequest` sueltos. Los tipos reflejan los DTO del plan (§F), no el modelo de Prisma.
- Subidas con progreso: `httpClient.upload(path, formData, { onProgress })` (mismo token,
  renovación y errores que el resto). Descargas: `httpClient.download` + `saveFile`; nunca un
  `<a href>` a la API (el token vive en memoria) ni abrir el archivo en línea (ADR-021).
- `<submódulo>.queries.ts`: hooks de TanStack Query con claves bajo `['crm', <área>]`:

  ```ts
  export const customerKeys = createScopedQueryKeys('crm', 'customers');
  // Tras una mutación: queryClient.invalidateQueries({ queryKey: customerKeys.all })
  ```

- Errores: `describeApiError(error, CUSTOMER_ERROR_MESSAGES)`. Los mensajes de los códigos del
  submódulo (plan §L.7) van en `<submódulo>.errors.ts` y se pasan como `overrides`. **Nunca** se
  muestra `error.message` del backend. Los errores por campo (`400 VALIDATION_FAILED` con
  `details[].field`, `422` de negocio) se pintan bajo su campo.

## 3. Piezas de `crm/common`

| Pieza | Uso |
|---|---|
| `useModuleAvailability(CRM_MODULE_OPTION_KEYS.projects)` | D-02.10: un módulo existe para el usuario si su opción está en `GET /me/menu`. Mientras devuelve `loading` no se llama a la API del otro módulo; con `unavailable` se muestra el estado informativo. Nunca se sondea la API del otro módulo para saberlo |
| `PossibleDuplicateDialog` + `parseDuplicateCandidates(error.details)` | `409 POSSIBLE_DUPLICATE` de clientes y contactos: "Revisar" o "Guardar de todos modos" → la pantalla reenvía con `acknowledgedDuplicateIds`. Con `DUPLICATE_BLOCKED` se usa `blocked` (sin confirmación). `isDuplicateError(error)` decide si abrirlo |
| `AttachmentsSection basePath="/customers/{id}/attachments"` | Lista, subida con progreso, descarga y eliminación de los adjuntos de cualquier dueño (cliente, proyecto, actividad). `canManage` sale de las `capabilities` del dueño y `limits` de su `form-options.attachments` |
| `crmBreadcrumbs({ label: 'Clientes', to: ROUTE_PATHS.crm.customers }, { label: 'Ficha' })` | Migas: Inicio › … |
| `AttachmentsSection takeInitialFiles` | Archivos elegidos en un formulario de alta que se suben en la ficha tras el `201` (D-02.15); progreso y errores `413`/`422` por archivo |
| `AttachmentsSection canDelete={false}` | Subir sin eliminar (adjuntos de un evento de visita, 04 §F.4) |
| `customers/index.ts` | Barril público para otros módulos: `CustomerPicker` (valor `{ id, crmCode, legalName, countryId }`; acepta `{ id }` preseleccionado) y `customerDetailPath(id)` |

### Piezas comunes de Actividad comercial (`commercial-activity/common/`)

Para las pantallas del Módulo 4 (actividades, visitas, agenda, seguimiento, historial). No se
importan desde otros submódulos: lo público para 02/03 está en `commercial-activity/entry-points`.

| Pieza | Uso |
|---|---|
| `commercial-activity.permissions.ts` | `ACTIVITY_PERMISSIONS`, `VISIT_PERMISSIONS` (`visitas.*`, `actividades.*`) |
| `commercial-activity.errors.ts` | `COMMERCIAL_ERROR_MESSAGES` (códigos de 04 §F.5), `commercialFieldErrors(error)` (`details[].field` → mensaje, `participants.0.contactId` → `participants`), `withReference`, `isNotFoundError` |
| `commercial-activity.api.ts` / `.queries.ts` | Tipos de los DTO compartidos (`StatusRef`, `AgendaItem`, `Interaction`, `FollowUpTrace`…), lookups (`owner-options`, cliente, contactos activos, proyectos y oportunidades del contrato de 03) y claves bajo `['crm', 'commercial-activity']` con `invalidateCommercialActivity` |
| `date-time.ts` | `formatDateTime`/`formatDate`/`formatTime` (zona del usuario, hoy la del navegador), `formatCalendarDate`, `todayInTimeZone`, `describeDue`, `toDateTimeLocalValue`/`fromDateTimeLocalValue`, `startOfDayIso`/`endOfDayIso` |
| `StatusChip` (`label`, `group`, `isRescheduled?`, `isUnregistered?`) | Estado con color + icono + texto (RN-04.35) |
| `DueBadge` (`dueAt`, `bucket`, `now?`) | Vencimiento: marca vencida/próxima, relativo y absoluto (RN-04.31) |
| `CustomerProjectFields` (`value`, `onChange(value, change)`, `withOpportunity?`, `customerReadOnly?`, `customerHelperText?`, `errors?`, `disabled?`) | Cliente → proyecto → oportunidad; cambiar de cliente limpia lo que depende; degrada sin el Módulo 3 |
| `useCommercialPreselection({ customerId, projectId, opportunityId })` | Resuelve la preselección de la URL: `{ isResolving, value, problems }` |
| `ParticipantsField` (`customerId`, `value`, `onChange`, `label?`, `required?`, `disabled?`, `error?`, `helperText?`) + `participants.ts` | Contactos (con `contactos.ver`), usuarios y externos; `toParticipantInputs`, `participantValuesFrom(dtos, role?)`, `withoutContacts` |
| `OwnerPicker` (`label`, `value`, `onChange`, `excludeIds?`…) | Usuarios de `owner-options` (responsable, asesor, participante) |
| `AttachmentsPanel` (`owner`, `canManage`, `limits?`, `title?`, `emptyMessage?`, `uploadPendingFromCreation?`) + `attachment-owner.ts` | Adjuntos de actividad, visita o evento (`commercialAttachmentsPath`, `stashPendingAttachments`/`takePendingAttachments`) |
| `FilesField` + `uploadFilesInOrder(basePath, files)` | Elegir archivos en un formulario o diálogo y subirlos en orden, parando en el primer fallo |
| `InteractionTimeline` (`customerId?`, `projectId?`, `opportunityId?`, `compact?`) / `InteractionTimelineList` (`items`, `hideCustomer?`, `hideProject?`) | Historial de interacciones agrupado por día con enlace al origen |
| `commercial-paths.ts` | `interactionHistoryPath`, `planVisitPath`, `visitDetailPath` |
| `CountrySelect` (`value`, `onChange`, `label?`, `disabled?`) + `useCountryOptions(enabled)` | Filtro "país del cliente" con los países de `GET /customers/form-options` (02 F2); sin `clientes.ver` no se ofrece |
| `AttachmentCount` (`count`) | Columna "Adjuntos": icono + número con nombre accesible ("3 adjuntos") |
| `NextActionDate` (`date`, `prefix?`, `today?`) | Fecha de próxima acción resaltada con color **y** texto ("(hoy)", "(pasada)") |

Opciones aditivas de `@/components/data` usadas por el CRM: `DataTable` `onRowClick` + `getRowLabel`
(fila navegable con teclado, `role="link"`) y `useTableQueryState({ paramPrefix })` para varias
tablas en la misma URL (p. ej. `contacts.`, `projects.`).

## 4. Menú, rutas y permisos

- El **menú no se declara aquí** (CLAUDE.md §8.11, ADR-018): sale de `GET /me/menu`. La opción
  `clientes-buscar` la crea la semilla (`backend/prisma/seed/crm-access.ts`) cuando la ruta está
  registrada (DM-32).
- Para añadir una pantalla navegable:
  1. `src/routes/route-paths.ts` → `ROUTE_PATHS.crm.<clave>`.
  2. `crm-routes.ts` → `path`, `permission` (el `requiredPermission` de su opción, o el de la
     operación si no tiene opción) y `Page` lazy.
  3. `backend/src/modules/access/app-routes.registry.json` → la misma ruta con su etiqueta
     (también las rutas con parámetro, D-02.12). `route-registry.spec.ts` falla si no coinciden.
  4. Si tiene opción de menú, se siembra con la ruta (skill `access-management`).
- Las acciones se ocultan con `useCan()`/`usePermission()` o, mejor, con las `capabilities` que
  devuelve el recurso (las calcula el backend con la misma política que aplica). Ocultar es
  experiencia de usuario, **no** seguridad. Las constantes de permisos van en
  `<submódulo>.permissions.ts` con los nombres exactos del catálogo sembrado.

## 5. Formularios, listas y diseño

- React Hook Form + Zod (`<submódulo>.schemas.ts`); la validación del cliente es de UX y el
  backend valida de nuevo. Las listas de valores (países, catálogos, responsables) salen siempre
  de la API (`form-options`), nunca de constantes del frontend.
- Listas: como en `features/admin/README.md` §3 (`useTableQueryState` + `DataTable`, estado en la
  URL). Si una pantalla tiene varias listas en la URL, cada sección usa su prefijo (p. ej.
  `projects.` en la ficha del cliente).
- Nada de hex, duraciones ni píxeles a mano (CLAUDE.md §8.12): tema y `theme/tokens.ts`.
  Encabezado con `PageHeader`; mobile-first (tabla → tarjetas por debajo de `md`).
- Cuatro estados por pantalla y por sección: cargando, vacío, error (con "Reintentar") y sin
  permiso. Un error en una sección de la ficha no rompe el resto.

## 6. Pruebas

- Vitest + React Testing Library por comportamiento (`renderWithProviders`; `mockApi` para
  `fetch` y `mockUpload` para las subidas, de `@/test/api-mocks`).
- Mínimo por pantalla: estados, mapeo de errores, acciones ocultas sin permiso y, en formularios,
  errores por campo. Recorridos críticos en Playwright (`frontend/tests/e2e`).
