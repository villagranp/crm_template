import type { CurrencyConversionService } from '@/modules/exchange-rates/currency-conversion.service';

import { effectiveCountryIds, LocalCurrencyReferenceService, localReferenceAmount, referenceCutDate } from './local-currency-reference';
import type { ReportingRepository } from './ports/reporting.repository.port';

const OWN = { kind: 'FILTERED', userId: 'u1', dataScope: 'OWN', ownerIds: ['u1'], teamIds: [], countryIds: [] } as const;
const COUNTRY = { kind: 'FILTERED', userId: 'u1', dataScope: 'COUNTRY', ownerIds: ['u1'], teamIds: [], countryIds: ['gt'] } as const;
const ALL = { kind: 'ALL', userId: 'u1', dataScope: 'ORGANIZATION' } as const;
const CLOCK = { now: new Date('2026-10-13T05:30:00Z'), businessTimeZone: 'America/Guatemala' };

describe('local-currency-reference (RN-05.58)', () => {
  it('país efectivo: el filtro si viene; si no, el del alcance COUNTRY; si no, ninguno', () => {
    expect(effectiveCountryIds(['gt', 'gt'], ALL)).toEqual(['gt']);
    expect(effectiveCountryIds(['gt', 'hn'], COUNTRY)).toEqual(['gt', 'hn']);
    expect(effectiveCountryIds([], COUNTRY)).toEqual(['gt']);
    expect(effectiveCountryIds([], OWN)).toBeNull();
    expect(effectiveCountryIds([], ALL)).toBeNull();
  });

  it('fecha de corte: `to` del período o hoy en la zona del negocio (no en UTC)', () => {
    expect(referenceCutDate('2026-07-15', CLOCK)).toBe('2026-07-15');
    // 2026-10-13 05:30 UTC = 2026-10-12 23:30 en Guatemala.
    expect(referenceCutDate(null, CLOCK)).toBe('2026-10-12');
  });

  it('PF-05.44: total USD × tasa con aritmética decimal exacta, 4 decimales HALF_UP', () => {
    expect(localReferenceAmount('1000.0000', '7.75000000')).toBe('7750.0000');
    expect(localReferenceAmount('0.0001', '0.50000000')).toBe('0.0001');
    expect(localReferenceAmount('0.0001', '0.49999999')).toBe('0.0000');
    expect(localReferenceAmount('123456789012.3456', '7.75123456')).toBe('956942529659.1215');
    expect(localReferenceAmount('0.1000', '0.20000000')).toBe('0.0200');
  });

  describe('LocalCurrencyReferenceService', () => {
    function build(options: { currencyCode?: string | null; rate?: { ratePerUsd: string; effectiveDate: string | null } | null } = {}) {
      const reporting = {
        countryCurrencies: jest.fn().mockResolvedValue(options.currencyCode === null ? [] : [{ id: 'gt', name: 'Guatemala', currencyCode: options.currencyCode ?? 'GTQ' }]),
      } as unknown as jest.Mocked<ReportingRepository>;
      const rate = options.rate === undefined ? { ratePerUsd: '7.75000000', effectiveDate: '2026-10-01' } : options.rate;
      const currencies = {
        baseCurrencyCode: jest.fn().mockResolvedValue('USD'),
        findApplicable: jest.fn().mockResolvedValue(rate ? { currencyCode: 'GTQ', isBaseCurrency: false, ...rate } : null),
      } as unknown as jest.Mocked<CurrencyConversionService>;
      return { service: new LocalCurrencyReferenceService(reporting, currencies), reporting, currencies };
    }

    it('con un país en moneda local y tasa: referencia con la tasa de la fecha de corte', async () => {
      const { service, currencies } = build();
      await expect(service.resolve({ filterCountryIds: ['gt'], scope: ALL, totalUsd: '1000.0000', periodTo: '2026-10-31', clock: CLOCK })).resolves.toEqual({
        reference: { currencyCode: 'GTQ', amount: '7750.0000', exchangeRate: '7.75000000', exchangeRateDate: '2026-10-01', cutDate: '2026-10-31', label: 'referencial' },
        unavailableReason: null,
      });
      expect(currencies.findApplicable).toHaveBeenCalledWith('GTQ', '2026-10-31');
    });

    it('motivos: varios países, país inexistente, moneda base y sin tasa', async () => {
      const input = { scope: ALL, totalUsd: '10.0000', periodTo: null, clock: CLOCK };
      await expect(build().service.resolve({ ...input, filterCountryIds: [] })).resolves.toEqual({ reference: null, unavailableReason: 'MULTIPLE_COUNTRIES' });
      await expect(build().service.resolve({ ...input, filterCountryIds: ['gt', 'hn'] })).resolves.toEqual({ reference: null, unavailableReason: 'MULTIPLE_COUNTRIES' });
      await expect(build({ currencyCode: null }).service.resolve({ ...input, filterCountryIds: ['xx'] })).resolves.toEqual({ reference: null, unavailableReason: 'MULTIPLE_COUNTRIES' });
      await expect(build({ currencyCode: 'USD' }).service.resolve({ ...input, filterCountryIds: ['sv'] })).resolves.toEqual({ reference: null, unavailableReason: 'BASE_CURRENCY' });
      await expect(build({ rate: null }).service.resolve({ ...input, filterCountryIds: ['gt'] })).resolves.toEqual({ reference: null, unavailableReason: 'EXCHANGE_RATE_NOT_FOUND' });
    });
  });
});
