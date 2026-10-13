import { allowedCurrencyCodes, amountInBaseCurrency, baseCurrencyRate } from '@/modules/exchange-rates/exchange-rate-rules';

import { applyEstimatePlan, EMPTY_ESTIMATE, type EstimateSnapshot, planEstimate } from './opportunity-estimate';

const SAVED: EstimateSnapshot = {
  estimatedAmount: '7750.0000',
  currencyCode: 'GTQ',
  exchangeRate: '7.75000000',
  exchangeRateDate: '2026-10-01',
  estimatedAmountUsd: '1000.0000',
};
const SAME_DATE = { before: '2026-10-10', after: '2026-10-10' };

describe('opportunity-estimate (RN-03.78–RN-03.83, PF-03.121, PF-03.126)', () => {
  it('alta: monto y moneda → CONVERT con la fecha de la oportunidad; nada → KEEP', () => {
    expect(planEstimate(null, { estimatedAmount: '7750', currencyCode: 'gtq' }, { before: null, after: '2026-10-10' })).toEqual({
      plan: { kind: 'CONVERT', amount: '7750.0000', currencyCode: 'GTQ', referenceDate: '2026-10-10' },
      issues: [],
    });
    expect(planEstimate(null, {}, { before: null, after: '2026-10-10' }).plan).toEqual({ kind: 'KEEP' });
  });

  it('los cinco campos van juntos: monto sin moneda → CURRENCY_REQUIRED; moneda sin monto → REQUIRED_FIELD_MISSING', () => {
    expect(planEstimate(null, { estimatedAmount: '1' }, { before: null, after: '2026-10-10' }).issues).toEqual([
      expect.objectContaining({ field: 'currencyCode', code: 'CURRENCY_REQUIRED' }),
    ]);
    expect(planEstimate(SAVED, { estimatedAmount: null }, SAME_DATE).issues).toEqual([
      expect.objectContaining({ field: 'estimatedAmount', code: 'REQUIRED_FIELD_MISSING' }),
    ]);
  });

  it('política de recálculo: solo monto (por valor), moneda o fecha disparan la resolución', () => {
    expect(planEstimate(SAVED, {}, SAME_DATE).plan).toEqual({ kind: 'KEEP' });
    expect(planEstimate(SAVED, { estimatedAmount: '7750.00', currencyCode: 'GTQ' }, SAME_DATE).plan).toEqual({ kind: 'KEEP' });
    expect(planEstimate(SAVED, { estimatedAmount: '7751' }, SAME_DATE).plan.kind).toBe('CONVERT');
    expect(planEstimate(SAVED, { currencyCode: 'USD' }, SAME_DATE).plan.kind).toBe('CONVERT');
    expect(planEstimate(SAVED, {}, { before: '2026-10-10', after: '2026-10-12' }).plan).toEqual({
      kind: 'CONVERT',
      amount: '7750.0000',
      currencyCode: 'GTQ',
      referenceDate: '2026-10-12',
    });
    // Sin estimación guardada, cambiar la fecha no crea nada.
    expect(planEstimate(EMPTY_ESTIMATE, {}, { before: '2026-10-10', after: '2026-10-12' }).plan).toEqual({ kind: 'KEEP' });
  });

  it('monto y moneda nulos borran los cinco campos; KEEP conserva la foto', () => {
    const { plan } = planEstimate(SAVED, { estimatedAmount: null, currencyCode: null }, SAME_DATE);
    expect(plan).toEqual({ kind: 'CLEAR' });
    expect(applyEstimatePlan(SAVED, plan, null)).toEqual(EMPTY_ESTIMATE);
    expect(applyEstimatePlan(SAVED, { kind: 'KEEP' }, null)).toBe(SAVED);
    expect(() => applyEstimatePlan(SAVED, { kind: 'CONVERT', amount: '1', currencyCode: 'GTQ', referenceDate: '2026-10-10' }, null)).toThrow();
  });

  it('aritmética decimal compartida (E1): round(monto / tasa, 4, HALF_UP), identidad USD y monedas admitidas', () => {
    const rate = { currencyCode: 'GTQ', ratePerUsd: '7.80000000', effectiveDate: '2026-10-05', isBaseCurrency: false };
    expect(amountInBaseCurrency('7750.0000', rate)).toBe('993.5897');
    expect(amountInBaseCurrency('0.0001', { ...rate, ratePerUsd: '2.00000000' })).toBe('0.0001');
    expect(amountInBaseCurrency('999999999999999.9999', { ...rate, ratePerUsd: '0.00000001' })).toBe('99999999999999999990000.0000');
    expect(amountInBaseCurrency('2500.5000', baseCurrencyRate('USD'))).toBe('2500.5000');
    expect(allowedCurrencyCodes('USD', 'GTQ')).toEqual(['USD', 'GTQ']);
    expect(allowedCurrencyCodes('USD', 'USD')).toEqual(['USD']);
  });
});
