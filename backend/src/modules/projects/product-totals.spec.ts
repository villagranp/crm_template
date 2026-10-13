import { productTotals } from './product-totals';

const VAR = { id: 'unit-var', code: 'VAR', symbol: 'var', dimension: 'COUNT' };
const KG = { id: 'unit-kg', code: 'KG', symbol: 'kg', dimension: 'MASS' };

describe('productTotals (RN-03.31, RN-03.60, PF-03.90)', () => {
  it('suma toneladas solo de estados activos con conversión, cantidades por unidad y cuenta las líneas sin conversión', () => {
    const totals = productTotals([
      { quantity: '120.0000', unit: VAR, tonnage: '0.4000', statusIsActive: true },
      { quantity: '30.5000', unit: VAR, tonnage: '0.1015', statusIsActive: true },
      { quantity: '500.0000', unit: KG, tonnage: '0.5000', statusIsActive: true },
      { quantity: '10.0000', unit: VAR, tonnage: null, statusIsActive: true },
      { quantity: '999.0000', unit: KG, tonnage: '0.9990', statusIsActive: false },
      { quantity: '7.0000', unit: VAR, tonnage: null, statusIsActive: false },
    ]);
    expect(totals).toEqual({
      tonnage: '1.0015',
      quantitiesByUnit: [
        { unit: KG, quantity: '500.0000' },
        { unit: VAR, quantity: '160.5000' },
      ],
      linesWithoutConversion: 1,
    });
  });

  it('sin líneas: cero toneladas, sin cantidades', () => {
    expect(productTotals([])).toEqual({ tonnage: '0.0000', quantitiesByUnit: [], linesWithoutConversion: 0 });
  });

  it('aritmética decimal exacta (sin flotantes)', () => {
    const lines = Array.from({ length: 10 }, () => ({ quantity: '0.1000', unit: KG, tonnage: '0.1000', statusIsActive: true }));
    expect(productTotals(lines)).toMatchObject({ tonnage: '1.0000', quantitiesByUnit: [{ unit: KG, quantity: '1.0000' }] });
  });
});
