import { type DecimalString, roundDecimal, sumDecimals } from '@/common/decimal';
import type { YearMonth } from '@/modules/commercial-metrics/metric-definitions';

import type { ForecastPeriod } from './forecast-window';

/**
 * Totales del forecast (03 RN-03.74, RN-03.31, AC-03.74). Puros y con aritmética
 * decimal exacta (`sumDecimals`, nunca `number`):
 *
 * - Toneladas por período: suma de los tonelajes de las líneas **con** conversión.
 * - Acumulado: suma corrida desde el primer período consultado hasta cada uno; el total
 *   de la ventana (o del rango) es el último acumulado.
 * - Cantidades **agrupadas por unidad**, nunca mezcladas (por período y total).
 * - Líneas sin conversión: se cuentan aparte y no suman toneladas.
 *
 * La entrada son importes ya agregados (el adaptador suma en SQL `numeric`, exacto) o
 * líneas sueltas (`lineAmount`): ambos se combinan igual.
 */

export const QUANTITY_SCALE = 4;

export interface TotalsUnit {
  readonly id: string;
  readonly code: string;
  readonly symbol: string;
  readonly dimension: string;
}

/** Importe de un período y una unidad: una línea o la suma de varias. */
export interface ForecastAmount extends YearMonth {
  readonly unit: TotalsUnit;
  readonly quantity: DecimalString;
  /** Suma de los tonelajes de las líneas con conversión; `null` si ninguna la tiene. */
  readonly tonnage: DecimalString | null;
  readonly linesWithoutConversion: number;
}

export interface ForecastLineAmountSource extends YearMonth {
  readonly unit: TotalsUnit;
  readonly quantity: DecimalString;
  readonly tonnage: DecimalString | null;
}

export function lineAmount(line: ForecastLineAmountSource): ForecastAmount {
  return {
    year: line.year,
    month: line.month,
    unit: line.unit,
    quantity: line.quantity,
    tonnage: line.tonnage,
    linesWithoutConversion: line.tonnage === null ? 1 : 0,
  };
}

export interface ForecastPeriodTotal extends YearMonth {
  readonly offset: number;
  readonly tonnage: DecimalString;
  readonly accumulatedTonnage: DecimalString;
}

export interface ForecastUnitTotal {
  readonly unit: TotalsUnit;
  readonly byPeriod: readonly (YearMonth & { readonly quantity: DecimalString })[];
  readonly total: DecimalString;
}

export interface ForecastTotals {
  readonly periods: readonly ForecastPeriodTotal[];
  readonly windowTonnage: DecimalString;
  readonly quantitiesByUnit: readonly ForecastUnitTotal[];
  readonly linesWithoutConversion: number;
}

export interface RowTotals {
  readonly tonnage: DecimalString;
  readonly quantitiesByUnit: readonly { readonly unit: TotalsUnit; readonly quantity: DecimalString }[];
}

const ZERO = roundDecimal('0', QUANTITY_SCALE);

function periodKey(period: YearMonth): number {
  return period.year * 12 + period.month;
}

function byUnitCode(a: { unit: TotalsUnit }, b: { unit: TotalsUnit }): number {
  return a.unit.code < b.unit.code ? -1 : a.unit.code > b.unit.code ? 1 : a.unit.id < b.unit.id ? -1 : a.unit.id > b.unit.id ? 1 : 0;
}

function tonnages(amounts: readonly ForecastAmount[]): DecimalString[] {
  return amounts.map((amount) => amount.tonnage).filter((value): value is DecimalString => value !== null);
}

/** Totales de la matriz sobre los períodos consultados (los importes de otros períodos se ignoran). */
export function forecastTotals(periods: readonly ForecastPeriod[], amounts: readonly ForecastAmount[]): ForecastTotals {
  const ordered = [...periods].sort((a, b) => periodKey(a) - periodKey(b));
  const wanted = new Set(ordered.map(periodKey));
  const relevant = amounts.filter((amount) => wanted.has(periodKey(amount)));

  const byPeriod = new Map<number, ForecastAmount[]>();
  for (const amount of relevant) {
    const list = byPeriod.get(periodKey(amount)) ?? [];
    list.push(amount);
    byPeriod.set(periodKey(amount), list);
  }

  let accumulated = ZERO;
  const periodTotals: ForecastPeriodTotal[] = ordered.map((period) => {
    const tonnage = sumDecimals(tonnages(byPeriod.get(periodKey(period)) ?? []), QUANTITY_SCALE);
    accumulated = sumDecimals([accumulated, tonnage], QUANTITY_SCALE);
    return { year: period.year, month: period.month, offset: period.offset, tonnage, accumulatedTonnage: accumulated };
  });

  const units = new Map<string, { unit: TotalsUnit; amounts: ForecastAmount[] }>();
  for (const amount of relevant) {
    const entry = units.get(amount.unit.id) ?? { unit: amount.unit, amounts: [] };
    entry.amounts.push(amount);
    units.set(amount.unit.id, entry);
  }
  const quantitiesByUnit: ForecastUnitTotal[] = [...units.values()].sort(byUnitCode).map((entry) => ({
    unit: entry.unit,
    byPeriod: ordered.map((period) => ({
      year: period.year,
      month: period.month,
      quantity: sumDecimals(
        entry.amounts.filter((amount) => periodKey(amount) === periodKey(period)).map((amount) => amount.quantity),
        QUANTITY_SCALE,
      ),
    })),
    total: sumDecimals(
      entry.amounts.map((amount) => amount.quantity),
      QUANTITY_SCALE,
    ),
  }));

  return {
    periods: periodTotals,
    windowTonnage: accumulated,
    quantitiesByUnit,
    linesWithoutConversion: relevant.reduce((total, amount) => total + amount.linesWithoutConversion, 0),
  };
}

/** Total de una fila de la matriz: toneladas y cantidades por unidad de sus celdas. */
export function rowTotals(amounts: readonly ForecastAmount[]): RowTotals {
  const units = new Map<string, { unit: TotalsUnit; quantities: DecimalString[] }>();
  for (const amount of amounts) {
    const entry = units.get(amount.unit.id) ?? { unit: amount.unit, quantities: [] };
    entry.quantities.push(amount.quantity);
    units.set(amount.unit.id, entry);
  }
  return {
    tonnage: sumDecimals(tonnages(amounts), QUANTITY_SCALE),
    quantitiesByUnit: [...units.values()].sort(byUnitCode).map((entry) => ({ unit: entry.unit, quantity: sumDecimals(entry.quantities, QUANTITY_SCALE) })),
  };
}
