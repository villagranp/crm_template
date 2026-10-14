import { findInFileDuplicates } from './in-file-duplicates';
import { canTransition, completionStatus, IMPORT_STATUSES, isFinalStatus } from './import-status';
import { IMPORT_COLUMNS, matchHeaders, normalizeHeader } from './import-template';

const HEADERS = IMPORT_COLUMNS.map((column) => column.header);

describe('matchHeaders (06 RN-06.10, PF-06.18, PF-06.43)', () => {
  it('acepta las 13 columnas en otro orden, sin acentos y con otras mayúsculas', () => {
    const shuffled = [...HEADERS].reverse().map((header) => normalizeHeader(header).toUpperCase());
    const match = matchHeaders(shuffled);
    expect(match.ok).toBe(true);
    if (match.ok) {
      expect(match.columnIndexes.get('taxId')).toBe(0);
      expect(match.columnIndexes.get('customerCode')).toBe(12);
    }
  });

  it('informa la columna faltante, la desconocida y la repetida', () => {
    const headers = [...HEADERS.filter((header) => header !== 'Razón social'), 'Sitio web', 'NIT'];
    expect(matchHeaders(headers)).toEqual({
      ok: false,
      issues: [
        { issue: 'UNKNOWN_COLUMN', column: 'Sitio web' },
        { issue: 'DUPLICATE_COLUMN', column: 'NIT' },
        { issue: 'MISSING_COLUMN', column: 'Razón social' },
      ],
    });
  });

  it('ignora los encabezados vacíos del final y las columnas del archivo de errores', () => {
    expect(matchHeaders(['Fila del archivo', ...HEADERS, 'Estado de la fila', 'Errores', '', ' ']).ok).toBe(true);
  });

  it('normaliza espacios duros y espacios repetidos', () => {
    expect(normalizeHeader(`  Razón${String.fromCharCode(0xa0)}  Social `)).toBe('razon social');
  });
});

describe('findInFileDuplicates (06 RN-06.14, D-06.5)', () => {
  it('agrupa por cada clave y apunta a la primera otra fila del grupo', () => {
    const result = findInFileDuplicates([
      { rowNumber: 1, customerCode: 'GT|A1', taxId: 'GT|9', legalName: null },
      { rowNumber: 2, customerCode: 'GT|A1', taxId: null, legalName: 'GT|x' },
      { rowNumber: 3, customerCode: 'GT|A1', taxId: 'GT|9', legalName: 'GT|x' },
      { rowNumber: 4, customerCode: 'SV|A1', taxId: null, legalName: null },
    ]);
    expect([...result.codeDuplicateOf.entries()]).toEqual([
      [1, 2],
      [2, 1],
      [3, 1],
    ]);
    expect([...result.taxIdDuplicateOf.entries()]).toEqual([
      [1, 3],
      [3, 1],
    ]);
    expect([...result.legalNameDuplicateOf.entries()]).toEqual([
      [2, 3],
      [3, 2],
    ]);
  });
});

describe('ImportStatus (06 RN-06.25, PF-06.42)', () => {
  it.each([
    ['UPLOADED', 'VALIDATING'],
    ['VALIDATING', 'VALIDATED'],
    ['VALIDATING', 'FAILED'],
    ['VALIDATED', 'IMPORTING'],
    ['VALIDATED', 'CANCELLED'],
    ['IMPORTING', 'COMPLETED'],
    ['IMPORTING', 'COMPLETED_WITH_ERRORS'],
    ['IMPORTING', 'FAILED'],
  ] as const)('permite %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['VALIDATED', 'COMPLETED'],
    ['IMPORTING', 'CANCELLED'],
    ['CANCELLED', 'IMPORTING'],
    ['COMPLETED', 'IMPORTING'],
    ['FAILED', 'VALIDATED'],
    ['UPLOADED', 'IMPORTING'],
  ] as const)('prohíbe %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('los estados finales no tienen salida', () => {
    expect(IMPORT_STATUSES.filter(isFinalStatus)).toEqual(['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED']);
  });

  it('COMPLETED solo si se importaron todas las filas del archivo', () => {
    expect(completionStatus({ totalRows: 3, importedRows: 3 })).toBe('COMPLETED');
    expect(completionStatus({ totalRows: 3, importedRows: 2 })).toBe('COMPLETED_WITH_ERRORS');
    expect(completionStatus({ totalRows: 3, importedRows: 0 })).toBe('COMPLETED_WITH_ERRORS');
  });
});
