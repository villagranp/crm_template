import { type Cell, ValueType, Workbook, type Worksheet } from 'exceljs';
import type request from 'supertest';

/**
 * Lectura de los `.xlsx` exportados **solo en pruebas** (05 PF-05.24, PF-05.45): el
 * código de producción usa `exceljs` únicamente a través de `src/common/xlsx.ts` (ADR-022).
 */

/** Parser de supertest que junta el cuerpo binario en un `Buffer`. */
export function binaryParser(response: request.Response, callback: (error: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}

export async function readXlsx(body: Buffer): Promise<Workbook> {
  const workbook = new Workbook();
  await workbook.xlsx.load(body as unknown as ArrayBuffer);
  return workbook;
}

export function sheet(workbook: Workbook, name: string): Worksheet {
  const worksheet = workbook.getWorksheet(name);
  if (!worksheet) throw new Error(`Sheet ${name} not found; sheets: ${workbook.worksheets.map((entry) => entry.name).join(', ')}`);
  return worksheet;
}

/** Encabezados (fila 1). */
export function headers(worksheet: Worksheet): string[] {
  const values: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => values.push(String(cell.value ?? '')));
  return values;
}

/** Filas de datos (desde la 2) como celdas, por número de columna base 1. */
export function dataRows(worksheet: Worksheet): Cell[][] {
  const rows: Cell[][] = [];
  const width = worksheet.getRow(1).cellCount;
  for (let index = 2; index <= worksheet.rowCount; index += 1) {
    const row = worksheet.getRow(index);
    rows.push(Array.from({ length: width }, (_, column) => row.getCell(column + 1)));
  }
  return rows;
}

/** Celda de la columna con ese encabezado. */
export function column(worksheet: Worksheet, header: string): number {
  const index = headers(worksheet).indexOf(header);
  if (index < 0) throw new Error(`Column ${header} not found in ${worksheet.name}`);
  return index + 1;
}

/** Hoja de dos o tres columnas (Resumen / Filtros) como mapa etiqueta → valor. */
export function keyValues(worksheet: Worksheet): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const row of dataRows(worksheet)) map.set(String(row[0]?.value ?? ''), row[1]?.value ?? null);
  return map;
}

export { ValueType };
