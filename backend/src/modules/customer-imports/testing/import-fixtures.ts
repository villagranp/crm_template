import { crc32, deflateRawSync } from 'node:zlib';

import ExcelJS from 'exceljs';

import { IMPORT_COLUMNS, type ImportColumnKey } from '../import-template';

/**
 * Generadores de archivos de prueba de la carga masiva (06 J: los archivos se
 * generan en la prueba con datos ficticios; no se versionan binarios). Solo para
 * pruebas (la carpeta `testing/` está fuera del build): aquí sí se usa `exceljs`
 * directamente para fabricar casos que el envoltorio de producción nunca escribe
 * (fórmulas, fechas, números).
 */

export type FixtureRow = Partial<Record<ImportColumnKey, string | null>>;

export const TEMPLATE_HEADERS: readonly string[] = IMPORT_COLUMNS.map((column) => column.header);

function rowValues(row: FixtureRow, headers: readonly string[]): string[] {
  return headers.map((header) => {
    const column = IMPORT_COLUMNS.find((candidate) => candidate.header === header);
    return column ? (row[column.key] ?? '') : '';
  });
}

function csvCell(value: string, delimiter: string): string {
  return /["\r\n]/.test(value) || value.includes(delimiter) ? `"${value.replace(/"/g, '""')}"` : value;
}

export interface CsvFixtureOptions {
  readonly delimiter?: ',' | ';';
  readonly bom?: boolean;
  readonly headers?: readonly string[];
  readonly lineEnding?: '\r\n' | '\n';
}

/** CSV UTF-8 con las columnas de la plantilla (o los encabezados dados). */
export function csvFile(rows: readonly FixtureRow[], options: CsvFixtureOptions = {}): Buffer {
  const delimiter = options.delimiter ?? ',';
  const headers = options.headers ?? TEMPLATE_HEADERS;
  const lineEnding = options.lineEnding ?? '\r\n';
  const lines = [headers, ...rows.map((row) => rowValues(row, headers))].map((cells) => cells.map((cell) => csvCell(cell, delimiter)).join(delimiter));
  const text = lines.join(lineEnding) + lineEnding;
  const content = Buffer.from(text, 'utf8');
  return options.bom === false ? content : Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), content]);
}

/** Valor de celda para `xlsxFile`: texto o un valor nativo de exceljs (número, fecha, fórmula…). */
export type XlsxFixtureCell = string | number | boolean | Date | null | { formula: string; result?: unknown } | { error: string } | { text: string; hyperlink: string };

export interface XlsxFixtureOptions {
  readonly sheetName?: string;
  readonly headers?: readonly string[];
  /** Hojas extra antes de la de datos (p. ej. una hoja oculta). */
  readonly extraSheets?: readonly { name: string; state?: 'visible' | 'hidden'; rows?: readonly (readonly XlsxFixtureCell[])[] }[];
}

/** XLSX con una hoja de datos; cada fila es un mapa por columna o una lista de celdas en el orden de `headers`. */
export async function xlsxFile(
  rows: readonly (FixtureRow | readonly XlsxFixtureCell[])[],
  options: XlsxFixtureOptions = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const extra of options.extraSheets ?? []) {
    const sheet = workbook.addWorksheet(extra.name, { state: extra.state ?? 'visible' });
    for (const values of extra.rows ?? []) sheet.addRow([...values]);
  }
  const headers = options.headers ?? TEMPLATE_HEADERS;
  const sheet = workbook.addWorksheet(options.sheetName ?? 'Clientes');
  sheet.addRow([...headers]);
  for (const row of rows) {
    sheet.addRow(Array.isArray(row) ? [...(row as readonly XlsxFixtureCell[])] : rowValues(row as FixtureRow, headers));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export interface ZipEntryFixture {
  readonly name: string;
  readonly data: Buffer;
  /** Por defecto `deflate`. */
  readonly stored?: boolean;
  /** Tamaño descomprimido que se **declara** (para fabricar tamaños falsos). */
  readonly declaredSize?: number;
  readonly encrypted?: boolean;
}

/** ZIP mínimo escrito a mano: permite fabricar bombas, entradas de más y tamaños declarados falsos. */
export function zipFile(entries: readonly ZipEntryFixture[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = entry.stored ? entry.data : deflateRawSync(entry.data);
    const method = entry.stored ? 0 : 8;
    const flags = entry.encrypted ? 0x1 : 0;
    const crc = crc32(entry.data);
    const declared = entry.declaredSize ?? entry.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(declared, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(declared, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>';
const WORKBOOK = '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"></workbook>';

/** Paquete con las dos entradas mínimas de un XLSX más las dadas. */
export function minimalXlsxZip(extra: readonly ZipEntryFixture[] = []): Buffer {
  return zipFile([
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES) },
    { name: 'xl/workbook.xml', data: Buffer.from(WORKBOOK) },
    ...extra,
  ]);
}

/** Contenedor OLE (cabecera de `.xls` o de una XLSX cifrada). */
export function oleFile(): Buffer {
  return Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504)]);
}

/** Firma PNG seguida de bytes binarios. */
export function pngFile(): Buffer {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
}
