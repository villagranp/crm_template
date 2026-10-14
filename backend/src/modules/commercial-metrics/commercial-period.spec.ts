import {
  addCalendarDays,
  addCalendarYears,
  businessToday,
  currentMonthRange,
  exceedsYears,
  forecastWindowMonths,
  formatYearMonth,
  monthRange,
  monthsBetween,
  parseYearMonth,
  periodDays,
  periodInstants,
  resolvePeriod,
  startOfBusinessDay,
  toBusinessWindow,
} from './commercial-period';

const GUATEMALA = 'America/Guatemala';

describe('commercial-period', () => {
  it('PF-05.3: el último día del mes a las 23:30 en Guatemala sigue siendo ese mes (no el siguiente de UTC)', () => {
    // 2026-10-31 23:30 en Guatemala (UTC-6) = 2026-11-01 05:30 UTC.
    const clock = { now: new Date('2026-11-01T05:30:00Z'), businessTimeZone: GUATEMALA };
    expect(businessToday(clock)).toBe('2026-10-31');
    expect(currentMonthRange(clock)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(resolvePeriod('MONTH', clock)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(forecastWindowMonths(clock, 6)).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
      { year: 2027, month: 3 },
      { year: 2027, month: 4 },
    ]);
    // Media hora después ya es noviembre en el negocio.
    const next = { now: new Date('2026-11-01T06:00:00Z'), businessTimeZone: GUATEMALA };
    expect(currentMonthRange(next)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('trimestre y año en curso (D-01.3)', () => {
    const clock = { now: new Date('2026-08-15T12:00:00Z'), businessTimeZone: GUATEMALA };
    expect(resolvePeriod('QUARTER', clock)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(resolvePeriod('YEAR', clock)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    const january = { now: new Date('2027-01-01T06:00:00Z'), businessTimeZone: GUATEMALA };
    expect(resolvePeriod('QUARTER', january)).toEqual({ from: '2027-01-01', to: '2027-03-31' });
  });

  it('RN-05.8: un período de fechas es [from 00:00, to+1 00:00) en la zona del negocio', () => {
    expect(startOfBusinessDay('2026-03-01', GUATEMALA).toISOString()).toBe('2026-03-01T06:00:00.000Z');
    expect(toBusinessWindow({ from: '2026-03-01', to: '2026-03-31' }, GUATEMALA)).toEqual({
      from: '2026-03-01',
      to: '2026-03-31',
      fromInstant: new Date('2026-03-01T06:00:00.000Z'),
      toExclusive: new Date('2026-04-01T06:00:00.000Z'),
    });
    // Una zona con horario de verano (la zona es un parámetro): Nueva York el día del cambio.
    expect(startOfBusinessDay('2026-03-08', 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(startOfBusinessDay('2026-03-09', 'America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(startOfBusinessDay('2026-06-01', 'UTC').toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('aritmética de calendario: días, años (29 de febrero) y rango máximo de 5 años', () => {
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarYears('2024-02-29', 1)).toBe('2025-02-28');
    expect(addCalendarYears('2021-01-01', 5)).toBe('2026-01-01');
    expect(exceedsYears({ from: '2021-01-01', to: '2025-12-31' }, 5)).toBe(false);
    expect(exceedsYears({ from: '2021-01-01', to: '2026-01-01' }, 5)).toBe(true);
    expect(exceedsYears({ from: '2026-03-01', to: '2026-03-01' }, 5)).toBe(false);
  });

  it('meses: rango de un mes, lectura YYYY-MM y meses entre dos (incluidos)', () => {
    expect(monthRange({ year: 2028, month: 2 })).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(parseYearMonth('2026-11')).toEqual({ year: 2026, month: 11 });
    expect(parseYearMonth('2026-13')).toBeNull();
    expect(parseYearMonth('2026-1')).toBeNull();
    expect(formatYearMonth({ year: 2026, month: 3 })).toBe('2026-03');
    expect(monthsBetween({ year: 2026, month: 11 }, { year: 2027, month: 2 })).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
    ]);
    expect(monthsBetween({ year: 2027, month: 2 }, { year: 2026, month: 11 })).toEqual([]);
  });
});

// --- Pruebas del Módulo 1 (01 RN-01.15, PF-01.12, PF-01.27) ---

const GT = GUATEMALA;
const clockAt = (iso: string) => ({ now: new Date(iso), businessTimeZone: GT });

describe('resolvePeriod (01 RN-01.15, PF-01.27)', () => {
  it('mes, trimestre y año en curso en la zona del negocio', () => {
    const ctx = clockAt('2026-10-10T15:00:00Z');
    expect(resolvePeriod('MONTH', ctx)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(resolvePeriod('QUARTER', ctx)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(resolvePeriod('YEAR', ctx)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('el 31-dic a las 23:30 de Guatemala (1-ene en UTC) sigue siendo diciembre; el 1-ene es enero', () => {
    expect(resolvePeriod('MONTH', clockAt('2027-01-01T05:30:00Z'))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(resolvePeriod('YEAR', clockAt('2027-01-01T05:30:00Z'))).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(resolvePeriod('QUARTER', clockAt('2027-01-01T06:30:00Z'))).toEqual({ from: '2027-01-01', to: '2027-03-31' });
  });

  it('febrero de año bisiesto', () => {
    expect(resolvePeriod('MONTH', clockAt('2028-02-10T12:00:00Z'))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('forecastWindowMonths (DEF-G, PF-01.12)', () => {
  it('octubre → noviembre…abril; diciembre cruza de año; último día a las 23:30 local', () => {
    expect(forecastWindowMonths(clockAt('2026-10-10T12:00:00Z'), 6)).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
      { year: 2027, month: 3 },
      { year: 2027, month: 4 },
    ]);
    expect(forecastWindowMonths(clockAt('2026-12-15T12:00:00Z'), 2)).toEqual([
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
    ]);
    // 31-oct 23:30 en Guatemala = 1-nov 05:30 UTC: el mes de negocio sigue siendo octubre.
    expect(forecastWindowMonths(clockAt('2026-11-01T05:30:00Z'), 1)).toEqual([{ year: 2026, month: 11 }]);
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
    expect(businessToday(clockAt('2027-01-01T05:30:00Z'))).toBe('2026-12-31');
  });
});
