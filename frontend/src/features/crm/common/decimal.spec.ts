import { describe, expect, it } from 'vitest';

import {
  compareDecimals,
  DECIMAL_SPECS,
  decimalSchema,
  describeDecimalIssue,
  formatDecimal,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatTonnage,
  isCanonicalDecimal,
  multiplyDecimals,
  normalizeDecimal,
  parseDecimal,
  roundDecimal,
  sumDecimals,
  toEditableDecimal,
} from './decimal';

describe('parseDecimal (03 §H.3: patrones del backend)', () => {
  it('normaliza el texto del usuario a la forma canónica', () => {
    expect(parseDecimal('1234.5', DECIMAL_SPECS.quantity)).toEqual({ ok: true, value: '1234.5' });
    expect(parseDecimal(' 0012.5000 ', DECIMAL_SPECS.quantity)).toEqual({
      ok: true,
      value: '12.5',
    });
    expect(parseDecimal('1,234,567.25', DECIMAL_SPECS.money)).toEqual({
      ok: true,
      value: '1234567.25',
    });
    expect(parseDecimal('.5', DECIMAL_SPECS.quantity)).toEqual({ ok: true, value: '0.5' });
    expect(parseDecimal('7.', DECIMAL_SPECS.quantity)).toEqual({ ok: true, value: '7' });
    expect(parseDecimal('-0', DECIMAL_SPECS.quantity)).toEqual({ ok: true, value: '0' });
    expect(parseDecimal('+3', DECIMAL_SPECS.quantity)).toEqual({ ok: true, value: '3' });
  });

  it('admite los límites exactos de Decimal(19,4) y Decimal(19,8)', () => {
    expect(parseDecimal('999999999999999.9999', DECIMAL_SPECS.money)).toEqual({
      ok: true,
      value: '999999999999999.9999',
    });
    expect(parseDecimal('0.03500000', DECIMAL_SPECS.factor)).toEqual({ ok: true, value: '0.035' });
    expect(parseDecimal('12345678901.12345678', DECIMAL_SPECS.factor)).toEqual({
      ok: true,
      value: '12345678901.12345678',
    });
  });

  it('rechaza lo que el backend rechazaría, sin redondear', () => {
    expect(parseDecimal('', DECIMAL_SPECS.quantity)).toEqual({ ok: false, issue: 'empty' });
    expect(parseDecimal('   ', DECIMAL_SPECS.quantity)).toEqual({ ok: false, issue: 'empty' });
    expect(parseDecimal('abc', DECIMAL_SPECS.quantity)).toEqual({ ok: false, issue: 'format' });
    expect(parseDecimal('1e5', DECIMAL_SPECS.quantity)).toEqual({ ok: false, issue: 'format' });
    expect(parseDecimal('.', DECIMAL_SPECS.quantity)).toEqual({ ok: false, issue: 'format' });
    expect(parseDecimal('1.2.3', DECIMAL_SPECS.quantity)).toEqual({ ok: false, issue: 'format' });
    expect(parseDecimal('-1', DECIMAL_SPECS.quantity)).toEqual({ ok: false, issue: 'negative' });
    expect(parseDecimal('1234567890123456', DECIMAL_SPECS.quantity)).toEqual({
      ok: false,
      issue: 'tooManyIntegerDigits',
    });
    expect(parseDecimal('1.12345', DECIMAL_SPECS.quantity)).toEqual({
      ok: false,
      issue: 'tooManyFractionDigits',
    });
    expect(parseDecimal('0.123456789', DECIMAL_SPECS.factor)).toEqual({
      ok: false,
      issue: 'tooManyFractionDigits',
    });
  });

  it('no confunde una coma decimal con un separador de miles', () => {
    expect(parseDecimal('1,5', DECIMAL_SPECS.quantity)).toEqual({ ok: false, issue: 'format' });
    expect(parseDecimal('12,34.5', DECIMAL_SPECS.quantity)).toEqual({ ok: false, issue: 'format' });
    expect(parseDecimal('1,234', DECIMAL_SPECS.quantity)).toEqual({ ok: true, value: '1234' });
  });

  it('porcentajes: 0–100 con hasta 2 decimales (RN-03.33, RN-03.49)', () => {
    expect(parseDecimal('100', DECIMAL_SPECS.percent)).toEqual({ ok: true, value: '100' });
    expect(parseDecimal('100.00', DECIMAL_SPECS.percent)).toEqual({ ok: true, value: '100' });
    expect(parseDecimal('0', DECIMAL_SPECS.percent)).toEqual({ ok: true, value: '0' });
    expect(parseDecimal('99.99', DECIMAL_SPECS.percent)).toEqual({ ok: true, value: '99.99' });
    expect(parseDecimal('100.01', DECIMAL_SPECS.percent)).toEqual({ ok: false, issue: 'aboveMax' });
    expect(parseDecimal('-1', DECIMAL_SPECS.percent)).toEqual({ ok: false, issue: 'negative' });
    expect(parseDecimal('12.345', DECIMAL_SPECS.percent)).toEqual({
      ok: false,
      issue: 'tooManyFractionDigits',
    });
    expect(parseDecimal('1000', DECIMAL_SPECS.percent)).toEqual({
      ok: false,
      issue: 'tooManyIntegerDigits',
    });
  });

  it('admite negativos solo si la especificación lo pide', () => {
    expect(
      parseDecimal('-12.5', { integerDigits: 4, fractionDigits: 2, allowNegative: true }),
    ).toEqual({ ok: true, value: '-12.5' });
  });
});

