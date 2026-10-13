import { BusinessRuleViolationError } from '@/common/errors/application-error';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import { CurrencyConversionService } from './currency-conversion.service';
import type { CurrencyRecord, ExchangeRateReader, ExchangeRateRecord } from './ports/exchange-rate.reader.port';

const GT = 'country-gt';
const SV = 'country-sv';
const HN = 'country-hn';
const TX = {} as TransactionContext;

const CURRENCIES: Record<string, CurrencyRecord> = {
  USD: { code: 'USD', name: 'Dólar estadounidense', symbol: '$', decimals: 2, isActive: true },
  GTQ: { code: 'GTQ', name: 'Quetzal', symbol: 'Q', decimals: 2, isActive: true },
  HNL: { code: 'HNL', name: 'Lempira', symbol: 'L', decimals: 2, isActive: false },
};
const COUNTRY_CURRENCY: Record<string, string> = { [GT]: 'GTQ', [SV]: 'USD', [HN]: 'HNL' };

function setup(options: { rates?: ExchangeRateRecord[]; thresholdDays?: number } = {}) {
  const rates = options.rates ?? [{ currencyCode: 'GTQ', effectiveDate: '2026-09-01', ratePerUsd: '7.75000000', source: 'Banco' }];
  const reader: jest.Mocked<ExchangeRateReader> = {
    findApplicable: jest.fn(async (code: string, date: string) => {
      const candidates = rates.filter((rate) => rate.currencyCode === code && rate.effectiveDate <= date);
      return candidates.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] ?? null;
    }),
    findCurrencies: jest.fn(async (codes: readonly string[]) => codes.flatMap((code) => (CURRENCIES[code] ? [CURRENCIES[code]] : []))),
    findCountryCurrencyCode: jest.fn(async (countryId: string) => COUNTRY_CURRENCY[countryId] ?? null),
  };
  const values: Record<string, unknown> = {
    'crm.moneda_base': 'USD',
    'crm.tipos_cambio.dias_aviso_antiguedad': options.thresholdDays ?? 31,
  };
  const parameters = { get: jest.fn(async (key: string) => values[key]) };
  const service = new CurrencyConversionService(reader, parameters as unknown as ParameterReader);
  return { service, reader, parameters };
}

async function caught(promise: Promise<unknown>): Promise<BusinessRuleViolationError> {
  const error = await promise.catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(BusinessRuleViolationError);
  return error as BusinessRuleViolationError;
}

