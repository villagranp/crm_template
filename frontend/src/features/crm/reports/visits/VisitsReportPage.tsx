import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { useMemo } from 'react';

import type { DataTableColumn } from '@/components/data';
import { formatDateTime, useCommercialTimeZones } from '@/features/crm/commercial-activity/entry-points';
import { customerDetailPath } from '@/features/crm/customers';
import { projectDetailPath } from '@/features/crm/projects';

import { ReportPage } from '../common/ReportPage';
import { ReportDateTime } from '../common/ReportDateTime';
import { ReportFilterBar, type ReportFilterField } from '../common/ReportFilterBar';
import { catalogOptions, enumOptions, namedOptions, ownerOptions } from '../common/report-filter-options';
import { EMPTY, formatCount, VISIT_CATEGORY_LABELS, VISIT_CATEGORY_TONES } from '../common/report-format';
import { visitDetailPath } from '../common/report-paths';
import type { ReportFilterOptions, VisitCategory } from '../common/report-types';
import { ReportTable } from '../common/ReportTable';
import { SourceLink } from '../common/SourceLink';
import { SummaryCards, type SummaryCardItem } from '../common/SummaryCards';
import { useReportExport } from '../common/use-report-export';
import { useReportQueryState, type ReportPeriodMode } from '../common/use-report-query-state';
import { useReportFilterOptions } from '../filter-options.queries';
import { useVisitReport, useVisitReportSummary } from '../report.queries';
import { reportErrorMessage } from '../reports.errors';
import { REPORT_SOURCE_PERMISSIONS } from '../reports.permissions';

import {
  exportVisitReport,
  VISIT_DATE_BASES,
  VISIT_REPORT_FILTER_KEYS,
  VISIT_REPORT_SORT_FIELDS,
  type VisitReportRow,
  type VisitReportSummary,
} from './visits-report.api';

const TITLE = 'Reporte de visitas';
const DEFAULT_SORT = { field: 'scheduledStartAt', direction: 'desc' } as const;
/** Período por defecto: mes en curso por la fecha planificada vigente (C.2). */
const PERIOD: ReportPeriodMode = { kind: 'dates', defaultPreset: 'CURRENT_MONTH', defaultDateBasis: 'SCHEDULED' };

const VISIT_CATEGORIES = ['SCHEDULED', 'COMPLETED', 'CONFIRMED', 'CANCELLED'] as const satisfies readonly VisitCategory[];

const DATE_BASIS_LABELS: Record<(typeof VISIT_DATE_BASES)[number], string> = {
  SCHEDULED: 'Fecha planificada (vigente)',
  ACTUAL: 'Fecha real',
  CONFIRMED: 'Fecha de confirmación',
};

/** C.2: con `ACTUAL` o `CONFIRMED` solo entran las visitas con ese dato. */
const DATE_BASIS_NOTES: Readonly<Record<string, string>> = {
  ACTUAL: 'Con la fecha real solo entran las visitas realizadas.',
  CONFIRMED: 'Con la fecha de confirmación solo entran las visitas confirmadas.',
};

function filterFields(options: ReportFilterOptions | undefined): ReportFilterField[] {
  const disabled = !options;
  return [
    { key: 'statusCategory', label: 'Categoría de estado', kind: 'select', options: enumOptions(VISIT_CATEGORIES, VISIT_CATEGORY_LABELS) },
    { key: 'statusId', label: 'Estado', kind: 'select', options: catalogOptions(options?.catalogs.visitStatuses), disabled },
    { key: 'ownerId', label: 'Asesor', kind: 'autocomplete', options: ownerOptions(options?.owners), disabled },
    { key: 'customerId', label: 'Cliente', kind: 'customer' },
    { key: 'projectId', label: 'Proyecto', kind: 'project', customerKey: 'customerId' },
    { key: 'countryId', label: 'País del cliente', kind: 'select', options: namedOptions(options?.countries), disabled },
  ];
}

/** "Reprogramada 2 veces" (AC-05.18). */
function rescheduleText(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  return count === 1 ? 'Reprogramada 1 vez' : `Reprogramada ${count} veces`;
}

function ScheduledCell({ row }: { row: VisitReportRow }) {
  const { timeZone } = useCommercialTimeZones();
  const rescheduled = rescheduleText(row.rescheduleCount);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" component="span" sx={{ display: 'block' }}>
        {formatDateTime(row.scheduledStartAt, timeZone)}
      </Typography>
      {rescheduled ? (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title={`${rescheduled}, original: ${formatDateTime(row.originalScheduledAt, timeZone)}`}>
            <EventRepeatOutlinedIcon fontSize="inherit" color="action" aria-hidden />
          </Tooltip>
          <Typography variant="caption" color="text.secondary">{`${rescheduled}, original: ${formatDateTime(row.originalScheduledAt, timeZone)}`}</Typography>
        </Stack>
      ) : null}
    </Box>
  );
}

