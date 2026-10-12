import { compareDecimal, type DecimalString, isDecimalString, roundDecimal } from '@/common/decimal';

import { FORECAST_ERROR_CODES, type ForecastIssue, forecastIssuesError, lineIssue } from './forecast-errors';
import { QUANTITY_SCALE } from './forecast-totals';
import { type ForecastWindow, isEditablePeriod, periodLabel } from './forecast-window';

/**
 * Validación de negocio del lote de `PUT /forecast/lines` que no necesita la base
 * (03 F.3, RN-03.64, RN-03.65, RN-03.66, RN-03.72). Pura. Reporta **todas** las
 * incidencias a la vez con `details[].field = "lines[i].<campo>"` (y `index`):
 *
 * - Cantidad decimal ≥ 0 con 4 decimales como máximo → `INVALID_QUANTITY` (`quantity`).
 * - Período fuera de M+1 … M+N → `FORECAST_PERIOD_OUT_OF_WINDOW` (`month`, con `period`).
 * - Clave (proyecto, producto, año, mes) repetida → `FORECAST_DUPLICATE_IN_BATCH` en cada
 *   repetición (`month`, con `duplicateOfIndex` = primera aparición).
 */

/** Máximo de líneas por petición (RN-03.72, H.3). */
export const MAX_BATCH_LINES = 500;
export const MAX_NOTES_LENGTH = 500;

export interface ForecastLineKey {
  readonly projectId: string;
  readonly productId: string;
  readonly year: number;
  readonly month: number;
}

export interface ForecastLineInput extends ForecastLineKey {
  /** Cadena decimal (forma validada por el DTO; el signo, aquí). */
  readonly quantity: string;
  readonly unitId?: string;
  readonly ownerId?: string;
  /** `undefined` = conservar; `null` = borrar. */
  readonly notes?: string | null;
  /** Instante ISO-8601 (`updatedAt` que el cliente vio). */
  readonly expectedUpdatedAt?: string;
}

/** Línea válida, con su posición en el lote y la cantidad normalizada a 4 decimales. */
export interface ValidatedForecastLine extends ForecastLineKey {
  readonly index: number;
  readonly quantity: DecimalString;
  readonly unitId: string | null;
  readonly ownerId: string | null;
  readonly notes: string | null | undefined;
  readonly expectedUpdatedAt: Date | null;
}

export function forecastLineKey(key: ForecastLineKey): string {
  return `${key.projectId.toLowerCase()}|${key.productId.toLowerCase()}|${key.year}|${key.month}`;
}

export function forecastPairKey(key: { readonly projectId: string; readonly productId: string }): string {
  return `${key.projectId.toLowerCase()}|${key.productId.toLowerCase()}`;
}

function quantityIsValid(value: string): boolean {
  return isDecimalString(value, { maxScale: QUANTITY_SCALE, maxIntegerDigits: 15, allowNegative: true }) && compareDecimal(value, '0') >= 0;
}

export function validateForecastBatch(window: ForecastWindow, lines: readonly ForecastLineInput[]): ValidatedForecastLine[] {
  const issues: ForecastIssue[] = [];
  const firstIndex = new Map<string, number>();

  lines.forEach((line, index) => {
    if (!quantityIsValid(line.quantity)) {
      issues.push(lineIssue(index, 'quantity', FORECAST_ERROR_CODES.invalidQuantity));
    }
    if (!isEditablePeriod(window, line)) {
      issues.push(lineIssue(index, 'month', FORECAST_ERROR_CODES.periodOutOfWindow, { period: periodLabel(line) }));
    }
    const key = forecastLineKey(line);
    const first = firstIndex.get(key);
    if (first === undefined) {
      firstIndex.set(key, index);
    } else {
      issues.push(lineIssue(index, 'month', FORECAST_ERROR_CODES.duplicateInBatch, { duplicateOfIndex: first }));
    }
  });

  if (issues.length > 0) throw forecastIssuesError(issues);

  return lines.map((line, index) => ({
    index,
    // Ids en minúsculas: PostgreSQL compara `uuid` sin distinguir mayúsculas y las claves en memoria también deben hacerlo.
    projectId: line.projectId.toLowerCase(),
    productId: line.productId.toLowerCase(),
    year: line.year,
    month: line.month,
    quantity: roundDecimal(line.quantity, QUANTITY_SCALE),
    unitId: line.unitId?.toLowerCase() ?? null,
    ownerId: line.ownerId?.toLowerCase() ?? null,
    notes: line.notes,
    expectedUpdatedAt: line.expectedUpdatedAt === undefined ? null : new Date(line.expectedUpdatedAt),
  }));
}
