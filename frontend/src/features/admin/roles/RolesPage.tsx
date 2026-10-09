import AddIcon from '@mui/icons-material/Add';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Alert, Button, Chip, IconButton, MenuItem, Stack, TextField } from '@mui/material';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  ADMIN_ONLY_NOTE,
  adminBreadcrumbs,
  ConfirmDialog,
  DataTable,
  describeApiError,
  useTableQueryState,
  type DataTableColumn,
} from '@/features/admin/common';
import { useCan, useIsAdministrador } from '@/hooks/use-permission';

import { RoleDetailDialog } from './components/RoleDetailDialog';
import { RoleFormDialog, type RoleFormMode } from './components/RoleFormDialog';
import { DATA_SCOPE_LABEL, ROLE_ERRORS } from './roles-format';
import type { Role } from './roles.api';
import { ROLE_PERMISSIONS } from './roles.permissions';
import { useDeleteRole, useRoles } from './roles.queries';

const TITLE = 'Roles y permisos';
const FILTER_KEYS = ['isSystem'] as const;
/** Misma lista blanca que el backend (`ROLE_SORT_FIELDS`). */
const SORTABLE = ['name', 'code', 'createdAt'] as const;
const DEFAULT_SORT = { field: 'name', direction: 'asc' } as const;

const COLUMNS: DataTableColumn<Role>[] = [
  { id: 'name', header: 'Nombre', render: (role) => role.name, sortable: true, primary: true },
  { id: 'code', header: 'Código', render: (role) => role.code, sortable: true, hideOnMobile: true },
  {
    id: 'type',
    header: 'Tipo',
    render: (role) => <Chip size="small" variant="outlined" label={role.isSystem ? 'Sistema' : 'Propio'} />,
  },
  { id: 'scope', header: 'Alcance', render: (role) => DATA_SCOPE_LABEL[role.dataScope], hideOnMobile: true },
  { id: 'users', header: 'Usuarios', render: (role) => role.userCount, align: 'right' },
  {
    id: 'status',
    header: 'Estado',
    render: (role) => <Chip size="small" color={role.isActive ? 'success' : 'default'} label={role.isActive ? 'Activo' : 'Inactivo'} />,
  },
];

/** Pantalla de administración «Roles y permisos». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function RolesPage() {
  const can = useCan();
  const isAdministrador = useIsAdministrador();
  // ADR-020: crear o duplicar un rol es asignar accesos; sólo el administrador.
  // Ocultarlo es UX: el backend responde 403 ADMIN_ONLY igualmente.
  const canCreate = can(ROLE_PERMISSIONS.create) && isAdministrador;
  const showAdminOnlyNote = !isAdministrador && (can(ROLE_PERMISSIONS.create) || can(ROLE_PERMISSIONS.edit));
  const [form, setForm] = useState<RoleFormMode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Role | null>(null);

  const table = useTableQueryState<'isSystem'>({ filterKeys: FILTER_KEYS, sortableFields: SORTABLE, defaultSort: DEFAULT_SORT });
  const roles = useRoles(table.apiQuery);
  const deleteMutation = useDeleteRole();
  const hasFilters = Boolean(table.state.search) || Object.keys(table.state.filters).length > 0;

  return (
    <>
      <PageHeader
        title={TITLE}
        subtitle="Roles del sistema y propios, con sus permisos y opciones de menú."
        breadcrumbs={adminBreadcrumbs(TITLE)}
        actions={
          canCreate ? (
            <Button startIcon={<AddIcon />} onClick={() => setForm({ kind: 'create' })}>
              Nuevo rol
            </Button>
          ) : null
        }
      />

      {showAdminOnlyNote ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {ADMIN_ONLY_NOTE} Puedes consultar los roles y editar su nombre y descripción.
        </Alert>
      ) : null}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="Buscar por nombre o código"
          type="search"
          value={table.searchInput}
          onChange={(event) => table.setSearchInput(event.target.value)}
          fullWidth
        />
        <TextField
          select
          label="Tipo"
          value={table.state.filters.isSystem ?? ''}
          onChange={(event) => table.setFilter('isSystem', event.target.value)}
          sx={{ minWidth: { md: '12rem' } }}
        >
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="true">Sistema</MenuItem>
          <MenuItem value="false">Propios</MenuItem>
        </TextField>
      </Stack>

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
            <Button variant="text" onClick={table.clearFilters}>
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
              <IconButton aria-label={`Duplicar ${role.name}`} onClick={() => setForm({ kind: 'duplicate', role })}>
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

      <RoleFormDialog mode={form} onClose={() => setForm(null)} onSaved={(role) => setSelectedId(role.id)} />
      <RoleDetailDialog roleId={selectedId} onClose={() => setSelectedId(null)} onOpenForm={setForm} />
      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar rol"
        description={toDelete ? `Se eliminará «${toDelete.name}». Sólo es posible si no tiene usuarios asignados.` : undefined}
        confirmLabel="Eliminar"
        destructive
        isPending={deleteMutation.isPending}
        errorMessage={deleteMutation.isError ? describeApiError(deleteMutation.error, ROLE_ERRORS).message : null}
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
