import { Alert, Box, Stack, Typography } from '@mui/material';
import { useMemo } from 'react';

import type { DataTableColumn } from '@/components/data';
import { customerDetailPath } from '@/features/crm/customers';
import { opportunityDetailPath, projectDetailPath } from '@/features/crm/projects';

import { ReportPage } from '../common/ReportPage';
import { ReportDateTime } from '../common/ReportDateTime';
import { ReportFilterBar, type ReportFilterField } from '../common/ReportFilterBar';
import { catalogOptions, enumOptions, namedOptions, ownerOptions } from '../common/report-filter-options';
import { EMPTY, formatTons, formatUsd } from '../common/report-format';
import type { ReportFilterOptions } from '../common/report-types';
import { ReportTable } from '../common/ReportTable';
import { SourceLink } from '../common/SourceLink';
import { SummaryCards, type SummaryCardItem } from '../common/SummaryCards';
import { useReportExport } from '../common/use-report-export';
import { useReportQueryState, type ReportPeriodMode } from '../common/use-report-query-state';
import { useReportFilterOptions } from '../filter-options.queries';
import { useOpportunityReport, useOpportunityReportSummary } from '../report.queries';
import { reportErrorMessage } from '../reports.errors';
import { REPORT_SOURCE_PERMISSIONS } from '../reports.permissions';

import {
  exportOpportunityReport,
  OPPORTUNITY_DATE_BASES,
  OPPORTUNITY_REPORT_FILTER_KEYS,
  OPPORTUNITY_REPORT_SORT_FIELDS,
  OPPORTUNITY_STATUS_FILTERS,
  type OpportunityReportRow,
  type OpportunityReportSummary,
} from './opportunities-report.api';
import { OpportunityDistributions } from './OpportunityDistributions';
import {
  DECIDED_BASIS_NOTE,
  decisionDateText,
  estimateLines,
  localReferenceText,
  OPPORTUNITY_DATE_BASIS_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  resultText,
} from './opportunity-report-format';

const TITLE = 'Reporte de oportunidades';
const DEFAULT_SORT = { field: 'updatedAt', direction: 'desc' } as const;
/** Sin período por defecto; base `IDENTIFIED` (C.2). */
const PERIOD: ReportPeriodMode = { kind: 'dates', defaultPreset: null, defaultDateBasis: 'IDENTIFIED' };

function filterFields(options: ReportFilterOptions | undefined): ReportFilterField[] {
  const disabled = !options;
  return [
    { key: 'status', label: 'Estado', kind: 'select', options: enumOptions(OPPORTUNITY_STATUS_FILTERS, OPPORTUNITY_STATUS_LABELS) },
    { key: 'stageId', label: 'Etapa', kind: 'select', options: catalogOptions(options?.catalogs.opportunityStages), disabled },
    { key: 'ownerId', label: 'Asesor', kind: 'autocomplete', options: ownerOptions(options?.owners), disabled },
    { key: 'customerId', label: 'Cliente', kind: 'customer' },
    { key: 'countryId', label: 'País', kind: 'select', options: namedOptions(options?.countries), disabled },
    { key: 'productFamilyId', label: 'Familia de producto', kind: 'select', options: namedOptions(options?.productFamilies), disabled },
    { key: 'productId', label: 'Producto', kind: 'product' },
  ];
}

function EstimateCell({ row }: { row: OpportunityReportRow }) {
  const lines = estimateLines(row.estimate);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" component="span" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
        {lines.original}
      </Typography>
      {lines.usd ? (
        <Typography variant="caption" component="span" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
          {lines.usd}
        </Typography>
      ) : null}
      {lines.tonnage ? (
        <Typography variant="caption" component="span" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
          {lines.tonnage}
        </Typography>
      ) : null}
    </Box>
  );
}

const COLUMNS: DataTableColumn<OpportunityReportRow>[] = [
  {
    id: 'code',
    header: 'Código',
    sortable: true,
    primary: true,
    render: (row) => (
      <SourceLink to={opportunityDetailPath(row.id)} permission={REPORT_SOURCE_PERMISSIONS.opportunity} label={`Abrir la oportunidad ${row.code}`}>
        {row.code}
      </SourceLink>
    ),
  },
  {
    id: 'projectName',
    header: 'Proyecto',
    sortable: true,
    render: (row) => (
      <SourceLink to={projectDetailPath(row.project.id)} permission={REPORT_SOURCE_PERMISSIONS.project}>
        {`${row.project.code} · ${row.project.name}`}
      </SourceLink>
    ),
  },
  {
    id: 'customerName',
    header: 'Cliente',
    sortable: true,
    render: (row) => (
      <SourceLink to={customerDetailPath(row.customer.id)} permission={REPORT_SOURCE_PERMISSIONS.customer}>
        {row.customer.name}
      </SourceLink>
    ),
  },
  { id: 'ownerName', header: 'Asesor', sortable: true, render: (row) => row.owner.displayName },
  { id: 'stageOrder', header: 'Etapa', sortable: true, render: (row) => row.stage.label },
  { id: 'result', header: 'Resultado', render: (row) => resultText(row.result) },
  { id: 'estimatedAmountUsd', header: 'Estimación', sortable: true, align: 'right', render: (row) => <EstimateCell row={row} /> },
  { id: 'decisionDate', header: 'Fecha de decisión', sortable: true, render: (row) => decisionDateText(row) },
  { id: 'updatedAt', header: 'Actualización', sortable: true, hideOnMobile: true, render: (row) => <ReportDateTime value={row.updatedAt} /> },
];

