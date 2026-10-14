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
