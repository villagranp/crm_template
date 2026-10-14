import { PassThrough } from 'node:stream';

// Solo las pruebas leen o arman archivos con la librería: producción la usa a través de `xlsx.ts` (ADR-022).
import ExcelJS, { type Cell, ValueType, Workbook } from 'exceljs';

import { rawRow, rawSheetXlsx, xlsxFile } from '@/modules/customer-imports/testing/import-fixtures';

import { readSheetRows, significantDigits, toCellValue, toExcelWallClock, writeTextWorkbook, xlsxCell, XlsxReadError, XlsxStreamWriter } from './xlsx';

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

describe('readSheetRows con estructuras que exceljs expandiría (revisión E5, B-1)', () => {
  // Los archivos se escriben como XML: exceljs expandiría estas estructuras también al escribirlas.
  async function timedRead(buffer: Buffer): Promise<{ ms: number; heapMb: number; rows: number }> {
    const heapBefore = process.memoryUsage().heapUsed;
    const started = Date.now();
    const result = await readSheetRows(buffer, OPTIONS);
    return { ms: Date.now() - started, heapMb: (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024, rows: result.rows.length };
  }

  it('una sola celda en la fila 1 048 576 no crea un millón de filas', async () => {
    const result = await timedRead(rawSheetXlsx(rawRow(1, ['a', 'b']) + rawRow(1048576, ['lejos'])));
    expect(result.rows).toBe(1);
    expect(result.ms).toBeLessThan(2000);
    expect(result.heapMb).toBeLessThan(100);
  });

  it('combinaciones, validaciones y formatos condicionales de columna completa se ignoran al cargar', async () => {
    const ranges =
      '<mergeCells count="1"><mergeCell ref="A3:XFD1048576"/></mergeCells>' +
      '<conditionalFormatting sqref="A2:XFD1048576"><cfRule type="expression" priority="1"><formula>TRUE</formula></cfRule></conditionalFormatting>' +
      '<dataValidations count="1"><dataValidation type="list" allowBlank="1" sqref="A2:XFD1048576"><formula1>"S,N"</formula1></dataValidation></dataValidations>' +
      '<hyperlinks><hyperlink ref="A2:XFD1048576" display="x"/></hyperlinks>';
    const result = await timedRead(rawSheetXlsx(rawRow(1, ['a', 'b']) + rawRow(2, ['x', 'y']), ranges));
    expect(result.rows).toBe(1);
    expect(result.ms).toBeLessThan(2000);
    expect(result.heapMb).toBeLessThan(100);
  });

  it('serializa las lecturas: dos lecturas simultáneas devuelven cada una su resultado', async () => {
    const [first, second] = await Promise.all([
      readSheetRows(await xlsxFile([['uno']], { headers: ['a'] }), OPTIONS),
      readSheetRows(await xlsxFile([['dos'], ['tres']], { headers: ['a'] }), OPTIONS),
    ]);
    expect(first.rows).toHaveLength(1);
    expect(second.rows).toHaveLength(2);
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

// --- Escritura tipada en streaming (exportación de reportes, 05 RN-05.47, RN-05.49) ---

async function written(build: (writer: XlsxStreamWriter) => void): Promise<{ workbook: Workbook; writer: XlsxStreamWriter }> {
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', (chunk: Buffer) => chunks.push(chunk));
  const ended = new Promise<void>((resolve) => output.on('end', resolve));
  const writer = new XlsxStreamWriter(output, 'America/Guatemala');
  build(writer);
  await writer.finish();
  await ended;
  const workbook = new Workbook();
  await workbook.xlsx.load(Buffer.concat(chunks) as unknown as ArrayBuffer);
  return { workbook, writer };
}

function cellOf(workbook: Workbook, sheet: string, address: string): Cell {
  const worksheet = workbook.getWorksheet(sheet);
  if (!worksheet) throw new Error(`Sheet ${sheet} not found`);
  return worksheet.getCell(address);
}

describe('significantDigits', () => {
  it.each([
    ['7750.0000', 4],
    ['0.0050', 1],
    ['0.0105', 3],
    ['-12.50', 3],
    ['1234567890123456', 16],
    ['0', 0],
  ])('%s → %d', (value, expected) => {
    expect(significantDigits(value)).toBe(expected);
  });
});

describe('toExcelWallClock', () => {
  it('expresa el instante con la hora local de la zona (Guatemala = UTC-6)', () => {
    expect(toExcelWallClock(new Date('2026-10-01T05:30:00Z'), 'America/Guatemala').toISOString()).toBe('2026-09-30T23:30:00.000Z');
  });
});

describe('XlsxStreamWriter (PF-05.6, AC-05.24, AC-05.29)', () => {
  it('celdas tipadas con formato; encabezado en negrita, congelado y con autofiltro', async () => {
    const { workbook } = await written((writer) => {
      const sheet = writer.addSheet('Datos', ['Texto', 'Cantidad', 'Avance', 'Fecha', 'Instante', 'Entero']);
      sheet.addRow([
        xlsxCell.text('Constructora Ñandú'),
        xlsxCell.number('1234.5000', '#,##0.0000'),
        xlsxCell.percent('45.00'),
        xlsxCell.date('2026-11-30'),
        xlsxCell.dateTime(new Date('2026-10-01T18:15:00Z')),
        xlsxCell.integer(3),
      ]);
      sheet.addRow([xlsxCell.text(null), xlsxCell.number(null, '0'), xlsxCell.percent(null), xlsxCell.date(null), xlsxCell.dateTime(null), xlsxCell.integer(null)]);
      sheet.commit();
    });

    const worksheet = workbook.getWorksheet('Datos');
    expect(worksheet?.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(worksheet?.autoFilter).toBe('A1:F1');
    expect(cellOf(workbook, 'Datos', 'A1').font?.bold).toBe(true);
    expect(cellOf(workbook, 'Datos', 'A1').value).toBe('Texto');

    expect(cellOf(workbook, 'Datos', 'A2')).toMatchObject({ type: ValueType.String, value: 'Constructora Ñandú', numFmt: '@' });
    expect(cellOf(workbook, 'Datos', 'B2')).toMatchObject({ type: ValueType.Number, value: 1234.5, numFmt: '#,##0.0000' });
    expect(cellOf(workbook, 'Datos', 'C2')).toMatchObject({ type: ValueType.Number, value: 0.45, numFmt: '0.00 %' });
    expect(cellOf(workbook, 'Datos', 'D2').type).toBe(ValueType.Date);
    expect((cellOf(workbook, 'Datos', 'D2').value as Date).toISOString()).toBe('2026-11-30T00:00:00.000Z');
    expect(cellOf(workbook, 'Datos', 'D2').numFmt).toBe('dd/mm/yyyy');
    // 18:15 UTC = 12:15 en Guatemala.
    expect((cellOf(workbook, 'Datos', 'E2').value as Date).toISOString()).toBe('2026-10-01T12:15:00.000Z');
    expect(cellOf(workbook, 'Datos', 'E2').numFmt).toBe('dd/mm/yyyy hh:mm');
    expect(cellOf(workbook, 'Datos', 'F2')).toMatchObject({ type: ValueType.Number, value: 3, numFmt: '0' });
    for (const address of ['A3', 'B3', 'C3', 'D3', 'E3', 'F3']) {
      expect(cellOf(workbook, 'Datos', address).type).toBe(ValueType.Null);
    }
  });

  it('textos que empiezan por =, +, -, @, tabulador o CR quedan como texto con apóstrofo, nunca como fórmula', async () => {
    const inputs = ['=1+1', '+A1', '-2', '@SUM(A1:A2)', '\tcmd', '\rcmd', '=HYPERLINK("http://x","y")'];
    const { workbook } = await written((writer) => {
      const sheet = writer.addSheet('Datos', ['Texto']);
      for (const input of inputs) sheet.addRow([xlsxCell.text(input)]);
      sheet.commit();
    });
    inputs.forEach((input, index) => {
      const cell = cellOf(workbook, 'Datos', `A${index + 2}`);
      // Al leer, el XML normaliza CR a LF; lo que importa es el apóstrofo y que no haya fórmula.
      expect({ type: cell.type, value: cell.value, formula: cell.formula }).toEqual({
        type: ValueType.String,
        value: `'${input.replace(/\r/g, '\n')}`,
        formula: undefined,
      });
    });
  });

  it('un número de 16 dígitos significativos se escribe como texto y se cuenta', async () => {
    const { workbook, writer } = await written((sheetWriter) => {
      const sheet = sheetWriter.addSheet('Datos', ['Monto']);
      sheet.addRow([xlsxCell.number('1234567890123.4567', '#,##0.00')]);
      sheet.addRow([xlsxCell.number('123456789012.3400', '#,##0.00')]);
      sheet.commit();
    });
    expect(cellOf(workbook, 'Datos', 'A2')).toMatchObject({ type: ValueType.String, value: '1234567890123.4567', numFmt: '@' });
    expect(cellOf(workbook, 'Datos', 'A3')).toMatchObject({ type: ValueType.Number, value: 123456789012.34 });
    expect(writer.textFallbacks).toBe(1);
  });

  it('varias hojas en orden; una hoja sin fila de encabezado no se congela', async () => {
    const { workbook } = await written((writer) => {
      writer.addSheet('Datos', ['A']).commit();
      const summary = writer.addSheet('Resumen', [], { headerRow: false });
      summary.addRow([xlsxCell.text('Total'), xlsxCell.integer(2)]);
      summary.commit();
    });
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Datos', 'Resumen']);
    expect((workbook.getWorksheet('Resumen')?.views ?? [])[0]?.state ?? 'normal').toBe('normal');
    expect(cellOf(workbook, 'Resumen', 'B1').value).toBe(2);
  });
});
