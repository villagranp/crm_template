import { type ForecastLineInput, validateForecastBatch } from './forecast-batch-validator';
import { computeForecastWindow } from './forecast-window';

// Ventana de diciembre de 2026: enero–junio de 2027.
const window = computeForecastWindow(new Date('2026-12-15T18:00:00.000Z'), { timeZone: 'America/Guatemala', horizonMonths: 6 });
const PROJECT = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';

function input(overrides: Partial<ForecastLineInput> = {}): ForecastLineInput {
  return { projectId: PROJECT, productId: PRODUCT, year: 2027, month: 1, quantity: '10', ...overrides };
}

describe('validateForecastBatch (RN-03.64, RN-03.65, RN-03.66, RN-03.72)', () => {
  it('lote válido: cantidad a 4 decimales, ids en minúsculas, opcionales normalizados', () => {
    const [first, second] = validateForecastBatch(window, [
      input({ quantity: '1.5', unitId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', notes: null, expectedUpdatedAt: '2026-12-01T10:00:00.123Z' }),
      input({ projectId: PROJECT.toUpperCase(), month: 6, quantity: '0' }),
    ]);
    expect(first).toEqual({
      index: 0,
      projectId: PROJECT,
      productId: PRODUCT,
      year: 2027,
      month: 1,
      quantity: '1.5000',
      unitId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ownerId: null,
      notes: null,
      expectedUpdatedAt: new Date('2026-12-01T10:00:00.123Z'),
    });
    expect(second).toMatchObject({ index: 1, projectId: PROJECT, month: 6, quantity: '0.0000', notes: undefined, expectedUpdatedAt: null });
  });

  it('una negativa entre válidas: 422 INVALID_QUANTITY con lines[i].quantity (AC-03.71)', () => {
    expect(() => validateForecastBatch(window, [input(), input({ month: 2, quantity: '-1' }), input({ month: 3 })])).toThrow(
      expect.objectContaining({
        code: 'INVALID_QUANTITY',
        details: [
          { field: 'lines[1].quantity', code: 'INVALID_QUANTITY', message: 'The quantity must be a decimal greater than or equal to zero', index: 1 },
        ],
      }),
    );
  });

  it('cantidad no decimal o con más de 4 decimales: INVALID_QUANTITY', () => {
    expect(() => validateForecastBatch(window, [input({ quantity: '1.23456' })])).toThrow(expect.objectContaining({ code: 'INVALID_QUANTITY' }));
    expect(() => validateForecastBatch(window, [input({ quantity: 'abc' })])).toThrow(expect.objectContaining({ code: 'INVALID_QUANTITY' }));
  });

  it('mes en curso, pasado y M+7: FORECAST_PERIOD_OUT_OF_WINDOW con el período (AC-03.72)', () => {
    expect(() =>
      validateForecastBatch(window, [input({ year: 2026, month: 12 }), input({ year: 2026, month: 11 }), input({ year: 2027, month: 7 }), input({ month: 4 })]),
    ).toThrow(
      expect.objectContaining({
        code: 'FORECAST_PERIOD_OUT_OF_WINDOW',
        details: [
          expect.objectContaining({ field: 'lines[0].month', code: 'FORECAST_PERIOD_OUT_OF_WINDOW', index: 0, period: '2026-12' }),
          expect.objectContaining({ field: 'lines[1].month', index: 1, period: '2026-11' }),
          expect.objectContaining({ field: 'lines[2].month', index: 2, period: '2027-07' }),
        ],
      }),
    );
  });

  it('clave repetida en el lote: FORECAST_DUPLICATE_IN_BATCH en cada repetición (también con otro caso de letras)', () => {
    expect(() => validateForecastBatch(window, [input(), input({ month: 2 }), input({ quantity: '3' }), input({ productId: PRODUCT.toUpperCase() })])).toThrow(
      expect.objectContaining({
        code: 'FORECAST_DUPLICATE_IN_BATCH',
        details: [
          {
            field: 'lines[2].month',
            code: 'FORECAST_DUPLICATE_IN_BATCH',
            message: 'The same project, product and period appear more than once in the batch',
            index: 2,
            duplicateOfIndex: 0,
          },
          expect.objectContaining({ field: 'lines[3].month', index: 3, duplicateOfIndex: 0 }),
        ],
      }),
    );
  });

  it('todas las incidencias a la vez, en orden de línea; el código es el de la primera', () => {
    let error: unknown;
    try {
      validateForecastBatch(window, [input({ month: 2 }), input({ quantity: '-5', year: 2026, month: 10 }), input({ month: 2 })]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: 'INVALID_QUANTITY', message: 'Some lines are not valid' });
    expect((error as { details: { field: string; code: string }[] }).details.map((issue) => [issue.field, issue.code])).toEqual([
      ['lines[1].quantity', 'INVALID_QUANTITY'],
      ['lines[1].month', 'FORECAST_PERIOD_OUT_OF_WINDOW'],
      ['lines[2].month', 'FORECAST_DUPLICATE_IN_BATCH'],
    ]);
  });
});
