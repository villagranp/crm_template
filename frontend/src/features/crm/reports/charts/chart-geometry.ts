import { chartLayout } from '@/theme';

/** Alto del lienzo de barras horizontales: una banda por categoría (etapas, asesores) y una más para el eje, con mínimo. */
export function horizontalChartHeight(categoryCount: number): number {
  return Math.max(chartLayout.minHeight, (categoryCount + 1) * chartLayout.bandHeight);
}
