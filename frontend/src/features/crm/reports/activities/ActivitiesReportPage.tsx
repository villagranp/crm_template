import { Box, Chip, Typography } from '@mui/material';
import { useMemo } from 'react';

import type { DataTableColumn } from '@/components/data';
import { customerDetailPath } from '@/features/crm/customers';
import { projectDetailPath } from '@/features/crm/projects';

import { ReportPage } from '../common/ReportPage';
import { ReportDateTime } from '../common/ReportDateTime';
import { ReportFilterBar, type ReportFilterField } from '../common/ReportFilterBar';
import { catalogOptions, enumOptions, namedOptions, ownerOptions } from '../common/report-filter-options';
import { ACTIVITY_CATEGORY_LABELS, ACTIVITY_CATEGORY_TONES, EMPTY, formatCount } from '../common/report-format';
import { activityDetailPath } from '../common/report-paths';
import type { ActivityCategory, ReportFilterOptions } from '../common/report-types';
import { ReportTable } from '../common/ReportTable';
import { SourceLink } from '../common/SourceLink';
import { SummaryCards, type SummaryCardItem } from '../common/SummaryCards';
import { useReportExport } from '../common/use-report-export';
import { useReportQueryState, type ReportPeriodMode } from '../common/use-report-query-state';
import { useReportFilterOptions } from '../filter-options.queries';
import { useActivityReport, useActivityReportSummary } from '../report.queries';
import { reportErrorMessage } from '../reports.errors';
import { REPORT_SOURCE_PERMISSIONS } from '../reports.permissions';

import {
  ACTIVITY_DATE_BASES,
  ACTIVITY_REPORT_FILTER_KEYS,
  ACTIVITY_REPORT_SORT_FIELDS,
  exportActivityReport,
  type ActivityReportRow,
  type ActivityReportSummary,
} from './activities-report.api';

const TITLE = 'Reporte de actividades';
const DEFAULT_SORT = { field: 'activityDate', direction: 'desc' } as const;
/** Período por defecto: mes en curso por la fecha de la actividad (C.2). */
const PERIOD: ReportPeriodMode = { kind: 'dates', defaultPreset: 'CURRENT_MONTH', defaultDateBasis: 'ACTIVITY_DATE' };

const ACTIVITY_CATEGORIES = ['PENDING', 'OVERDUE', 'COMPLETED', 'CANCELLED'] as const satisfies readonly ActivityCategory[];

const DATE_BASIS_LABELS: Record<(typeof ACTIVITY_DATE_BASES)[number], string> = {
  ACTIVITY_DATE: 'Fecha de la actividad',
  DUE: 'Vencimiento',
  COMPLETED: 'Fecha de realización',
};

/** C.2: con `COMPLETED` solo entran las actividades completadas. */
const DATE_BASIS_NOTES: Readonly<Record<string, string>> = {
  ACTIVITY_DATE: 'Fecha programada o, si no tiene, su vencimiento.',
  COMPLETED: 'Con la fecha de realización solo entran las actividades completadas.',
};

function filterFields(options: ReportFilterOptions | undefined): ReportFilterField[] {
  const disabled = !options;
  return [
    { key: 'statusCategory', label: 'Categoría de estado', kind: 'select', options: enumOptions(ACTIVITY_CATEGORIES, ACTIVITY_CATEGORY_LABELS) },
    { key: 'statusId', label: 'Estado', kind: 'select', options: catalogOptions(options?.catalogs.activityStatuses), disabled },
    { key: 'typeId', label: 'Tipo de actividad', kind: 'select', options: catalogOptions(options?.catalogs.activityTypes), disabled },
    { key: 'priorityId', label: 'Prioridad', kind: 'select', options: catalogOptions(options?.catalogs.priorities), disabled },
    { key: 'ownerId', label: 'Responsable', kind: 'autocomplete', options: ownerOptions(options?.owners), disabled },
    { key: 'customerId', label: 'Cliente', kind: 'customer' },
    { key: 'countryId', label: 'País del cliente', kind: 'select', options: namedOptions(options?.countries), disabled },
  ];
}

function DueCell({ row }: { row: ActivityReportRow }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" component="span" sx={{ display: 'block', color: row.isOverdue ? 'error.main' : undefined }}>
        <ReportDateTime value={row.dueAt} />
      </Typography>
      {row.isOverdue ? <Chip size="small" color="error" label="Vencida" sx={{ mt: 0.5 }} /> : null}
    </Box>
  );
}

