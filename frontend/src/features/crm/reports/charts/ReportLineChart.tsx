import { Box } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';

import { chartLayout } from '@/theme';

import type { LineChartImplProps } from './chart-types';

/**
 * Líneas de Reportes (tendencias mensuales, RN-05.52) con `LineChart` de `@mui/x-charts`
 * Community (ADR-023), cargado en diferido por `LazyCharts`. Marca visible en cada mes y
 * leyenda en HTML (`ChartFigure`).
 */
export default function ReportLineChart({ ariaLabel, categories, series, onItemClick, skipAnimation }: LineChartImplProps) {
  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <LineChart
        aria-label={ariaLabel}
        height={chartLayout.height}
        hideLegend
        skipAnimation={skipAnimation}
        grid={{ horizontal: true }}
        xAxis={[{ scaleType: 'point', data: [...categories], id: 'categories' }]}
        yAxis={[{ id: 'values', tickMinStep: 1 }]}
        series={series.map((item) => ({
          id: item.key,
          label: item.label,
          data: [...item.values],
          color: item.color,
          showMark: true,
          valueFormatter: item.formatValue ? (value: number | null, context: { dataIndex: number }) => item.formatValue?.(value, context.dataIndex) ?? null : undefined,
        }))}
        onMarkClick={onItemClick ? (_event, item) => onItemClick(item.dataIndex ?? 0, String(item.seriesId)) : undefined}
      />
    </Box>
  );
}
