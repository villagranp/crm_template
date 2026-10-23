import { extraEmails, type ImportRowValues, parseRowValues, sanitizeCell, sanitizeRow, splitEmailList, toCustomerDraft } from './cell-sanitizer';
import { IMPORT_COLUMNS, type ImportColumnKey } from './import-template';

function column(key: ImportColumnKey) {
  const found = IMPORT_COLUMNS.find((candidate) => candidate.key === key);
  if (!found) throw new Error(key);
  return found;
}

const NBSP = String.fromCharCode(0xa0);

describe('sanitizeCell (06 RN-06.11, PF-06.6, PF-06.21)', () => {
  it('recorta espacios, incluido el espacio duro, y trata la cadena vacía como ausente', () => {
    expect(sanitizeCell(column('legalName'), { kind: 'text', text: `${NBSP} Empresa ${NBSP}` })).toEqual({ value: 'Empresa', issue: null });
    expect(sanitizeCell(column('legalName'), { kind: 'text', text: '   ' })).toEqual({ value: null, issue: null });
    expect(sanitizeCell(column('legalName'), { kind: 'empty' })).toEqual({ value: null, issue: null });
  });

  it('conserva ceros a la izquierda y convierte enteros sin notación científica', () => {
    expect(sanitizeCell(column('customerCode'), { kind: 'text', text: '000123' }).value).toBe('000123');
    expect(sanitizeCell(column('taxId'), { kind: 'number', value: 1234567890123 }).value).toBe('1234567890123');
  });

  it('un decimal en una columna de código es INVALID_CELL_TYPE; en texto libre se lee como texto', () => {
    expect(sanitizeCell(column('phone'), { kind: 'number', value: 12.5 }).issue).toMatchObject({ field: 'phone', code: 'INVALID_CELL_TYPE', severity: 'ERROR' });
    expect(sanitizeCell(column('city'), { kind: 'number', value: 12.5 }).value).toBe('12.5');
  });

  it('un entero mayor que 2^53 (ya sin precisión) es INVALID_CELL_TYPE', () => {
    expect(sanitizeCell(column('taxId'), { kind: 'number', value: 2 ** 60 }).issue?.code).toBe('INVALID_CELL_TYPE');
  });

  it.each(['date', 'boolean', 'error'] as const)('una celda %s es INVALID_CELL_TYPE', (kind) => {
    expect(sanitizeCell(column('legalName'), { kind })).toMatchObject({ value: null, issue: { code: 'INVALID_CELL_TYPE' } });
  });

  it('una fórmula es FORMULA_NOT_ALLOWED y no aporta valor', () => {
    expect(sanitizeCell(column('legalName'), { kind: 'formula' })).toMatchObject({ value: null, issue: { field: 'legalName', code: 'FORMULA_NOT_ALLOWED' } });
  });

  it.each(['=HYPERLINK("x")', '@SUM(A1)', '\tTexto', ' =1+1'])('texto libre que empieza por un prefijo de fórmula (%j) es FORMULA_NOT_ALLOWED', (text) => {
    expect(sanitizeCell(column('legalName'), { kind: 'text', text }).issue?.code).toBe('FORMULA_NOT_ALLOWED');
  });

  it('conserva el texto rechazado (fórmula de texto, longitud) para el archivo de errores; nunca el de una fórmula real', () => {
    expect(sanitizeCell(column('legalName'), { kind: 'text', text: '=cmd' }).value).toBe('=cmd');
    expect(sanitizeCell(column('legalName'), { kind: 'text', text: 'y'.repeat(201) }).value).toHaveLength(201);
    expect(sanitizeCell(column('legalName'), { kind: 'formula' }).value).toBeNull();
  });

  it('un teléfono con + sigue aceptado (no es texto libre)', () => {
    expect(sanitizeCell(column('phone'), { kind: 'text', text: '+502 2222 3333' })).toEqual({ value: '+502 2222 3333', issue: null });
  });

  it('quita el apóstrofo de la neutralización del archivo de errores y vuelve a aplicar la regla de fórmulas', () => {
    expect(sanitizeCell(column('phone'), { kind: 'text', text: "'+502 2222 3333" }).value).toBe('+502 2222 3333');
    expect(sanitizeCell(column('legalName'), { kind: 'text', text: "'=cmd" }).issue?.code).toBe('FORMULA_NOT_ALLOWED');
    expect(sanitizeCell(column('legalName'), { kind: 'text', text: "'Comillas" }).value).toBe("'Comillas");
  });

  it('un valor mayor que la longitud máxima es MAX_LENGTH, sin repetir el valor en el mensaje', () => {
    const result = sanitizeCell(column('legalName'), { kind: 'text', text: 'x'.repeat(201) });
    expect(result.issue).toMatchObject({ field: 'legalName', code: 'MAX_LENGTH' });
    expect(result.issue?.message).not.toContain('xxxx');
  });
});

describe('sanitizeRow y parseRowValues', () => {
  it('asigna cada celda a su columna por índice y deja vacías las ausentes', () => {
    const indexes = new Map<ImportColumnKey, number>([
      ['legalName', 1],
      ['country', 0],
    ]);
    const row = sanitizeRow([{ kind: 'text', text: 'GT' }, { kind: 'text', text: 'Empresa' }], indexes);
    expect(row.issues).toEqual([]);
    expect(row.values).toMatchObject({ legalName: 'Empresa', country: 'GT', taxId: null });
    expect(Object.keys(row.values)).toHaveLength(13);
  });

  it('raw_data purgado ({}) o con otra forma → null; valores no textuales → null', () => {
    expect(parseRowValues({})).toBeNull();
    expect(parseRowValues([])).toBeNull();
    expect(parseRowValues({ legalName: 'A', taxId: 3 })).toMatchObject({ legalName: 'A', taxId: null });
  });
});

describe('lista de correos en la celda «Correo» (ADR-028)', () => {
  const rowWith = (email: string | null): ImportRowValues => ({
    customerCode: null, legalName: 'X', tradeName: null, country: 'EC', city: null, address: null, phone: null,
    email, companyType: null, status: null, rating: null, salesOwner: null, taxId: null,
  });

  it('separa por coma o punto y coma, recorta y no repite sin distinguir mayúsculas', () => {
    expect(splitEmailList(' a@x.com , B@y.com;A@X.com ,, c@z.com ')).toEqual(['a@x.com', 'B@y.com', 'c@z.com']);
    expect(splitEmailList('solo@x.com')).toEqual(['solo@x.com']);
    expect(splitEmailList(null)).toEqual([]);
  });

  it('el borrador del cliente lleva solo el primer correo', () => {
    expect(toCustomerDraft(rowWith('a@x.com, b@y.com')).email).toBe('a@x.com');
    expect(toCustomerDraft(rowWith('a@x.com')).email).toBe('a@x.com');
    expect(toCustomerDraft(rowWith(null)).email).toBeNull();
  });

  it('los adicionales válidos van a contactos y los que no parecen un correo se descartan y se cuentan', () => {
    expect(extraEmails(rowWith('a@x.com, b@y.com, sin-arroba, c@z.com'))).toEqual({ extras: ['b@y.com', 'c@z.com'], discarded: 1 });
    expect(extraEmails(rowWith('a@x.com'))).toEqual({ extras: [], discarded: 0 });
  });
});
