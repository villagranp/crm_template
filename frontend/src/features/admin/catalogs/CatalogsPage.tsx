import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import { Button, Chip, IconButton, MenuItem, Stack, TextField } from '@mui/material';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  adminBreadcrumbs,
  ConfirmDialog,
  DataTable,
  describeApiError,
  useTableQueryState,
  type DataTableColumn,
} from '@/features/admin/common';
import { useCan } from '@/hooks/use-permission';

import type { Catalog } from './catalogs.api';
import { CATALOG_PERMISSIONS } from './catalogs.permissions';
import { useCatalogs, useDeleteCatalog } from './catalogs.queries';
import { CatalogDetailDialog } from './components/CatalogDetailDialog';
import { CatalogFormDialog } from './components/CatalogFormDialog';
import { CATALOG_DELETE_ERRORS } from './catalogs.errors';

const TITLE = 'Catálogos';
const FILTER_KEYS = ['isSystem'] as const;
const SORTABLE = ['name', 'key', 'createdAt', 'updatedAt'] as const;
const DEFAULT_SORT = { field: 'name', direction: 'asc' } as const;


const COLUMNS: DataTableColumn<Catalog>[] = [
  { id: 'name', header: 'Nombre', render: (catalog) => catalog.name, sortable: true, primary: true },
  { id: 'key', header: 'Clave', render: (catalog) => catalog.key, sortable: true },
  {
    id: 'items',
    header: 'Elementos',
    render: (catalog) => `${catalog.activeItemCount} activos de ${catalog.itemCount}`,
    hideOnMobile: true,
  },
  {
    id: 'type',
    header: 'Tipo',
    render: (catalog) => (
      <Chip size="small" color={catalog.isSystem ? 'primary' : 'default'} label={catalog.isSystem ? 'Sistema' : 'Propio'} />
    ),
  },
];

type FormState = { open: false } | { open: true; catalog: Catalog | null };

/** Pantalla de administración «Catálogos». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function CatalogsPage() {
  const can = useCan();
  const [form, setForm] = useState<FormState>({ open: false });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [catalogToDelete, setCatalogToDelete] = useState<Catalog | null>(null);

  const table = useTableQueryState<'isSystem'>({
    filterKeys: FILTER_KEYS,
    sortableFields: SORTABLE,
    defaultSort: DEFAULT_SORT,
  });
  const catalogs = useCatalogs(table.apiQuery);
  const deleteMutation = useDeleteCatalog();

  const canCreate = can(CATALOG_PERMISSIONS.create);
  const canEdit = can(CATALOG_PERMISSIONS.edit);
  const canDelete = can(CATALOG_PERMISSIONS.remove);

  const rowActions = (catalog: Catalog) => (
    <>
      <IconButton aria-label={`Elementos de ${catalog.name}`} onClick={() => setDetailId(catalog.id)}>
        <ListAltOutlinedIcon />
      </IconButton>
      {canEdit ? (
        <IconButton aria-label={`Editar ${catalog.name}`} onClick={() => setForm({ open: true, catalog })}>
          <EditOutlinedIcon />
        </IconButton>
      ) : null}
      {canDelete && !catalog.isSystem ? (
        <IconButton
          aria-label={`Eliminar ${catalog.name}`}
          onClick={() => {
            deleteMutation.reset();
            setCatalogToDelete(catalog);
          }}
        >
          <DeleteOutlineIcon />
        </IconButton>
      ) : null}
    </>
  );

  return (
    <>
      <PageHeader
        title={TITLE}
        subtitle="Catálogos de valores y sus elementos."
        breadcrumbs={adminBreadcrumbs(TITLE)}
        actions={
          canCreate ? (
            <Button startIcon={<AddIcon />} onClick={() => setForm({ open: true, catalog: null })}>
              Nuevo catálogo
            </Button>
          ) : null
        }
      />

      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Buscar por clave o nombre"
            size="small"
            value={table.searchInput}
            onChange={(event) => table.setSearchInput(event.target.value)}
            sx={{ flex: 1 }}
          />
          <TextField
            select
            label="Tipo"
            size="small"
            value={table.state.filters.isSystem ?? ''}
            onChange={(event) => table.setFilter('isSystem', event.target.value || undefined)}
            sx={{ minWidth: { sm: '12rem' } }}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="true">Sistema</MenuItem>
            <MenuItem value="false">Propios</MenuItem>
          </TextField>
        </Stack>

        <DataTable
          label="Catálogos"
          columns={COLUMNS}
          rows={catalogs.data?.data}
          getRowId={(catalog) => catalog.id}
          totalItems={catalogs.data?.pagination.totalItems ?? 0}
          page={table.state.page}
          pageSize={table.state.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          sort={table.state.sort}
          onSortChange={table.setSort}
          isLoading={catalogs.isPending}
          isFetching={catalogs.isFetching}
          errorMessage={catalogs.isError ? describeApiError(catalogs.error).message : null}
          onRetry={() => void catalogs.refetch()}
          emptyTitle="No hay catálogos"
          rowActions={rowActions}
        />
      </Stack>

      <CatalogFormDialog
        open={form.open}
        catalog={form.open ? form.catalog : null}
        onClose={() => setForm({ open: false })}
      />
      <CatalogDetailDialog catalogId={detailId} onClose={() => setDetailId(null)} />
      <ConfirmDialog
        open={catalogToDelete !== null}
        title="Eliminar catálogo"
        description={
          catalogToDelete ? `Se eliminará «${catalogToDelete.name}». Sólo es posible si no tiene ningún elemento.` : undefined
        }
        confirmLabel="Eliminar"
        destructive
        isPending={deleteMutation.isPending}
        errorMessage={
          deleteMutation.isError ? describeApiError(deleteMutation.error, CATALOG_DELETE_ERRORS).message : null
        }
        onConfirm={() => {
          if (catalogToDelete) {
            deleteMutation.mutate(catalogToDelete.id, { onSuccess: () => setCatalogToDelete(null) });
          }
        }}
        onClose={() => setCatalogToDelete(null)}
      />
    </>
  );
}
