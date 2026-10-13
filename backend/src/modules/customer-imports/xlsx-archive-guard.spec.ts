import { ArchiveRejectedError, type ArchiveLimits, countSheetContent, DEFAULT_ARCHIVE_LIMITS, inspectXlsxArchive } from './xlsx-archive-guard';
import { minimalXlsxZip, xlsxFile, zipFile } from './testing/import-fixtures';

const LIMITS: ArchiveLimits = { ...DEFAULT_ARCHIVE_LIMITS, maxDataRows: 100 };

function rejectionOf(buffer: Buffer, limits: ArchiveLimits = LIMITS): ArchiveRejectedError['rejection'] {
  try {
    inspectXlsxArchive(buffer, limits);
  } catch (error) {
    if (error instanceof ArchiveRejectedError) return error.rejection;
    throw error;
  }
  throw new Error('expected ArchiveRejectedError');
}

describe('inspectXlsxArchive (06 RN-06.31, H.2, PF-06.26, PF-06.43)', () => {
  it('acepta un XLSX real (plantilla escrita con exceljs)', async () => {
    const buffer = await xlsxFile([{ legalName: 'Empresa Uno' }]);
    expect(inspectXlsxArchive(buffer, LIMITS).entries).toBeGreaterThan(2);
  });

  it('rechaza un ZIP sin las entradas de un libro como no admitido (415)', () => {
    expect(rejectionOf(zipFile([{ name: 'a.txt', data: Buffer.from('hola') }]))).toEqual({ kind: 'UNSUPPORTED', reason: 'NOT_XLSX' });
  });

  it('rechaza macros (vbaProject.bin) y el tipo de libro con macros como no admitido', () => {
    expect(rejectionOf(minimalXlsxZip([{ name: 'xl/vbaProject.bin', data: Buffer.from('macro') }]))).toEqual({ kind: 'UNSUPPORTED', reason: 'MACROS' });
    const macroTypes = zipFile([
      { name: '[Content_Types].xml', data: Buffer.from('<Types><Override ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>') },
      { name: 'xl/workbook.xml', data: Buffer.from('<workbook/>') },
    ]);
    expect(rejectionOf(macroTypes)).toEqual({ kind: 'UNSUPPORTED', reason: 'MACROS' });
  });

  it('rechaza entradas cifradas como no admitidas', () => {
    expect(rejectionOf(minimalXlsxZip([{ name: 'xl/secret.xml', data: Buffer.from('x'), encrypted: true }]))).toEqual({ kind: 'UNSUPPORTED', reason: 'ENCRYPTED' });
  });

  it('rechaza más de 100 entradas', () => {
    const entries = Array.from({ length: 1000 }, (_value, index) => ({ name: `xl/media/f${index}.bin`, data: Buffer.from('x') }));
    expect(rejectionOf(minimalXlsxZip(entries))).toMatchObject({ kind: 'INVALID', issue: 'ARCHIVE_LIMITS_EXCEEDED', reason: 'TOO_MANY_ENTRIES' });
  });

  it('rechaza una bomba ZIP por la razón de compresión antes de descomprimir', () => {
    const bomb = minimalXlsxZip([{ name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(20 * 1024 * 1024, 0x41) }]);
    expect(rejectionOf(bomb)).toMatchObject({ issue: 'ARCHIVE_LIMITS_EXCEEDED', reason: 'COMPRESSION_RATIO' });
  });

  it('rechaza un tamaño descomprimido declarado total mayor que 64 MB', () => {
    const big = minimalXlsxZip([{ name: 'xl/big.xml', data: Buffer.from('x'), stored: true, declaredSize: 65 * 1024 * 1024 }]);
    expect(rejectionOf(big, { ...LIMITS, maxCompressionRatio: Number.MAX_SAFE_INTEGER })).toMatchObject({ reason: 'UNCOMPRESSED_SIZE' });
  });

  it('detecta tamaños declarados falsos al descomprimir de verdad (sin superar el declarado)', () => {
    const data = Buffer.from('<worksheet>'.padEnd(5000, 'x'));
    const lying = minimalXlsxZip([{ name: 'xl/worksheets/sheet1.xml', data, declaredSize: 100 }]);
    expect(rejectionOf(lying)).toMatchObject({ issue: 'ARCHIVE_LIMITS_EXCEEDED', reason: 'DECLARED_SIZE_MISMATCH' });
  });

  it.each(['/etc/passwd', '../evil.xml', 'xl\\worksheets\\sheet1.xml', 'C:/evil.xml'])('rechaza la ruta insegura %s', (name) => {
    expect(rejectionOf(minimalXlsxZip([{ name, data: Buffer.from('x') }]))).toMatchObject({ reason: 'UNSAFE_PATH' });
  });

  it('rechaza XML con DTD o entidades (XXE, PF-06.27) sin entregarlo a ningún parser', () => {
    const xxe = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><worksheet>&e;</worksheet>';
    expect(rejectionOf(minimalXlsxZip([{ name: 'xl/worksheets/sheet1.xml', data: Buffer.from(xxe) }]))).toEqual({
      kind: 'INVALID',
      issue: 'UNSAFE_CONTENT',
      reason: 'DTD',
    });
  });

  it('rechaza una hoja con más filas con valores que el máximo (más el encabezado)', () => {
    const rows = Array.from({ length: 4 }, (_value, index) => `<row r="${index + 1}"><c r="A${index + 1}"><v>1</v></c></row>`).join('');
    const sheet = minimalXlsxZip([{ name: 'xl/worksheets/sheet1.xml', data: Buffer.from(`<worksheet><sheetData>${rows}</sheetData></worksheet>`) }]);
    expect(rejectionOf(sheet, { ...LIMITS, maxDataRows: 2 })).toMatchObject({ kind: 'INVALID', issue: 'TOO_MANY_ROWS' });
    expect(() => inspectXlsxArchive(sheet, { ...LIMITS, maxDataRows: 3 })).not.toThrow();
  });

  it('rechaza lo que no es un ZIP', () => {
    expect(rejectionOf(Buffer.from('no soy un zip'))).toEqual({ kind: 'UNSUPPORTED', reason: 'NOT_XLSX' });
  });
});

describe('countSheetContent', () => {
  it('cuenta solo las filas con valores y todas las celdas', () => {
    const xml = '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" s="1"/></row><row r="3"><c r="A3"><f>1+1</f></c></row></sheetData>';
    expect(countSheetContent(xml)).toEqual({ rowsWithValues: 2, cells: 3 });
  });
});