describe('CurrencyConversionService', () => {
  describe('allowedCurrencies (RN-03.78)', () => {
    it('Guatemala: USD y GTQ, con GTQ por defecto', async () => {
      const { service } = setup();
      await expect(service.allowedCurrencies(GT)).resolves.toEqual({
        baseCurrencyCode: 'USD',
        defaultCurrencyCode: 'GTQ',
        allowed: [
          { code: 'USD', name: 'Dólar estadounidense', symbol: '$', decimals: 2 },
          { code: 'GTQ', name: 'Quetzal', symbol: 'Q', decimals: 2 },
        ],
      });
    });

    it('El Salvador (moneda del país USD): solo USD', async () => {
      const { service } = setup();
      const result = await service.allowedCurrencies(SV);
      expect(result.allowed.map((currency) => currency.code)).toEqual(['USD']);
      expect(result.defaultCurrencyCode).toBe('USD');
    });

    it('moneda del país inactiva: no se admite y el defecto es la base', async () => {
      const { service } = setup();
      const result = await service.allowedCurrencies(HN);
      expect(result.allowed.map((currency) => currency.code)).toEqual(['USD']);
      expect(result.defaultCurrencyCode).toBe('USD');
    });

    it('propaga la transacción del llamador al puerto', async () => {
      const { service, reader } = setup();
      await service.allowedCurrencies(GT, TX);
      expect(reader.findCountryCurrencyCode).toHaveBeenCalledWith(GT, TX);
      expect(reader.findCurrencies).toHaveBeenCalledWith(['USD', 'GTQ'], TX);
    });
  });

  describe('assertCurrencyAllowed', () => {
    it('HNL en Guatemala y GTQ en El Salvador → 422 CURRENCY_NOT_ALLOWED con las admitidas (AC-03.88)', async () => {
      const { service } = setup();

      const hnl = await caught(service.assertCurrencyAllowed('HNL', GT));
      expect(hnl.code).toBe('CURRENCY_NOT_ALLOWED');
      expect(hnl.details).toEqual([{ field: 'currencyCode', code: 'CURRENCY_NOT_ALLOWED', currencyCode: 'HNL', allowedCurrencyCodes: ['USD', 'GTQ'] }]);

      const gtq = await caught(service.assertCurrencyAllowed('GTQ', SV, { field: 'estimate.currencyCode' }));
      expect(gtq.details).toEqual([
        { field: 'estimate.currencyCode', code: 'CURRENCY_NOT_ALLOWED', currencyCode: 'GTQ', allowedCurrencyCodes: ['USD'] },
      ]);
    });

    it('una moneda inexistente también se rechaza', async () => {
      const { service } = setup();
      expect((await caught(service.assertCurrencyAllowed('ZZZ', GT))).code).toBe('CURRENCY_NOT_ALLOWED');
    });

    it('devuelve la moneda admitida', async () => {
      const { service } = setup();
      await expect(service.assertCurrencyAllowed('GTQ', GT)).resolves.toEqual({ code: 'GTQ', name: 'Quetzal', symbol: 'Q', decimals: 2 });
    });
  });

  describe('findApplicable (00 §2.16)', () => {
    it('la base es tasa 1 sin consultar el puerto', async () => {
      const { service, reader } = setup();
      await expect(service.findApplicable('USD', '2026-10-11')).resolves.toEqual({
        currencyCode: 'USD',
        ratePerUsd: '1.00000000',
        effectiveDate: null,
        isBaseCurrency: true,
      });
      expect(reader.findApplicable).not.toHaveBeenCalled();
    });

    it('otra moneda: la de mayor vigencia ≤ fecha; null si no hay (sin lanzar)', async () => {
      const { service } = setup({
        rates: [
          { currencyCode: 'GTQ', effectiveDate: '2026-08-01', ratePerUsd: '7.80000000', source: 'A' },
          { currencyCode: 'GTQ', effectiveDate: '2026-09-01', ratePerUsd: '7.75000000', source: 'B' },
          { currencyCode: 'GTQ', effectiveDate: '2026-10-01', ratePerUsd: '7.70000000', source: 'C' },
        ],
      });
      await expect(service.findApplicable('GTQ', '2026-09-30')).resolves.toMatchObject({ ratePerUsd: '7.75000000', effectiveDate: '2026-09-01' });
      await expect(service.findApplicable('GTQ', '2026-10-01')).resolves.toMatchObject({ effectiveDate: '2026-10-01' });
      await expect(service.findApplicable('GTQ', '2026-07-31')).resolves.toBeNull();
    });

    it('rechaza una fecha que no es de calendario (error de programación)', async () => {
      const { service } = setup();
      await expect(service.findApplicable('GTQ', '2026-02-30')).rejects.toThrow(RangeError);
    });
  });

  describe('convertToBase (RN-03.78–RN-03.81)', () => {
    it('moneda local: foto de la tasa, equivalente USD y sin avisos dentro del umbral', async () => {
      const { service } = setup();
      await expect(
        service.convertToBase({ amount: '850000', currencyCode: 'GTQ', referenceDate: '2026-09-11', countryId: GT }),
      ).resolves.toEqual({
        amount: '850000.0000',
        currencyCode: 'GTQ',
        exchangeRate: '7.75000000',
        exchangeRateDate: '2026-09-01',
        amountInBaseCurrency: '109677.4194',
        baseCurrencyCode: 'USD',
        warnings: [],
      });
    });

    it('USD: tasa 1, sin fecha, mismo monto y nunca avisa', async () => {
      const { service, parameters } = setup();
      const result = await service.convertToBase({ amount: '1000.5', currencyCode: 'USD', referenceDate: '2026-10-11', countryId: GT });
      expect(result).toEqual({
        amount: '1000.5000',
        currencyCode: 'USD',
        exchangeRate: '1.00000000',
        exchangeRateDate: null,
        amountInBaseCurrency: '1000.5000',
        baseCurrencyCode: 'USD',
        warnings: [],
      });
      expect(parameters.get).not.toHaveBeenCalledWith('crm.tipos_cambio.dias_aviso_antiguedad');
    });

    it('tasa de hace 45 días con umbral 31 → se convierte con aviso EXCHANGE_RATE_STALE (AC-03.90)', async () => {
      const { service } = setup();
      const result = await service.convertToBase({ amount: '100', currencyCode: 'GTQ', referenceDate: '2026-10-16', countryId: GT });
      expect(result.amountInBaseCurrency).toBe('12.9032');
      expect(result.warnings).toEqual([
        {
          code: 'EXCHANGE_RATE_STALE',
          message: 'The applied exchange rate is older than the configured threshold',
          details: { currencyCode: 'GTQ', exchangeRateDate: '2026-09-01', referenceDate: '2026-10-16', ageDays: 45, thresholdDays: 31 },
        },
      ]);
    });

    it('el umbral sale del parámetro en cada llamada', async () => {
      const { service } = setup({ thresholdDays: 60 });
      const result = await service.convertToBase({ amount: '100', currencyCode: 'GTQ', referenceDate: '2026-10-16', countryId: GT });
      expect(result.warnings).toEqual([]);
    });

    it('sin tasa ≤ fecha → 422 EXCHANGE_RATE_NOT_FOUND con moneda y fecha (AC-03.89)', async () => {
      const { service } = setup();
      const error = await caught(
        service.convertToBase({ amount: '100', currencyCode: 'GTQ', referenceDate: '2026-08-31', countryId: GT, currencyField: 'currencyCode' }),
      );
      expect(error.code).toBe('EXCHANGE_RATE_NOT_FOUND');
      expect(error.details).toEqual([{ field: 'currencyCode', code: 'EXCHANGE_RATE_NOT_FOUND', currencyCode: 'GTQ', date: '2026-08-31' }]);
    });

    it('la moneda no admitida se rechaza antes de buscar la tasa', async () => {
      const { service, reader } = setup();
      const error = await caught(service.convertToBase({ amount: '100', currencyCode: 'HNL', referenceDate: '2026-10-11', countryId: GT }));
      expect(error.code).toBe('CURRENCY_NOT_ALLOWED');
      expect(reader.findApplicable).not.toHaveBeenCalled();
    });

    it('propaga la transacción a la búsqueda de la tasa', async () => {
      const { service, reader } = setup();
      await service.convertToBase({ amount: '1', currencyCode: 'GTQ', referenceDate: '2026-09-11', countryId: GT, tx: TX });
      expect(reader.findApplicable).toHaveBeenCalledWith('GTQ', '2026-09-11', TX);
    });
  });
});
