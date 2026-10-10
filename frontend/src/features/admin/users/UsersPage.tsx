import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Alert, Button, Chip, IconButton, MenuItem, TextField } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  AdminListCard,
  adminBreadcrumbs,
  DataTable,
  describeApiError,
  FilterChips,
  ListCardTool,
  ListToolbar,
  recordsSubtitle,
  RefreshTool,
  RowIdentity,
  useFilterCounts,
  useTableQueryState,
  type DataTableColumn,
  type ListQuery,
} from '@/features/admin/common';
import { useCan } from '@/hooks/use-permission';

import { UserDetailDialog } from './components/UserDetailDialog';
import { UserFormDialog } from './components/UserFormDialog';
import { USER_STATUS_VIEW, formatDateTime } from './users-format';
import { listUsers, USER_STATUSES, type UserListItem } from './users.api';
import { USER_PERMISSIONS } from './users.permissions';
import { useAssignableRoles, useExportUsers, userKeys, useUsers } from './users.queries';

const TITLE = 'Usuarios';
const DESCRIPTION = 'Alta, edición, suspensión y asignaciones de los usuarios.';
const FILTER_KEYS = ['status', 'roleCode'] as const;
type UserFilterKey = (typeof FILTER_KEYS)[number];
/** Misma lista blanca que el backend (`USER_SORT_FIELDS`). */
const SORTABLE = ['displayName', 'email', 'status', 'createdAt', 'lastLoginAt'] as const;
const DEFAULT_SORT = { field: 'displayName', direction: 'asc' } as const;
/** Chips de estado: "Todos" (`''`) y cada estado. */
const STATUS_CHIP_VALUES: readonly string[] = ['', ...USER_STATUSES];
const COLUMNS: DataTableColumn<UserListItem>[] = [
  {
    id: 'displayName',
    header: 'Nombre',
    render: (user) => <RowIdentity name={user.displayName} secondary={user.jobTitle} />,
    sortable: true,
    primary: true,
  },
  { id: 'email', header: 'Correo', render: (user) => user.email, sortable: true },
  { id: 'roles', header: 'Roles', render: (user) => user.roles.join(', ') || '—' },
  {
    id: 'lastLoginAt',
    header: 'Último acceso',
    render: (user) => formatDateTime(user.lastLoginAt),
    sortable: true,
    hideOnMobile: true,
  },
  {
    id: 'status',
    header: 'Estado',
    sortable: true,
    render: (user) => (
      <Chip
        size="small"
        color={USER_STATUS_VIEW[user.status].color}
        label={USER_STATUS_VIEW[user.status].label}
      />
    ),
  },
];

function statusLabel(value: string): string {
  return value in USER_STATUS_VIEW
    ? USER_STATUS_VIEW[value as keyof typeof USER_STATUS_VIEW].label
    : 'Todos';
}

/** Pantalla de administración «Usuarios». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function UsersPage() {
  const can = useCan();
  const queryClient = useQueryClient();
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
  const statusCounts = useFilterCounts({
    baseQuery: table.apiQuery,
    filterKey: 'status',
    values: STATUS_CHIP_VALUES,
    queryKey: userKeys.list,
    queryFn: listUsers,
  });

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
      <PageHeader title={TITLE} breadcrumbs={adminBreadcrumbs(TITLE)} />

      {exportMutation.isError ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => exportMutation.reset()}>
          {describeApiError(exportMutation.error).message}
        </Alert>
      ) : null}

      <AdminListCard
        icon={<ManageAccountsOutlinedIcon />}
        title={TITLE}
        subtitle={recordsSubtitle(users.data?.pagination.totalItems, DESCRIPTION)}
        tools={
          <>
            {can(USER_PERMISSIONS.export) ? (
              <ListCardTool
                label="Exportar CSV"
                icon={<FileDownloadOutlinedIcon />}
                disabled={exportMutation.isPending}
                onClick={() => exportMutation.mutate(exportFilters)}
              />
            ) : null}
            <RefreshTool
              busy={users.isFetching}
              onRefresh={() => void queryClient.invalidateQueries({ queryKey: userKeys.lists() })}
            />
          </>
        }
        toolbar={
          <ListToolbar
            filters={
              <>
                <FilterChips
                  label="Filtrar por estado"
                  value={filters.status ?? ''}
                  onChange={(value) => table.setFilter('status', value)}
                  options={STATUS_CHIP_VALUES.map((status) => ({
                    value: status,
                    label: statusLabel(status),
                    count: statusCounts[status],
                  }))}
                />
                {roles.data ? (
                  <TextField
                    select
                    size="small"
                    fullWidth={false}
                    value={filters.roleCode ?? ''}
                    onChange={(event) => table.setFilter('roleCode', event.target.value)}
                    slotProps={{
                      select: { displayEmpty: true, inputProps: { 'aria-label': 'Rol' } },
                    }}
                    sx={{ flex: '0 0 auto', minWidth: '11rem' }}
                  >
                    <MenuItem value="">Todos los roles</MenuItem>
                    {roles.data.map((role) => (
                      <MenuItem key={role.id} value={role.code}>
                        {role.name}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : null}
              </>
            }
            search={{
              value: table.searchInput,
              onChange: table.setSearchInput,
              label: 'Buscar por nombre o correo',
            }}
            primaryAction={
              can(USER_PERMISSIONS.create)
                ? { label: 'Nuevo usuario', onClick: () => setCreating(true) }
                : undefined
            }
          />
        }
      >
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
          emptyIcon={hasFilters ? undefined : <ManageAccountsOutlinedIcon />}
          emptyAction={
            hasFilters ? (
              <Button variant="outlined" onClick={table.clearFilters}>
                Limpiar filtros
              </Button>
            ) : undefined
          }
          rowActions={(user) => (
            <IconButton
              aria-label={`Ver ${user.displayName}`}
              onClick={() => setSelectedId(user.id)}
            >
              <VisibilityOutlinedIcon />
            </IconButton>
          )}
        />
      </AdminListCard>

      <UserFormDialog
        open={creating}
        user={null}
        onClose={() => setCreating(false)}
        onSaved={setSelectedId}
      />
      <UserDetailDialog userId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
