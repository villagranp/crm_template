import {
  contactFullName,
  normalizeCustomerCode,
  normalizeEmail,
  normalizeName,
  normalizeTaxId,
  phoneDigits,
  searchTerms,
  startsWithFormula,
} from './customer-normalization';

describe('customer-normalization (RN-02.17)', () => {
  it('código de cliente: mayúsculas sin espacios ni guiones', () => {
    expect(normalizeCustomerCode('ab-12 x')).toBe('AB12X');
    expect(normalizeCustomerCode(' - ')).toBeNull();
    expect(normalizeCustomerCode(null)).toBeNull();
    expect(normalizeCustomerCode(undefined)).toBeNull();
  });

  it('NIT: mayúsculas sin espacios, guiones ni puntos', () => {
    expect(normalizeTaxId('12.345-6 k')).toBe('123456K');
    expect(normalizeTaxId('0614-010101-101-1')).toBe('06140101011011');
    expect(normalizeTaxId('. -')).toBeNull();
  });

  it('nombres: minúsculas, sin acentos, espacios colapsados y recortado', () => {
    expect(normalizeName('  Constructora  PEÑA S.A. ')).toBe('constructora pena s.a.');
    expect(normalizeName('Ferretería El Sol')).toBe(normalizeName('FERRETERIA  el sol'));
    expect(normalizeName('Ünïcödé Çà')).toBe('unicode ca');
    expect(normalizeName('   ')).toBeNull();
  });

  it('correo: minúsculas y recortado', () => {
    expect(normalizeEmail('  Ana@Empresa.EXAMPLE ')).toBe('ana@empresa.example');
    expect(normalizeEmail('')).toBeNull();
  });

  it('teléfono para comparar: solo dígitos', () => {
    expect(phoneDigits('+502 (2222) 3333')).toBe('50222223333');
    expect(phoneDigits('sin número')).toBeNull();
  });

  it('términos de búsqueda: palabras normalizadas sin repetir', () => {
    expect(searchTerms('construc  PEÑA pena')).toEqual(['construc', 'pena']);
    expect(searchTerms('   ')).toEqual([]);
    expect(searchTerms(undefined)).toEqual([]);
  });

  it('fórmulas (RN-02.32): =, @, tabulador o retorno al inicio, aun tras espacios; + y - no', () => {
    for (const value of ['=1+1', '@SUM(A1)', '\tdato', '\rdato', '   =x', ' \tx']) {
      expect(startsWithFormula(value)).toBe(true);
    }
    for (const value of ['+502 2222', '-nota', 'Empresa = Sol', 'a@b.com', '', null, undefined]) {
      expect(startsWithFormula(value)).toBe(false);
    }
  });

  it('nombre completo del contacto', () => {
    expect(contactFullName(' Ana ', ' López  Pérez ')).toBe('Ana López Pérez');
  });
});
