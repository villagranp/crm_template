import { Box } from '@mui/material';
import { BarPlot } from '@mui/x-charts/BarChart';
import { ChartContainer } from '@mui/x-charts/ChartContainer';
import { ChartsAxisHighlight } from '@mui/x-charts/ChartsAxisHighlight';
import { ChartsGrid } from '@mui/x-charts/ChartsGrid';
import { ChartsTooltip } from '@mui/x-charts/ChartsTooltip';
import { ChartsXAxis } from '@mui/x-charts/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts/ChartsYAxis';
import { LinePlot, MarkPlot } from '@mui/x-charts/LineChart';

import { chartLayout } from '@/theme';

import type { ComboChartImplProps, ResolvedChartSeries } from './chart-types';

function formatterOf(item: ResolvedChartSeries) {
  return item.formatValue ? (value: number | null, context: { dataIndex: number }) => item.formatValue?.(value, context.dataIndex) ?? null : undefined;
}

/**
 * Barras + línea sobre **un solo eje** y la misma unidad (forecast por mes: toneladas del mes y
 * acumulado, E.7), compuestas con `ChartContainer` de `@mui/x-charts` Community (ADR-023).
 * Nunca dos escalas: el acumulado comparte el eje de toneladas.
 */
export default function ReportComboChart({ ariaLabel, categories, onItemClick, series, skipAnimation }: ComboChartImplProps) {
  const [bars, line] = series;
  if (!bars || !line) {
    return null;
  }
  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <ChartContainer
        aria-label={ariaLabel}
        height={chartLayout.height}
        skipAnimation={skipAnimation}
        xAxis={[{ scaleType: 'band', data: [...categories], id: 'categories' }]}
        yAxis={[{ id: 'values' }]}
        series={[
          { type: 'bar', id: bars.key, label: bars.label, data: [...bars.values], color: bars.color, valueFormatter: formatterOf(bars) },
          { type: 'line', id: line.key, label: line.label, data: [...line.values], color: line.color, showMark: true, valueFormatter: formatterOf(line) },
        ]}
      >
        <ChartsGrid horizontal />
        <BarPlot
          borderRadius={chartLayout.barRadius}
          onItemClick={onItemClick ? (_event, item) => onItemClick(item.dataIndex, String(item.seriesId)) : undefined}
        />
        <LinePlot />
        <MarkPlot />
        <ChartsXAxis axisId="categories" />
        <ChartsYAxis axisId="values" />
        <ChartsAxisHighlight x="band" />
        <ChartsTooltip />
      </ChartContainer>
    </Box>
  );
}
