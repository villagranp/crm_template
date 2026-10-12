import { computeForecastWindow, isEditablePeriod, parsePeriodLabel, periodLabel, selectPeriods } from './forecast-window';

const GT = { timeZone: 'America/Guatemala', horizonMonths: 6 };

function labels(periods: readonly { label: string }[]): string[] {
  return periods.map((period) => period.label);
}

describe('forecast-window (RN-03.66, D-03.5, PF-03.92)', () => {
  it('octubre: la ventana es noviembre–abril con desplazamientos 1…6 y etiquetas YYYY-MM', () => {
    const window = computeForecastWindow(new Date('2026-10-15T12:00:00.000Z'), GT);
    expect(window.timeZone).toBe('America/Guatemala');
    expect(window.current).toEqual({ year: 2026, month: 10 });
    expect(window.periods).toEqual([
      { year: 2026, month: 11, offset: 1, label: '2026-11' },
      { year: 2026, month: 12, offset: 2, label: '2026-12' },
      { year: 2027, month: 1, offset: 3, label: '2027-01' },
      { year: 2027, month: 2, offset: 4, label: '2027-02' },
      { year: 2027, month: 3, offset: 5, label: '2027-03' },
      { year: 2027, month: 4, offset: 6, label: '2027-04' },
    ]);
  });

  it('diciembre → enero–junio del año siguiente (AC-03.69)', () => {
    const window = computeForecastWindow(new Date('2026-12-15T18:00:00.000Z'), GT);
    expect(window.current).toEqual({ year: 2026, month: 12 });
    expect(labels(window.periods)).toEqual(['2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06']);
  });

  it('2026-12-31 23:30 en Guatemala (ya 1 de enero en UTC): sigue siendo diciembre y la ventana enero–junio', () => {
    const now = new Date('2027-01-01T05:30:00.000Z');
    const guatemala = computeForecastWindow(now, GT);
    expect(guatemala.current).toEqual({ year: 2026, month: 12 });
    expect(labels(guatemala.periods)).toEqual(['2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06']);
    // En UTC ya es enero: la zona del negocio es la que manda.
    const utc = computeForecastWindow(now, { timeZone: 'UTC', horizonMonths: 6 });
    expect(utc.current).toEqual({ year: 2027, month: 1 });
    expect(labels(utc.periods)[0]).toBe('2027-02');
  });

  it('medianoche exacta: 2027-01-01 00:00 en Guatemala ya es enero', () => {
    const window = computeForecastWindow(new Date('2027-01-01T06:00:00.000Z'), GT);
    expect(window.current).toEqual({ year: 2027, month: 1 });
    expect(labels(window.periods)[0]).toBe('2027-02');
  });

  it('horizonte parametrizable (crm.forecast.horizonte_meses)', () => {
    const now = new Date('2026-10-15T12:00:00.000Z');
    expect(labels(computeForecastWindow(now, { ...GT, horizonMonths: 3 }).periods)).toEqual(['2026-11', '2026-12', '2027-01']);
    const twelve = computeForecastWindow(now, { ...GT, horizonMonths: 12 });
    expect(twelve.periods).toHaveLength(12);
    expect(twelve.periods[11]).toEqual({ year: 2027, month: 10, offset: 12, label: '2027-10' });
    expect(() => computeForecastWindow(now, { ...GT, horizonMonths: 0 })).toThrow(RangeError);
  });

  it('editable solo M+1 … M+N: el mes en curso, los pasados y M+N+1 no', () => {
    const window = computeForecastWindow(new Date('2026-12-15T18:00:00.000Z'), GT);
    expect(isEditablePeriod(window, { year: 2026, month: 12 })).toBe(false);
    expect(isEditablePeriod(window, { year: 2026, month: 11 })).toBe(false);
    expect(isEditablePeriod(window, { year: 2027, month: 1 })).toBe(true);
    expect(isEditablePeriod(window, { year: 2027, month: 6 })).toBe(true);
    expect(isEditablePeriod(window, { year: 2027, month: 7 })).toBe(false);
  });

  it('etiquetas de período', () => {
    expect(periodLabel({ year: 2027, month: 3 })).toBe('2027-03');
    expect(parsePeriodLabel('2027-03')).toEqual({ year: 2027, month: 3 });
    expect(parsePeriodLabel('2027-13')).toBeNull();
    expect(parsePeriodLabel('2027-3')).toBeNull();
  });
});

