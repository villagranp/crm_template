import type { ConversionScope, UnitOfMeasure, UnitRef, UserRef } from '@/features/crm/projects';
import type { ListQuery } from '@/lib/query-keys';
import { httpClient } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

/**
 * Cliente HTTP del Forecast M+6 (03 §F.3, F-20). Los tipos reflejan los DTO del
 * backend (`backend/src/modules/forecast/dto`). Cantidades y tonelajes como
 * **cadena** decimal; la ventana la calcula el backend (DEF-G) y cada celda
 * dice si es editable.
 */

const FORECAST_PATH = '/forecast';

export type ForecastMode = 'WINDOW' | 'HISTORY';

export interface YearMonth {
  year: number;
  month: number;
}

export interface ForecastWindowPeriod extends YearMonth {
  /** M+offset. */
  offset: number;
  /** `YYYY-MM`. */
  label: string;
}

/** `ForecastWindowDto`: M (de solo lectura) y M+1 … M+N (los únicos editables). */
export interface ForecastWindow {
  timeZone: string;
  current: YearMonth;
  periods: ForecastWindowPeriod[];
}

/** `ForecastCellDto`. */
export interface ForecastCell extends YearMonth {
  /** M+offset; pasados ≤ 0. */
  offset: number;
  /** `null` = celda vacía. */
  lineId: string | null;
  quantity: string | null;
  unit: UnitRef | null;
  /** `null` = "sin conversión" o celda vacía. */
  tonnage: string | null;
  hasConversion: boolean;
  owner: UserRef | null;
  /** Valor para `expectedUpdatedAt` (concurrencia optimista, D-03.6). */
  updatedAt: string | null;
  updatedBy: UserRef | null;
  /** `canEdit` de la fila, modo `WINDOW` y período M+1 … M+N. */
  editable: boolean;
}

export interface ForecastProductRef {
  id: string;
  sku: string;
  description: string;
  family: { id: string; code: string; name: string };
}

export interface QuantityByUnit {
  unit: UnitRef;
  quantity: string;
}

/** `ForecastRowDto`: un par (proyecto, producto). */
export interface ForecastRow {
  project: { id: string; code: string; name: string; owner: UserRef };
  product: ForecastProductRef;
  /** Unidad propuesta para celdas nuevas. */
  unit: UnitRef;
  /** Regla vigente para `unit` (vista previa del tonelaje); `null` = "sin conversión". */
  conversion: { ruleId: string; scope: ConversionScope; factor: string } | null;
  /** Una por período consultado, en orden. */
  cells: ForecastCell[];
  rowTotals: { tonnage: string; quantitiesByUnit: QuantityByUnit[] };
  lastUpdatedAt: string | null;
  canEdit: boolean;
}

export interface ForecastPeriodTotal extends YearMonth {
  offset: number;
  tonnage: string;
  /** Suma corrida desde el primer período consultado. */
  accumulatedTonnage: string;
}

/** `ForecastTotalsDto`: sobre todas las filas filtradas (no la página). Solo toneladas; cantidades por unidad. */
export interface ForecastTotals {
  periods: ForecastPeriodTotal[];
  windowTonnage: string;
  quantitiesByUnit: { unit: UnitRef; byPeriod: (YearMonth & { quantity: string })[]; total: string }[];
  linesWithoutConversion: number;
}

/** Una línea de `SaveForecastLinesDto`. */
export interface SaveForecastLineInput extends YearMonth {
  projectId: string;
  productId: string;
  quantity: string;
  unitId?: string;
  ownerId?: string;
  notes?: string | null;
  expectedUpdatedAt?: string;
}

export interface ForecastSaveResult {
  created: number;
  updated: number;
  unchanged: number;
  lines: (YearMonth & { lineId: string; projectId: string; productId: string; quantity: string; unit: UnitRef; tonnage: string | null; updatedAt: string })[];
}

/** Filtros comunes de filas y totales (nombres de la API). Listas separadas por comas. */
export interface ForecastFilters {
  mode: ForecastMode;
  projectId?: string;
  productId?: string;
  ownerId?: string;
  /** `YYYY-MM` de la ventana, separados por comas (solo `WINDOW`). */
  periods?: string;
  /** `YYYY-MM` (solo `HISTORY`). */
  from?: string;
  to?: string;
  search?: string;
}

/** Filtros de la pantalla en la URL (nombres de la API; la búsqueda va aparte). */
export const FORECAST_FILTER_KEYS = ['mode', 'projectId', 'productId', 'ownerId', 'periods', 'from', 'to'] as const;
export type ForecastFilterKey = (typeof FORECAST_FILTER_KEYS)[number];

export const FORECAST_SORT_FIELDS = ['projectCode', 'productSku', 'updatedAt'] as const;
/** Máximo de líneas por guardado (RN-03.72). */
export const MAX_BATCH_LINES = 500;

/** Consulta para la API sin vacíos ni parámetros del modo contrario (`400` en el backend). */
export function forecastQuery(filters: ForecastFilters): ListQuery {
  const query: ListQuery = { mode: filters.mode };
  for (const key of ['projectId', 'productId', 'ownerId', 'search'] as const) {
    if (filters[key]) query[key] = filters[key];
  }
  if (filters.mode === 'WINDOW') {
    if (filters.periods) query.periods = filters.periods;
  } else {
    if (filters.from) query.from = filters.from;
    if (filters.to) query.to = filters.to;
  }
  return query;
}

export function getForecastWindow(): Promise<ForecastWindow> {
  return httpClient.get<ForecastWindow>(`${FORECAST_PATH}/window`);
}

export function listForecastRows(query: ListQuery): Promise<PaginatedResponse<ForecastRow>> {
  return httpClient.get<PaginatedResponse<ForecastRow>>(`${FORECAST_PATH}/rows`, { query });
}

export function getForecastTotals(query: ListQuery): Promise<ForecastTotals> {
  return httpClient.get<ForecastTotals>(`${FORECAST_PATH}/totals`, { query });
}

/** Guardado en lote atómico (upsert por proyecto, producto, año y mes; RN-03.63, RN-03.72). */
export function saveForecastLines(lines: SaveForecastLineInput[]): Promise<ForecastSaveResult> {
  return httpClient.put<ForecastSaveResult>(`${FORECAST_PATH}/lines`, { body: { lines } });
}

/** Unidades activas para el selector de unidad de la fila (`proyectos.ver`). */
export function listForecastUnits(): Promise<{ data: UnitOfMeasure[] }> {
  return httpClient.get<{ data: UnitOfMeasure[] }>('/units-of-measure');
}
