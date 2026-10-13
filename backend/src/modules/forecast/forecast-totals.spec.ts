import { type ForecastAmount, forecastTotals, lineAmount, rowTotals } from './forecast-totals';
import { computeForecastWindow } from './forecast-window';

const TON = { id: 'u-ton', code: 'TON', symbol: 't', dimension: 'MASS' };
const KG = { id: 'u-kg', code: 'KG', symbol: 'kg', dimension: 'MASS' };
const VAR = { id: 'u-var', code: 'VAR', symbol: 'var', dimension: 'COUNT' };

const window = computeForecastWindow(new Date('2026-12-15T18:00:00.000Z'), { timeZone: 'America/Guatemala', horizonMonths: 6 });
const [JAN, FEB, MAR] = window.periods;

function line(period: { year: number; month: number }, unit: typeof TON, quantity: string, tonnage: string | null): ForecastAmount {
  return lineAmount({ year: period.year, month: period.month, unit, quantity, tonnage });
}

describe('forecastTotals (RN-03.74, RN-03.31, PF-03.99)', () => {
  it('TON, KG con regla y VAR sin regla: solo toneladas, cantidades por unidad y líneas sin conversión (AC-03.74)', () => {
    const totals = forecastTotals(window.periods, [
      line(JAN!, TON, '2.5', '2.5000'),
      line(JAN!, KG, '1500', '1.5000'),
      line(JAN!, VAR, '120', null),
      line(FEB!, TON, '0.1', '0.1000'),
      line(FEB!, VAR, '30', null),
      line(MAR!, KG, '0.3333', '0.0003'),
    ]);
    expect(totals.periods.slice(0, 4)).toEqual([
      { year: 2027, month: 1, offset: 1, tonnage: '4.0000', accumulatedTonnage: '4.0000' },
      { year: 2027, month: 2, offset: 2, tonnage: '0.1000', accumulatedTonnage: '4.1000' },
      { year: 2027, month: 3, offset: 3, tonnage: '0.0003', accumulatedTonnage: '4.1003' },
      { year: 2027, month: 4, offset: 4, tonnage: '0.0000', accumulatedTonnage: '4.1003' },
    ]);
    expect(totals.windowTonnage).toBe('4.1003');
    expect(totals.linesWithoutConversion).toBe(2);
    expect(totals.quantitiesByUnit.map((entry) => [entry.unit.code, entry.total])).toEqual([
      ['KG', '1500.3333'],
      ['TON', '2.6000'],
      ['VAR', '150.0000'],
    ]);
    expect(totals.quantitiesByUnit.find((entry) => entry.unit.code === 'VAR')?.byPeriod).toEqual([
      { year: 2027, month: 1, quantity: '120.0000' },
      { year: 2027, month: 2, quantity: '30.0000' },
      { year: 2027, month: 3, quantity: '0.0000' },
      { year: 2027, month: 4, quantity: '0.0000' },
      { year: 2027, month: 5, quantity: '0.0000' },
      { year: 2027, month: 6, quantity: '0.0000' },
    ]);
  });

  it('decimal exacto: 0.1 + 0.2 = 0.3 (nunca number)', () => {
    const totals = forecastTotals(window.periods, [line(JAN!, TON, '0.1', '0.1000'), line(JAN!, TON, '0.2', '0.2000')]);
    expect(totals.periods[0]?.tonnage).toBe('0.3000');
    expect(totals.quantitiesByUnit[0]?.total).toBe('0.3000');
  });

  it('importes agregados (grupos del adaptador) se combinan igual que líneas sueltas', () => {
    const totals = forecastTotals(window.periods, [
      { year: 2027, month: 1, unit: VAR, quantity: '200.0000', tonnage: '1.2500', linesWithoutConversion: 3 },
      { year: 2027, month: 1, unit: TON, quantity: '5.0000', tonnage: '5.0000', linesWithoutConversion: 0 },
    ]);
    expect(totals.periods[0]?.tonnage).toBe('6.2500');
    expect(totals.linesWithoutConversion).toBe(3);
  });

  it('solo los períodos consultados: acumulado corrido sobre ellos y el resto se ignora', () => {
    const totals = forecastTotals([MAR!, JAN!], [line(JAN!, TON, '1', '1.0000'), line(FEB!, TON, '7', '7.0000'), line(MAR!, TON, '2', '2.0000')]);
    expect(totals.periods).toEqual([
      { year: 2027, month: 1, offset: 1, tonnage: '1.0000', accumulatedTonnage: '1.0000' },
      { year: 2027, month: 3, offset: 3, tonnage: '2.0000', accumulatedTonnage: '3.0000' },
    ]);
    expect(totals.windowTonnage).toBe('3.0000');
    expect(totals.quantitiesByUnit[0]?.total).toBe('3.0000');
  });

  it('sin líneas: ceros y ninguna unidad', () => {
    const totals = forecastTotals(window.periods, []);
    expect(totals.windowTonnage).toBe('0.0000');
    expect(totals.periods.every((period) => period.tonnage === '0.0000' && period.accumulatedTonnage === '0.0000')).toBe(true);
    expect(totals.quantitiesByUnit).toEqual([]);
    expect(totals.linesWithoutConversion).toBe(0);
  });
});

describe('rowTotals', () => {
  it('toneladas de las celdas con conversión y cantidades por unidad sin mezclar', () => {
    expect(rowTotals([line(JAN!, VAR, '120', '0.4000'), line(FEB!, VAR, '0', '0.0000'), line(MAR!, KG, '10', null)])).toEqual({
      tonnage: '0.4000',
      quantitiesByUnit: [
        { unit: KG, quantity: '10.0000' },
        { unit: VAR, quantity: '120.0000' },
      ],
    });
  });
});
