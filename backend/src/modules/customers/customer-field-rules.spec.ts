import { compileCountryPattern, isBrokenCountryPattern, isValidPhone, isValidTaxId } from './customer-field-rules';

describe('customer-field-rules (RN-02.6, RN-02.7, DM-3; PF-02.14, PF-02.15)', () => {
  it('teléfono con patrón del país: debe cumplirlo entero', () => {
    const pattern = '\\+502 \\d{4}-\\d{4}';
    expect(isValidPhone('+502 2222-3333', pattern)).toBe(true);
    expect(isValidPhone('+502 2222-3333 ext 4', pattern)).toBe(false);
    expect(isValidPhone('2222 3333', pattern)).toBe(false);
  });

  it('teléfono sin patrón: caracteres permitidos y entre 7 y 20 dígitos', () => {
    expect(isValidPhone('+502 (2222) 3333', null)).toBe(true);
    expect(isValidPhone('1234567', null)).toBe(true);
    expect(isValidPhone('123456', null)).toBe(false);
    expect(isValidPhone('1'.repeat(21), null)).toBe(false);
    expect(isValidPhone('2222-3333 ext. 1', null)).toBe(false);
  });

  it('NIT normalizado contra el patrón del país, o alfanumérico de 4 a 30', () => {
    expect(isValidTaxId('1234567K', '\\d{7}[0-9K]')).toBe(true);
    expect(isValidTaxId('123K', '\\d{7}[0-9K]')).toBe(false);
    expect(isValidTaxId('ABC1', null)).toBe(true);
    expect(isValidTaxId('AB1', null)).toBe(false);
    expect(isValidTaxId('A'.repeat(31), null)).toBe(false);
  });

  it('un patrón que no compila cae a la regla genérica y se detecta', () => {
    expect(compileCountryPattern('([')).toBeNull();
    expect(isBrokenCountryPattern('([')).toBe(true);
    expect(isBrokenCountryPattern(null)).toBe(false);
    expect(isValidPhone('2222 3333', '([')).toBe(true);
  });
});
