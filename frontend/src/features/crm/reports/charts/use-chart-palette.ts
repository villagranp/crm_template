import { useMediaQuery, useTheme } from '@mui/material';
import { useMemo } from 'react';

import { chartColors } from '@/theme';

import type { ChartSeriesSpec, ChartSeriesTone, ResolvedChartSeries } from './chart-types';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Colores de datos del modo activo (`chartColors` de `tokens.ts`, ADR-017/ADR-023): los azules
 * de identidad de los slots 1 y 2 y el rojo semántico sólo para una serie que **es** un estado
 * negativo. Sin hex en los componentes.
 */
export function useChartPalette(): Readonly<Record<ChartSeriesTone, string>> {
  const mode = useTheme().palette.mode;
  return useMemo(() => {
    const colors = chartColors[mode];
    return { primary: colors.series[0], secondary: colors.series[1], negative: colors.negative };
  }, [mode]);
}

/** Series con su color resuelto. */
export function useResolvedSeries(series: readonly ChartSeriesSpec[]): ResolvedChartSeries[] {
  const palette = useChartPalette();
  return useMemo(() => series.map((item) => ({ ...item, color: palette[item.tone] })), [series, palette]);
}

/** `true` con `prefers-reduced-motion: reduce`: las gráficas se dibujan sin animación. */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY, { noSsr: true });
}
