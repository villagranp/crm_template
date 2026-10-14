import { describe, expect, it } from 'vitest';

import {
  defaultForecastWindow,
  describePeriod,
  exceedsYears,
  issuesByField,
  isCalendarDay,
  matchingPreset,
  monthRangeDraftSchema,
  monthsBetween,
  PERIOD_MESSAGES,
  periodDraftSchema,
  presetPeriod,
} from './report-period';

describe('presetPeriod (05 E.1: atajos desde "hoy" en la zona del negocio)', () => {
  it('calcula mes, trimestre, año y últimos 12 meses como fechas de calendario inclusivas', () => {
    expect(presetPeriod('CURRENT_MONTH', '2026-10-14')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetPeriod('CURRENT_QUARTER', '2026-10-14')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(presetPeriod('CURRENT_QUARTER', '2026-02-28')).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(presetPeriod('CURRENT_YEAR', '2026-10-14')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(presetPeriod('LAST_12_MONTHS', '2026-10-14')).toEqual({ from: '2025-11-01', to: '2026-10-31' });
  });

  it('respeta febrero bisiesto y el cambio de año', () => {
    expect(presetPeriod('CURRENT_MONTH', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(presetPeriod('LAST_12_MONTHS', '2026-01-31')).toEqual({ from: '2025-02-01', to: '2026-01-31' });
  });

  it('reconoce el atajo de un período y lo describe; uno libre se describe como rango', () => {
    expect(matchingPreset({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-14')).toBe('CURRENT_MONTH');
    expect(matchingPreset({ from: '2026-10-02', to: '2026-10-31' }, '2026-10-14')).toBeNull();
    expect(describePeriod({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-14')).toMatch(/^Mes en curso \(1 oct 2026 – 31 oct 2026\)$/);
    expect(describePeriod({ from: '2026-10-02', to: '2026-10-15' }, '2026-10-14')).toBe('2 oct 2026 – 15 oct 2026');
  });
});

describe('límites (P-05.4)', () => {
  it('admite hasta el día anterior al aniversario de 5 años', () => {
    expect(exceedsYears({ from: '2021-01-01', to: '2025-12-31' }, 5)).toBe(false);
    expect(exceedsYears({ from: '2021-01-01', to: '2026-01-01' }, 5)).toBe(true);
  });

  it('cuenta los meses incluidos y la ventana M+1…M+6', () => {
    expect(monthsBetween({ year: 2026, month: 11 }, { year: 2028, month: 10 })).toBe(24);
    expect(defaultForecastWindow('2026-10-14')).toEqual({ fromMonth: '2026-11', toMonth: '2027-04' });
    expect(defaultForecastWindow('2026-12-31')).toEqual({ fromMonth: '2027-01', toMonth: '2027-06' });
  });

  it('valida fechas reales', () => {
    expect(isCalendarDay('2026-02-29')).toBe(false);
    expect(isCalendarDay('2028-02-29')).toBe(true);
    expect(isCalendarDay('2026-10-1')).toBe(false);
  });
});

describe('periodDraftSchema (espejo de las reglas del backend)', () => {
  const issues = (draft: { from: string; to: string; dateBasis: string }, options?: Parameters<typeof periodDraftSchema>[0]) => {
    const result = periodDraftSchema(options).safeParse(draft);
    return result.success ? {} : issuesByField(result.error);
  };

  it('acepta sin período o con un período válido', () => {
    expect(issues({ from: '', to: '', dateBasis: '' })).toEqual({});
    expect(issues({ from: '2026-10-01', to: '2026-10-31', dateBasis: 'IDENTIFIED' })).toEqual({});
  });

  it('exige ambas fechas, que sean reales y en orden', () => {
    expect(issues({ from: '2026-10-01', to: '', dateBasis: '' })).toEqual({ to: PERIOD_MESSAGES.bothRequired });
    expect(issues({ from: '2026-02-30', to: '2026-03-01', dateBasis: '' })).toEqual({ from: PERIOD_MESSAGES.invalidDate });
    expect(issues({ from: '2026-10-31', to: '2026-10-01', dateBasis: '' })).toEqual({ to: PERIOD_MESSAGES.fromAfterTo });
  });

  it('rechaza un rango de 5 años o más', () => {
    expect(issues({ from: '2021-01-01', to: '2026-01-01', dateBasis: '' })).toEqual({ to: PERIOD_MESSAGES.tooLong(5) });
  });

  it('con período exige la base de fecha si el reporte no tiene una por defecto (proyectos)', () => {
    expect(issues({ from: '2026-10-01', to: '2026-10-31', dateBasis: '' }, { dateBasisRequired: true })).toEqual({ dateBasis: PERIOD_MESSAGES.dateBasisRequired });
    expect(issues({ from: '', to: '', dateBasis: '' }, { dateBasisRequired: true })).toEqual({});
  });
});

describe('monthRangeDraftSchema (forecast, máximo 24 meses)', () => {
  const issues = (draft: { fromMonth: string; toMonth: string }) => {
    const result = monthRangeDraftSchema().safeParse(draft);
    return result.success ? {} : issuesByField(result.error);
  };

  it('acepta vacío (M+1…M+6) y un rango válido de hasta 24 meses', () => {
    expect(issues({ fromMonth: '', toMonth: '' })).toEqual({});
    expect(issues({ fromMonth: '2026-11', toMonth: '2028-10' })).toEqual({});
  });

  it('rechaza un rango incompleto, invertido o mayor de 24 meses', () => {
    expect(issues({ fromMonth: '2026-11', toMonth: '' })).toEqual({ toMonth: PERIOD_MESSAGES.monthsBothRequired });
    expect(issues({ fromMonth: '2027-01', toMonth: '2026-12' })).toEqual({ toMonth: PERIOD_MESSAGES.monthsReversed });
    expect(issues({ fromMonth: '2026-11', toMonth: '2028-11' })).toEqual({ toMonth: PERIOD_MESSAGES.monthsTooLong(24) });
  });
});