const COLUMNS: DataTableColumn<VisitReportRow>[] = [
  {
    id: 'code',
    header: 'Código',
    primary: true,
    render: (row) => (
      <SourceLink to={visitDetailPath(row.id)} permission={REPORT_SOURCE_PERMISSIONS.visit} label={`Abrir la visita ${row.code}`}>
        {row.code}
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
  {
    id: 'project',
    header: 'Proyecto',
    hideOnMobile: true,
    render: (row) =>
      row.project ? (
        <SourceLink to={projectDetailPath(row.project.id)} permission={REPORT_SOURCE_PERMISSIONS.project}>
          {`${row.project.code} · ${row.project.name}`}
        </SourceLink>
      ) : (
        EMPTY
      ),
  },
  { id: 'ownerName', header: 'Asesor', sortable: true, render: (row) => row.owner.displayName },
  { id: 'scheduledStartAt', header: 'Fecha planificada', sortable: true, render: (row) => <ScheduledCell row={row} /> },
  { id: 'actualStartAt', header: 'Fecha real', sortable: true, hideOnMobile: true, render: (row) => <ReportDateTime value={row.actualStartAt} /> },
  {
    id: 'statusOrder',
    header: 'Estado',
    sortable: true,
    render: (row) => (
      <Chip size="small" color={VISIT_CATEGORY_TONES[row.status.category]} label={row.status.label} />
    ),
  },
  { id: 'result', header: 'Resultado', hideOnMobile: true, render: (row) => row.result?.label ?? EMPTY },
  { id: 'confirmedAt', header: 'Confirmación', sortable: true, hideOnMobile: true, render: (row) => <ReportDateTime value={row.confirmedAt} /> },
];

function summaryItems(summary: VisitReportSummary | undefined): SummaryCardItem[] {
  if (!summary) {
    return [];
  }
  return [
    { key: 'SCHEDULED', label: VISIT_CATEGORY_LABELS.SCHEDULED, value: summary.scheduled, tone: 'info', filterValue: 'SCHEDULED', detail: 'Incluye reprogramadas' },
    { key: 'COMPLETED', label: VISIT_CATEGORY_LABELS.COMPLETED, value: summary.completed, tone: 'success', filterValue: 'COMPLETED', detail: 'Sin confirmar' },
    { key: 'CONFIRMED', label: VISIT_CATEGORY_LABELS.CONFIRMED, value: summary.confirmed, tone: 'success', filterValue: 'CONFIRMED' },
    { key: 'CANCELLED', label: VISIT_CATEGORY_LABELS.CANCELLED, value: summary.cancelled, filterValue: 'CANCELLED' },
    { key: 'total', label: 'Total', value: summary.total, detail: `Realizadas en total: ${formatCount(summary.completedTotal)}` },
  ];
}

function summaryFooter(summary: VisitReportSummary | undefined): string | null {
  if (!summary) {
    return null;
  }
  const events = summary.rescheduleEvents === 1 ? '1 reprogramación' : `${formatCount(summary.rescheduleEvents)} reprogramaciones`;
  const visits = summary.rescheduledVisits === 1 ? '1 visita' : `${formatCount(summary.rescheduledVisits)} visitas`;
  return `Reprogramadas: ${visits} (${events}) · Pendientes atrasadas: ${formatCount(summary.overduePending)}`;
}

/**
 * Reporte de visitas (05 F-37, E.5): período por defecto el mes en curso (fecha planificada
 * vigente), categorías disjuntas que suman el total (AC-05.17), reprogramadas contadas una vez
 * con su marca (AC-05.18) y país del cliente (AC-05.19). Cada tarjeta filtra la tabla.
 */
export function VisitsReportPage() {
  const state = useReportQueryState({
    filterKeys: VISIT_REPORT_FILTER_KEYS,
    sortableFields: VISIT_REPORT_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
    period: PERIOD,
  });
  const options = useReportFilterOptions();
  const report = useVisitReport(state.listQuery);
  const summary = useVisitReportSummary(state.filterQuery);
  const exporter = useReportExport({ request: () => exportVisitReport(state.exportQuery), fallbackFileName: 'reporte-visitas.xlsx' });
  const fields = useMemo(() => filterFields(options.data), [options.data]);

  return (
    <ReportPage title={TITLE} subtitle="Visitas comerciales por su estado vigente." exporter={exporter} filterOptionsFailed={options.isError}>
      <ReportFilterBar
        label="Filtros del reporte de visitas"
        fields={fields}
        values={state.values}
        onApply={state.apply}
        onClear={state.clear}
        period={{
          kind: 'dates',
          period: state.period,
          isDefault: state.isDefaultPeriod,
          today: state.today,
          dateBases: enumOptions(VISIT_DATE_BASES, DATE_BASIS_LABELS),
          defaultDateBasis: 'SCHEDULED',
          allowEmpty: false,
          dateBasisNotes: DATE_BASIS_NOTES,
        }}
      />
      <SummaryCards
        label="Resumen de visitas"
        items={summaryItems(summary.data)}
        activeValue={state.values.statusCategory}
        onSelect={(value) => state.table.setFilter('statusCategory', value)}
        isLoading={summary.isPending}
        errorMessage={summary.isError ? reportErrorMessage(summary.error) : null}
        onRetry={() => void summary.refetch()}
        footer={summaryFooter(summary.data)}
      />
      <ReportTable label={TITLE} columns={COLUMNS} query={report} state={state} getRowId={(row) => row.id} />
    </ReportPage>
  );
}
