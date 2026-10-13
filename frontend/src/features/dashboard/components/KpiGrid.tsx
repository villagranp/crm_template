import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import AssignmentLateOutlinedIcon from '@mui/icons-material/AssignmentLateOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import ThumbDownOffAltOutlinedIcon from '@mui/icons-material/ThumbDownOffAltOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import { Alert, Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';

import { fontSizes, layout } from '@/theme/tokens';
import { sectionLabelSx } from '@/theme/typography';

import {
  forecastBarRatios,
  formatCount,
  formatMonth,
  formatPeriodRange,
  formatQuantityText,
  formatTonnageValue,
  PERIOD_LABELS,
  pluralize,
  topStages,
} from '../dashboard-format';
import type { DashboardAccess } from '../dashboard.permissions';
import {
  useActivityIndicators,
  useForecastIndicators,
  useOpportunityIndicators,
  useProjectIndicators,
  useVisitIndicators,
} from '../dashboard.queries';
import {
  DASHBOARD_PERIODS,
  type DashboardPeriod,
  type ForecastIndicators,
} from '../dashboard.types';
import { kpiCardHref, useLinkContext } from '../source-routes';
import { KpiCard } from './KpiCard';
import { TargetsCard } from './TargetsCard';

/** Parámetro de la URL con el período de K3, K4 y K9 (D-01.3). */
export const PERIOD_PARAM = 'period';
const DEFAULT_PERIOD: DashboardPeriod = 'MONTH';

/** Aviso de RN-01.7. */
export const NO_INDICATORS_NOTICE = 'Todavía no tienes indicadores comerciales asignados';

function parsePeriod(raw: string | null): DashboardPeriod {
  return DASHBOARD_PERIODS.find((period) => period === raw) ?? DEFAULT_PERIOD;
}

/** Estado común de una tarjeta a partir de su consulta. */
function cardState(query: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
  data?: { generatedAt: string };
}) {
  return {
    isLoading: query.isPending,
    error: query.isError ? query.error : undefined,
    onRetry: () => void query.refetch(),
    generatedAt: query.data?.generatedAt,
  };
}

