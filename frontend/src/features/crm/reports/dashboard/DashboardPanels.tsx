import { Alert, Box, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

import { LazyBarChart, LazyComboChart, LazyLineChart } from '../charts/LazyCharts';
import { ChartDataTable } from '../common/ChartDataTable';
import { ChartPanel } from '../common/ChartPanel';
import { activeProjectsReportHref, forecastMonthReportHref, opportunitiesReportHref } from '../common/report-links';
import { describeMonthRange } from '../common/report-period';
import { formatCount, formatMonth, formatTons } from '../common/report-format';
import { SourceLink } from '../common/SourceLink';
import { REPORT_PERMISSIONS } from '../reports.permissions';

import type { CommercialDashboard, CommercialTrends, ReportPeriodRange } from './dashboard.api';
import { chartNumber, monthLabels, OTHER_OWNERS_LABEL, TREND_METRIC_BASIS, TREND_METRIC_LABELS } from './dashboard-format';

/**
 * Paneles del dashboard comercial (05 E.7, AC-05.30–AC-05.34). Cada uno es un `ChartPanel` con
 * su gráfica (`@mui/x-charts` en diferido), su tabla equivalente ("Ver como tabla") y sus
 * estados de carga, error con "Reintentar" y vacío. Los seis primeros salen de
 * `GET /reports/dashboard`; las tendencias, de `/trends` (cargan y fallan por separado).
 *
 * Clic en una barra → reporte con el filtro aplicado; la tabla ofrece el mismo destino como
 * enlace (camino por teclado).
 */

/** Filtros del dashboard que se trasladan a los reportes de destino. */
export interface DashboardLinkContext {
  ownerId?: string;
  countryId?: string;
  /** Período efectivo (el de la URL o el que aplicó el servidor). */
  period: ReportPeriodRange | null;
}

export interface DashboardPanelProps {
  data: CommercialDashboard | undefined;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  links: DashboardLinkContext;
}

function ReportLink({ to, children, label }: { to: string; children: string; label?: string }) {
  return (
    <SourceLink to={to} permission={REPORT_PERMISSIONS.view} label={label}>
      {children}
    </SourceLink>
  );
}

/** Proyectos activos (RN-05.15): cifra + barras por fase; estado actual, sin período ni tendencia (AC-05.34). */
export function ActiveProjectsPanel({ data, isLoading, errorMessage, onRetry, links }: DashboardPanelProps) {
  const navigate = useNavigate();
  const phases = data?.activeProjects.byPhase ?? [];
  const hrefOf = (phaseId: string) => activeProjectsReportHref({ phaseId, ownerId: links.ownerId, countryId: links.countryId });
  return (
    <ChartPanel
      title="Proyectos activos"
      description="Estado actual por fase. El período no aplica y este indicador no tiene tendencia (no hay histórico)."
      isLoading={isLoading}
      errorMessage={errorMessage}
      onRetry={onRetry}
      isEmpty={phases.length === 0}
      summary={
        data ? (
          <Typography variant="h4" component="p" sx={{ fontWeight: 600 }} data-testid="active-projects-count">
            {formatCount(data.activeProjects.count)}
          </Typography>
        ) : null
      }
      chart={
        <LazyBarChart
          ariaLabel="Proyectos activos por fase"
          layout="horizontal"
          categories={phases.map((item) => item.phase.label)}
          series={[{ key: 'count', label: 'Proyectos activos', tone: 'primary', values: phases.map((item) => item.count) }]}
          onItemClick={(index) => {
            const phase = phases[index];
            if (phase) {
              navigate(hrefOf(phase.phase.id));
            }
          }}
        />
      }
      table={
        <ChartDataTable
          label="Proyectos activos por fase"
          columns={[
            { key: 'phase', header: 'Fase' },
            { key: 'count', header: 'Proyectos activos', align: 'right' },
          ]}
          rows={phases.map((item) => ({
            key: item.phase.id,
            cells: [<ReportLink key="phase" to={hrefOf(item.phase.id)} label={`Ver los proyectos activos en ${item.phase.label}`}>{item.phase.label}</ReportLink>, formatCount(item.count)],
          }))}
        />
      }
    />
  );
}

/** Oportunidades identificadas en el período por etapa vigente (E.7), barras horizontales en orden de etapa. */
export function OpportunitiesByStagePanel({ data, isLoading, errorMessage, onRetry, links }: DashboardPanelProps) {
  const navigate = useNavigate();
  const stages = data?.opportunitiesByStage ?? [];
  const hrefOf = (stageId: string) => opportunitiesReportHref({ stageId, ownerId: links.ownerId, countryId: links.countryId, period: links.period });
  const labelOf = (stage: (typeof stages)[number]['stage']) => (stage.isActive ? stage.label : `${stage.label} (inactiva)`);
  return (
    <ChartPanel
      title="Oportunidades por etapa"
      description="Etapa vigente de las oportunidades identificadas en el período."
      isLoading={isLoading}
      errorMessage={errorMessage}
      onRetry={onRetry}
      isEmpty={stages.length === 0}
      chart={
        <LazyBarChart
          ariaLabel="Oportunidades por etapa"
          layout="horizontal"
          categories={stages.map((item) => labelOf(item.stage))}
          series={[{ key: 'count', label: 'Oportunidades', tone: 'primary', values: stages.map((item) => item.count) }]}
          onItemClick={(index) => {
            const stage = stages[index];
            if (stage) {
              navigate(hrefOf(stage.stage.id));
            }
          }}
        />
      }
      table={
        <ChartDataTable
          label="Oportunidades por etapa"
          columns={[
            { key: 'stage', header: 'Etapa' },
            { key: 'count', header: 'Oportunidades', align: 'right' },
          ]}
          rows={stages.map((item) => ({
            key: item.stage.id,
            cells: [<ReportLink key="stage" to={hrefOf(item.stage.id)} label={`Ver las oportunidades en ${item.stage.label}`}>{labelOf(item.stage)}</ReportLink>, formatCount(item.count)],
          }))}
        />
      }
    />
  );
}

/** Ganadas vs. perdidas por mes de decisión (E.7): ganadas completas + parciales apiladas, perdidas al lado. */
export function WonLostPanel({ data, isLoading, errorMessage, onRetry }: DashboardPanelProps) {
  const months = data?.wonLostByMonth ?? [];
  return (
    <ChartPanel
      title="Ganadas vs. perdidas"
      description="Por mes de la fecha de decisión. Las ganadas incluyen los resultados parciales."
      isLoading={isLoading}
      errorMessage={errorMessage}
      onRetry={onRetry}
      isEmpty={months.length === 0}
      chart={
        <LazyBarChart
          ariaLabel="Ganadas y perdidas por mes"
          layout="vertical"
          categories={monthLabels(months)}
          series={[
            { key: 'wonFull', label: 'Ganadas (completas)', tone: 'primary', stack: 'won', values: months.map((item) => item.wonFull) },
            { key: 'partial', label: 'Ganadas parciales', tone: 'secondary', stack: 'won', values: months.map((item) => item.partial) },
            { key: 'lost', label: 'Perdidas', tone: 'negative', values: months.map((item) => item.lost) },
          ]}
        />
      }
      table={
        <ChartDataTable
          label="Ganadas y perdidas por mes"
          columns={[
            { key: 'month', header: 'Mes' },
            { key: 'won', header: 'Ganadas', align: 'right' },
            { key: 'partial', header: 'De ellas parciales', align: 'right' },
            { key: 'lost', header: 'Perdidas', align: 'right' },
          ]}
          rows={months.map((item) => ({
            key: `${item.year}-${item.month}`,
            cells: [formatMonth(item), formatCount(item.won), formatCount(item.partial), formatCount(item.lost)],
          }))}
        />
      }
    />
  );
}

/** Forecast por mes (E.7): toneladas del mes + acumulado, un solo eje; meses del período ∪ M+1…M+6. */
export function ForecastPanel({ data, isLoading, errorMessage, onRetry, links }: DashboardPanelProps) {
  const navigate = useNavigate();
  const months = data?.forecastByMonth ?? [];
  const withoutConversion = months.reduce((sum, item) => sum + item.linesWithoutConversion, 0);
  const range = data ? describeMonthRange(data.forecastRange.from, data.forecastRange.to) : null;
  const hrefOf = (month: (typeof months)[number]) => forecastMonthReportHref({ month, ownerId: links.ownerId, countryId: links.countryId });
  return (
    <ChartPanel
      title="Forecast por mes"
      description={`Toneladas por año/mes de la línea y acumulado. Meses del período y los próximos 6${range ? ` (${range})` : ''}.`}
      isLoading={isLoading}
      errorMessage={errorMessage}
      onRetry={onRetry}
      isEmpty={months.length === 0}
      summary={
        withoutConversion > 0 ? (
          <Alert severity="warning" role="status" data-testid="forecast-without-conversion">
            {withoutConversion === 1
              ? '1 línea sin conversión a toneladas no suma en el gráfico.'
              : `${formatCount(withoutConversion)} líneas sin conversión a toneladas no suman en el gráfico.`}
          </Alert>
        ) : null
      }
      chart={
        <LazyComboChart
          ariaLabel="Forecast por mes en toneladas"
          categories={monthLabels(months)}
          bars={{
            key: 'tonnage',
            label: 'Toneladas del mes',
            tone: 'primary',
            values: months.map((item) => chartNumber(item.tonnage)),
            formatValue: (_value, index) => formatTons(months[index]?.tonnage),
          }}
          line={{
            key: 'cumulative',
            label: 'Acumulado',
            tone: 'secondary',
            values: months.map((item) => chartNumber(item.cumulative)),
            formatValue: (_value, index) => formatTons(months[index]?.cumulative),
          }}
          onItemClick={(index) => {
            const month = months[index];
            if (month) {
              navigate(hrefOf(month));
            }
          }}
        />
      }
      table={
        <ChartDataTable
          label="Forecast por mes"
          columns={[
            { key: 'month', header: 'Mes' },
            { key: 'tonnage', header: 'Toneladas', align: 'right' },
            { key: 'cumulative', header: 'Acumulado', align: 'right' },
            { key: 'withoutConversion', header: 'Líneas sin conversión', align: 'right' },
          ]}
          rows={months.map((item) => ({
            key: `${item.year}-${item.month}`,
            cells: [
              <ReportLink key="month" to={hrefOf(item)} label={`Ver el forecast de ${formatMonth(item)}`}>{formatMonth(item)}</ReportLink>,
              formatTons(item.tonnage),
              formatTons(item.cumulative),
              formatCount(item.linesWithoutConversion),
            ],
          }))}
        />
      }
    />
  );
}

/**
 * Distribución por asesor (E.7): abiertas y ganadas (conteos) y toneladas de forecast en una
 * gráfica **aparte** (otra unidad: nunca dos escalas en un mismo eje). Top 10 + "Otros".
 */
export function OwnersPanel({ data, isLoading, errorMessage, onRetry, links }: DashboardPanelProps) {
  const navigate = useNavigate();
  const owners = data?.byOwner ?? [];
  const categories = owners.map((item) => item.owner?.displayName ?? OTHER_OWNERS_LABEL);
  const hrefOf = (ownerId: string) => opportunitiesReportHref({ ownerId, countryId: links.countryId, period: links.period });
  const goTo = (index: number) => {
    const owner = owners[index]?.owner;
    if (owner) {
      navigate(hrefOf(owner.id));
    }
  };
  return (
    <ChartPanel
      title="Distribución por asesor"
      description="Abiertas entre las identificadas en el período, ganadas decididas en el período y toneladas de forecast. Los 10 primeros y el resto en «Otros»."
      isLoading={isLoading}
      errorMessage={errorMessage}
      onRetry={onRetry}
      isEmpty={owners.length === 0}
      chart={
        <Stack spacing={2}>
          <LazyBarChart
            ariaLabel="Oportunidades abiertas y ganadas por asesor"
            layout="horizontal"
            categories={categories}
            series={[
              { key: 'open', label: 'Abiertas', tone: 'primary', values: owners.map((item) => item.openOpportunities) },
              { key: 'won', label: 'Ganadas', tone: 'secondary', values: owners.map((item) => item.won) },
            ]}
            onItemClick={goTo}
          />
          <Typography variant="subtitle2" component="h3">
            Toneladas de forecast por asesor
          </Typography>
          <LazyBarChart
            ariaLabel="Toneladas de forecast por asesor"
            layout="horizontal"
            categories={categories}
            series={[
              {
                key: 'tonnage',
                label: 'Toneladas de forecast',
                tone: 'primary',
                values: owners.map((item) => chartNumber(item.forecastTonnage)),
                formatValue: (_value, index) => formatTons(owners[index]?.forecastTonnage),
              },
            ]}
          />
        </Stack>
      }
      table={
        <ChartDataTable
          label="Distribución por asesor"
          columns={[
            { key: 'owner', header: 'Asesor' },
            { key: 'open', header: 'Abiertas', align: 'right' },
            { key: 'won', header: 'Ganadas', align: 'right' },
            { key: 'tonnage', header: 'Toneladas de forecast', align: 'right' },
          ]}
          rows={owners.map((item) => ({
            key: item.owner?.id ?? 'others',
            cells: [
              item.owner ? (
                <ReportLink key="owner" to={hrefOf(item.owner.id)} label={`Ver las oportunidades de ${item.owner.displayName}`}>
                  {item.owner.displayName}
                </ReportLink>
              ) : (
                OTHER_OWNERS_LABEL
              ),
              formatCount(item.openOpportunities),
              formatCount(item.won),
              formatTons(item.forecastTonnage),
            ],
          }))}
        />
      }
    />
  );
}

/** Actividades y visitas por mes (E.7): realizadas, visitas realizadas + confirmadas y visitas canceladas. */
export function ActivityVisitPanel({ data, isLoading, errorMessage, onRetry }: DashboardPanelProps) {
  const months = data?.activityVisitByMonth ?? [];
  return (
    <ChartPanel
      title="Actividades y visitas"
      description="Por mes: actividades por fecha de realización, visitas realizadas y confirmadas por fecha real, canceladas por fecha de cancelación."
      isLoading={isLoading}
      errorMessage={errorMessage}
      onRetry={onRetry}
      isEmpty={months.length === 0}
      chart={
        <LazyBarChart
          ariaLabel="Actividades y visitas por mes"
          layout="vertical"
          categories={monthLabels(months)}
          series={[
            { key: 'activities', label: 'Actividades realizadas', tone: 'primary', values: months.map((item) => item.activitiesCompleted) },
            { key: 'visits', label: 'Visitas realizadas', tone: 'secondary', values: months.map((item) => item.visitsCompleted) },
            { key: 'cancelled', label: 'Visitas canceladas', tone: 'negative', values: months.map((item) => item.visitsCancelled) },
          ]}
        />
      }
      table={
        <ChartDataTable
          label="Actividades y visitas por mes"
          columns={[
            { key: 'month', header: 'Mes' },
            { key: 'activities', header: 'Actividades realizadas', align: 'right' },
            { key: 'visits', header: 'Visitas realizadas', align: 'right' },
            { key: 'cancelled', header: 'Visitas canceladas', align: 'right' },
          ]}
          rows={months.map((item) => ({
            key: `${item.year}-${item.month}`,
            cells: [formatMonth(item), formatCount(item.activitiesCompleted), formatCount(item.visitsCompleted), formatCount(item.visitsCancelled)],
          }))}
        />
      }
    />
  );
}

export interface TrendsPanelProps {
  data: CommercialTrends | undefined;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
}

/**
 * Tendencias (RN-05.52): una pequeña gráfica de líneas por indicador (múltiplos pequeños: cada
 * uno con su escala y su título, sin leyenda de color) y una tabla mes × indicador.
 */
export function TrendsPanel({ data, isLoading, errorMessage, onRetry }: TrendsPanelProps) {
  const series = data?.series ?? [];
  const months = series[0]?.points ?? [];
  return (
    <ChartPanel
      title="Tendencias"
      description="Series mensuales de los indicadores con fecha histórica. Proyectos activos no tiene tendencia."
      isLoading={isLoading}
      errorMessage={errorMessage}
      onRetry={onRetry}
      isEmpty={series.length === 0 || months.length === 0}
      chart={
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
          {series.map((item) => (
            <Stack key={item.metric} spacing={0.5} sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" component="h3">
                {TREND_METRIC_LABELS[item.metric]}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {TREND_METRIC_BASIS[item.metric]}
              </Typography>
              <LazyLineChart
                ariaLabel={`Tendencia: ${TREND_METRIC_LABELS[item.metric]}`}
                categories={monthLabels(item.points)}
                series={[{ key: item.metric, label: TREND_METRIC_LABELS[item.metric], tone: 'primary', values: item.points.map((point) => point.value) }]}
              />
            </Stack>
          ))}
        </Box>
      }
      table={
        <ChartDataTable
          label="Tendencias por mes"
          columns={[{ key: 'month', header: 'Mes' }, ...series.map((item) => ({ key: item.metric, header: TREND_METRIC_LABELS[item.metric], align: 'right' as const }))]}
          rows={months.map((month, index) => ({
            key: `${month.year}-${month.month}`,
            cells: [formatMonth(month), ...series.map((item) => formatCount(item.points[index]?.value))],
          }))}
        />
      }
    />
  );
}
