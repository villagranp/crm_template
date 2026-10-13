import { CsvReadError, detectDelimiter, readCsv } from './csv-reader';

const utf8 = (text: string): Buffer => Buffer.from(text, 'utf8');
const LIMITS = { maxRows: 100 };

function issueOf(work: () => unknown): { issue: string; reason: string | null } {
  try {
    work();
  } catch (error) {
    if (error instanceof CsvReadError) return { issue: error.issue, reason: error.reason };
    throw error;
  }
  throw new Error('expected CsvReadError');
}

describe('readCsv (06 D-06.2, D-06.3, PF-06.43)', () => {
  it('lee encabezados y filas como texto, con BOM y CRLF', () => {
    const result = readCsv(utf8('\ufeffCódigo,Nombre\r\n00123,Ana\r\n'), LIMITS);
    expect(result).toEqual({
      delimiter: ',',
      headers: ['Código', 'Nombre'],
      rows: [{ rowNumber: 1, cells: ['00123', 'Ana'] }],
    });
  });

  it('detecta el punto y coma de Excel en español y acepta LF y CR', () => {
    const result = readCsv(utf8('a;b\n1;2\r3;4'), LIMITS);
    expect(result.delimiter).toBe(';');
    expect(result.rows).toEqual([
      { rowNumber: 1, cells: ['1', '2'] },
      { rowNumber: 2, cells: ['3', '4'] },
    ]);
  });

  it('respeta comillas, comillas escapadas, delimitadores y saltos de línea dentro de comillas', () => {
    const result = readCsv(utf8('a,b\n"Pérez, ""Ana""","línea 1\nlínea 2"\n'), LIMITS);
    expect(result.rows).toEqual([{ rowNumber: 1, cells: ['Pérez, "Ana"', 'línea 1\nlínea 2'] }]);
  });

  it('omite las filas vacías sin alterar la numeración de las siguientes', () => {
    const result = readCsv(utf8('a,b\n1,2\n,\n\n3,4\n'), LIMITS);
    expect(result.rows.map((row) => row.rowNumber)).toEqual([1, 4]);
  });

  it('conserva una comilla en medio de un campo sin comillas', () => {
    expect(readCsv(utf8('a\nab"c\n'), LIMITS).rows[0]?.cells).toEqual(['ab"c']);
  });

  it('lee el último registro sin salto de línea final, también con un campo vacío entre comillas', () => {
    expect(readCsv(utf8('a,b\n1,""'), LIMITS).rows).toEqual([{ rowNumber: 1, cells: ['1', ''] }]);
  });

  it.each([
    ['vacío', '', 'EMPTY_FILE'],
    ['solo espacios', ' \r\n ', 'EMPTY_FILE'],
  ])('archivo %s → %s', (_label, text, issue) => {
    expect(issueOf(() => readCsv(utf8(text), LIMITS)).issue).toBe(issue);
  });

  it('rechaza un CSV que no es UTF-8 (Windows-1252)', () => {
    const latin1 = Buffer.from([0x61, 0x0a, 0x50, 0xe9, 0x72, 0x65, 0x7a, 0x0a]);
    expect(issueOf(() => readCsv(latin1, LIMITS)).issue).toBe('INVALID_ENCODING');
  });

  it.each([
    ['comillas sin cerrar', 'a\n"abc\n', 'UNCLOSED_QUOTE'],
    ['texto tras la comilla de cierre', 'a\n"abc"x\n', 'TEXT_AFTER_QUOTE'],
  ])('%s → MALFORMED_CSV', (_label, text, reason) => {
    expect(issueOf(() => readCsv(utf8(text), LIMITS))).toEqual({ issue: 'MALFORMED_CSV', reason });
  });

  it('aborta con una línea mayor que 16 KB', () => {
    const text = `a\n${'x'.repeat(16 * 1024 + 1)}\n`;
    expect(issueOf(() => readCsv(utf8(text), LIMITS))).toEqual({ issue: 'MALFORMED_CSV', reason: 'RECORD_TOO_LONG' });
  });

  it('aborta con más de 30 columnas', () => {
    expect(issueOf(() => readCsv(utf8(`${Array(31).fill('a').join(',')}\n`), LIMITS))).toEqual({
      issue: 'MALFORMED_CSV',
      reason: 'TOO_MANY_COLUMNS',
    });
  });

  it('aborta al superar el máximo de filas de datos (las vacías no cuentan)', () => {
    expect(readCsv(utf8('a\n1\n\n2\n'), { maxRows: 2 }).rows).toHaveLength(2);
    expect(issueOf(() => readCsv(utf8('a\n1\n2\n3\n'), { maxRows: 2 })).issue).toBe('TOO_MANY_ROWS');
  });
});

describe('detectDelimiter', () => {
  it('ignora los separadores dentro de comillas y mira solo la primera línea', () => {
    expect(detectDelimiter('"a;b;c",d\ne;f;g;h')).toBe(',');
    expect(detectDelimiter('a;b,c;d')).toBe(';');
  });
});
