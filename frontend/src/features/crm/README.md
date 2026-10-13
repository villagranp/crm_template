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
  activities/              (llega con el Módulo 4)
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
| `customers/index.ts` | Barril público para otros módulos: `CustomerPicker` (valor `{ id, crmCode, legalName, countryId }`; acepta `{ id }` preseleccionado) y `customerDetailPath(id)` |
| `PendingPage` / `PendingScreen` | Página con título y migas definitivos y estado "En construcción": permite registrar la ruta y sembrar su opción antes de construir la pantalla (Módulo 3, etapa E1) |
| `decimal.ts` + `DecimalField` | Decimales sin `number` flotante (ver §3.1) |
| `invalidateCrmCaches(queryClient, ['forecast', 'opportunities', 'customerProjects', 'projectTeamLists'])` | Invalida cachés de otro submódulo que dependen de una mutación (p. ej. borrar un proyecto refresca el forecast y la ficha del cliente) sin importar sus claves y sin ciclos entre barriles. Raíces en `CRM_CACHE_ROOTS`; matriz en 03 "Revisión E5 — frontend" |
| `UnsavedChangesGuard when={dirty} shouldBlock?` | Aviso al abandonar una pantalla con cambios sin guardar: `beforeunload` y, con el router de datos de la aplicación, `useBlocker` con un diálogo propio ("Salir sin guardar" / "Seguir editando"). Por defecto solo bloquea cambios de ruta (los filtros en la URL no pierden el borrador). Bajo `MemoryRouter` (pruebas) solo protege `beforeunload` |
| `projects/index.ts` | Barril público del Módulo 3: constantes de permisos (`PROJECT_`, `OPPORTUNITY_`, `FORECAST_`, `PRODUCT_PERMISSIONS`), `projectDetailPath(id)`, `opportunityDetailPath(id)`, `ProjectPicker`, `OwnerPicker`, `ProductPicker`, `UnitSelect`, `ConversionBadge`, formatos de fecha, `projectKeys`/`useInvalidateProject` y tipos |
| `opportunities/index.ts` | Barril de Oportunidades: `OpportunityPicker` (Módulo 4: `projectId`, `status="OPEN"`), `OpportunityFormDialog`, `StageChangeDialog`, `ResultEditDialog`, `OpportunityHistoryPanel`, `StageChip`, `OutcomeChip`, `EstimateText`, hooks de lectura y tipos |
| `forecast/index.ts` | Barril de Forecast: `ForecastMatrix filters={{ mode, projectId… }}` (la ficha la reutiliza filtrada por el proyecto) |

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
