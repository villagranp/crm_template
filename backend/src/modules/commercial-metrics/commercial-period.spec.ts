import { businessToday, periodDays, periodInstants, resolvePeriod, startOfBusinessDay } from './commercial-period';
import { forecastWindowMonths } from './metric-definitions';

const GT = 'America/Guatemala';
const clock = (iso: string) => ({ now: new Date(iso), businessTimeZone: GT });

describe('resolvePeriod (01 RN-01.15, PF-01.27)', () => {
  it('mes, trimestre y año en curso en la zona del negocio', () => {
    const ctx = clock('2026-10-10T15:00:00Z');
    expect(resolvePeriod('MONTH', ctx)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(resolvePeriod('QUARTER', ctx)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(resolvePeriod('YEAR', ctx)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('el 31-dic a las 23:30 de Guatemala (1-ene en UTC) sigue siendo diciembre; el 1-ene es enero', () => {
    expect(resolvePeriod('MONTH', clock('2027-01-01T05:30:00Z'))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(resolvePeriod('YEAR', clock('2027-01-01T05:30:00Z'))).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(resolvePeriod('QUARTER', clock('2027-01-01T06:30:00Z'))).toEqual({ from: '2027-01-01', to: '2027-03-31' });
  });

  it('febrero de año bisiesto', () => {
    expect(resolvePeriod('MONTH', clock('2028-02-10T12:00:00Z'))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('forecastWindowMonths (DEF-G, PF-01.12)', () => {
  it('octubre → noviembre…abril; diciembre cruza de año; último día a las 23:30 local', () => {
    expect(forecastWindowMonths(clock('2026-10-10T12:00:00Z'), 6)).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
      { year: 2027, month: 3 },
      { year: 2027, month: 4 },
    ]);
    expect(forecastWindowMonths(clock('2026-12-15T12:00:00Z'), 2)).toEqual([
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
    ]);
    // 31-oct 23:30 en Guatemala = 1-nov 05:30 UTC: el mes de negocio sigue siendo octubre.
    expect(forecastWindowMonths(clock('2026-11-01T05:30:00Z'), 1)).toEqual([{ year: 2026, month: 11 }]);
  });
});

describe('instantes del período', () => {
  it('el día empieza a medianoche local (UTC-6 en Guatemala) y el fin es exclusivo', () => {
    expect(startOfBusinessDay('2026-10-01', GT).toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(periodInstants({ from: '2026-10-01', to: '2026-10-31' }, GT)).toEqual({
      start: new Date('2026-10-01T06:00:00.000Z'),
      endExclusive: new Date('2026-11-01T06:00:00.000Z'),
    });
  });

  it('respeta el horario de verano (Madrid: UTC+2 en verano, +1 en invierno)', () => {
    expect(startOfBusinessDay('2026-07-01', 'Europe/Madrid').toISOString()).toBe('2026-06-30T22:00:00.000Z');
    expect(startOfBusinessDay('2026-12-01', 'Europe/Madrid').toISOString()).toBe('2026-11-30T23:00:00.000Z');
  });

  it('días del rango y hoy en la zona del negocio', () => {
    expect(periodDays({ from: '2026-01-01', to: '2026-12-31' })).toBe(365);
    expect(periodDays({ from: '2026-10-01', to: '2026-10-01' })).toBe(1);
    expect(businessToday(clock('2027-01-01T05:30:00Z'))).toBe('2026-12-31');
  });
});