/** Mini-serie de seis meses del forecast como tabla accesible, con barras decorativas. */
function ForecastSeries({ data }: { data: ForecastIndicators }) {
  const ratios = forecastBarRatios(data.months.map((month) => month.tonnage));
  return (
    <Box
      component="table"
      sx={{
        width: '100%',
        mt: 1,
        borderCollapse: 'collapse',
        fontSize: fontSizes.caption,
        color: 'text.secondary',
      }}
    >
      <Box component="caption" sx={{ textAlign: 'left', captionSide: 'top', pb: 0.5 }}>
        Toneladas por mes
      </Box>
      <thead>
        <tr>
          <Box component="th" scope="col" sx={{ textAlign: 'left', fontWeight: 500 }}>
            Mes
          </Box>
          <Box component="th" scope="col" aria-hidden="true" />
          <Box component="th" scope="col" sx={{ textAlign: 'right', fontWeight: 500 }}>
            Toneladas
          </Box>
        </tr>
      </thead>
      <tbody>
        {data.months.map((month, index) => (
          <tr key={`${month.year}-${month.month}`}>
            <Box
              component="th"
              scope="row"
              sx={{ textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap', pr: 1 }}
            >
              {formatMonth(month)}
            </Box>
            <Box component="td" aria-hidden="true" sx={{ width: '100%' }}>
              <Box
                sx={{
                  height: (theme) => theme.spacing(0.75),
                  borderRadius: `${layout.radiusPill}px`,
                  bgcolor: 'primary.main',
                  width: `${Math.round((ratios[index] ?? 0) * 100)}%`,
                }}
              />
            </Box>
            <Box component="td" sx={{ textAlign: 'right', whiteSpace: 'nowrap', pl: 1 }}>
              {formatTonnageValue(month.tonnage, data.tonnageUnit)}
            </Box>
          </tr>
        ))}
      </tbody>
    </Box>
  );
}

function forecastFoot(data: ForecastIndicators): string | undefined {
  const parts = [
    `${formatMonth(data.window.from)} – ${formatMonth(data.window.to)}`,
    data.unconvertedLines > 0
      ? pluralize(data.unconvertedLines, 'línea sin conversión', 'líneas sin conversión')
      : null,
    data.quantitiesByUnit.length > 0
      ? `Cantidades: ${data.quantitiesByUnit.map((item) => formatQuantityText(item.quantity, item.unitSymbol)).join(' · ')}`
      : null,
  ].filter((part): part is string => part !== null);
  return parts.join(' · ');
}

/**
 * Indicadores K1–K9 (01 §E.3) con el selector de período (Mes / Trimestre /
 * Año en curso, en la URL `?period=`, sólo afecta a K3, K4 y K9).
 *
 * Cada tarjeta se monta y se consulta sólo con el permiso de su fuente
 * (RN-01.4) y tiene su propia carga y error (RN-01.8). Sin ningún permiso de
 * fuente, el aviso de RN-01.7 y ninguna petición.
 */
export function KpiGrid({ access }: { access: DashboardAccess }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = parsePeriod(searchParams.get(PERIOD_PARAM));
  const links = useLinkContext();

  const projects = useProjectIndicators(access.projects);
  const opportunities = useOpportunityIndicators(period, access.opportunities);
  const forecast = useForecastIndicators(access.forecast);
  const visits = useVisitIndicators(access.visits);
  const activities = useActivityIndicators(access.activities);

  const changePeriod = (next: DashboardPeriod | null) => {
    if (!next) {
      return;
    }
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        if (next === DEFAULT_PERIOD) {
          params.delete(PERIOD_PARAM);
        } else {
          params.set(PERIOD_PARAM, next);
        }
        return params;
      },
      { replace: true },
    );
  };

  const showPeriod = access.opportunities || access.targets;
  const opportunityPeriod = opportunities.data?.period;
  const periodText = opportunityPeriod
    ? formatPeriodRange(opportunityPeriod)
    : PERIOD_LABELS[period];

  return (
    <Box component="section" aria-labelledby="home-indicators">
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
        spacing={1.5}
        sx={{ mb: 1.5 }}
      >
        <Typography
          id="home-indicators"
          component="h2"
          sx={{ ...sectionLabelSx, color: 'text.secondary' }}
        >
          Indicadores
        </Typography>
        {access.anyCommercialSource && showPeriod ? (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={period}
            onChange={(_, next: DashboardPeriod | null) => changePeriod(next)}
            aria-label="Período"
          >
            {DASHBOARD_PERIODS.map((option) => (
              <ToggleButton key={option} value={option} sx={{ minHeight: layout.tap, px: 1.5 }}>
                {PERIOD_LABELS[option]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        ) : null}
      </Stack>

      {!access.anyCommercialSource ? (
        <Alert severity="info">{NO_INDICATORS_NOTICE}</Alert>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              lg: 'repeat(3, minmax(0, 1fr))',
              xl: 'repeat(4, minmax(0, 1fr))',
            },
          }}
        >
          {access.projects ? (
            <KpiCard
              tone="brand"
              label="Proyectos activos"
              icon={<ApartmentOutlinedIcon />}
              {...cardState(projects)}
              value={projects.data ? formatCount(projects.data.activeProjects) : undefined}
              href={kpiCardHref('activeProjects', links)}
            />
          ) : null}

          {access.opportunities ? (
            <>
              <KpiCard
                tone="brandSoft"
                label="Oportunidades abiertas"
                icon={<HandshakeOutlinedIcon />}
                {...cardState(opportunities)}
                value={opportunities.data ? formatCount(opportunities.data.open.count) : undefined}
                foot={
                  opportunities.data
                    ? topStages(opportunities.data.open.byStage)
                        .map((stage) => `${stage.label} ${formatCount(stage.count)}`)
                        .join(' · ') || undefined
                    : undefined
                }
                href={kpiCardHref('openOpportunities', links)}
              />
              <KpiCard
                label="Oportunidades ganadas"
                icon={<EmojiEventsOutlinedIcon />}
                {...cardState(opportunities)}
                value={opportunities.data ? formatCount(opportunities.data.won.count) : undefined}
                foot={
                  opportunities.data
                    ? `${pluralize(opportunities.data.won.partialCount, 'parcial', 'parciales')} · ${periodText}`
                    : undefined
                }
                href={kpiCardHref('wonOpportunities', links, opportunityPeriod)}
              />
              <KpiCard
                label="Oportunidades perdidas"
                icon={<ThumbDownOffAltOutlinedIcon />}
                {...cardState(opportunities)}
                value={opportunities.data ? formatCount(opportunities.data.lost.count) : undefined}
                foot={opportunities.data ? periodText : undefined}
                href={kpiCardHref('lostOpportunities', links, opportunityPeriod)}
              />
            </>
          ) : null}

          {access.forecast ? (
            <KpiCard
              label="Forecast próximos seis meses"
              icon={<TrendingUpOutlinedIcon />}
              {...cardState(forecast)}
              value={
                forecast.data
                  ? forecast.data.totalTonnage === null
                    ? 'Sin proyección'
                    : formatTonnageValue(forecast.data.totalTonnage, forecast.data.tonnageUnit)
                  : undefined
              }
              foot={forecast.data ? forecastFoot(forecast.data) : undefined}
              href={kpiCardHref('forecast', links)}
            >
              {forecast.data &&
              forecast.data.totalTonnage !== null &&
              forecast.data.months.length > 0 ? (
                <ForecastSeries data={forecast.data} />
              ) : null}
            </KpiCard>
          ) : null}

          {access.visits ? (
            <KpiCard
              label="Visitas pendientes"
              icon={<LocationOnOutlinedIcon />}
              {...cardState(visits)}
              value={visits.data ? formatCount(visits.data.pending.count) : undefined}
              foot={
                visits.data
                  ? `${pluralize(visits.data.upcoming.count, 'próxima', 'próximas')} en ${visits.data.upcoming.days} días · ${pluralize(visits.data.pending.overdueCount, 'atrasada', 'atrasadas')}`
                  : undefined
              }
              href={kpiCardHref('pendingVisits', links)}
            />
          ) : null}

          {access.activities ? (
            <>
              <KpiCard
                label="Actividades pendientes"
                icon={<AssignmentOutlinedIcon />}
                {...cardState(activities)}
                value={activities.data ? formatCount(activities.data.pending.count) : undefined}
                foot={
                  activities.data
                    ? `${formatCount(activities.data.pending.dueSoonCount)} por vencer en ${activities.data.pending.dueSoonHours} h`
                    : undefined
                }
                href={kpiCardHref('pendingActivities', links)}
              />
              <KpiCard
                label="Actividades vencidas"
                icon={<AssignmentLateOutlinedIcon />}
                {...cardState(activities)}
                value={activities.data ? formatCount(activities.data.overdue.count) : undefined}
                href={kpiCardHref('overdueActivities', links)}
              />
            </>
          ) : null}

          {access.targets ? <TargetsCard period={period} /> : null}
        </Box>
      )}
    </Box>
  );
}
