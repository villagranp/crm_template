import { Box, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import { useMemo } from 'react';

import type { DataTableColumn } from '@/components/data';
import { formatDecimal } from '@/features/crm/common/decimal';
import { customerDetailPath } from '@/features/crm/customers';
import { projectDetailPath } from '@/features/crm/projects';

import { ReportPage } from '../common/ReportPage';
import { ReportCalendarDate, ReportDateTime } from '../common/ReportDateTime';
import { ReportFilterBar, type ReportFilterField, type ReportFilterOption } from '../common/ReportFilterBar';
import { catalogOptions, enumOptions, namedOptions, ownerOptions } from '../common/report-filter-options';
import { EMPTY, type ReportTone } from '../common/report-format';
import type { ReportFilterOptions } from '../common/report-types';
import { ReportTable } from '../common/ReportTable';
import { SourceLink } from '../common/SourceLink';
import { useReportExport } from '../common/use-report-export';
import { useReportQueryState, type ReportPeriodMode } from '../common/use-report-query-state';
import { useReportFilterOptions } from '../filter-options.queries';
import { useProjectReport } from '../report.queries';
import { REPORT_SOURCE_PERMISSIONS } from '../reports.permissions';

import {
  exportProjectReport,
  PROJECT_DATE_BASES,
  PROJECT_REPORT_FILTER_KEYS,
  PROJECT_REPORT_SORT_FIELDS,
  type ProjectCommercialStatusKind,
  type ProjectReportRow,
} from './projects-report.api';

const TITLE = 'Reporte de proyectos';
const DEFAULT_SORT = { field: 'lastActivityAt', direction: 'desc' } as const;
/** Proyectos no tiene período por defecto ni base por defecto (C.2, P-05.4). */
const PERIOD: ReportPeriodMode = { kind: 'dates', defaultPreset: null, defaultDateBasis: null };

const DATE_BASIS_LABELS: Record<(typeof PROJECT_DATE_BASES)[number], string> = {
  DECISION_ESTIMATED: 'Fecha estimada de decisión',
  UPDATED: 'Última actualización',
  CREATED: 'Fecha de creación',
};

const SITUATION_LABELS = { ACTIVE: 'Activos (fase no final)', FINISHED: 'Finalizados (fase final)' } as const;

const COMMERCIAL_TONES: Record<ProjectCommercialStatusKind, ReportTone> = {
  OPEN_STAGE: 'info',
  WON: 'success',
  LOST: 'error',
  NO_OPPORTUNITIES: 'default',
};

function commercialStatusOptions(options: ReportFilterOptions | undefined): ReportFilterOption[] {
  const openStages = (options?.catalogs.opportunityStages ?? [])
    .filter((stage) => !stage.isClosed)
    .sort((a, b) => a.order - b.order)
    .map((stage) => ({ value: `OPEN_STAGE:${stage.id}`, label: `Abierta en ${stage.label}`, inactive: !stage.isActive }));
  return [
    { value: 'OPEN_STAGE', label: 'Con oportunidades abiertas' },
    ...openStages,
    { value: 'WON', label: 'Ganado' },
    { value: 'LOST', label: 'Perdido' },
    { value: 'NO_OPPORTUNITIES', label: 'Sin oportunidades' },
  ];
}

function filterFields(options: ReportFilterOptions | undefined): ReportFilterField[] {
  const disabled = !options;
  return [
    { key: 'situation', label: 'Situación', kind: 'select', options: enumOptions(['ACTIVE', 'FINISHED'] as const, SITUATION_LABELS) },
    { key: 'countryId', label: 'País', kind: 'select', options: namedOptions(options?.countries), disabled },
    { key: 'city', label: 'Ubicación (ciudad)', kind: 'text' },
    { key: 'ownerId', label: 'Asesor', kind: 'autocomplete', options: ownerOptions(options?.owners), disabled },
    { key: 'customerId', label: 'Cliente', kind: 'customer' },
    { key: 'projectTypeId', label: 'Tipo de proyecto', kind: 'select', options: catalogOptions(options?.catalogs.projectTypes), disabled },
    { key: 'phaseId', label: 'Fase', kind: 'select', options: catalogOptions(options?.catalogs.projectPhases), disabled },
    { key: 'commercialStatus', label: 'Estado comercial', kind: 'select', options: commercialStatusOptions(options), disabled },
  ];
}

function ProgressCell({ value }: { value: string }) {
  const text = `${formatDecimal(value, { maxFractionDigits: 2 })} %`;
  // Sólo para dibujar la barra: el número mostrado es la cadena de la API.
  const percent = Math.min(100, Math.max(0, Number(value)));
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: (theme) => theme.spacing(14) }}>
      <Box sx={{ flex: 1 }}>
        <LinearProgress variant="determinate" value={Number.isFinite(percent) ? percent : 0} aria-hidden />
      </Box>
      <Typography variant="body2" component="span" sx={{ whiteSpace: 'nowrap' }}>
        {text}
      </Typography>
    </Stack>
  );
}

