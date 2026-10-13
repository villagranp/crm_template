import { formatQuantity, formatTonnage } from '@/features/crm/common/decimal';
import { formatDateTime } from '@/features/crm/projects';

import type { ForecastCell, ForecastRow, YearMonth } from './forecast.api';

/** Total de una fila: cantidades por unidad (nunca mezcladas) y toneladas ("120 var · 0.40 t"). */
export function rowTotalText(row: Pick<ForecastRow, 'rowTotals'>): string {
  const quantities = row.rowTotals.quantitiesByUnit.map((item) => formatQuantity(item.quantity, item.unit.symbol));
  return [...quantities, formatTonnage(row.rowTotals.tonnage)].join(' · ');
}

/**
 * Etiquetas del Forecast M+6 (03 §E.8). Los meses se construyen con sus partes
 * (nunca `new Date('2027-01')`, que se desplaza por la zona horaria).
 */

const monthFormatter = new Intl.DateTimeFormat('es-GT', { month: 'short', year: 'numeric' });

/** "ene 2027". */
export function periodLabel({ year, month }: YearMonth): string {
  return monthFormatter.format(new Date(year, month - 1, 1)).replace('.', '');
}

/** "M+1", "M", "M-2". */
export function offsetLabel(offset: number): string {
  if (offset === 0) return 'M';
  return offset > 0 ? `M+${offset}` : `M${offset}`;
}

/** "M+1 (ene 2027)". */
export function periodHeader(period: YearMonth & { offset: number }): string {
  return `${offsetLabel(period.offset)} (${periodLabel(period)})`;
}

/** `YYYY-MM` (filtro `periods`, `from`, `to`). */
export function periodKey({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** "Actualizado el … por …" de una celda (AC-03.76). */
export function updatedText(cell: Pick<ForecastCell, 'updatedAt' | 'updatedBy'>): string | null {
  if (!cell.updatedAt) {
    return null;
  }
  return cell.updatedBy ? `Actualizado el ${formatDateTime(cell.updatedAt)} por ${cell.updatedBy.displayName}` : `Actualizado el ${formatDateTime(cell.updatedAt)}`;
}

/** Mes anterior o posterior (para el rango del historial). */
export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
