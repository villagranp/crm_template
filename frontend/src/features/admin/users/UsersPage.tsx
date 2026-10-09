import AddIcon from '@mui/icons-material/Add';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Alert, Button, Chip, IconButton, MenuItem, Stack, TextField } from '@mui/material';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  adminBreadcrumbs,
  DataTable,
  describeApiError,
  useTableQueryState,
  type DataTableColumn,
  type ListQuery,
} from '@/features/admin/common';
import { useCan } from '@/hooks/use-permission';

import { UserDetailDialog } from './components/UserDetailDialog';
import { UserFormDialog } from './components/UserFormDialog';
import { USER_STATUS_VIEW, formatDateTime } from './users-format';
import { USER_STATUSES, type UserListItem } from './users.api';
import { USER_PERMISSIONS } from './users.permissions';
import { useAssignableRoles, useExportUsers, useUsers } from './users.queries';

const TITLE = 'Usuarios';
const FILTER_KEYS = ['status', 'roleCode'] as const;
type UserFilterKey = (typeof FILTER_KEYS)[number];
/** Misma lista blanca que el backend (`USER_SORT_FIELDS`). */
const SORTABLE = ['displayName', 'email', 'status', 'createdAt', 'lastLoginAt'] as const;
const DEFAULT_SORT = { field: 'displayName', direction: 'asc' } as const;
const COLUMNS: DataTableColumn<UserListItem>[] = [
  { id: 'displayName', header: 'Nombre', render: (user) => user.displayName, sortable: true, primary: true },
  { id: 'email', header: 'Correo', render: (user) => user.email, sortable: true },
  {
    id: 'status',
    header: 'Estado',
    sortable: true,
    render: (user) => <Chip size="small" color={USER_STATUS_VIEW[user.status].color} label={USER_STATUS_VIEW[user.status].label} />,
  },
  { id: 'roles', header: 'Roles', render: (user) => user.roles.join(', ') || '—' },
  { id: 'lastLoginAt', header: 'Último acceso', render: (user) => formatDateTime(user.lastLoginAt), sortable: true, hideOnMobile: true },
];

/** Pantalla de administración «Usuarios». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function UsersPage() {
  const can = useCan();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const table = useTableQueryState<UserFilterKey>({
    filterKeys: FILTER_KEYS,
    sortableFields: SORTABLE,
    defaultSort: DEFAULT_SORT,
  });
  const users = useUsers(table.apiQuery);
  const roles = useAssignableRoles(can(USER_PERMISSIONS.viewRoles));
  const exportMutation = useExportUsers();
  const { filters, search, sort } = table.state;

  /** Filtros activos para la exportación, sin paginación. */
  const exportFilters = useMemo<ListQuery>(() => {
    const query: ListQuery = { ...filters };
    if (search) {
      query.search = search;
    }
    if (sort) {
      query.sortBy = sort.field;
      query.sortOrder = sort.direction;
    }
    return query;
  }, [filters, search, sort]);

  const hasFilters = Boolean(search) || Object.keys(filters).length > 0;

  return (
    <>
      <PageHeader
        title={TITLE}
        subtitle="Alta, edición, suspensión y asignaciones de los usuarios."
        breadcrumbs={adminBreadcrumbs(TITLE)}
        actions={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {can(USER_PERMISSIONS.export) ? (
              <Button
                variant="outlined"
                startIcon={<FileDownloadOutlinedIcon />}
                disabled={exportMutation.isPending}
                onClick={() => exportMutation.mutate(exportFilters)}
              >
                {exportMutation.isPending ? 'Exportando…' : 'Exportar CSV'}
              </Button>
            ) : null}
            {can(USER_PERMISSIONS.create) ? (
              <Button startIcon={<AddIcon />} onClick={() => setCreating(true)}>
                Nuevo usuario
              </Button>
            ) : null}
          </Stack>
        }
      />

      {exportMutation.isError ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => exportMutation.reset()}>
          {describeApiError(exportMutation.error).message}
        </Alert>
      ) : null}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="Buscar por nombre o correo"
          type="search"
          value={table.searchInput}
          onChange={(event) => table.setSearchInput(event.target.value)}
          fullWidth
        />
        <TextField
          select
          label="Estado"
          value={filters.status ?? ''}
          onChange={(event) => table.setFilter('status', event.target.value)}
          sx={{ minWidth: { md: '12rem' } }}
        >
          <MenuItem value="">Todos</MenuItem>
          {USER_STATUSES.map((status) => (
            <MenuItem key={status} value={status}>
              {USER_STATUS_VIEW[status].label}
            </MenuItem>
          ))}
        </TextField>
        {roles.data ? (
          <TextField
            select
            label="Rol"
            value={filters.roleCode ?? ''}
            onChange={(event) => table.setFilter('roleCode', event.target.value)}
            sx={{ minWidth: { md: '12rem' } }}
          >
            <MenuItem value="">Todos</MenuItem>
            {roles.data.map((role) => (
              <MenuItem key={role.id} value={role.code}>
                {role.name}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
      </Stack>

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
        emptyTitle={hasFilters ? 'No hay resultados' : 'Aún no hay usuarios'}
        emptyAction={
          hasFilters ? (
            <Button variant="text" onClick={table.clearFilters}>
              Limpiar filtros
            </Button>
          ) : undefined
        }
        rowActions={(user) => (
          <IconButton aria-label={`Ver ${user.displayName}`} onClick={() => setSelectedId(user.id)}>
            <VisibilityOutlinedIcon />
          </IconButton>
        )}
      />

      <UserFormDialog open={creating} user={null} onClose={() => setCreating(false)} onSaved={setSelectedId} />
      <UserDetailDialog userId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
