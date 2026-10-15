import { Box, Typography } from '@mui/material';
import { useMemo } from 'react';

import { ReportPage } from '../common/ReportPage';
import { ReportFilterBar, type ReportFilterField } from '../common/ReportFilterBar';
import { namedOptions, ownerOptions } from '../common/report-filter-options';
import { SCOPE_LABELS } from '../common/report-format';
import type { ReportFilterOptions } from '../common/report-types';
import { useReportQueryState, type ReportPeriodMode } from '../common/use-report-query-state';
import { useReportFilterOptions } from '../filter-options.queries';
import { useCommercialDashboard, useCommercialTrends } from '../report.queries';
import { reportErrorMessage } from '../reports.errors';

import { DASHBOARD_FILTER_KEYS, DASHBOARD_MAX_MONTHS } from './dashboard.api';
import {
  ActiveProjectsPanel,
  ActivityVisitPanel,
  type DashboardLinkContext,
  ForecastPanel,
  OpportunitiesByStagePanel,
  OwnersPanel,
  TrendsPanel,
  WonLostPanel,
} from './DashboardPanels';

const TITLE = 'Dashboard comercial';
/** Sin tabla paginada: el orden no se usa, pero `useReportQueryState` lo exige. */
const NO_SORT_FIELDS: readonly string[] = [];
const NO_SORT = { field: 'none', direction: 'asc' } as const;
/**
 * Sin período en la URL no se envía ninguno: el servidor aplica el suyo (12 meses cerrados + el
 * mes en curso en la zona del negocio, P-05.14) y lo devuelve en `period`, que es lo que muestra
 * el chip. Así la pantalla y el servidor nunca discrepan.
 */
const PERIOD: ReportPeriodMode = { kind: 'dates', defaultPreset: null, defaultDateBasis: null };

function filterFields(options: ReportFilterOptions | undefined): ReportFilterField[] {
  const disabled = !options;
  return [
    { key: 'countryId', label: 'País', kind: 'select', options: namedOptions(options?.countries), disabled },
    { key: 'ownerId', label: 'Asesor', kind: 'autocomplete', options: ownerOptions(options?.owners), disabled },
  ];
}

/**
 * Dashboard comercial (05 F-40, E.7, RN-05.51): tablero **analítico** con siete paneles
 * (proyectos activos, oportunidades por etapa, ganadas vs. perdidas, forecast por mes,
 * distribución por asesor, actividades y visitas, tendencias), filtros de período, país y
 * asesor en la URL, y sin alertas ni accesos rápidos (eso es del Inicio). Cuadrícula de una
 * columna en móvil, dos en `md` y tres en `lg`; las tendencias ocupan todo el ancho.
 */
export function CommercialDashboardPage() {
  const state = useReportQueryState({ filterKeys: DASHBOARD_FILTER_KEYS, sortableFields: NO_SORT_FIELDS, defaultSort: NO_SORT, period: PERIOD });
  const options = useReportFilterOptions();
  const dashboard = useCommercialDashboard(state.filterQuery);
  const trends = useCommercialTrends(state.filterQuery);
  const fields = useMemo(() => filterFields(options.data), [options.data]);

  const appliedPeriod = state.period ?? dashboard.data?.period ?? trends.data?.period ?? null;
  const links: DashboardLinkContext = { ownerId: state.values.ownerId, countryId: state.values.countryId, period: appliedPeriod };
  const dashboardError = dashboard.isError ? reportErrorMessage(dashboard.error) : null;
  const panel = { data: dashboard.data, isLoading: dashboard.isPending, errorMessage: dashboardError, onRetry: () => void dashboard.refetch(), links };

  return (
    <ReportPage
      title={TITLE}
      subtitle="Tendencias y distribuciones comerciales del período. Para tus pendientes y alertas, usa el Inicio."
      filterOptionsFailed={options.isError}
    >
      <ReportFilterBar
        label="Filtros del dashboard comercial"
        fields={fields}
        values={state.values}
        onApply={state.apply}
        onClear={state.clear}
        period={{
          kind: 'dates',
          period: appliedPeriod,
          isDefault: state.period === null,
          today: state.today,
          defaultDateBasis: null,
          allowEmpty: false,
          maxMonths: DASHBOARD_MAX_MONTHS,
          defaultNote: 'por defecto',
        }}
      />
      {options.data ? (
        <Typography variant="body2" color="text.secondary">
          {`Alcance: ${SCOPE_LABELS[options.data.scope]}. Las cifras usan las mismas definiciones que el Inicio y los reportes.`}
        </Typography>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
          alignItems: 'stretch',
        }}
      >
        <ActiveProjectsPanel {...panel} />
        <OpportunitiesByStagePanel {...panel} />
        <WonLostPanel {...panel} />
        <ForecastPanel {...panel} />
        <OwnersPanel {...panel} />
        <ActivityVisitPanel {...panel} />
        <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
          <TrendsPanel
            data={trends.data}
            isLoading={trends.isPending}
            errorMessage={trends.isError ? reportErrorMessage(trends.error) : null}
            onRetry={() => void trends.refetch()}
          />
        </Box>
      </Box>
    </ReportPage>
  );
}
