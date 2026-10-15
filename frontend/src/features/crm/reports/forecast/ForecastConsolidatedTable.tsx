import { Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn, type UseTableQueryStateResult } from '@/components/data';
import type { PaginatedResponse } from '@/types/api';

import { EMPTY_REPORT_TITLE } from '../common/ReportTable';
import { formatMonth, formatTons, monthKey } from '../common/report-format';
import type { ForecastMonthRef } from '../common/report-types';
import { reportErrorMessage } from '../reports.errors';

import { FORECAST_GROUP_BY, type ForecastGroup, type ForecastGroupBy } from './forecast-report.api';
import { flattenGroups, FORECAST_GROUP_LABELS, quantitiesText, withoutConversionText, type ConsolidatedRow } from './forecast-report-format';

/**
 * Vista "Consolidado" del forecast (05 E.4, RN-05.36): matriz con una fila por grupo (y sus
 * subgrupos con `thenBy`), una columna por mes del rango y "Total". Cada celda muestra las
 * toneladas; el total del grupo, además, las cantidades por unidad y las líneas sin conversión
 * (nunca se suman unidades distintas). `groupBy`/`thenBy` y la página de grupos viven en la URL.
 */
export interface ForecastConsolidatedTableProps {
  query: UseQueryResult<PaginatedResponse<ForecastGroup>>;
  table: UseTableQueryStateResult<'groupBy' | 'thenBy'>;
  /** Meses del rango aplicado (del resumen), para las columnas. */
  months: readonly ForecastMonthRef[];
  groupBy: ForecastGroupBy;
  thenBy: ForecastGroupBy | null;
  onClearFilters: () => void;
}

function columnsFor(months: readonly ForecastMonthRef[], groupBy: ForecastGroupBy): DataTableColumn<ConsolidatedRow>[] {
  return [
    {
      id: 'group',
      header: FORECAST_GROUP_LABELS[groupBy],
      primary: true,
      render: (row) => (
        <Typography variant="body2" component="span" sx={{ pl: row.level === 1 ? 2 : 0, fontWeight: row.level === 0 ? 600 : 400, overflowWrap: 'anywhere' }}>
          {row.label}
        </Typography>
      ),
    },
    ...months.map<DataTableColumn<ConsolidatedRow>>((month) => ({
      id: monthKey(month),
      header: formatMonth(month),
      align: 'right',
      render: (row) => {
        const cell = row.byMonth.get(monthKey(month));
        return (
          <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
            {cell ? formatTons(cell.tonnage) : formatTons('0')}
          </Box>
        );
      },
    })),
    {
      id: 'total',
      header: 'Total',
      align: 'right',
      render: (row) => {
        const withoutConversion = withoutConversionText(row.total.linesWithoutConversion);
        return (
          <Stack component="span" sx={{ alignItems: 'flex-end' }}>
            <Typography variant="body2" component="span" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
              {formatTons(row.total.tonnage)}
            </Typography>
            <Typography variant="caption" component="span" color="text.secondary">
              {quantitiesText(row.total.quantities)}
            </Typography>
            {withoutConversion ? (
              <Typography variant="caption" component="span" color="warning.main">
                {withoutConversion}
              </Typography>
            ) : null}
          </Stack>
        );
      },
    },
  ];
}

export function ForecastConsolidatedTable({ query, table, months, groupBy, thenBy, onClearFilters }: ForecastConsolidatedTableProps) {
  const columns = useMemo(() => columnsFor(months, groupBy), [months, groupBy]);
  const rows = useMemo(() => (query.data ? flattenGroups(query.data.data) : undefined), [query.data]);

  return (
    <Paper component="section" aria-label="Forecast consolidado: resultados" sx={{ overflow: 'hidden', boxShadow: 1 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ px: { xs: 2, md: 2.5 }, py: 2, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          select
          size="small"
          label="Agrupar por"
          value={groupBy}
          onChange={(event) => {
            const next = event.target.value as ForecastGroupBy;
            table.setFilters({ groupBy: next === 'MONTH' ? undefined : next, thenBy: thenBy === next ? undefined : (thenBy ?? undefined) });
          }}
          sx={{ minWidth: (theme) => theme.spacing(22) }}
        >
          {FORECAST_GROUP_BY.map((value) => (
            <MenuItem key={value} value={value}>
              {FORECAST_GROUP_LABELS[value]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Luego por"
          value={thenBy ?? ''}
          onChange={(event) => table.setFilter('thenBy', event.target.value || undefined)}
          sx={{ minWidth: (theme) => theme.spacing(22) }}
        >
          <MenuItem value="">Sin segundo nivel</MenuItem>
          {FORECAST_GROUP_BY.filter((value) => value !== groupBy).map((value) => (
            <MenuItem key={value} value={value}>
              {FORECAST_GROUP_LABELS[value]}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <DataTable
        label="Forecast consolidado"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        totalItems={query.data?.pagination.totalItems ?? 0}
        page={table.state.page}
        pageSize={table.state.pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        errorMessage={query.isError ? reportErrorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        emptyTitle={EMPTY_REPORT_TITLE}
        emptyDescription="Prueba con otro rango de meses o quita algún filtro."
        emptyAction={
          <Button variant="outlined" onClick={onClearFilters}>
            Limpiar filtros
          </Button>
        }
        cardsBelow="sm"
      />
    </Paper>
  );
}
