import { EMPTY, formatQuantityWithUnit, formatTons, monthKey } from '../common/report-format';
import type { ForecastMonthRef } from '../common/report-types';

import type { ForecastGroup, ForecastGroupBy, ForecastSubgroup, ForecastTotals, ForecastUnitQuantity } from './forecast-report.api';

/** Textos y transformaciones del reporte de forecast (05 E.4). */

export const FORECAST_GROUP_LABELS: Record<ForecastGroupBy, string> = {
  MONTH: 'Mes',
  PRODUCT: 'Producto',
  FAMILY: 'Familia',
  PROJECT: 'Proyecto',
  CUSTOMER: 'Cliente',
  OWNER: 'Asesor',
};

/** Texto del tonelaje de una línea: `null` = "sin conversión" (DM-24). */
export const NO_CONVERSION = 'sin conversión';

export function tonnageText(value: string | null): string {
  return value === null ? NO_CONVERSION : formatTons(value);
}

/** Cantidades por unidad, nunca sumadas entre unidades (RN-05.12): "120 kg · 3 VAR". */
export function quantitiesText(quantities: readonly ForecastUnitQuantity[]): string {
  return quantities.length === 0 ? EMPTY : quantities.map((item) => formatQuantityWithUnit(item.quantity, item.unit.symbol)).join(' · ');
}

/** "3 líneas sin conversión" (o `null` si no hay). */
export function withoutConversionText(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  return count === 1 ? '1 línea sin conversión' : `${count} líneas sin conversión`;
}

/** Fila de la matriz consolidada: un grupo o un subgrupo (con su nivel para la sangría). */
export interface ConsolidatedRow {
  id: string;
  level: 0 | 1;
  label: string;
  /** Totales por mes indexados por `YYYY-MM`. */
  byMonth: ReadonlyMap<string, ForecastTotals>;
  total: ForecastTotals;
}

function toRow(group: ForecastSubgroup, level: 0 | 1, parentId: string | null, index: number): ConsolidatedRow {
  const keyId = group.key.id ?? group.key.label;
  return {
    id: parentId ? `${parentId}/${keyId}` : `${keyId}#${index}`,
    level,
    label: group.key.label,
    byMonth: new Map(group.months.map((month) => [monthKey(month), month])),
    total: group.total,
  };
}

/** Grupos (y subgrupos, si hay `thenBy`) en filas planas, en el orden de la API. */
export function flattenGroups(groups: readonly ForecastGroup[]): ConsolidatedRow[] {
  return groups.flatMap((group, index) => {
    const row = toRow(group, 0, null, index);
    const children = (group.subgroups ?? []).map((subgroup, childIndex) => toRow(subgroup, 1, row.id, childIndex));
    return [row, ...children];
  });
}

/** Meses de un rango (incluidos), en orden. */
export function monthsOfRange(from: ForecastMonthRef, to: ForecastMonthRef): ForecastMonthRef[] {
  const result: ForecastMonthRef[] = [];
  let index = from.year * 12 + (from.month - 1);
  const last = to.year * 12 + (to.month - 1);
  while (index <= last) {
    result.push({ year: Math.floor(index / 12), month: (index % 12) + 1 });
    index += 1;
  }
  return result;
}
