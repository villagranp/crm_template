import { PassThrough } from 'node:stream';

// Solo la prueba lee el archivo con la librería: producción la usa a través de `xlsx.ts` (ADR-022).
import { type Cell, ValueType, Workbook } from 'exceljs';

import { significantDigits, toExcelWallClock, xlsxCell, XlsxStreamWriter } from './xlsx';

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
