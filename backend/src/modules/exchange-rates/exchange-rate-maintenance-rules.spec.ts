import { BusinessRuleViolationError, ResourceConflictError } from '@/common/errors/application-error';

import {
  currencyIssue,
  exchangeRateDuplicateError,
  invalidExchangeRateError,
  isPositiveRate,
  normalizeRate,
  RATE_PATTERN,
} from './exchange-rate-maintenance-rules';

const GTQ = { code: 'GTQ', name: 'Quetzal', symbol: 'Q', decimals: 2, isActive: true };

describe('Reglas del mantenimiento de tipos de cambio (RN-07.44)', () => {
  it('currencyIssue: base, inexistente, inactiva; válida → null', () => {
    expect(currencyIssue('USD', { ...GTQ, code: 'USD' }, 'USD')).toBe('base_currency');
    expect(currencyIssue('XXX', null, 'USD')).toBe('unknown_currency');
    expect(currencyIssue('GTQ', { ...GTQ, isActive: false }, 'USD')).toBe('inactive_currency');
    expect(currencyIssue('GTQ', GTQ, 'USD')).toBeNull();
  });

  it('isPositiveRate: > 0; cero, negativo o no decimal → false', () => {
    expect(isPositiveRate('7.75')).toBe(true);
    expect(isPositiveRate('0.00000001')).toBe(true);
    for (const rate of ['0', '0.00000000', '-1', '-0', 'abc', '']) {
      expect(isPositiveRate(rate)).toBe(false);
    }
  });

  it('RATE_PATTERN: hasta 11 enteros y 8 decimales, con signo para que ≤ 0 sea 422', () => {
    for (const rate of ['7.75', '-1', '0', '12345678901.12345678']) expect(RATE_PATTERN.test(rate)).toBe(true);
    for (const rate of ['123456789012', '1.123456789', '1e3', '7,75', ' 7.75']) expect(RATE_PATTERN.test(rate)).toBe(false);
  });

  it('normalizeRate: 8 decimales', () => {
    expect(normalizeRate('7.75')).toBe('7.75000000');
  });

  it('invalidExchangeRateError: 422 con field e issue', () => {
    const error = invalidExchangeRateError('base_currency', 'USD');
    expect(error).toBeInstanceOf(BusinessRuleViolationError);
    expect(error.code).toBe('INVALID_EXCHANGE_RATE');
    expect(error.details).toEqual([{ field: 'currencyCode', issue: 'base_currency', currencyCode: 'USD' }]);
    expect(invalidExchangeRateError('non_positive_rate').details).toEqual([{ field: 'ratePerUsd', issue: 'non_positive_rate' }]);
  });

  it('exchangeRateDuplicateError: 409 EXCHANGE_RATE_DUPLICATE', () => {
    const error = exchangeRateDuplicateError('GTQ', '2026-10-01');
    expect(error).toBeInstanceOf(ResourceConflictError);
    expect(error.code).toBe('EXCHANGE_RATE_DUPLICATE');
    expect(error.details).toEqual([{ field: 'effectiveDate', issue: 'duplicated', currencyCode: 'GTQ', effectiveDate: '2026-10-01' }]);
  });
});
