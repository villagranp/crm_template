import type { CalendarDate } from '@/common/calendar-date';
import { BusinessRuleViolationError } from '@/common/errors/application-error';

/** `422`: moneda distinta de la base y de la del país, inexistente o inactiva (RN-03.78). */
export const CURRENCY_NOT_ALLOWED = 'CURRENCY_NOT_ALLOWED';
/** `422`: no hay tasa de la moneda con vigencia ≤ la fecha de referencia (RN-03.79, ADR-024). */
export const EXCHANGE_RATE_NOT_FOUND = 'EXCHANGE_RATE_NOT_FOUND';

export function currencyNotAllowedError(field: string, currencyCode: string, allowedCodes: readonly string[]): BusinessRuleViolationError {
  return new BusinessRuleViolationError(CURRENCY_NOT_ALLOWED, 'The currency is not allowed for this record', [
    { field, code: CURRENCY_NOT_ALLOWED, currencyCode, allowedCurrencyCodes: [...allowedCodes] },
  ]);
}

export function exchangeRateNotFoundError(field: string, currencyCode: string, date: CalendarDate): BusinessRuleViolationError {
  return new BusinessRuleViolationError(EXCHANGE_RATE_NOT_FOUND, 'There is no exchange rate in effect for the currency at that date', [
    { field, code: EXCHANGE_RATE_NOT_FOUND, currencyCode, date },
  ]);
}
