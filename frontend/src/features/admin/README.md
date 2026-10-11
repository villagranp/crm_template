# Administración — convenciones del frontend

Pantallas del módulo **Administración** ([PLAN-ADMIN](../../../../docs/implementation-plans/PLAN-ADMIN.md)).
Cada área tiene un responsable distinto: estas convenciones existen para que nadie
tenga que tocar archivos compartidos al construir su área.

## 1. Estructura: una carpeta por área

```text
features/admin/
  admin-routes.ts          ruta + permiso + página lazy de cada área (ya están las 8)
  common/                  piezas compartidas (no se modifican sin acordarlo)
  users/                   UsersPage.tsx, users.api.ts, users.queries.ts, users.schemas.ts, components/…
  roles/  menu-options/  teams/  catalogs/  parameters/  approvals/  audit/
```

| Área | Carpeta | Ruta | Permiso de la ruta |
|---|---|---|---|
| Usuarios | `users/` | `/administracion/usuarios` | `usuarios.ver` |
| Roles y permisos | `roles/` | `/administracion/roles` | `roles.ver` |
| Opciones de menú | `menu-options/` | `/administracion/opciones` | `opciones.ver` |
| Equipos | `teams/` | `/administracion/equipos` | `equipos.ver` |
| Catálogos | `catalogs/` | `/administracion/catalogos` | `catalogos.ver` |
| Parámetros | `parameters/` | `/administracion/parametros` | `parametros.ver` |
| Aprobaciones | `approvals/` | `/administracion/aprobaciones` | `aprobaciones.ver` |
| Auditoría | `audit/` | `/administracion/auditoria` | `auditoria.ver` |

- La página del área (`<Area>Page.tsx`) conserva su **export con nombre**: `admin-routes.ts`
  la carga con `React.lazy` por ese nombre. Sustituye `<UnderConstruction />` por la pantalla real.
- Lo que sólo usa tu área vive en tu carpeta. Un área **no importa** de otra área; si algo
  hace falta en dos, se propone para `common/`.
- Importa lo compartido desde el barril: `import { DataTable, … } from '@/features/admin/common';`.
- Las piezas que no son propias de la administración (`DataTable`, `ConfirmDialog`, `ListToolbar`,
  `EmptyState`, `FormSection`, `EntityDialog`/`EntityDrawer`, `useTableQueryState`) viven en
  `@/components/data`, y `describeApiError`, `createScopedQueryKeys` y `saveFile` en `@/lib`
  (D-02.11). El barril de `common/` las reexporta con los nombres de siempre
  (`AdminDialog`/`AdminDrawer` son alias), así que las áreas de administración no cambian.

## 2. API y estado de servidor

- `<area>.api.ts`: funciones que llaman a `httpClient` (`@/services/api`). Nunca `fetch`.
  Los tipos de request/response van en el mismo archivo o en `<area>.types.ts` y reflejan
  el DTO del backend, no el modelo de Prisma.
- Colecciones: el backend devuelve `Paginated<T>` = `{ data: T[], pagination: { page, pageSize, totalItems, totalPages } }`
  (`backend/src/common/dto/paginated-response.dto.ts`).
- `<area>.queries.ts`: hooks de TanStack Query con claves de `createQueryKeys('<area>')`:

  ```ts
  export const roleKeys = createQueryKeys('roles');            // ['admin', 'roles', …]
  export function useRoles(query: ListQuery) {
    return useQuery({ queryKey: roleKeys.list(query), queryFn: () => listRoles(query), placeholderData: keepPreviousData });
  }
  // Tras una mutación: queryClient.invalidateQueries({ queryKey: roleKeys.all })
  ```

  Si una mutación cambia accesos del propio usuario, invalida también `['me']`.
- Errores: `describeApiError(error, overrides?)` devuelve `{ message, issues, code, statusCode, correlationId }`
  con el texto en español. **Nunca** se muestra `error.message` del backend. Los códigos de
  PLAN-ADMIN §3 ya tienen mensaje; pasa `overrides` para matices de tu pantalla
  (p. ej. `{ RESOURCE_CONFLICT: 'Ya existe un rol con ese nombre.' }`).

## 3. Listas

