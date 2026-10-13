import { type DecimalString, sumDecimals } from '@/common/decimal';

/**
 * Totales de los productos asociados de un proyecto (03 RN-03.31, RN-03.60, AC-03.67).
 * Puros y con aritmética decimal exacta:
 *
 * - Solo cuentan las líneas cuyo estado (`crm.estado_producto_asociado`) tiene
 *   `metadata.isActive = true`.
 * - `tonnage`: suma de los tonelajes de esas líneas (4 decimales). Las líneas sin
 *   conversión no suman ("no sumar unidades incompatibles", 00 §2.3).
 * - `quantitiesByUnit`: cantidades agrupadas por unidad, nunca mezcladas.
 * - `linesWithoutConversion`: líneas activas sin tonelaje.
 */

export const QUANTITY_SCALE = 4;

export interface TotalsUnit {
  readonly id: string;
  readonly code: string;
  readonly symbol: string;
  readonly dimension: string;
}

export interface TotalsLine {
  readonly quantity: DecimalString;
  readonly unit: TotalsUnit;
  readonly tonnage: DecimalString | null;
  /** Estado con `metadata.isActive = true`. */
  readonly statusIsActive: boolean;
}

export interface ProductTotals {
  readonly tonnage: DecimalString;
  readonly quantitiesByUnit: readonly { readonly unit: TotalsUnit; readonly quantity: DecimalString }[];
  readonly linesWithoutConversion: number;
}

export function productTotals(lines: readonly TotalsLine[]): ProductTotals {
  const active = lines.filter((line) => line.statusIsActive);
  const byUnit = new Map<string, { unit: TotalsUnit; quantities: DecimalString[] }>();
  for (const line of active) {
    const entry = byUnit.get(line.unit.id) ?? { unit: line.unit, quantities: [] };
    entry.quantities.push(line.quantity);
    byUnit.set(line.unit.id, entry);
  }
  return {
    tonnage: sumDecimals(
      active.map((line) => line.tonnage).filter((value): value is DecimalString => value !== null),
      QUANTITY_SCALE,
    ),
    quantitiesByUnit: [...byUnit.values()]
      .sort((a, b) => (a.unit.code < b.unit.code ? -1 : a.unit.code > b.unit.code ? 1 : 0))
      .map((entry) => ({ unit: entry.unit, quantity: sumDecimals(entry.quantities, QUANTITY_SCALE) })),
    linesWithoutConversion: active.filter((line) => line.tonnage === null).length,
  };
}
