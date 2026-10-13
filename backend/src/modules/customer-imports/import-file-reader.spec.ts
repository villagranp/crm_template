import * as xlsx from '@/common/xlsx';

import { UnsupportedImportFileError } from './customer-import-errors';
import { detectFormat, readImportFile } from './import-file-reader';
import { csvFile, minimalXlsxZip, xlsxFile } from './testing/import-fixtures';
import * as guard from './xlsx-archive-guard';

const LIMITS = { maxRows: 10, maxColumns: 30, parseTimeoutMs: 5000 };
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('readImportFile (06 RN-06.9, RN-06.10, RN-06.31, PF-06.53)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('un CSV se lee con el lector propio y nunca llega a exceljs', async () => {
    const readSheet = jest.spyOn(xlsx, 'readSheetRows');
    const result = await readImportFile({ buffer: csvFile([{ legalName: 'Uno' }]), originalName: 'a.csv', mimeType: 'text/csv' }, 'CSV', LIMITS);
    expect(result.ok).toBe(true);
    expect(readSheet).not.toHaveBeenCalled();
  });

  it('en XLSX la guardia ZIP se ejecuta antes que la librería', async () => {
    const inspect = jest.spyOn(guard, 'inspectXlsxArchive');
    const readSheet = jest.spyOn(xlsx, 'readSheetRows');
    const result = await readImportFile({ buffer: await xlsxFile([{ legalName: 'Uno' }]), originalName: 'a.xlsx', mimeType: XLSX_TYPE }, 'XLSX', LIMITS);
    expect(result.ok).toBe(true);
    expect(inspect.mock.invocationCallOrder[0]).toBeLessThan(readSheet.mock.invocationCallOrder[0] ?? 0);
  });

  it('si la guardia rechaza, la librería no se llama; macros → 415, límites → 422 ARCHIVE_LIMITS_EXCEEDED', async () => {
    const readSheet = jest.spyOn(xlsx, 'readSheetRows');
    const macro = minimalXlsxZip([{ name: 'xl/vbaProject.bin', data: Buffer.from('x') }]);
    await expect(readImportFile({ buffer: macro, originalName: 'm.xlsx', mimeType: XLSX_TYPE }, 'XLSX', LIMITS)).rejects.toBeInstanceOf(UnsupportedImportFileError);

    const many = minimalXlsxZip(Array.from({ length: 120 }, (_value, index) => ({ name: `xl/f${index}.bin`, data: Buffer.from('x') })));
    await expect(readImportFile({ buffer: many, originalName: 'z.xlsx', mimeType: XLSX_TYPE }, 'XLSX', LIMITS)).resolves.toEqual({
      ok: false,
      format: 'XLSX',
      problems: [{ field: 'file', issue: 'ARCHIVE_LIMITS_EXCEEDED' }],
    });
    expect(readSheet).not.toHaveBeenCalled();
  });

  it('vacío, solo encabezados, demasiadas filas y columnas incorrectas → problemas de estructura', async () => {
    const read = (buffer: Buffer) => readImportFile({ buffer, originalName: 'a.csv', mimeType: 'text/csv' }, 'CSV', LIMITS);
    await expect(read(Buffer.alloc(0))).resolves.toMatchObject({ ok: false, problems: [{ field: 'file', issue: 'EMPTY_FILE' }] });
    await expect(read(csvFile([]))).resolves.toMatchObject({ ok: false, problems: [{ field: 'rows', issue: 'NO_DATA_ROWS' }] });
    await expect(read(csvFile(Array.from({ length: 11 }, () => ({ legalName: 'x' }))))).resolves.toMatchObject({
      ok: false,
      problems: [{ field: 'rows', issue: 'TOO_MANY_ROWS' }],
    });
    await expect(read(csvFile([{ legalName: 'x' }], { headers: ['Razón social'] }))).resolves.toMatchObject({
      ok: false,
      problems: expect.arrayContaining([{ field: 'columns', issue: 'MISSING_COLUMN', column: 'NIT' }]),
    });
  });
});

describe('detectFormat', () => {
  it('lanza UnsupportedImportFileError con el motivo (para el log, nunca para el cliente)', () => {
    expect(() => detectFormat({ buffer: Buffer.from('x'), originalName: 'a.txt', mimeType: 'text/plain' })).toThrow(UnsupportedImportFileError);
  });
});
