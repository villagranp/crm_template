/**
 * Contrato de las gráficas de Reportes (ADR-023). Estos tipos **no** importan `@mui/x-charts`:
 * las páginas sólo conocen esto y `LazyCharts`, y la librería queda en un *chunk* diferido.
 */

/** Papel del color de una serie (DESIGN-SYSTEM §3 "Gráficas"): identidad (slot 1/2) o estado negativo. */
export type ChartSeriesTone = 'primary' | 'secondary' | 'negative';

export interface ChartSeriesSpec {
  /** Identificador estable de la serie (llega a `onItemClick`). */
  key: string;
  /** Texto de la leyenda y del *tooltip* (el color nunca es el único indicador). */
  label: string;
  values: readonly (number | null)[];
  tone: ChartSeriesTone;
  /** Series con el mismo `stack` se apilan (p. ej. ganadas completas + parciales). */
  stack?: string;
  /** Texto del valor en el *tooltip* (p. ej. toneladas con su unidad, desde la cadena decimal original). */
  formatValue?: (value: number | null, index: number) => string;
}

/** Serie con su color ya resuelto desde el tema (lo que recibe la implementación). */
export interface ResolvedChartSeries extends ChartSeriesSpec {
  color: string;
}

export interface CartesianChartProps {
  /** Nombre accesible del lienzo (la alternativa completa es "Ver como tabla"). */
  ariaLabel: string;
  /** Etiquetas de las categorías (etapas, asesores, meses), en orden. */
  categories: readonly string[];
  series: readonly ChartSeriesSpec[];
  /** Clic en una barra o punto: índice de la categoría y clave de la serie. */
  onItemClick?: (categoryIndex: number, seriesKey: string) => void;
}

export interface BarChartProps extends CartesianChartProps {
  /** `horizontal` = barras horizontales (etapas, embudo, asesores). */
  layout: 'horizontal' | 'vertical';
  /** Texto junto a cada barra (p. ej. "4 · 42.86 %" en el embudo); `null` = sin texto. */
  barLabel?: (value: number | null, index: number) => string | null;
}

/** Implementación: series con color resuelto y movimiento reducido. */
export interface ChartRuntime {
  series: readonly ResolvedChartSeries[];
  skipAnimation: boolean;
}

export type BarChartImplProps = Omit<BarChartProps, 'series'> & ChartRuntime;
export type LineChartImplProps = Omit<CartesianChartProps, 'series'> & ChartRuntime;
/** Combinada: la primera serie son barras y la segunda una línea, sobre el **mismo eje** y unidad. */
export type ComboChartImplProps = Omit<CartesianChartProps, 'series'> & ChartRuntime;