describe('describeDecimalIssue', () => {
  it('explica cada incidencia en español', () => {
    expect(describeDecimalIssue('empty', DECIMAL_SPECS.quantity)).toBe(
      'Este campo es obligatorio.',
    );
    expect(describeDecimalIssue('format', DECIMAL_SPECS.quantity)).toBe(
      'Escribe un número válido (punto como separador decimal).',
    );
    expect(describeDecimalIssue('negative', DECIMAL_SPECS.quantity)).toBe(
      'Debe ser mayor o igual que 0.',
    );
    expect(describeDecimalIssue('tooManyIntegerDigits', DECIMAL_SPECS.quantity)).toBe(
      'Admite como máximo 15 dígitos enteros.',
    );
    expect(describeDecimalIssue('tooManyFractionDigits', DECIMAL_SPECS.quantity)).toBe(
      'Admite como máximo 4 decimales.',
    );
    expect(
      describeDecimalIssue('tooManyFractionDigits', { integerDigits: 3, fractionDigits: 0 }),
    ).toBe('Debe ser un número entero.');
    expect(describeDecimalIssue('aboveMax', DECIMAL_SPECS.percent)).toBe(
      'Debe ser como máximo 100.',
    );
  });
});

describe('decimalSchema', () => {
  it('transforma el texto en la cadena canónica que espera la API', () => {
    expect(decimalSchema(DECIMAL_SPECS.quantity).parse('1,200.50')).toBe('1200.5');
  });

  it('obligatorio por defecto; opcional vacío → null', () => {
    expect(decimalSchema(DECIMAL_SPECS.quantity).safeParse('').error?.issues[0]?.message).toBe(
      'Este campo es obligatorio.',
    );
    expect(decimalSchema(DECIMAL_SPECS.tonnage, { required: false }).parse('')).toBeNull();
  });

  it('propaga el mensaje de la incidencia', () => {
    expect(decimalSchema(DECIMAL_SPECS.percent).safeParse('101').error?.issues[0]?.message).toBe(
      'Debe ser como máximo 100.',
    );
  });
});

