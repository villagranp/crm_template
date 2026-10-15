import { Box, Tab, Tabs, Typography } from '@mui/material';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useTableQueryState, type DataTableColumn } from '@/components/data';
import { customerDetailPath } from '@/features/crm/customers';
import { projectDetailPath } from '@/features/crm/projects';
import type { ListQuery } from '@/lib/query-keys';

import { ReportPage } from '../common/ReportPage';
import { ReportDateTime } from '../common/ReportDateTime';
import { ReportFilterBar, type ReportFilterField } from '../common/ReportFilterBar';
import { namedOptions, ownerOptions } from '../common/report-filter-options';
import { formatMonth, formatQuantityWithUnit } from '../common/report-format';
import type { ReportFilterOptions } from '../common/report-types';
import { ReportTable } from '../common/ReportTable';
import { SourceLink } from '../common/SourceLink';
import { useReportExport } from '../common/use-report-export';
import { useReportQueryState, type ReportPeriodMode } from '../common/use-report-query-state';
import { useReportFilterOptions } from '../filter-options.queries';
import { useForecastConsolidated, useForecastReport, useForecastReportSummary } from '../report.queries';
import { reportErrorMessage } from '../reports.errors';
import { REPORT_SOURCE_PERMISSIONS } from '../reports.permissions';

import { ForecastConsolidatedTable } from './ForecastConsolidatedTable';
import {
  exportForecastReport,
  FORECAST_GROUP_BY,
  FORECAST_REPORT_FILTER_KEYS,
  FORECAST_REPORT_SORT_FIELDS,
  type ForecastGroupBy,
  type ForecastReportRow,
} from './forecast-report.api';
import { monthsOfRange, tonnageText } from './forecast-report-format';
import { ForecastSummaryPanel } from './ForecastSummaryPanel';

const TITLE = 'Reporte de forecast';
const DEFAULT_SORT = { field: 'period', direction: 'asc' } as const;
/** Sin `fromMonth`/`toMonth`, la API aplica M+1…M+6 en la zona del negocio (C.2). */
const PERIOD: ReportPeriodMode = { kind: 'months' };

/** Vista en la URL (`?vista=consolidado`); por defecto, el detalle. */
const VIEW_PARAM = 'vista';
const CONSOLIDATED_VIEW = 'consolidado';
/** Parámetros del consolidado con su propio prefijo (`consolidado.groupBy`, `consolidado.page`…). */
const CONSOLIDATED_PREFIX = 'consolidado.';
const CONSOLIDATED_KEYS = ['groupBy', 'thenBy'] as const;

function isGroupBy(value: string | undefined): value is ForecastGroupBy {
  return (FORECAST_GROUP_BY as readonly string[]).includes(value ?? '');
}

function filterFields(options: ReportFilterOptions | undefined): ReportFilterField[] {
  const disabled = !options;
  return [
    { key: 'ownerId', label: 'Asesor', kind: 'autocomplete', options: ownerOptions(options?.owners), disabled },
    { key: 'customerId', label: 'Cliente', kind: 'customer' },
    { key: 'projectId', label: 'Proyecto', kind: 'project', customerKey: 'customerId' },
    { key: 'productFamilyId', label: 'Familia de producto', kind: 'select', options: namedOptions(options?.productFamilies), disabled },
    { key: 'productId', label: 'Producto', kind: 'product' },
    { key: 'countryId', label: 'País', kind: 'select', options: namedOptions(options?.countries), disabled },
  ];
}

const COLUMNS: DataTableColumn<ForecastReportRow>[] = [
  {
    id: 'projectName',
    header: 'Proyecto',
    sortable: true,
    primary: true,
    render: (row) => (
      <SourceLink to={projectDetailPath(row.project.id)} permission={REPORT_SOURCE_PERMISSIONS.project} label={`Abrir el proyecto ${row.project.code}`}>
        {`${row.project.code} · ${row.project.name}`}
      </SourceLink>
    ),
  },
  {
    id: 'customer',
    header: 'Cliente',
    render: (row) => (
      <SourceLink to={customerDetailPath(row.customer.id)} permission={REPORT_SOURCE_PERMISSIONS.customer}>
        {row.customer.name}
      </SourceLink>
    ),
  },
  { id: 'productSku', header: 'Producto', sortable: true, render: (row) => `${row.product.sku} · ${row.product.description}` },
  { id: 'familyName', header: 'Familia', sortable: true, hideOnMobile: true, render: (row) => row.family.name },
  { id: 'year', header: 'Año', hideOnMobile: true, render: (row) => row.year },
  { id: 'period', header: 'Mes', sortable: true, render: (row) => formatMonth(row) },
  { id: 'quantity', header: 'Cantidad', align: 'right', render: (row) => formatQuantityWithUnit(row.quantity, row.unit.symbol) },
  { id: 'unit', header: 'Unidad', hideOnMobile: true, render: (row) => row.unit.code },
  {
    id: 'tonnage',
    header: 'Tonelaje (t)',
    sortable: true,
    align: 'right',
    render: (row) => (
      <Typography variant="body2" component="span" color={row.tonnage === null ? 'warning.main' : undefined} sx={{ whiteSpace: 'nowrap' }}>
        {tonnageText(row.tonnage)}
      </Typography>
    ),
  },
  { id: 'ownerName', header: 'Asesor', sortable: true, render: (row) => row.owner.displayName },
  { id: 'updatedAt', header: 'Actualización', sortable: true, hideOnMobile: true, render: (row) => <ReportDateTime value={row.updatedAt} /> },
];

