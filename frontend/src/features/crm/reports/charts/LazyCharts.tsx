import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { lazy, Suspense, type ReactNode } from 'react';

import { chartLayout } from '@/theme';

import type { BarChartProps, CartesianChartProps, ChartSeriesSpec, ResolvedChartSeries } from './chart-types';
import { useReducedMotion, useResolvedSeries } from './use-chart-palette';

/**
 * Puerta única de las gráficas de Reportes (ADR-023, AC-05.47). `@mui/x-charts` sólo se importa
 * desde `ReportBarChart`, `ReportLineChart` y `ReportComboChart`, y esos módulos sólo se cargan
 * aquí con `React.lazy`: la librería queda en un *chunk* diferido que no pagan las páginas sin
 * gráficas ni la carga inicial (lo vigila `charts-architecture.spec.ts`).
 *
 * Cada gráfica va en una `figure` con su leyenda en HTML (texto + muestra de color: el color
 * nunca es el único indicador) y, mientras llega el *chunk*, un esqueleto del mismo alto.
 */

const ReportBarChart = lazy(() => import('./ReportBarChart'));
const ReportLineChart = lazy(() => import('./ReportLineChart'));
const ReportComboChart = lazy(() => import('./ReportComboChart'));

interface ChartFigureProps {
  ariaLabel: string;
  series: readonly ResolvedChartSeries[];
  children: ReactNode;
}

/** Leyenda con texto: siempre con dos o más series; con una, el título del panel la nombra. */
export function ChartLegend({ series }: { series: readonly ResolvedChartSeries[] }) {
  if (series.length < 2) {
    return null;
  }
  return (
    <Stack component="ul" direction="row" spacing={2} useFlexGap flexWrap="wrap" aria-label="Leyenda" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {series.map((item) => (
        <Stack key={item.key} component="li" direction="row" spacing={1} alignItems="center">
          <Box
            aria-hidden
            sx={{ width: chartLayout.legendSwatch, height: chartLayout.legendSwatch, borderRadius: 0.5, bgcolor: item.color, flex: '0 0 auto' }}
          />
          <Typography variant="body2" color="text.secondary" component="span">
            {item.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function ChartFigure({ ariaLabel, series, children }: ChartFigureProps) {
  return (
    <Box component="figure" aria-label={ariaLabel} sx={{ m: 0, minWidth: 0 }}>
      <Stack spacing={1}>
        <ChartLegend series={series} />
        <Suspense fallback={<Skeleton variant="rounded" height={chartLayout.minHeight} aria-label="Cargando gráfica" />}>{children}</Suspense>
      </Stack>
    </Box>
  );
}

/** Barras (verticales u horizontales) en diferido. */
export function LazyBarChart(props: BarChartProps) {
  const series = useResolvedSeries(props.series);
  const skipAnimation = useReducedMotion();
  return (
    <ChartFigure ariaLabel={props.ariaLabel} series={series}>
      <ReportBarChart {...props} series={series} skipAnimation={skipAnimation} />
    </ChartFigure>
  );
}

/** Líneas en diferido. */
export function LazyLineChart(props: CartesianChartProps) {
  const series = useResolvedSeries(props.series);
  const skipAnimation = useReducedMotion();
  return (
    <ChartFigure ariaLabel={props.ariaLabel} series={series}>
      <ReportLineChart {...props} series={series} skipAnimation={skipAnimation} />
    </ChartFigure>
  );
}

export interface LazyComboChartProps extends Omit<CartesianChartProps, 'series'> {
  bars: ChartSeriesSpec;
  /** Misma unidad y mismo eje que `bars` (un solo eje, nunca dos escalas). */
  line: ChartSeriesSpec;
}

/** Barras + línea sobre un solo eje, en diferido. */
export function LazyComboChart({ bars, line, ...props }: LazyComboChartProps) {
  const series = useResolvedSeries([bars, line]);
  const skipAnimation = useReducedMotion();
  return (
    <ChartFigure ariaLabel={props.ariaLabel} series={series}>
      <ReportComboChart {...props} series={series} skipAnimation={skipAnimation} />
    </ChartFigure>
  );
}
