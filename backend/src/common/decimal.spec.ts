import {
  compareDecimal,
  divideDecimal,
  InvalidDecimalError,
  isDecimalString,
  isZeroDecimal,
  multiplyDecimal,
  roundDecimal,
  sumDecimals,
} from './decimal';

describe('decimal (aritmética exacta sin flotantes)', () => {
  describe('roundDecimal', () => {
    it('redondea HALF_UP y fija exactamente la escala pedida', () => {
      expect(roundDecimal('1.23445', 4)).toBe('1.2345');
      expect(roundDecimal('1.23444', 4)).toBe('1.2344');
      expect(roundDecimal('2', 4)).toBe('2.0000');
      expect(roundDecimal('0.5', 0)).toBe('1');
      expect(roundDecimal('7.75', 8)).toBe('7.75000000');
    });

    it('la mitad negativa se aleja de cero y nunca devuelve -0', () => {
      expect(roundDecimal('-1.00005', 4)).toBe('-1.0001');
      expect(roundDecimal('-0.00004', 4)).toBe('0.0000');
    });

    it('acepta la notación exponencial que puede producir Decimal.toString()', () => {
      expect(roundDecimal('1e-8', 8)).toBe('0.00000001');
      expect(roundDecimal('1.5E+3', 2)).toBe('1500.00');
    });

    it('rechaza lo que no es un decimal', () => {
      for (const value of ['', 'abc', '1,5', '1.2.3', 'NaN', '1e100000']) {
        expect(() => roundDecimal(value, 2)).toThrow(InvalidDecimalError);
      }
    });

    it('rechaza escalas no enteras o negativas', () => {
      expect(() => roundDecimal('1', -1)).toThrow(RangeError);
      expect(() => roundDecimal('1', 1.5)).toThrow(RangeError);
    });
  });

  describe('multiplyDecimal (tonelaje = round(cantidad × factor, 4), PF-03.42)', () => {
    it('es exacto donde el punto flotante falla', () => {
      // 0.1 × 3 en coma flotante da 0.30000000000000004.
      expect(multiplyDecimal('0.1', '3', 4)).toBe('0.3000');
      expect(multiplyDecimal('20000', '0.00336', 4)).toBe('67.2000');
    });

    it('factores de 8 decimales y cantidades grandes sin perder precisión', () => {
      expect(multiplyDecimal('123456789012345.6789', '0.00045359', 4)).toBe('55998764928.1099');
      expect(multiplyDecimal('999999999999999.9999', '99999999999.99999999', 4)).toBe('99999999999999999980000000.0000');
      expect(multiplyDecimal('1', '0.00045359237', 4)).toBe('0.0005');
    });

    it('redondea la mitad hacia arriba', () => {
      expect(multiplyDecimal('1', '0.00005', 4)).toBe('0.0001');
      expect(multiplyDecimal('1', '0.000049999', 4)).toBe('0.0000');
    });
  });

  describe('divideDecimal (USD = round(monto / tasa, 4), RN-03.80)', () => {
    it('convierte un monto en moneda local con la tasa por 1 USD', () => {
      expect(divideDecimal('850000', '7.75000000', 4)).toBe('109677.4194');
      expect(divideDecimal('100', '3', 4)).toBe('33.3333');
      expect(divideDecimal('200', '3', 4)).toBe('66.6667');
    });

    it('identidad con tasa 1 y cero entre cualquier tasa', () => {
      expect(divideDecimal('450000', '1', 4)).toBe('450000.0000');
      expect(divideDecimal('0', '24.8', 4)).toBe('0.0000');
    });

    it('maneja signos y divisor cero', () => {
      expect(divideDecimal('-1', '8', 4)).toBe('-0.1250');
      expect(divideDecimal('1', '-8', 4)).toBe('-0.1250');
      expect(() => divideDecimal('1', '0.0000', 4)).toThrow(RangeError);
    });
  });

  it('sumDecimals suma exacto y redondea al final', () => {
    expect(sumDecimals(['0.1', '0.2'], 4)).toBe('0.3000');
    expect(sumDecimals(['1.00005', '1.00005'], 4)).toBe('2.0001');
    expect(sumDecimals([], 4)).toBe('0.0000');
  });

  it('compareDecimal e isZeroDecimal comparan sin redondear', () => {
    expect(compareDecimal('1.10', '1.1')).toBe(0);
    expect(compareDecimal('1.00000001', '1')).toBe(1);
    expect(compareDecimal('-2', '1')).toBe(-1);
    expect(isZeroDecimal('0.0000')).toBe(true);
    expect(isZeroDecimal('0.0001')).toBe(false);
  });

  describe('isDecimalString', () => {
    it('acepta notación simple dentro de los límites', () => {
      expect(isDecimalString('1200.5')).toBe(true);
      expect(isDecimalString('0.1234', { maxScale: 4 })).toBe(true);
      expect(isDecimalString('000123456789012345.1', { maxIntegerDigits: 15 })).toBe(true);
    });

    it('rechaza negativos (salvo que se permitan), exceso de escala o de enteros y otros tipos', () => {
      expect(isDecimalString('-1')).toBe(false);
      expect(isDecimalString('-1', { allowNegative: true })).toBe(true);
      expect(isDecimalString('0.12345', { maxScale: 4 })).toBe(false);
      expect(isDecimalString('1234567890123456', { maxIntegerDigits: 15 })).toBe(false);
      expect(isDecimalString('1e3')).toBe(false);
      expect(isDecimalString(12)).toBe(false);
      expect(isDecimalString('1.')).toBe(false);
    });
  });
});
