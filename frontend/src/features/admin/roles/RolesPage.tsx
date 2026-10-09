import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Alert, Box, Button, Chip, IconButton } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  ADMIN_ONLY_NOTE,
  AdminListCard,
  adminBreadcrumbs,
  ConfirmDialog,
  DataTable,
  describeApiError,
  FilterChips,
  ListToolbar,
  recordsSubtitle,
  RefreshTool,
  useFilterCounts,
  useTableQueryState,
  type DataTableColumn,
} from '@/features/admin/common';
import { useCan, useIsAdministrador } from '@/hooks/use-permission';

import { RoleDetailDialog } from './components/RoleDetailDialog';
import { RoleFormDialog, type RoleFormMode } from './components/RoleFormDialog';
import { DATA_SCOPE_LABEL, ROLE_ERRORS } from './roles-format';
import { listRoles, type Role } from './roles.api';
import { ROLE_PERMISSIONS } from './roles.permissions';
import { roleKeys, useDeleteRole, useRoles } from './roles.queries';

const TITLE = 'Roles y permisos';
const DESCRIPTION = 'Roles del sistema y propios, con sus permisos y opciones de menú.';
const FILTER_KEYS = ['isSystem'] as const;
/** Misma lista blanca que el backend (`ROLE_SORT_FIELDS`). */
const SORTABLE = ['name', 'code', 'createdAt'] as const;
const DEFAULT_SORT = { field: 'name', direction: 'asc' } as const;
/** Chips de tipo: todos, de sistema y propios (`isSystem`). */
const TYPE_CHIPS = [
  { value: '', label: 'Todos' },
  { value: 'true', label: 'Sistema' },
  { value: 'false', label: 'Propios' },
] as const;
const TYPE_CHIP_VALUES: readonly string[] = TYPE_CHIPS.map((chip) => chip.value);

const COLUMNS: DataTableColumn<Role>[] = [
  {
    id: 'name',
    header: 'Nombre',
    render: (role) => (
      <Box component="span" sx={{ fontWeight: 600 }}>
        {role.name}
      </Box>
    ),
    sortable: true,
    primary: true,
  },
  { id: 'code', header: 'Código', render: (role) => role.code, sortable: true, hideOnMobile: true },
  {
    id: 'type',
    header: 'Tipo',
    render: (role) => (
      <Chip size="small" variant="outlined" label={role.isSystem ? 'Sistema' : 'Propio'} />
    ),
  },
  {
    id: 'scope',
    header: 'Alcance',
    render: (role) => DATA_SCOPE_LABEL[role.dataScope],
    hideOnMobile: true,
  },
  { id: 'users', header: 'Usuarios', render: (role) => role.userCount, align: 'right' },
  {
    id: 'status',
    header: 'Estado',
    render: (role) => (
      <Chip
        size="small"
        color={role.isActive ? 'success' : 'default'}
        label={role.isActive ? 'Activo' : 'Inactivo'}
      />
    ),
  },
];

