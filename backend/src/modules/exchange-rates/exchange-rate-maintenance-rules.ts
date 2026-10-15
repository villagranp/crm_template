import { type DecimalString, isDecimalString, isZeroDecimal, roundDecimal } from '@/common/decimal';
import { BusinessRuleViolationError, MASTER_DATA_ERROR_CODES, ResourceConflictError } from '@/common/errors/application-error';

import { RATE_SCALE } from './exchange-rate-rules';
import type { CurrencyRecord } from './ports/exchange-rate.reader.port';

/**
 * Reglas puras del mantenimiento de tipos de cambio (07 RN-07.44, ADR-024, 00 §2.16).
 * Sin base de datos: las prueba `exchange-rate-maintenance-rules.spec.ts` y las aplica
 * `ExchangeRatesService`.
 */

/** Incidencia de `422 INVALID_EXCHANGE_RATE` (`details[].issue`, 07 F.7). */
export type ExchangeRateIssue = 'base_currency' | 'unknown_currency' | 'inactive_currency' | 'non_positive_rate';

/** Hasta 11 enteros y 8 decimales (`Decimal(19, 8)`), con signo para que `≤ 0` sea `422` y no `400`. */
export const RATE_PATTERN = /^-?\d{1,11}(\.\d{1,8})?$/;

export const EXCHANGE_RATE_SOURCE_MAX = 120;
export const EXCHANGE_RATE_NOTES_MAX = 500;

/**
 * La moneda de un tipo de cambio debe existir, estar activa y no ser la base: la
 * base no tiene tasa (`ck_exchange_rates_not_base`). `null` = válida.
 */
export function currencyIssue(currencyCode: string, currency: CurrencyRecord | null, baseCurrencyCode: string): ExchangeRateIssue | null {
  if (currencyCode === baseCurrencyCode) return 'base_currency';
  if (!currency) return 'unknown_currency';
  if (!currency.isActive) return 'inactive_currency';
  return null;
}

/** La tasa es un decimal > 0 (`ck_exchange_rates_rate`). */
export function isPositiveRate(rate: DecimalString): boolean {
  return isDecimalString(rate, { allowNegative: true }) && !rate.startsWith('-') && !isZeroDecimal(rate);
}

/** Tasa normalizada a 8 decimales, la forma en que se guarda y se devuelve. */
export function normalizeRate(rate: DecimalString): DecimalString {
  return roundDecimal(rate, RATE_SCALE);
}

const ISSUE_FIELD: Record<ExchangeRateIssue, string> = {
  base_currency: 'currencyCode',
  unknown_currency: 'currencyCode',
  inactive_currency: 'currencyCode',
  non_positive_rate: 'ratePerUsd',
};

const ISSUE_MESSAGE: Record<ExchangeRateIssue, string> = {
  base_currency: 'The base currency has no exchange rate',
  unknown_currency: 'The currency does not exist',
  inactive_currency: 'The currency is inactive',
  non_positive_rate: 'The rate must be greater than zero',
};

export function invalidExchangeRateError(issue: ExchangeRateIssue, currencyCode?: string): BusinessRuleViolationError {
  return new BusinessRuleViolationError(MASTER_DATA_ERROR_CODES.invalidExchangeRate, ISSUE_MESSAGE[issue], [
    { field: ISSUE_FIELD[issue], issue, ...(currencyCode ? { currencyCode } : {}) },
  ]);
}

export function exchangeRateDuplicateError(currencyCode: string, effectiveDate: string): ResourceConflictError {
  return new ResourceConflictError(
    'There is already an exchange rate for this currency and effective date',
    [{ field: 'effectiveDate', issue: 'duplicated', currencyCode, effectiveDate }],
    MASTER_DATA_ERROR_CODES.exchangeRateDuplicate,
  );
}