const COLUMNS: DataTableColumn<ProjectReportRow>[] = [
  {
    id: 'code',
    header: 'Código',
    sortable: true,
    primary: true,
    render: (row) => (
      <SourceLink to={projectDetailPath(row.id)} permission={REPORT_SOURCE_PERMISSIONS.project} label={`Abrir el proyecto ${row.code}`}>
        {row.code}
      </SourceLink>
    ),
  },
  { id: 'name', header: 'Nombre', sortable: true, render: (row) => row.name },
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
  { id: 'countryName', header: 'País', sortable: true, render: (row) => row.country.name },
  { id: 'city', header: 'Ubicación', hideOnMobile: true, render: (row) => row.city ?? EMPTY },
  { id: 'ownerName', header: 'Asesor', sortable: true, render: (row) => row.owner.displayName },
  { id: 'projectType', header: 'Tipo', hideOnMobile: true, render: (row) => row.projectType?.label ?? EMPTY },
  { id: 'phaseOrder', header: 'Fase', sortable: true, render: (row) => row.phase.label },
  { id: 'phaseProgress', header: '% avance', sortable: true, render: (row) => <ProgressCell value={row.phaseProgress} /> },
  {
    id: 'commercialStatus',
    header: 'Estado comercial',
    render: (row) => <Chip size="small" color={COMMERCIAL_TONES[row.commercialStatus.kind]} label={row.commercialStatus.label} />,
  },
  { id: 'estimatedDecisionDate', header: 'Decisión estimada', sortable: true, hideOnMobile: true, render: (row) => <ReportCalendarDate value={row.estimatedDecisionDate} /> },
  { id: 'lastActivityAt', header: 'Última actualización', sortable: true, render: (row) => <ReportDateTime value={row.lastActivityAt} /> },
];

/**
 * Reporte de proyectos (05 F-34, E.2): las 12 columnas de §7.1, orden por defecto
 * `lastActivityAt desc` (AC-05.1), filtros combinados (AC-05.3) y código como enlace a la
 * ficha sólo con `proyectos.ver` (AC-05.4). Sin resumen en pantalla (E.2); la exportación lleva
 * las mismas columnas.
 */
export function ProjectsReportPage() {
  const state = useReportQueryState({
    filterKeys: PROJECT_REPORT_FILTER_KEYS,
    sortableFields: PROJECT_REPORT_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
    period: PERIOD,
  });
  const options = useReportFilterOptions();
  const report = useProjectReport(state.listQuery);
  const exporter = useReportExport({ request: () => exportProjectReport(state.exportQuery), fallbackFileName: 'reporte-proyectos.xlsx' });
  const fields = useMemo(() => filterFields(options.data), [options.data]);

  return (
    <ReportPage title={TITLE} subtitle="Cartera de proyectos visibles para ti." exporter={exporter} filterOptionsFailed={options.isError}>
      <ReportFilterBar
        label="Filtros del reporte de proyectos"
        fields={fields}
        values={state.values}
        onApply={state.apply}
        onClear={state.clear}
        period={{
          kind: 'dates',
          period: state.period,
          isDefault: state.isDefaultPeriod,
          today: state.today,
          dateBases: enumOptions(PROJECT_DATE_BASES, DATE_BASIS_LABELS),
          defaultDateBasis: null,
          dateBasisRequired: true,
          allowEmpty: true,
        }}
        search={{
          value: state.table.searchInput,
          onChange: state.table.setSearchInput,
          label: 'Buscar por código, nombre del proyecto o cliente',
          placeholder: 'Buscar proyectos…',
        }}
      />
      <ReportTable label={TITLE} columns={COLUMNS} query={report} state={state} getRowId={(row) => row.id} />
    </ReportPage>
  );
}
