import type { ForecastCell, ForecastRow, ForecastTotals, ForecastWindow } from '../forecast.api';

/**
 * Datos de las pruebas del Forecast (ficticios). Ventana de ejemplo: M = dic
 * 2026, M+1 … M+3 = ene–mar 2027 (tres meses para que las pruebas sean cortas).
 */

export const VAR = { id: 'u-var', code: 'VAR', symbol: 'var', dimension: 'COUNT' as const };
export const KG = { id: 'u-kg', code: 'KG', symbol: 'kg', dimension: 'MASS' as const };

export const WINDOW: ForecastWindow = {
  timeZone: 'America/Guatemala',
  current: { year: 2026, month: 12 },
  periods: [
    { offset: 1, year: 2027, month: 1, label: '2027-01' },
    { offset: 2, year: 2027, month: 2, label: '2027-02' },
    { offset: 3, year: 2027, month: 3, label: '2027-03' },
  ],
};

export function cell(month: number, overrides: Partial<ForecastCell> = {}): ForecastCell {
  return {
    year: 2027,
    month,
    offset: month,
    lineId: null,
    quantity: null,
    unit: null,
    tonnage: null,
    hasConversion: true,
    owner: null,
    updatedAt: null,
    updatedBy: null,
    editable: true,
    ...overrides,
  };
}

/** Celda con línea guardada. */
export function savedCell(month: number, quantity: string, overrides: Partial<ForecastCell> = {}): ForecastCell {
  return cell(month, {
    lineId: `l-${month}`,
    quantity,
    unit: VAR,
    tonnage: '0.4020',
    owner: { id: 'u-1', displayName: 'Ana Asesora' },
    updatedAt: `2026-12-0${month}T15:00:00.000Z`,
    updatedBy: { id: 'u-1', displayName: 'Ana Asesora' },
    ...overrides,
  });
}

export function row(overrides: Partial<ForecastRow> = {}): ForecastRow {
  return {
    project: { id: 'p-1', code: 'PRY-2026-00042', name: 'Torre Norte', owner: { id: 'u-1', displayName: 'Ana Asesora' } },
    product: { id: 'pr-var3', sku: 'VAR-3', description: 'Varilla #3', family: { id: 'f-var', code: 'VARILLA', name: 'Varilla' } },
    unit: VAR,
    conversion: { ruleId: 'r-1', scope: 'PRODUCT', factor: '0.00335000' },
    cells: [savedCell(1, '120.0000'), cell(2), cell(3)],
    rowTotals: { tonnage: '0.4020', quantitiesByUnit: [{ unit: VAR, quantity: '120.0000' }] },
    lastUpdatedAt: '2026-12-01T15:00:00.000Z',
    canEdit: true,
    ...overrides,
  };
}

export const TOTALS: ForecastTotals = {
  periods: [
    { year: 2027, month: 1, offset: 1, tonnage: '0.4020', accumulatedTonnage: '0.4020' },
    { year: 2027, month: 2, offset: 2, tonnage: '1.0000', accumulatedTonnage: '1.4020' },
    { year: 2027, month: 3, offset: 3, tonnage: '0.0000', accumulatedTonnage: '1.4020' },
  ],
  windowTonnage: '1.4020',
  quantitiesByUnit: [
    { unit: VAR, byPeriod: [{ year: 2027, month: 1, quantity: '120.0000' }, { year: 2027, month: 2, quantity: '0' }, { year: 2027, month: 3, quantity: '0' }], total: '120.0000' },
    { unit: KG, byPeriod: [{ year: 2027, month: 1, quantity: '0' }, { year: 2027, month: 2, quantity: '1000.0000' }, { year: 2027, month: 3, quantity: '0' }], total: '1000.0000' },
  ],
  linesWithoutConversion: 2,
};

export function rowsPage(rows: ForecastRow[], totalItems = rows.length) {
  return { data: rows, pagination: { page: 1, pageSize: 50, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / 50)) } };
}
