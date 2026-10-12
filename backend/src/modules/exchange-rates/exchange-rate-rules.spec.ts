import {
  allowedCurrencyCodes,
  amountInBaseCurrency,
  baseCurrencyRate,
  exchangeRateAgeDays,
  fromExchangeRateRecord,
  staleExchangeRateWarning,
} from './exchange-rate-rules';

const GTQ = fromExchangeRateRecord({ currencyCode: 'GTQ', effectiveDate: '2026-09-01', ratePerUsd: '7.75', source: 'Banco' });

describe('exchange-rate-rules', () => {
  it('la moneda base tiene tasa 1 sin fecha de vigencia (00 §2.16)', () => {
    expect(baseCurrencyRate('USD')).toEqual({ currencyCode: 'USD', ratePerUsd: '1.00000000', effectiveDate: null, isBaseCurrency: true });
  });

  it('la tasa de una fila se normaliza a 8 decimales', () => {
    expect(GTQ).toEqual({ currencyCode: 'GTQ', ratePerUsd: '7.75000000', effectiveDate: '2026-09-01', isBaseCurrency: false });
  });

  describe('allowedCurrencyCodes (RN-03.78)', () => {
    it('base + moneda del país', () => {
      expect(allowedCurrencyCodes('USD', 'GTQ')).toEqual(['USD', 'GTQ']);
    });

    it('un país con USD solo admite USD, sin repetir', () => {
      expect(allowedCurrencyCodes('USD', 'USD')).toEqual(['USD']);
    });

    it('sin país conocido, solo la base', () => {
      expect(allowedCurrencyCodes('USD', null)).toEqual(['USD']);
    });
  });

  describe('staleExchangeRateWarning (RN-03.81, AC-03.90)', () => {
    it('45 días con umbral 31 → aviso con los detalles completos', () => {
      expect(staleExchangeRateWarning(GTQ, '2026-10-16', 31)).toEqual({
        code: 'EXCHANGE_RATE_STALE',
        message: 'The applied exchange rate is older than the configured threshold',
        details: { currencyCode: 'GTQ', exchangeRateDate: '2026-09-01', referenceDate: '2026-10-16', ageDays: 45, thresholdDays: 31 },
      });
    });

    it('exactamente el umbral no avisa; un día más sí ("en más de N días")', () => {
      expect(exchangeRateAgeDays('2026-09-01', '2026-10-02')).toBe(31);
      expect(staleExchangeRateWarning(GTQ, '2026-10-02', 31)).toBeNull();
      expect(staleExchangeRateWarning(GTQ, '2026-10-03', 31)?.details).toMatchObject({ ageDays: 32 });
    });

    it('10 días no avisa y la moneda base nunca avisa', () => {
      expect(staleExchangeRateWarning(GTQ, '2026-09-11', 31)).toBeNull();
      expect(staleExchangeRateWarning(baseCurrencyRate('USD'), '2030-01-01', 1)).toBeNull();
    });
  });

  describe('amountInBaseCurrency (RN-03.80)', () => {
    it('round(monto / tasa, 4, HALF_UP)', () => {
      expect(amountInBaseCurrency('850000', GTQ)).toBe('109677.4194');
      expect(amountInBaseCurrency('0', GTQ)).toBe('0.0000');
    });

    it('en la moneda base es el mismo monto', () => {
      expect(amountInBaseCurrency('450000.5', baseCurrencyRate('USD'))).toBe('450000.5000');
    });
  });
});