function summaryItems(summary: OpportunityReportSummary | undefined): SummaryCardItem[] {
  if (!summary) {
    return [];
  }
  const items: SummaryCardItem[] = [
    { key: 'total', label: 'Total', value: summary.total },
    { key: 'open', label: 'Abiertas', value: summary.open, tone: 'info', filterValue: 'OPEN' },
    { key: 'won', label: 'Ganadas', value: summary.won, tone: 'success', filterValue: 'WON', detail: `de las cuales parciales: ${summary.partial}` },
    { key: 'lost', label: 'Perdidas', value: summary.lost, tone: 'error', filterValue: 'LOST' },
    { key: 'partial', label: 'Resultados parciales', value: summary.partial, tone: 'success', filterValue: 'PARTIAL' },
  ];
  if (summary.closedWithoutResult > 0) {
    items.push({ key: 'closedWithoutResult', label: 'Cerradas sin resultado', value: summary.closedWithoutResult, tone: 'warning', filterValue: 'CLOSED_NO_RESULT' });
  }
  return items;
}

/** Totales de la estimación (RN-05.13, RN-05.58): un solo total en USD + toneladas; la referencia local solo si viene. */
function EstimateTotals({ summary }: { summary: OpportunityReportSummary }) {
  const totals = summary.estimateTotals;
  return (
    <Box component="section" aria-label="Estimación total" sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, boxShadow: 1 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 4 }} useFlexGap flexWrap="wrap">
        <Box>
          <Typography variant="overline" component="p" color="text.secondary">
            {`Estimación total (${totals.currencyCode})`}
          </Typography>
          <Typography variant="h5" component="p" sx={{ fontWeight: 600 }}>
            {formatUsd(totals.amountUsd, totals.currencyCode)}
          </Typography>
          {totals.localReference ? (
            <Typography variant="body2" color="text.secondary" data-testid="local-reference">
              {localReferenceText(totals.localReference)}
            </Typography>
          ) : null}
        </Box>
        <Box>
          <Typography variant="overline" component="p" color="text.secondary">
            Toneladas estimadas
          </Typography>
          <Typography variant="h5" component="p" sx={{ fontWeight: 600 }}>
            {totals.tonnage ? formatTons(totals.tonnage) : EMPTY}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}

/**
 * Reporte de oportunidades (05 F-35, E.3): resumen con conteos que cuadran (AC-05.5; ganadas
 * incluye parciales, DM-15), estimación total **solo en USD** con la referencia local si hay un
 * único país (AC-05.11, AC-05.45), distribuciones por etapa y asesor (AC-05.10) y la lista con
 * monto original + equivalente en USD (AC-05.44). Cada tarjeta de estado filtra la tabla.
 */
export function OpportunitiesReportPage() {
  const state = useReportQueryState({
    filterKeys: OPPORTUNITY_REPORT_FILTER_KEYS,
    sortableFields: OPPORTUNITY_REPORT_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
    period: PERIOD,
  });
  const options = useReportFilterOptions();
  const report = useOpportunityReport(state.listQuery);
  const summary = useOpportunityReportSummary(state.filterQuery);
  const exporter = useReportExport({ request: () => exportOpportunityReport(state.exportQuery), fallbackFileName: 'reporte-oportunidades.xlsx' });
  const fields = useMemo(() => filterFields(options.data), [options.data]);
  const summaryError = summary.isError ? reportErrorMessage(summary.error) : null;
  const showDecidedNote = state.dateBasis === 'DECIDED' && state.period !== null;

  return (
    <ReportPage title={TITLE} subtitle="Pipeline de oportunidades y sus resultados. Importes en USD." exporter={exporter} filterOptionsFailed={options.isError}>
      <ReportFilterBar
        label="Filtros del reporte de oportunidades"
        fields={fields}
        values={state.values}
        onApply={state.apply}
        onClear={state.clear}
        period={{
          kind: 'dates',
          period: state.period,
          isDefault: state.isDefaultPeriod,
          today: state.today,
          dateBases: enumOptions(OPPORTUNITY_DATE_BASES, OPPORTUNITY_DATE_BASIS_LABELS),
          defaultDateBasis: 'IDENTIFIED',
          allowEmpty: true,
          dateBasisNotes: { DECIDED: DECIDED_BASIS_NOTE },
        }}
      >
        {showDecidedNote ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            {DECIDED_BASIS_NOTE}
          </Alert>
        ) : null}
      </ReportFilterBar>
      <SummaryCards
        label="Resumen de oportunidades"
        items={summaryItems(summary.data)}
        activeValue={state.values.status}
        onSelect={(value) => state.table.setFilter('status', value)}
        isLoading={summary.isPending}
        errorMessage={summaryError}
        onRetry={() => void summary.refetch()}
        columns={6}
      />
      {summary.data ? <EstimateTotals summary={summary.data} /> : null}
      {summaryError ? null : (
        <OpportunityDistributions summary={summary.data} isLoading={summary.isPending} errorMessage={null} onRetry={() => void summary.refetch()} />
      )}
      <ReportTable label={TITLE} columns={COLUMNS} query={report} state={state} getRowId={(row) => row.id} />
    </ReportPage>
  );
}

