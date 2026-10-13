import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { Alert, Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';

import { ConfirmDialog, DataTable, DEFAULT_PAGE_SIZE, EmptyState, type DataTableColumn } from '@/components/data';
import { formatQuantity, formatTonnage } from '@/features/crm/common/decimal';
import { describeApiError } from '@/lib/api-error-view';

import { ConversionBadge } from '../components/ConversionBadge';
import { productLabel } from '../project-format';
import type { ProjectDetail, ProjectFormOptions } from '../projects.api';
import { forecastPeriodsOf, PROJECT_ERROR_MESSAGES, withReference } from '../projects.errors';
import type { ProjectProduct, ProjectProductTotals } from '../products/project-products.api';
import { useDeleteProjectProduct, useProjectProducts } from '../products/project-products.queries';
import { ProjectProductFormDialog } from '../products/ProjectProductFormDialog';

import { SectionCard } from './SectionCard';

const DEFAULT_SORT = { field: 'sku', direction: 'asc' } as const;

const COLUMNS: DataTableColumn<ProjectProduct>[] = [
  {
    id: 'sku',
    header: 'Producto',
    sortable: true,
    primary: true,
    render: (line) => (
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
          {productLabel(line.product)}
        </Typography>
        {line.product.isActive ? null : (
          <Typography variant="caption" color="warning.main">
            Producto inactivo
          </Typography>
        )}
      </Box>
    ),
  },
  { id: 'family', header: 'Familia', hideOnMobile: true, render: (line) => line.product.family.name },
  { id: 'quantity', header: 'Cantidad', align: 'right', render: (line) => formatQuantity(line.quantity, line.unit.symbol) },
  {
    id: 'tonnage',
    header: 'Tonelaje',
    align: 'right',
    render: (line) => (line.conversion && line.tonnage !== null ? formatTonnage(line.tonnage) : <ConversionBadge conversion={null} />),
  },
  {
    id: 'status',
    header: 'Estado',
    render: (line) => (
      <Chip size="small" variant={line.status.isActive ? 'filled' : 'outlined'} color={line.status.isActive ? 'primary' : 'default'} label={line.status.label} />
    ),
  },
  { id: 'opportunity', header: 'Oportunidad', hideOnMobile: true, render: (line) => line.opportunity?.code ?? 'Sin oportunidad' },
];

function TotalsFooter({ totals }: { totals: ProjectProductTotals }) {
  return (
    <Box
      component="dl"
      aria-label="Totales de productos"
      sx={{ m: 0, mt: 2, p: 2, borderRadius: 1, bgcolor: 'background.subtle', display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' } }}
    >
      <Box>
        <Typography component="dt" variant="caption" color="text.secondary">
          Total en toneladas
        </Typography>
        <Typography component="dd" variant="body1" sx={{ m: 0, fontWeight: 'fontWeightMedium' }}>
          {formatTonnage(totals.tonnage)}
        </Typography>
      </Box>
      <Box>
        <Typography component="dt" variant="caption" color="text.secondary">
          Cantidades por unidad
        </Typography>
        <Typography component="dd" variant="body2" sx={{ m: 0 }}>
          {totals.quantitiesByUnit.length > 0 ? totals.quantitiesByUnit.map((item) => formatQuantity(item.quantity, item.unit.symbol)).join(' · ') : '—'}
        </Typography>
      </Box>
      <Box>
        <Typography component="dt" variant="caption" color="text.secondary">
          Sin conversión
        </Typography>
        <Typography component="dd" variant="body2" sx={{ m: 0 }}>
          {totals.linesWithoutConversion === 1
            ? '1 línea no suma en toneladas'
            : `${totals.linesWithoutConversion} líneas no suman en toneladas`}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ gridColumn: '1 / -1' }}>
        Sólo suman las líneas con estado activo; las cantidades nunca se mezclan entre unidades.
      </Typography>
    </Box>
  );
}

export interface ProjectProductsSectionProps {
  project: ProjectDetail;
  options: ProjectFormOptions | undefined;
}

/**
 * Sección 6 · Productos asociados (03 §E.4, F-19). Totales del backend sobre
 * todas las líneas (RN-03.31, RN-03.60): toneladas sólo de los estados activos,
 * cantidades agrupadas por unidad y conteo de líneas sin conversión.
 */
export function ProjectProductsSection({ project, options }: ProjectProductsSectionProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' }>(DEFAULT_SORT);
  const query = { page, pageSize, sortBy: sort.field, sortOrder: sort.direction };
  const products = useProjectProducts(project.id, query);
  const removal = useDeleteProjectProduct(project.id);
  const [editing, setEditing] = useState<ProjectProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<ProjectProduct | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canEdit = project.capabilities.canEdit;

  const periods = forecastPeriodsOf(removal.error);
  const removeError = removal.isError
    ? periods.length > 0
      ? `No se puede quitar: tiene forecast en ${periods.join(', ')}. Pon esas cantidades a 0 o asocia el producto de nuevo antes de quitarlo.`
      : withReference(describeApiError(removal.error, PROJECT_ERROR_MESSAGES))
    : null;

  const openCreate = () => {
    setNotice(null);
    setCreating(true);
  };

  const action = canEdit ? (
    <Button size="small" variant="outlined" startIcon={<AddIcon />} disabled={!options} onClick={openCreate}>
      Asociar producto
    </Button>
  ) : null;

  const data = products.data;
  const isEmpty = data && data.pagination.totalItems === 0;

  return (
    <SectionCard title="Productos asociados" actions={action}>
      <Stack spacing={2}>
        {notice ? (
          <Alert severity="success" role="status" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        ) : null}
        {isEmpty ? (
          <EmptyState
            icon={<Inventory2OutlinedIcon />}
            title="Sin productos asociados"
            description="Asocia productos del catálogo con sus cantidades para estimar el tonelaje y proyectar el forecast."
            action={
              canEdit ? (
                <Button disabled={!options} onClick={openCreate}>
                  Asociar producto
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Box sx={{ mx: { xs: -2, sm: -2.5 } }}>
            <DataTable
              label="Productos asociados"
              columns={COLUMNS}
              rows={data?.data}
              getRowId={(line) => line.id}
              totalItems={data?.pagination.totalItems ?? 0}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              sort={sort}
              onSortChange={(next) => {
                setSort(next);
                setPage(1);
              }}
              isLoading={products.isPending}
              isFetching={products.isFetching}
              errorMessage={products.isError ? withReference(describeApiError(products.error, PROJECT_ERROR_MESSAGES)) : null}
              onRetry={() => void products.refetch()}
              emptyTitle="Sin productos asociados"
              rowActions={
                canEdit
                  ? (line) => (
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Editar">
                          <span>
                            <IconButton
                              aria-label={`Editar ${line.product.sku}`}
                              disabled={!options}
                              onClick={() => {
                                setNotice(null);
                                setEditing(line);
                              }}
                            >
                              <EditOutlinedIcon />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Quitar">
                          <IconButton
                            aria-label={`Quitar ${line.product.sku}`}
                            onClick={() => {
                              removal.reset();
                              setRemoving(line);
                            }}
                          >
                            <DeleteOutlineIcon />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    )
                  : undefined
              }
            />
          </Box>
        )}
        {data && !isEmpty ? <TotalsFooter totals={data.totals} /> : null}
      </Stack>

      {canEdit && options ? (
        <ProjectProductFormDialog
          open={creating || editing !== null}
          project={project}
          options={options}
          line={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(line) => {
            setNotice(editing ? `Producto ${line.product.sku} actualizado.` : `Producto ${line.product.sku} asociado.`);
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        destructive
        title="Quitar producto"
        description={
          removing
            ? `«${productLabel(removing.product)}» dejará de estar asociado al proyecto. Su historia se conserva.`
            : undefined
        }
        confirmLabel="Quitar"
        isPending={removal.isPending}
        errorMessage={removeError}
        onConfirm={() => {
          if (!removing) return;
          removal.mutate(removing.id, {
            onSuccess: () => {
              setNotice(`Producto ${removing.product.sku} quitado.`);
              setRemoving(null);
            },
          });
        }}
        onClose={() => {
          setRemoving(null);
          removal.reset();
        }}
      />
    </SectionCard>
  );
}
