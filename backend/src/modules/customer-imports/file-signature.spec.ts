import { detectImportFileType } from './file-signature';
import { csvFile, oleFile, pngFile, xlsxFile } from './testing/import-fixtures';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('detectImportFileType (06 RN-06.8, H.2, PF-06.16, PF-06.43)', () => {
  it('reconoce un CSV y un XLSX reales con sus Content-Type habituales', async () => {
    expect(detectImportFileType(csvFile([]), 'clientes.csv', 'text/csv')).toEqual({ ok: true, format: 'CSV' });
    // Windows declara el CSV como vnd.ms-excel.
    expect(detectImportFileType(csvFile([]), 'CLIENTES.CSV', 'application/vnd.ms-excel')).toEqual({ ok: true, format: 'CSV' });
    expect(detectImportFileType(await xlsxFile([]), 'clientes.xlsx', XLSX_TYPE)).toEqual({ ok: true, format: 'XLSX' });
  });

  it('rechaza extensiones distintas de .csv y .xlsx', () => {
    expect(detectImportFileType(csvFile([]), 'clientes.xls', 'application/vnd.ms-excel')).toEqual({ ok: false, reason: 'UNSUPPORTED_EXTENSION' });
    expect(detectImportFileType(csvFile([]), 'clientes.xlsm', XLSX_TYPE)).toEqual({ ok: false, reason: 'UNSUPPORTED_EXTENSION' });
  });

  it('rechaza un contenedor OLE (.xls real o XLSX cifrada) aunque se llame .xlsx', () => {
    expect(detectImportFileType(oleFile(), 'cifrada.xlsx', XLSX_TYPE)).toEqual({ ok: false, reason: 'OLE_CONTAINER' });
  });

  it('rechaza un PNG renombrado a .csv y un CSV renombrado a .xlsx', () => {
    expect(detectImportFileType(pngFile(), 'imagen.csv', 'text/csv')).toEqual({ ok: false, reason: 'BINARY_CONTENT' });
    expect(detectImportFileType(csvFile([]), 'texto.xlsx', XLSX_TYPE)).toEqual({ ok: false, reason: 'SIGNATURE_MISMATCH' });
  });

  it('rechaza un ZIP renombrado a .csv y un texto con bytes NUL', async () => {
    expect(detectImportFileType(await xlsxFile([]), 'libro.csv', 'text/csv')).toEqual({ ok: false, reason: 'BINARY_CONTENT' });
    expect(detectImportFileType(Buffer.from('a,b\0c'), 'nul.csv', 'text/csv')).toEqual({ ok: false, reason: 'BINARY_CONTENT' });
  });

  it('rechaza un Content-Type incoherente con la extensión', () => {
    expect(detectImportFileType(csvFile([]), 'clientes.csv', 'image/png')).toEqual({ ok: false, reason: 'CONTENT_TYPE_MISMATCH' });
  });

  it('un archivo vacío toma el formato de la extensión (el lector lo rechaza como EMPTY_FILE)', () => {
    expect(detectImportFileType(Buffer.alloc(0), 'vacio.xlsx', XLSX_TYPE)).toEqual({ ok: true, format: 'XLSX' });
  });
});
