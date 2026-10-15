import { Button, Paper } from '@mui/material';
import type { UseQueryResult } from '@tanstack/react-query';

import { DataTable, type DataTableColumn, type TableSort } from '@/components/data';
import type { PaginatedResponse } from '@/types/api';

import { reportErrorMessage } from '../reports.errors';

/**
 * Tabla de un reporte (05 E.1): `DataTable` (PLAN-ADMIN D14, sin librería nueva) con
 * paginación, orden y filtros en el servidor y en la URL, tarjetas por debajo de `sm`, y los
 * estados de la pantalla: cargando (esqueletos), vacío ("No hay registros para los filtros
 * seleccionados" + "Limpiar filtros") y error (mensaje + referencia + "Reintentar").
 */
export interface ReportTableProps<TRow> {
  /** Nombre accesible de la tabla (p. ej. "Reporte de proyectos"); selector estable del E2E. */
  label: string;
  columns: readonly DataTableColumn<TRow>[];
  query: UseQueryResult<PaginatedResponse<TRow>>;
  /** Paginación, orden y "limpiar" de `useReportQueryState` (los filtros concretos no importan aquí). */
  state: ReportTablePaging;
  getRowId: (row: TRow) => string;
}

export interface ReportTablePaging {
  table: {
    state: { page: number; pageSize: number; sort: TableSort | null };
    setPage: (page: number) => void;
    setPageSize: (pageSize: number) => void;
    setSort: (sort: TableSort | null) => void;
  };
  clear: () => void;
}

export const EMPTY_REPORT_TITLE = 'No hay registros para los filtros seleccionados';

export function ReportTable<TRow>({ label, columns, query, state, getRowId }: ReportTableProps<TRow>) {
  const { table } = state;
  return (
    <Paper component="section" aria-label={`${label}: resultados`} sx={{ overflow: 'hidden', boxShadow: 1 }}>
      <DataTable
        label={label}
        columns={columns}
        rows={query.data?.data}
        getRowId={getRowId}
        totalItems={query.data?.pagination.totalItems ?? 0}
        page={table.state.page}
        pageSize={table.state.pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        sort={table.state.sort}
        onSortChange={table.setSort}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        errorMessage={query.isError ? reportErrorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        emptyTitle={EMPTY_REPORT_TITLE}
        emptyDescription="Prueba con otro período o quita algún filtro."
        emptyAction={
          <Button variant="outlined" onClick={state.clear}>
            Limpiar filtros
          </Button>
        }
        cardsBelow="sm"
      />
    </Paper>
  );
}