/** Pantalla de administración «Roles y permisos». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function RolesPage() {
  const can = useCan();
  const isAdministrador = useIsAdministrador();
  // ADR-020: crear o duplicar un rol es asignar accesos; sólo el administrador.
  // Ocultarlo es UX: el backend responde 403 ADMIN_ONLY igualmente.
  const canCreate = can(ROLE_PERMISSIONS.create) && isAdministrador;
  const showAdminOnlyNote =
    !isAdministrador && (can(ROLE_PERMISSIONS.create) || can(ROLE_PERMISSIONS.edit));
  const [form, setForm] = useState<RoleFormMode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Role | null>(null);

  const table = useTableQueryState<'isSystem'>({
    filterKeys: FILTER_KEYS,
    sortableFields: SORTABLE,
    defaultSort: DEFAULT_SORT,
  });
  const roles = useRoles(table.apiQuery);
  const deleteMutation = useDeleteRole();
  const queryClient = useQueryClient();
  const typeCounts = useFilterCounts({
    baseQuery: table.apiQuery,
    filterKey: 'isSystem',
    values: TYPE_CHIP_VALUES,
    queryKey: roleKeys.list,
    queryFn: listRoles,
  });
  const hasFilters = Boolean(table.state.search) || Object.keys(table.state.filters).length > 0;

  return (
    <>
      <PageHeader title={TITLE} breadcrumbs={adminBreadcrumbs(TITLE)} />

      {showAdminOnlyNote ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {ADMIN_ONLY_NOTE} Puedes consultar los roles y editar su nombre y descripción.
        </Alert>
      ) : null}

      <AdminListCard
        icon={<AdminPanelSettingsOutlinedIcon />}
        title={TITLE}
        subtitle={recordsSubtitle(roles.data?.pagination.totalItems, DESCRIPTION)}
        tools={
          <RefreshTool
            busy={roles.isFetching}
            onRefresh={() => void queryClient.invalidateQueries({ queryKey: roleKeys.lists() })}
          />
        }
        toolbar={
          <ListToolbar
            filters={
              <FilterChips
                label="Filtrar por tipo"
                value={table.state.filters.isSystem ?? ''}
                onChange={(value) => table.setFilter('isSystem', value)}
                options={TYPE_CHIPS.map((chip) => ({ ...chip, count: typeCounts[chip.value] }))}
              />
            }
            search={{
              value: table.searchInput,
              onChange: table.setSearchInput,
              label: 'Buscar por nombre o código',
            }}
            primaryAction={
              canCreate
                ? { label: 'Nuevo rol', onClick: () => setForm({ kind: 'create' }) }
                : undefined
            }
          />
        }
      >
        <DataTable
          label="Roles"
          columns={COLUMNS}
          rows={roles.data?.data}
          getRowId={(role) => role.id}
          totalItems={roles.data?.pagination.totalItems ?? 0}
          page={table.state.page}
          pageSize={table.state.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          sort={table.state.sort}
          onSortChange={table.setSort}
          isLoading={roles.isPending}
          isFetching={roles.isFetching}
          errorMessage={roles.isError ? describeApiError(roles.error).message : null}
          onRetry={() => void roles.refetch()}
          emptyAction={
            hasFilters ? (
              <Button variant="outlined" onClick={table.clearFilters}>
                Limpiar filtros
              </Button>
            ) : undefined
          }
          rowActions={(role) => (
            <>
              <IconButton aria-label={`Ver ${role.name}`} onClick={() => setSelectedId(role.id)}>
                <VisibilityOutlinedIcon />
              </IconButton>
              {canCreate ? (
                <IconButton
                  aria-label={`Duplicar ${role.name}`}
                  onClick={() => setForm({ kind: 'duplicate', role })}
                >
                  <ContentCopyOutlinedIcon />
                </IconButton>
              ) : null}
              {can(ROLE_PERMISSIONS.remove) && !role.isSystem ? (
                <IconButton
                  aria-label={`Eliminar ${role.name}`}
                  onClick={() => {
                    deleteMutation.reset();
                    setToDelete(role);
                  }}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              ) : null}
            </>
          )}
        />
      </AdminListCard>

      <RoleFormDialog
        mode={form}
        onClose={() => setForm(null)}
        onSaved={(role) => setSelectedId(role.id)}
      />
      <RoleDetailDialog
        roleId={selectedId}
        onClose={() => setSelectedId(null)}
        onOpenForm={setForm}
      />
      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar rol"
        description={
          toDelete
            ? `Se eliminará «${toDelete.name}». Sólo es posible si no tiene usuarios asignados.`
            : undefined
        }
        confirmLabel="Eliminar"
        destructive
        isPending={deleteMutation.isPending}
        errorMessage={
          deleteMutation.isError
            ? describeApiError(deleteMutation.error, ROLE_ERRORS).message
            : null
        }
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            deleteMutation.mutate(toDelete.id, { onSuccess: () => setToDelete(null) });
          }
        }}
      />
    </>
  );
}