const COLUMNS: DataTableColumn<ActivityReportRow>[] = [
  {
    id: 'code',
    header: 'Código',
    primary: true,
    render: (row) => (
      <SourceLink to={activityDetailPath(row.id)} permission={REPORT_SOURCE_PERMISSIONS.activity} label={`Abrir la actividad ${row.code}`}>
        {row.code}
      </SourceLink>
    ),
  },
  { id: 'typeName', header: 'Tipo', sortable: true, render: (row) => row.type.label },
  {
    id: 'subject',
    header: 'Asunto',
    render: (row) => (
      <Typography variant="body2" component="span" sx={{ overflowWrap: 'anywhere' }}>
        {row.subject}
      </Typography>
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
  { id: 'ownerName', header: 'Responsable', sortable: true, render: (row) => row.owner.displayName },
  { id: 'activityDate', header: 'Fecha', sortable: true, render: (row) => <ReportDateTime value={row.activityDate} /> },
  { id: 'dueAt', header: 'Vencimiento', sortable: true, render: (row) => <DueCell row={row} /> },
  { id: 'priorityWeight', header: 'Prioridad', sortable: true, hideOnMobile: true, render: (row) => row.priority.label },
  {
    id: 'status',
    header: 'Estado',
    render: (row) => <Chip size="small" color={ACTIVITY_CATEGORY_TONES[row.status.category]} label={row.status.label} />,
  },
  { id: 'result', header: 'Resultado', hideOnMobile: true, render: (row) => row.result?.label ?? EMPTY },
];

function summaryItems(summary: ActivityReportSummary | undefined): SummaryCardItem[] {
  if (!summary) {
    return [];
  }
  return [
    { key: 'PENDING', label: ACTIVITY_CATEGORY_LABELS.PENDING, value: summary.pending, tone: 'info', filterValue: 'PENDING', detail: 'Abiertas sin vencer' },
    { key: 'OVERDUE', label: ACTIVITY_CATEGORY_LABELS.OVERDUE, value: summary.overdue, tone: 'error', filterValue: 'OVERDUE' },
    { key: 'COMPLETED', label: ACTIVITY_CATEGORY_LABELS.COMPLETED, value: summary.completed, tone: 'success', filterValue: 'COMPLETED' },
    { key: 'CANCELLED', label: ACTIVITY_CATEGORY_LABELS.CANCELLED, value: summary.cancelled, filterValue: 'CANCELLED' },
    { key: 'total', label: 'Total', value: summary.total },
  ];
}

/**
 * Reporte de actividades (05 F-38, E.6): período por defecto el mes en curso, pendientes y
 * vencidas disjuntas cuya suma con realizadas y canceladas es el total (AC-05.20), y la lista y
 * los conteos con el mismo conjunto filtrado (AC-05.22). Cada tarjeta filtra la tabla.
 */
export function ActivitiesReportPage() {
  const state = useReportQueryState({
    filterKeys: ACTIVITY_REPORT_FILTER_KEYS,
    sortableFields: ACTIVITY_REPORT_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
    period: PERIOD,
  });
  const options = useReportFilterOptions();
  const report = useActivityReport(state.listQuery);
  const summary = useActivityReportSummary(state.filterQuery);
  const exporter = useReportExport({ request: () => exportActivityReport(state.exportQuery), fallbackFileName: 'reporte-actividades.xlsx' });
  const fields = useMemo(() => filterFields(options.data), [options.data]);
  const dueSoon = summary.data
    ? `Próximas a vencer (en ${formatCount(summary.data.dueSoonHours)} h): ${formatCount(summary.data.dueSoon)}`
    : null;

  return (
    <ReportPage title={TITLE} subtitle="Actividades comerciales por su estado." exporter={exporter} filterOptionsFailed={options.isError}>
      <ReportFilterBar
        label="Filtros del reporte de actividades"
        fields={fields}
        values={state.values}
        onApply={state.apply}
        onClear={state.clear}
        period={{
          kind: 'dates',
          period: state.period,
          isDefault: state.isDefaultPeriod,
          today: state.today,
          dateBases: enumOptions(ACTIVITY_DATE_BASES, DATE_BASIS_LABELS),
          defaultDateBasis: 'ACTIVITY_DATE',
          allowEmpty: false,
          dateBasisNotes: DATE_BASIS_NOTES,
        }}
      />
      <SummaryCards
        label="Resumen de actividades"
        items={summaryItems(summary.data)}
        activeValue={state.values.statusCategory}
        onSelect={(value) => state.table.setFilter('statusCategory', value)}
        isLoading={summary.isPending}
        errorMessage={summary.isError ? reportErrorMessage(summary.error) : null}
        onRetry={() => void summary.refetch()}
        footer={dueSoon}
      />
      <ReportTable label={TITLE} columns={COLUMNS} query={report} state={state} getRowId={(row) => row.id} />
    </ReportPage>
  );
}
