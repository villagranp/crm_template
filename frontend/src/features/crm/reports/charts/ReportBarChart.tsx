import { Box } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';

import { chartLayout } from '@/theme';

import { horizontalChartHeight } from './chart-geometry';
import type { BarChartImplProps } from './chart-types';

/**
 * Barras de Reportes con `BarChart` de `@mui/x-charts` **Community** (ADR-023). Sólo se carga en
 * diferido a través de `LazyCharts` (export por defecto para `React.lazy`). El embudo usa
 * `layout="horizontal"`; nunca el `FunnelChart` de la edición Pro.
 *
 * La leyenda es HTML (`ChartFigure`), por eso aquí `hideLegend`. Ejes, rejilla y *tooltip* toman
 * tipografía y colores del tema MUI.
 */
export default function ReportBarChart({ ariaLabel, categories, layout, onItemClick, barLabel, series, skipAnimation }: BarChartImplProps) {
  const horizontal = layout === 'horizontal';
  const categoryAxis = { scaleType: 'band' as const, data: [...categories], id: 'categories' };
  const valueAxis = { id: 'values', tickMinStep: 1 };
  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <BarChart
        aria-label={ariaLabel}
        layout={layout}
        height={horizontal ? horizontalChartHeight(categories.length) : chartLayout.height}
        hideLegend
        skipAnimation={skipAnimation}
        borderRadius={chartLayout.barRadius}
        grid={horizontal ? { vertical: true } : { horizontal: true }}
        xAxis={[horizontal ? valueAxis : categoryAxis]}
        yAxis={[horizontal ? { ...categoryAxis, width: chartLayout.categoryAxisWidth } : valueAxis]}
        series={series.map((item) => ({
          id: item.key,
          label: item.label,
          data: [...item.values],
          color: item.color,
          stack: item.stack,
          valueFormatter: item.formatValue ? (value: number | null, context: { dataIndex: number }) => item.formatValue?.(value, context.dataIndex) ?? null : undefined,
          barLabel: barLabel ? (bar: { value: number | null; dataIndex: number }) => barLabel(bar.value, bar.dataIndex) : undefined,
          barLabelPlacement: barLabel ? ('outside' as const) : undefined,
        }))}
        onItemClick={onItemClick ? (_event, item) => onItemClick(item.dataIndex, String(item.seriesId)) : undefined}
      />
    </Box>
  );
}
