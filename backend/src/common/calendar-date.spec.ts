import { calendarDateIn, calendarDaysBetween, fromCalendarDate, isCalendarDate, toCalendarDate } from './calendar-date';

describe('calendar-date', () => {
  it('isCalendarDate solo acepta fechas reales YYYY-MM-DD', () => {
    expect(isCalendarDate('2026-10-11')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('2026-1-01')).toBe(false);
    expect(isCalendarDate('2026-10-11T00:00:00Z')).toBe(false);
    expect(isCalendarDate(20261011)).toBe(false);
  });

  it('convierte de ida y vuelta con medianoche UTC (columnas @db.Date)', () => {
    expect(fromCalendarDate('2026-10-11').toISOString()).toBe('2026-10-11T00:00:00.000Z');
    expect(toCalendarDate(new Date('2026-10-11T00:00:00.000Z'))).toBe('2026-10-11');
    expect(() => fromCalendarDate('2026-02-30')).toThrow(RangeError);
  });

  it('cuenta días naturales, también entre años', () => {
    expect(calendarDaysBetween('2026-09-01', '2026-10-16')).toBe(45);
    expect(calendarDaysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(calendarDaysBetween('2026-10-11', '2026-10-01')).toBe(-10);
  });

  it('"hoy" se calcula en la zona del negocio, no en UTC', () => {
    // 1 de enero de 2027 a las 04:00 UTC = 31 de diciembre de 2026 a las 22:00 en Guatemala.
    const at = new Date('2027-01-01T04:00:00.000Z');
    expect(calendarDateIn(at, 'UTC')).toBe('2027-01-01');
    expect(calendarDateIn(at, 'America/Guatemala')).toBe('2026-12-31');
  });
});
