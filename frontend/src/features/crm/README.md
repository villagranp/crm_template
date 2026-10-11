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
  projects/  activities/   (llegan con los módulos 3 y 4)
```

| Pantalla | Carpeta | Ruta | Permiso de la ruta | ¿Opción de menú? |
|---|---|---|---|---|
| Búsqueda de clientes | `customers/` | `/clientes` | `clientes.ver` | Sí: `clientes-buscar` |
| Alta de cliente | `customers/` | `/clientes/nuevo` | `clientes.crear` | No (botón "Nuevo cliente") |
| Ficha del cliente | `customers/` | `/clientes/:customerId` | `clientes.ver` | No (ruta con parámetro, D-02.12) |

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