describe('aritmética exacta', () => {
  it('suma sin errores de punto flotante', () => {
    expect(sumDecimals(['0.1', '0.2'])).toBe('0.3');
    expect(sumDecimals(['999999999999999.9999', '0.0001'])).toBe('1000000000000000');
    expect(sumDecimals(['1.5', '-2'])).toBe('-0.5');
    expect(sumDecimals([])).toBe('0');
  });

  it('multiplica y redondea HALF_UP a 4 decimales (tonelaje = cantidad × factor, D-03.13)', () => {
    expect(multiplyDecimals('1200', '0.035')).toBe('42');
    expect(multiplyDecimals('120', '0.00333333', 4)).toBe('0.4');
    expect(multiplyDecimals('1', '0.00005', 4)).toBe('0.0001');
    expect(multiplyDecimals('1', '0.00004999', 4)).toBe('0');
    expect(multiplyDecimals('999999999999999.9999', '12345678.12345678', 4)).toBe(
      '12345678123456779998765.4322',
    );
  });

  it('redondea la mitad alejándose del cero', () => {
    expect(roundDecimal('2.345', 2)).toBe('2.35');
    expect(roundDecimal('2.344', 2)).toBe('2.34');
    expect(roundDecimal('-2.345', 2)).toBe('-2.35');
    expect(roundDecimal('9.995', 2)).toBe('10');
    expect(roundDecimal('1.5', 4)).toBe('1.5');
    expect(roundDecimal('0.5', 0)).toBe('1');
  });

  it('compara cadenas de distinta escala', () => {
    expect(compareDecimals('100', '100.00')).toBe(0);
    expect(compareDecimals('100.01', '100')).toBe(1);
    expect(compareDecimals('-1', '0')).toBe(-1);
  });

  it('normaliza las cadenas de la API y rechaza lo que no es decimal', () => {
    expect(normalizeDecimal('12.5000')).toBe('12.5');
    expect(normalizeDecimal('0.0000')).toBe('0');
    expect(isCanonicalDecimal('12.5')).toBe(true);
    expect(isCanonicalDecimal('1,234')).toBe(false);
    expect(() => sumDecimals(['NaN'])).toThrow(RangeError);
  });
});

describe('presentación es-GT', () => {
  it('agrupa miles con coma y usa punto decimal', () => {
    expect(formatDecimal('1234567.5')).toBe('1,234,567.5');
    expect(formatDecimal('1234')).toBe('1,234');
    expect(formatDecimal('999')).toBe('999');
    expect(formatDecimal('-1234.5')).toBe('-1,234.5');
    expect(formatDecimal('12.5000')).toBe('12.5');
    expect(formatDecimal('12.5', { minFractionDigits: 2 })).toBe('12.50');
    expect(formatDecimal('12.345', { maxFractionDigits: 2 })).toBe('12.35');
    expect(formatDecimal('1234.5', { useGrouping: false })).toBe('1234.5');
  });

  it('vacío o no decimal → guion largo', () => {
    expect(formatDecimal(null)).toBe('—');
    expect(formatDecimal(undefined)).toBe('—');
    expect(formatDecimal('')).toBe('—');
    expect(formatDecimal('abc')).toBe('—');
  });

  it('porcentajes, montos, cantidades y toneladas', () => {
    expect(formatPercent('75.00')).toBe('75%');
    expect(formatPercent('12.5')).toBe('12.5%');
    expect(formatPercent(null)).toBe('—');
    expect(formatMoney('1234.5', 'GTQ')).toBe('GTQ 1,234.50');
    expect(formatMoney('1000000.0000', 'USD')).toBe('USD 1,000,000.00');
    expect(formatMoney('10.555', 'USD')).toBe('USD 10.56');
    expect(formatMoney('1500', 'CRC', 0)).toBe('CRC 1,500');
    expect(formatMoney('5', null)).toBe('5.00');
    expect(formatMoney(null, 'USD')).toBe('—');
    expect(formatQuantity('480.0000', 'VAR')).toBe('480 VAR');
    expect(formatQuantity('1200.12345', null)).toBe('1,200.1235');
    expect(formatQuantity(null, 'VAR')).toBe('—');
    expect(formatTonnage('1.6125')).toBe('1.61 t');
    expect(formatTonnage('42', 't', 4)).toBe('42.0000 t');
    expect(formatTonnage(null)).toBe('—');
  });

  it('texto editable sin separador de miles', () => {
    expect(toEditableDecimal('1234.5000')).toBe('1234.5');
    expect(toEditableDecimal(null)).toBe('');
    expect(toEditableDecimal('12.')).toBe('12.');
  });
});
