import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ToggleOffOutlinedIcon from '@mui/icons-material/ToggleOffOutlined';
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined';
import { IconButton, Tooltip } from '@mui/material';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  AdminListCard,
  DataTable,
  describeApiError,
  FilterChips,
  ListToolbar,
  recordsSubtitle,
  RefreshTool,
  type DataTableColumn,
  type Paginated,
  type UseTableQueryStateResult,
} from '@/features/admin/common';

import { ACTIVE_FILTER_CHIPS } from '../products-format';

export interface MasterListCardProps<TRow extends { id: string; isActive: boolean }> {
  title: string;
  description: string;
  icon: ReactNode;
  table: UseTableQueryStateResult<'isActive'>;
  query: UseQueryResult<Paginated<TRow>>;
  columns: readonly DataTableColumn<TRow>[];
  /** Nombre de la fila en los nombres accesibles de sus acciones ("Editar VAR-3"). */
  nameOf: (row: TRow) => string;
  searchLabel: string;
  createLabel: string;
  emptyTitle: string;
  /** `productos.configurar`: sin él no hay alta, edición ni activar/desactivar (UX; el backend vuelve a exigirlo). */
  canConfigure: boolean;
  onRefresh: () => void;
  onCreate: () => void;
  onEdit: (row: TRow) => void;
  onToggleActive: (row: TRow) => void;
}

/**
 * Tarjeta de listado común a las pestañas de «Productos y unidades»: filtro de
 * estado y búsqueda en la URL, tabla (tarjetas bajo `sm`) con sus cuatro
 * estados y acciones de editar y activar/desactivar. No hay borrado (07 F.7).
 */
export function MasterListCard<TRow extends { id: string; isActive: boolean }>({
  title,
  description,
  icon,
  table,
  query,
  columns,
  nameOf,
  searchLabel,
  createLabel,
  emptyTitle,
  canConfigure,
  onRefresh,
  onCreate,
  onEdit,
  onToggleActive,
}: MasterListCardProps<TRow>) {
  const rowActions = canConfigure
    ? (row: TRow) => (
        <>
          <IconButton aria-label={`Editar ${nameOf(row)}`} onClick={() => onEdit(row)}>
            <EditOutlinedIcon />
          </IconButton>
          <Tooltip title={row.isActive ? 'Desactivar' : 'Activar'}>
            <IconButton
              aria-label={`${row.isActive ? 'Desactivar' : 'Activar'} ${nameOf(row)}`}
              onClick={() => onToggleActive(row)}
            >
              {row.isActive ? <ToggleOnOutlinedIcon color="success" /> : <ToggleOffOutlinedIcon />}
            </IconButton>
          </Tooltip>
        </>
      )
    : undefined;

  return (
    <AdminListCard
      icon={icon}
      title={title}
      subtitle={recordsSubtitle(query.data?.pagination.totalItems, description)}
      tools={<RefreshTool busy={query.isFetching} onRefresh={onRefresh} />}
      toolbar={
        <ListToolbar
          filters={
            <FilterChips
              label="Filtrar por estado"
              value={table.state.filters.isActive ?? ''}
              onChange={(value) => table.setFilter('isActive', value || undefined)}
              options={ACTIVE_FILTER_CHIPS}
            />
          }
          search={{ value: table.searchInput, onChange: table.setSearchInput, label: searchLabel }}
          primaryAction={canConfigure ? { label: createLabel, onClick: onCreate } : undefined}
        />
      }
    >
      <DataTable
        label={title}
        columns={columns}
        rows={query.data?.data}
        getRowId={(row) => row.id}
        totalItems={query.data?.pagination.totalItems ?? 0}
        page={table.state.page}
        pageSize={table.state.pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        sort={table.state.sort}
        onSortChange={table.setSort}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        errorMessage={query.isError ? describeApiError(query.error).message : null}
        onRetry={() => void query.refetch()}
        emptyTitle={emptyTitle}
        emptyDescription={
          table.state.search || table.state.filters.isActive
            ? 'Prueba con otros filtros.'
            : undefined
        }
        rowActions={rowActions}
      />
    </AdminListCard>
  );
}