/**
 * Reporte de forecast (05 F-36, E.4): por defecto M+1…M+6 (AC-05.12), resumen con totales
 * mensuales y acumulados en toneladas, cantidades por unidad y líneas sin conversión
 * (AC-05.13), pestañas "Detalle" (una fila por línea) y "Consolidado" (`groupBy`/`thenBy`,
 * AC-05.14). La exportación lleva el detalle y, desde "Consolidado", también esa hoja.
 */
export function ForecastReportPage() {
  const state = useReportQueryState({
    filterKeys: FORECAST_REPORT_FILTER_KEYS,
    sortableFields: FORECAST_REPORT_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
    period: PERIOD,
  });
  const consolidatedTable = useTableQueryState<(typeof CONSOLIDATED_KEYS)[number]>({ filterKeys: CONSOLIDATED_KEYS, paramPrefix: CONSOLIDATED_PREFIX });
  const [searchParams, setSearchParams] = useSearchParams();
  const isConsolidated = searchParams.get(VIEW_PARAM) === CONSOLIDATED_VIEW;
  const groupFilters = consolidatedTable.state.filters;
  const groupBy: ForecastGroupBy = isGroupBy(groupFilters.groupBy) ? groupFilters.groupBy : 'MONTH';
  const thenBy: ForecastGroupBy | null = isGroupBy(groupFilters.thenBy) && groupFilters.thenBy !== groupBy ? groupFilters.thenBy : null;

  const consolidatedQuery = useMemo<ListQuery>(
    () => ({
      ...state.filterQuery,
      page: consolidatedTable.state.page,
      pageSize: consolidatedTable.state.pageSize,
      groupBy,
      thenBy: thenBy ?? undefined,
    }),
    [state.filterQuery, consolidatedTable.state.page, consolidatedTable.state.pageSize, groupBy, thenBy],
  );

  const options = useReportFilterOptions();
  const summary = useForecastReportSummary(state.filterQuery);
  const detail = useForecastReport(state.listQuery, !isConsolidated);
  const consolidated = useForecastConsolidated(consolidatedQuery, isConsolidated);
  const exporter = useReportExport({
    request: () => exportForecastReport(isConsolidated ? { ...state.exportQuery, groupBy, thenBy: thenBy ?? undefined } : state.exportQuery),
    fallbackFileName: 'reporte-forecast.xlsx',
  });
  const fields = useMemo(() => filterFields(options.data), [options.data]);
  const range = summary.data?.range ?? null;
  const months = useMemo(() => (range ? monthsOfRange(range.from, range.to) : []), [range]);

  const setView = (view: 'detalle' | 'consolidado') =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (view === CONSOLIDATED_VIEW) {
          next.set(VIEW_PARAM, CONSOLIDATED_VIEW);
        } else {
          next.delete(VIEW_PARAM);
        }
        return next;
      },
      { replace: true },
    );

  return (
    <ReportPage title={TITLE} subtitle="Proyecciones por mes en toneladas y en su unidad." exporter={exporter} filterOptionsFailed={options.isError}>
      <ReportFilterBar
        label="Filtros del reporte de forecast"
        fields={fields}
        values={state.values}
        onApply={state.apply}
        onClear={state.clear}
        period={{ kind: 'months', appliedRange: range }}
      />
      <ForecastSummaryPanel
        summary={summary.data}
        isLoading={summary.isPending}
        errorMessage={summary.isError ? reportErrorMessage(summary.error) : null}
        onRetry={() => void summary.refetch()}
      />
      <Box>
        <Tabs value={isConsolidated ? CONSOLIDATED_VIEW : 'detalle'} onChange={(_, value: 'detalle' | 'consolidado') => setView(value)} aria-label="Vista del forecast">
          <Tab value="detalle" label="Detalle" />
          <Tab value={CONSOLIDATED_VIEW} label="Consolidado" />
        </Tabs>
      </Box>
      {isConsolidated ? (
        <ForecastConsolidatedTable query={consolidated} table={consolidatedTable} months={months} groupBy={groupBy} thenBy={thenBy} onClearFilters={state.clear} />
      ) : (
        <ReportTable label={TITLE} columns={COLUMNS} query={detail} state={state} getRowId={(row) => row.id} />
      )}
    </ReportPage>
  );
}