```tsx
const FILTER_KEYS = ['status'] as const;                  // constantes de módulo
const SORTABLE = ['displayName', 'createdAt'] as const;   // misma lista blanca que el backend

const table = useTableQueryState<'status'>({ filterKeys: FILTER_KEYS, sortableFields: SORTABLE });
const users = useUsers(table.apiQuery);

<DataTable
  label="Usuarios"
  columns={COLUMNS}
  rows={users.data?.data}
  getRowId={(user) => user.id}
  totalItems={users.data?.pagination.totalItems ?? 0}
  page={table.state.page}
  pageSize={table.state.pageSize}
  onPageChange={table.setPage}
  onPageSizeChange={table.setPageSize}
  sort={table.state.sort}
  onSortChange={table.setSort}
  isLoading={users.isPending}
  isFetching={users.isFetching}
  errorMessage={users.isError ? describeApiError(users.error).message : null}
  onRetry={() => void users.refetch()}
  rowActions={(user) => (can('usuarios.editar') ? <IconButton aria-label={`Editar ${user.displayName}`}>…</IconButton> : null)}
/>
```

- Paginación, orden, búsqueda y filtros van **al servidor** y viven en la URL (se puede
  compartir y recargar una vista filtrada). Los nombres de parámetro son los de la API.
- El campo de búsqueda usa `table.searchInput` / `table.setSearchInput` (debounce de 300 ms).
- Los filtros y el estado vacío son de cada pantalla; `DataTable` pinta carga, vacío y error.
- Por debajo de `sm` la tabla se convierte en tarjetas: marca una columna `primary` (título de
  la tarjeta) y `hideOnMobile` en las secundarias.

## 4. Permisos

- La **ruta** ya está protegida en `admin-routes.ts` con el permiso de su opción de menú.
- Las **acciones** se ocultan con `usePermission('roles.editar')` o, para varias,
  `const can = useCan(); can('roles.eliminar')` (`@/hooks/use-permission`).
- Ocultar es experiencia de usuario, **no** seguridad: el backend vuelve a exigir el permiso
  y es la autoridad. Si responde `403`, `describeApiError` ya da el mensaje.
- Las constantes de permisos de tu área van en tu carpeta (`<area>.permissions.ts`), con los
  nombres exactos del catálogo sembrado. No se inventan permisos (ADR-008, PLAN-ADMIN §5).

## 5. Formularios y confirmaciones

- React Hook Form + Zod; el esquema en `<area>.schemas.ts`. La validación del cliente es de UX:
  el backend valida de nuevo. Los `issues` de un `400` se pueden mostrar bajo el formulario.
- Acciones destructivas o de alto impacto: `ConfirmDialog` con `destructive`.
- Asignaciones directas (ADR-018 §4, PLAN-ADMIN D5): `ConfirmDialog` con
  `reason={{}}` → razón obligatoria de al menos `REASON_MIN_LENGTH` (10) caracteres; se recibe
  ya recortada en `onConfirm(reason)`. El diálogo no se cierra solo: ciérralo en el `onSuccess`
  de la mutación y pásale `isPending` y `errorMessage`.

## 6. Añadir una ruta navegable nueva

1. `src/routes/route-paths.ts` → `ROUTE_PATHS.admin.<clave>`.
2. `admin-routes.ts` → entrada con `path`, `permission` (el `requiredPermission` de la opción) y `Page` lazy.
3. `backend/src/modules/access/app-routes.registry.json` → la misma ruta con su etiqueta.
4. La opción de menú se crea en la semilla o desde la pantalla de opciones (skill `access-management`).

`src/routes/route-registry.spec.ts` falla si los pasos 2 y 3 no coinciden.

## 7. Diseño y pruebas

- Nada de hex, duraciones ni píxeles a mano (CLAUDE.md §8.12): tema y `theme/tokens.ts`.
  Encabezado con `PageHeader` y `adminBreadcrumbs('<Pantalla>')`.
- Cuatro estados en cada pantalla: cargando, vacío, error y sin permiso.
- Pruebas con React Testing Library por comportamiento (`renderWithProviders`, `mockApi` de
  `@/test/api-mocks`): formularios, mapeo de errores y acciones ocultas sin permiso. Para la
  vista de tabla en jsdom simula `matchMedia` (ver `src/components/data/DataTable.spec.tsx`).
