import ExcelJS from 'exceljs';

import { xlsxFile } from '@/modules/customer-imports/testing/import-fixtures';

import { readSheetRows, toCellValue, writeTextWorkbook, XlsxReadError } from './xlsx';

const OPTIONS = { preferredSheet: 'Clientes', maxRows: 100, maxColumns: 30, timeoutMs: 5000 };

async function issueOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    if (error instanceof XlsxReadError) return error.issue;
    throw error;
  }
  throw new Error('expected XlsxReadError');
}

describe('readSheetRows (ADR-022, 06 RN-06.11, RN-06.31, PF-06.6, PF-06.53)', () => {
  it('lee la hoja Clientes con valores tipados sin evaluar fórmulas ni usar su valor en caché', async () => {
    const buffer = await xlsxFile([], {
      headers: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      extraSheets: [{ name: 'Otra', rows: [['x']] }],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('Clientes');
    sheet?.addRow([
      1234567890123,
      { formula: 'A2*2', result: 'VALOR-EN-CACHE' },
      new Date(2026, 0, 1),
      { richText: [{ text: 'Ri' }, { text: 'co' }] },
      { text: 'Enlace', hyperlink: 'https://ejemplo.invalid/' },
      { error: '#N/A' },
      true,
    ]);
    const result = await readSheetRows(Buffer.from(await workbook.xlsx.writeBuffer()), OPTIONS);

    expect(result.sheetName).toBe('Clientes');
    expect(result.rows).toEqual([
      {
        rowNumber: 1,
        cells: [
          { kind: 'number', value: 1234567890123 },
          { kind: 'formula' },
          { kind: 'date' },
          { kind: 'text', text: 'Rico' },
          { kind: 'text', text: 'Enlace' },
          { kind: 'error' },
          { kind: 'boolean' },
        ],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('VALOR-EN-CACHE');
  });

  it('omite filas vacías conservando la numeración y usa la primera hoja visible si no hay Clientes', async () => {
    const buffer = await xlsxFile([['uno'], [], ['  '], ['dos']], {
      sheetName: 'Datos',
      headers: ['col'],
      extraSheets: [{ name: 'Oculta', state: 'hidden', rows: [['x']] }],
    });
    const result = await readSheetRows(buffer, OPTIONS);
    expect(result.sheetName).toBe('Datos');
    expect(result.rows.map((row) => row.rowNumber)).toEqual([1, 4]);
  });

  it('SHEET_NOT_FOUND si no hay hoja Clientes ni hoja visible con datos', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Vacia');
    expect(await issueOf(readSheetRows(Buffer.from(await workbook.xlsx.writeBuffer()), OPTIONS))).toBe('SHEET_NOT_FOUND');
  });

  it('TOO_MANY_ROWS y TOO_MANY_COLUMNS', async () => {
    expect(await issueOf(readSheetRows(await xlsxFile([['1'], ['2'], ['3']], { headers: ['a'] }), { ...OPTIONS, maxRows: 2 }))).toBe('TOO_MANY_ROWS');
    const wide = await xlsxFile([], { headers: Array.from({ length: 31 }, (_value, index) => `c${index}`) });
    expect(await issueOf(readSheetRows(wide, OPTIONS))).toBe('TOO_MANY_COLUMNS');
  });

  it('UNREADABLE para un ZIP que no es un libro', async () => {
    const garbage = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('basura')]);
    expect(await issueOf(readSheetRows(garbage, OPTIONS))).toBe('UNREADABLE');
  });
});

describe('toCellValue', () => {
  it('texto vacío = vacío; hipervínculo sin texto = vacío; número no finito = error', () => {
    expect(toCellValue('')).toEqual({ kind: 'empty' });
    expect(toCellValue({ text: '', hyperlink: 'x' })).toEqual({ kind: 'empty' });
    expect(toCellValue(Number.NaN)).toEqual({ kind: 'error' });
    expect(toCellValue({ sharedFormula: 'A1' })).toEqual({ kind: 'formula' });
  });
});

describe('writeTextWorkbook (RN-06.26, AC-06.21, PF-06.28)', () => {
  it('escribe celdas de texto neutralizadas, nunca fórmulas, con encabezado en negrita', async () => {
    const buffer = await writeTextWorkbook([
      { name: 'Clientes', columns: [{ header: 'Valor' }, { header: '=Cabecera' }], rows: [['=cmd', '+1'], ['-2', '@x'], ['00123', null]] },
      { name: 'Otra', columns: [{ header: 'x' }], rows: [] },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('Clientes');
    const values = [1, 2, 3, 4].map((row) => [1, 2].map((column) => sheet?.getRow(row).getCell(column).value ?? null));
    expect(values).toEqual([
      ['Valor', "'=Cabecera"],
      ["'=cmd", "'+1"],
      ["'-2", "'@x"],
      ['00123', null],
    ]);
    const cell = sheet?.getRow(2).getCell(1);
    expect(cell?.type).toBe(ExcelJS.ValueType.String);
    expect(cell?.numFmt).toBe('@');
    expect(sheet?.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(workbook.worksheets.map((candidate) => candidate.name)).toEqual(['Clientes', 'Otra']);
  });
});
