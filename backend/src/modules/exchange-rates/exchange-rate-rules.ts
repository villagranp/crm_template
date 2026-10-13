import { type CalendarDate, calendarDaysBetween } from '@/common/calendar-date';
import { type DecimalString, divideDecimal, roundDecimal } from '@/common/decimal';
import type { ApplicationWarning } from '@/common/warnings';

import type { ExchangeRateRecord } from './ports/exchange-rate.reader.port';

/**
 * Reglas puras de moneda y tipo de cambio (ADR-024, 00 §2.16, 03 RN-03.78–RN-03.81).
 * Sin base de datos: las prueba `exchange-rate-rules.spec.ts` y las aplica
 * `CurrencyConversionService`.
 */

/** Escala de montos (`Decimal(19, 4)`: `estimated_amount`, `estimated_amount_usd`). */
export const AMOUNT_SCALE = 4;
/** Escala de tasas (`Decimal(19, 8)`: `rate_per_usd`, `opportunities.exchange_rate`). */
export const RATE_SCALE = 8;
/** Aviso no bloqueante de tasa antigua (RN-03.81). */
export const EXCHANGE_RATE_STALE = 'EXCHANGE_RATE_STALE';

/** Tasa aplicada a una fecha de referencia: lo que se copia como foto (RN-03.79). */
export interface AppliedExchangeRate {
  readonly currencyCode: string;
  /** Unidades de la moneda por 1 USD, 8 decimales. `'1.00000000'` en la moneda base. */
  readonly ratePerUsd: DecimalString;
  /** Vigencia de la fila aplicada; `null` en la moneda base (sin fila, `ck_opportunities_rate_date`). */
  readonly effectiveDate: CalendarDate | null;
  readonly isBaseCurrency: boolean;
}

/** La moneda base tiene tasa 1 y no tiene fila en `exchange_rates` (00 §2.16). */
export function baseCurrencyRate(baseCurrencyCode: string): AppliedExchangeRate {
  return { currencyCode: baseCurrencyCode, ratePerUsd: roundDecimal('1', RATE_SCALE), effectiveDate: null, isBaseCurrency: true };
}

export function fromExchangeRateRecord(record: ExchangeRateRecord): AppliedExchangeRate {
  return {
    currencyCode: record.currencyCode,
    ratePerUsd: roundDecimal(record.ratePerUsd, RATE_SCALE),
    effectiveDate: record.effectiveDate,
    isBaseCurrency: false,
  };
}

/**
 * Códigos admitidos para una estimación (RN-03.78): la moneda base y la moneda del
 * país, sin repetir (El Salvador y Ecuador usan USD: solo una). Orden: base primero.
 * La comprobación de "existe y está activa" la hace el servicio con `currencies`.
 */
export function allowedCurrencyCodes(baseCurrencyCode: string, countryCurrencyCode: string | null): string[] {
  return countryCurrencyCode && countryCurrencyCode !== baseCurrencyCode ? [baseCurrencyCode, countryCurrencyCode] : [baseCurrencyCode];
}

/** Días naturales entre la vigencia de la tasa y la fecha de referencia (≥ 0 por la regla de búsqueda). */
export function exchangeRateAgeDays(effectiveDate: CalendarDate, referenceDate: CalendarDate): number {
  return calendarDaysBetween(effectiveDate, referenceDate);
}

/**
 * RN-03.81: la tasa es antigua si su vigencia es anterior a la fecha de referencia
 * en **más de** `thresholdDays` días (con 31: 31 días no avisa, 32 sí). La moneda
 * base nunca avisa.
 */
export function staleExchangeRateWarning(
  rate: AppliedExchangeRate,
  referenceDate: CalendarDate,
  thresholdDays: number,
): ApplicationWarning | null {
  if (rate.isBaseCurrency || rate.effectiveDate === null) {
    return null;
  }
  const ageDays = exchangeRateAgeDays(rate.effectiveDate, referenceDate);
  if (ageDays <= thresholdDays) {
    return null;
  }
  return {
    code: EXCHANGE_RATE_STALE,
    message: 'The applied exchange rate is older than the configured threshold',
    details: { currencyCode: rate.currencyCode, exchangeRateDate: rate.effectiveDate, referenceDate, ageDays, thresholdDays },
  };
}

/** RN-03.80: `round(amount / ratePerUsd, 4, HALF_UP)` con aritmética decimal exacta. */
export function amountInBaseCurrency(amount: DecimalString, rate: AppliedExchangeRate): DecimalString {
  return divideDecimal(amount, rate.ratePerUsd, AMOUNT_SCALE);
}
