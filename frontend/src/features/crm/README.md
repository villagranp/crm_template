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
  projects/                Módulo 3 (Proyectos): búsqueda, alta, ficha, vista de equipo; index.ts
  opportunities/           Módulo 3: pipeline y detalle de oportunidades
  forecast/                Módulo 3: matriz del forecast M+6
  commercial-activity/     Módulo 4 (Actividad comercial): common/, activities/, pending/, visits/, agenda/,
                           follow-up/, interactions/, entry-points/ (barril para 02/03 y Reportes)
  reports/                 Módulo 5 (Reportes): common/, projects/, opportunities/, forecast/, visits/,
                           activities/ (dashboard y embudo: otra tanda), reports-routes.ts
```

| Pantalla | Carpeta | Ruta | Permiso de la ruta | ¿Opción de menú? |
|---|---|---|---|---|
| Búsqueda de clientes | `customers/` | `/clientes` | `clientes.ver` | Sí: `clientes-buscar` |
| Alta de cliente | `customers/` | `/clientes/nuevo` | `clientes.crear` | No (botón "Nuevo cliente") |
| Ficha del cliente | `customers/` | `/clientes/:customerId` | `clientes.ver` | No (ruta con parámetro, D-02.12) |
| Búsqueda de proyectos | `projects/` | `/proyectos` | `proyectos.ver` | Sí: `proyectos-buscar` |
| Alta de proyecto | `projects/` | `/proyectos/nuevo` | `proyectos.crear` | No (botón "Nuevo proyecto") |
| Ficha del proyecto | `projects/` | `/proyectos/:projectId` | `proyectos.ver` | No (ruta con parámetro, D-03.2) |
| Proyectos del equipo | `projects/` | `/proyectos/equipo` | `proyectos.ver` | Sí: `proyectos-equipo` |
| Pipeline de oportunidades | `opportunities/` | `/proyectos/oportunidades` | `oportunidades.ver` | Sí: `proyectos-oportunidades` |
| Detalle de oportunidad | `opportunities/` | `/proyectos/oportunidades/:opportunityId` | `oportunidades.ver` | No (ruta con parámetro; destino de alertas de Inicio) |
| Forecast M+6 | `forecast/` | `/proyectos/forecast` | `forecast.ver` | Sí: `proyectos-forecast` |
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
- Parámetros repetibles: una lista en `query` se envía como `id=a&id=b`
  (`httpClient.get(path, { query: { id: ['a', 'b'] } })`).
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
| `AttachmentsSection onChanged` / `formatDate` | Opciones aditivas: `onChanged` se llama tras cada subida o eliminación correcta (el dueño refresca sus contadores; Actividad comercial invalida la raíz del módulo); `formatDate` formatea la fecha de subida (p. ej. en la zona del usuario). Sin ellas, el comportamiento de Clientes no cambia |
| `customers/index.ts` | Barril público para otros módulos: `CustomerPicker` (valor `{ id, crmCode, legalName, countryId }`; acepta `{ id }` preseleccionado) y `customerDetailPath(id)` |
| `PendingPage` / `PendingScreen` | Página con título y migas definitivos y estado "En construcción": permite registrar la ruta y sembrar su opción antes de construir la pantalla (Módulo 3, etapa E1) |
| `decimal.ts` + `DecimalField` | Decimales sin `number` flotante (ver §3.1) |
| `invalidateCrmCaches(queryClient, ['forecast', 'opportunities', 'customerProjects', 'projectTeamLists'])` | Invalida cachés de otro submódulo que dependen de una mutación (p. ej. borrar un proyecto refresca el forecast y la ficha del cliente) sin importar sus claves y sin ciclos entre barriles. Raíces en `CRM_CACHE_ROOTS`; matriz en 03 "Revisión E5 — frontend" |
| `UnsavedChangesGuard when={dirty} shouldBlock?` | Aviso al abandonar una pantalla con cambios sin guardar: `beforeunload` y, con el router de datos de la aplicación, `useBlocker` con un diálogo propio ("Salir sin guardar" / "Seguir editando"). Por defecto solo bloquea cambios de ruta (los filtros en la URL no pierden el borrador). Bajo `MemoryRouter` (pruebas) solo protege `beforeunload` |
| `projects/index.ts` | Barril público del Módulo 3: constantes de permisos (`PROJECT_`, `OPPORTUNITY_`, `FORECAST_`, `PRODUCT_PERMISSIONS`), `projectDetailPath(id)`, `opportunityDetailPath(id)`, `ProjectPicker`, `OwnerPicker`, `ProductPicker`, `UnitSelect`, `ConversionBadge`, formatos de fecha (y `projectLabel`), `projectKeys`/`useInvalidateProject`, `useProject` (preselección del Módulo 4) y tipos |
| `opportunities/index.ts` | Barril de Oportunidades: `OpportunityPicker` (Módulo 4: `projectId`, `status="OPEN"`), `OpportunityFormDialog`, `StageChangeDialog`, `ResultEditDialog`, `OpportunityHistoryPanel`, `StageChip`, `OutcomeChip`, `EstimateText`, hooks de lectura y tipos |
| `forecast/index.ts` | Barril de Forecast: `ForecastMatrix filters={{ mode, projectId… }}` (la ficha la reutiliza filtrada por el proyecto) |

### Piezas comunes de Actividad comercial (`commercial-activity/common/`)

Para las pantallas del Módulo 4 (actividades, visitas, agenda, seguimiento, historial). No se
importan desde otros submódulos: lo público para 02/03 está en `commercial-activity/entry-points`.

| Pieza | Uso |
|---|---|
| `commercial-activity.permissions.ts` | `ACTIVITY_PERMISSIONS`, `VISIT_PERMISSIONS` (`visitas.*`, `actividades.*`) |
| `commercial-activity.errors.ts` | `COMMERCIAL_ERROR_MESSAGES` (códigos de 04 §F.5), `commercialFieldErrors(error)` (`details[].field` → mensaje, `participants.0.contactId` → `participants`), `withReference`, `isNotFoundError` |
| `commercial-activity.api.ts` / `.queries.ts` | Tipos de los DTO compartidos (`StatusRef`, `AgendaItem`, `Interaction`, `FollowUpTrace`, `CommercialFormContext`…), lookups (`owner-options`, cliente, contactos activos; proyectos y oportunidades se piden con los selectores y hooks de los barriles de 03), `withoutSearch(query)` (`/agenda`, `/interactions`, `/follow-ups` y los adjuntos no admiten `search`) y claves bajo `['crm', 'commercial-activity']` con `invalidateCommercialActivity` |
| `useOwnerNames(ids)` / `useOwnerName(id)` | Nombre de usuarios ya elegidos (filtro de asesor o usuario tras recargar) con `owner-options?id=` (repetible, máx. 50). Sólo devuelve los que están en el alcance y activos; si no vuelve, la pantalla muestra su respaldo ("Seleccionado") |
| `date-time.ts` | Todo con zona explícita (`timeZone` opcional; omitida = la del navegador): `formatDateTime`/`formatDate`/`formatTime`, `toDateTimeLocalValue`/`fromDateTimeLocalValue`/`nowDateTimeLocalValue`/`isFutureLocalValue` (desfase calculado con `Intl` en el propio instante, seguro ante cambios de horario), `startOfDayIso`/`endOfDayIso` (un día con cambio de horario dura 23 o 25 h), `dayKeyInTimeZone`, `todayInTimeZone`; además `formatCalendarDate` (sin zona), `describeDue`, `isValidTimeZone` |
| `useCommercialTimeZones()` + `formTimeZone(options)` | Zonas de RN-04.9 de los `form-options` del módulo (los de actividades con `actividades.ver`; si no, los de visitas): `timeZone` (perfil del usuario: instantes, entradas `datetime-local`, días de la agenda y del historial) y `businessTimeZone` (`crm.zona_horaria_negocio`: "hoy" y fechas de calendario). Lector pasivo de la caché (no recarga al montarse); mientras carga o si falla, la zona del navegador. Los formularios y diálogos usan `formTimeZone(options)` de sus propios `form-options` |
| `ZonedDateTime` (`value`, `format?`) | Texto de un instante en la zona del usuario, para celdas de tabla |
| `useResyncOnChange(values, onChange)` | Borradores de filtros: se reinician cuando cambia el **contenido** de los filtros aplicados (URL), no por un nuevo render con los mismos (p. ej. al recargar la lista) |
| `StatusChip` (`label`, `group`, `isRescheduled?`, `isUnregistered?`) | Estado con color + icono + texto (RN-04.35) |
| `DueBadge` (`dueAt`, `bucket`, `now?`) | Vencimiento: marca vencida/próxima, relativo y absoluto en la zona del usuario (RN-04.31) |
| `CustomerProjectFields` (`value`, `onChange(value, change)`, `withOpportunity?`, `customerReadOnly?`, `customerHelperText?`, `errors?`, `disabled?`) | Cliente (`CustomerPicker` de 02) → proyecto (`ProjectPicker` de 03, del cliente) → oportunidad (`OpportunityPicker` de 03, abiertas); cambiar de cliente limpia lo que depende; sin la opción `proyectos-buscar` el proyecto queda deshabilitado con su explicación |
| `useCommercialPreselection({ customerId, projectId, opportunityId })` | Resuelve la preselección de la URL (`GET /customers/{id}`, `useProject`, `useOpportunity`): `{ isResolving, value, problems }` |
| `ProjectFilterField` (`value`, `onChange`, `customerId?`, `label?`) + `useProjectFilterName(id)` | Filtro "Proyecto" de seguimiento, historial y visitas (`ProjectPicker` de 03) y nombre de su chip; no se ofrece ni llama a `/projects` sin la opción `proyectos-buscar` |
| `ParticipantsField` (`customerId`, `value`, `onChange`, `label?`, `required?`, `disabled?`, `error?`, `helperText?`) + `participants.ts` | Contactos (con `contactos.ver`), usuarios y externos; `toParticipantInputs`, `participantValuesFrom(dtos, role?)`, `withoutContacts` |
| `OwnerPicker` (`label`, `value`, `onChange`, `fallbackName?`, `excludeIds?`…) | Usuarios de `owner-options` (responsable, asesor, participante). `value` puede ser sólo `{ id }` (un filtro de la URL): el nombre se resuelve con `useOwnerName` |
| `AttachmentsPanel` (`owner`, `canManage`, `limits?`, `title?`, `emptyMessage?`, `uploadPendingFromCreation?`) + `attachment-owner.ts` | Adjuntos de actividad, visita o evento (`commercialAttachmentsPath`, `stashPendingAttachments`/`takePendingAttachments`). `limits` = `form-options.attachments` del módulo (actividades en una actividad, visitas en una visita o evento). Subir o eliminar invalida la raíz del módulo (`attachmentCount` de listas, agenda, eventos y seguimiento) |
| `FilesField` (`limits?`) + `uploadFilesInOrder(basePath, files, limits?)` | Elegir archivos en un formulario o diálogo y subirlos en orden, parando en el primer fallo; con `limits`, un archivo demasiado grande o de un tipo no admitido se detecta antes de enviarlo |
| `InteractionTimeline` (`customerId?`, `projectId?`, `opportunityId?`, `compact?`) / `InteractionTimelineList` (`items`, `hideCustomer?`, `hideProject?`) | Historial de interacciones agrupado por día con enlace al origen |
| `commercial-paths.ts` | `interactionHistoryPath`, `planVisitPath`, `visitDetailPath` |
| `CountrySelect` (`value`, `onChange`, `label?`, `disabled?`) + `useCountryOptions(enabled)` | Filtro "país del cliente" con los países de `GET /customers/form-options` (02 F2); sin `clientes.ver` no se ofrece |
| `AttachmentCount` (`count`) | Columna "Adjuntos": icono + número con nombre accesible ("3 adjuntos") |
| `NextActionDate` (`date`, `prefix?`, `today?`) | Fecha de próxima acción resaltada con color **y** texto ("(hoy)", "(pasada)"); "hoy" en la zona de negocio |

### Piezas comunes de Reportes (`reports/common/`)

Para las siete pantallas del Módulo 5 (`/reportes/*`, todas con `reportes.ver`; 05 E.1 y
"Precisiones … frontend" P-05.19–P-05.26). Las de proyectos, oportunidades, forecast, visitas y
actividades están entregadas; dashboard y embudo siguen en `ReportsPendingPage`.

| Pieza | Uso |
|---|---|
| `useReportQueryState({ filterKeys, sortableFields, defaultSort, period, paramPrefix? })` | Estado en la URL con los nombres de la API. `period`: `{ kind: 'dates', defaultPreset: 'CURRENT_MONTH' \| … \| null, defaultDateBasis }` o `{ kind: 'months' }`. Devuelve `values`, `period` efectivo, `isDefaultPeriod`, `dateBasis`, `today` (zona del negocio), `filterQuery` (resúmenes), `listQuery` (listas), `exportQuery` (+ orden + `format=xlsx`, sin página), `apply(values)`, `clear()`, `table` |
| `ReportFilterBar` (`label`, `fields`, `values`, `onApply`, `onClear`, `period?`, `search?`, `children?`) | Botón "Filtros" + formulario (borrador, "Aplicar filtros"), chips "Campo: valor" con quitar y "Limpiar". `fields`: `select`/`autocomplete` (opciones de `filter-options`), `text`, `customer`, `project` (`customerKey?`), `product` (cada remoto con su permiso). `period`: `{ kind: 'dates', period, isDefault, today, dateBases?, defaultDateBasis, dateBasisRequired?, allowEmpty, maxYears?, dateBasisNotes? }` o `{ kind: 'months', appliedRange, maxMonths? }` |
| `report-filter-options.ts` | `ownerOptions`, `namedOptions`, `catalogOptions` (orden de catálogo, inactivos marcados), `enumOptions` |
| `SummaryCards` (`label`, `items[{ key, label, value, detail?, tone?, filterValue? }]`, `activeValue?`, `onSelect?`, `isLoading?`, `errorMessage?`, `onRetry?`, `footer?`, `columns?`) | Tarjetas de resumen; con `filterValue` son botones (`aria-pressed`) que aplican/quitan el filtro de estado |
| `useReportExport({ request, fallbackFileName })` + `ExportButton` (`exporter`, `label?`) + `ExportFeedback` (`exporter`) | Descarga `.xlsx` con `httpClient.download` + `saveFile`; botón solo con `reportes.exportar`; progreso, filas de `X-Export-Rows` y errores 422/429/503 con referencia |
| `ChartPanel` (`title`, `description?`, `table`, `chart?`, `isLoading?`, `errorMessage?`, `onRetry?`, `isEmpty?`, `emptyMessage?`, `action?`) | Panel con estados propios y "Ver como tabla" / "Ver como gráfica" si hay `chart` (AC-05.32, AC-05.33) |
| `ReportPage` (`title`, `subtitle?`, `exporter?`, `filterOptionsFailed?`, `actions?`) | `PageHeader` "Inicio / Reportes / <Pantalla>" con exportación y aviso si fallan las opciones de filtro |
| `ReportTable` (`label`, `columns`, `query`, `state`, `getRowId`) | `DataTable` con tarjetas bajo `sm` y estados cargando / vacío ("No hay registros para los filtros seleccionados" + "Limpiar filtros") / error con referencia |
| `SourceLink` (`to`, `permission`, `label?`) | Código como enlace a la ficha solo con el `.ver` de la entidad (`REPORT_SOURCE_PERMISSIONS`) |
| `ReportDateTime` / `ReportCalendarDate`, `report-format.ts`, `report-period.ts`, `report-paths.ts` | Instantes en la zona del perfil, fechas de calendario sin zona; `formatCount`/`formatUsd`/`formatTons`/`formatQuantityWithUnit`/`formatMonth`; atajos y esquemas de período; fichas de visita y actividad |
| `reports.errors.ts` | `describeReportError`, `reportErrorMessage` (con referencia), `exportTooLargeDetails` |

El barril `commercial-activity/entry-points` exporta además `useCommercialTimeZones`,
`formatDateTime`, `formatDate`, `formatCalendarDate` y `todayInTimeZone` para Reportes (P-05.21).
`httpClient.download` devuelve `headers` y `ApiError.retryAfterSeconds` lee `Retry-After`.

Opciones aditivas de `@/components/data` usadas por el CRM: `DataTable` `onRowClick` + `getRowLabel`
(fila navegable con teclado, `role="link"`) y `useTableQueryState({ paramPrefix })` para varias
tablas en la misma URL (p. ej. `contacts.`, `projects.`).

### 3.1 Decimales: `decimal.ts` y `DecimalField`

La API transporta cantidades, tonelajes, factores, montos y porcentajes como **cadenas
decimales** (`"1200.0000"`, `"75.00"`, 03 RN-03.30). El frontend **nunca** las convierte a
`number` (ni `parseFloat`, ni `type="number"`): todo pasa por `features/crm/common/decimal.ts`,
que trabaja con enteros escalados (`BigInt`).

| Necesito… | Uso |
|---|---|
| Límites de un campo | `DECIMAL_SPECS.quantity` / `tonnage` / `money` (15 enteros, 4 decimales), `factor` (11, 8), `percent` (3, 2, máximo 100): los patrones del backend (03 §H.3) |
| Validar un formulario | `decimalSchema(DECIMAL_SPECS.x)` en Zod: valida el texto y lo transforma en la cadena canónica para la API; `{ required: false }` → `null` si está vacío |
| Un campo editable | `<DecimalField spec={…} unit="t" value onChange onBlur inputRef error helperText />` con `Controller`: `inputMode="decimal"`, ignora letras, emite la cadena canónica y muestra `es-GT` (`1,234.5`) al perder el foco |
| Mostrar un valor | `formatDecimal`, `formatPercent` (`"75%"`), `formatMoney(amount, currencyCode, decimals)` (`"GTQ 1,234.50"`, código ISO y no símbolo), `formatQuantity(value, unit)`, `formatTonnage(value)` (`"1.61 t"`); vacío → `—` |
| Una vista previa | `multiplyDecimals(quantity, factor, 4)` (`HALF_UP`, D-03.13), `sumDecimals`, `compareDecimals`, `roundDecimal`. El factor es el que devuelve el backend; los totales oficiales también |

Configuración regional `es-GT`: punto decimal y coma de miles. Al escribir se admite la coma de
miles solo bien colocada (`"1,234.5"`); `"1,5"` es un error de formato, para no confundir una
coma decimal con miles.

## 4. Menú, rutas y permisos

- El **menú no se declara aquí** (CLAUDE.md §8.11, ADR-018): sale de `GET /me/menu`. Las opciones
  (`clientes-buscar`, `proyectos-buscar`, `proyectos-equipo`, `proyectos-oportunidades`,
  `proyectos-forecast`) las crea la semilla (`backend/prisma/seed/crm-access.ts`) cuando la ruta está
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

## 7. Submódulo Proyectos (Módulo 3)

Plan: [`03-proyectos.md`](../../../../docs/implementation-plans/crm/03-proyectos.md). Tres carpetas
hermanas (D-03.3): `projects/`, `opportunities/` y `forecast/`. Entre ellas solo se importa por
`projects/index.ts`.

| Etapa | Estado | Qué hay |
|---|---|---|
| E1 (base) | Entregada | Rutas de §E.1 en `crm-routes.ts` y en el registro del backend; páginas provisionales (`PendingPage`) con título y migas definitivos; `projects.permissions.ts`; `project-paths.ts`; iconos `apartment`, `groups`, `handshake`, `trending_up`; `decimal.ts` y `DecimalField` |
| E3a (proyectos) | Entregada | Búsqueda (filtros repetibles por comas en la URL), alta con adjuntos en cola, ficha con diez secciones (pestañas/acordeón, `?seccion=`), edición, duplicado, eliminación, clasificación con vista previa de `resolve`, fase con historial, productos asociados con totales, historial, adjuntos y vista de equipo; `ProjectPicker` en el barril |
| E3b (oportunidades y forecast) | Entregada | Secciones Oportunidades, Resultados y Forecast de la ficha; pipeline (lista y tablero con `stage-summary`, `?vista=tablero`), detalle de oportunidad, alta/edición con monedas admitidas y aviso `EXCHANGE_RATE_STALE`, cambio de etapa con resultado, modificar resultado, matriz M+6 con borrador (`forecast-draft.ts`), `409 FORECAST_LINE_STALE` con recarga que conserva el resto, teclado (Enter/Escape) y vista móvil; `OpportunityPicker` en el diálogo de productos |

- La sección "Proyectos" de la ficha del cliente (`CustomerProjectsSection`) consume
  `GET /projects?customerId=` con el contrato de 03 F.1 (AC-03.86): filtros `phaseId`, `ownerId`,
  `commercialStatus`; orden `code`, `name`, `phaseOrder`, `estimatedDecisionDate`. Se activa sola
  cuando el menú del usuario contiene `proyectos-buscar` (D-02.10).
- Decimales (`progress`, cantidades, tonelajes, montos) con `decimal.ts` (§3.1); fechas de
  calendario (`YYYY-MM-DD`) sin pasar por `new Date(cadena)`, que las desplaza un día en UTC-6.