describe('selectPeriods (03 F.3 ForecastQueryDto)', () => {
  const window = computeForecastWindow(new Date('2026-10-15T12:00:00.000Z'), GT);

  it('WINDOW sin períodos: toda la ventana', () => {
    expect(selectPeriods(window, { mode: 'WINDOW' })).toEqual({ mode: 'WINDOW', periods: window.periods });
  });

  it('WINDOW con períodos: ordenados y sin repetir', () => {
    const selection = selectPeriods(window, { mode: 'WINDOW', periods: ['2027-01', '2026-11', '2027-01'] });
    expect(selection.periods).toEqual([
      { year: 2026, month: 11, offset: 1, label: '2026-11' },
      { year: 2027, month: 1, offset: 3, label: '2027-01' },
    ]);
  });

  it('WINDOW con períodos fuera de la ventana: 422 con todas las incidencias', () => {
    expect(() => selectPeriods(window, { mode: 'WINDOW', periods: ['2026-10', '2026-12', '2027-05'] })).toThrow(
      expect.objectContaining({
        code: 'FORECAST_PERIOD_OUT_OF_WINDOW',
        details: [
          { field: 'periods[0]', code: 'FORECAST_PERIOD_OUT_OF_WINDOW', message: 'The period is outside the editable forecast window', period: '2026-10' },
          { field: 'periods[2]', code: 'FORECAST_PERIOD_OUT_OF_WINDOW', message: 'The period is outside the editable forecast window', period: '2027-05' },
        ],
      }),
    );
  });

  it('WINDOW con from/to: 400 VALIDATION_FAILED', () => {
    expect(() => selectPeriods(window, { mode: 'WINDOW', from: '2026-01' })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED', details: [{ field: 'from', issue: 'from is only allowed with mode=HISTORY' }] }),
    );
    expect(() => selectPeriods(window, { mode: 'WINDOW', to: '2026-01' })).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('HISTORY por defecto: los N meses que terminan en M, con desplazamientos ≤ 0', () => {
    const selection = selectPeriods(window, { mode: 'HISTORY' });
    expect(selection.mode).toBe('HISTORY');
    expect(labels(selection.periods)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(selection.periods.map((period) => period.offset)).toEqual([-5, -4, -3, -2, -1, 0]);
  });

  it('HISTORY con rango: inclusive; puede cruzar el año', () => {
    const selection = selectPeriods(window, { mode: 'HISTORY', from: '2025-11', to: '2026-02' });
    expect(labels(selection.periods)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(selection.periods[0]?.offset).toBe(-11);
  });

  it('HISTORY: 24 meses se admiten; 25 → 422 INVALID_DATE_RANGE con maxMonths', () => {
    expect(selectPeriods(window, { mode: 'HISTORY', from: '2024-11', to: '2026-10' }).periods).toHaveLength(24);
    expect(() => selectPeriods(window, { mode: 'HISTORY', from: '2024-10', to: '2026-10' })).toThrow(
      expect.objectContaining({
        code: 'INVALID_DATE_RANGE',
        details: [{ field: 'to', code: 'INVALID_DATE_RANGE', message: 'The range cannot exceed 24 months', startField: 'from', maxMonths: 24 }],
      }),
    );
  });

  it('HISTORY con from > to: 422 INVALID_DATE_RANGE', () => {
    expect(() => selectPeriods(window, { mode: 'HISTORY', from: '2026-09', to: '2026-08' })).toThrow(
      expect.objectContaining({
        code: 'INVALID_DATE_RANGE',
        details: [{ field: 'to', code: 'INVALID_DATE_RANGE', message: 'The end period cannot be earlier than the start period', startField: 'from' }],
      }),
    );
  });

  it('HISTORY con periods: 400 VALIDATION_FAILED', () => {
    expect(() => selectPeriods(window, { mode: 'HISTORY', periods: ['2026-09'] })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED', details: [{ field: 'periods', issue: 'periods is only allowed with mode=WINDOW' }] }),
    );
  });
});
