import { PassThrough, type Writable } from 'node:stream';

import ExcelJS from 'exceljs';

import type { CalendarDate } from './calendar-date';
import { neutralizeFormula } from './csv';
import type { DecimalString } from './decimal';

/**
 * Envoltorio único de `exceljs` (ADR-022): ninguna otra pieza de producción importa la
 * librería. Sirve a la carga masiva (Módulo 6) y a la exportación de reportes (Módulo 5).
 *
 * - **Lectura** de archivos no confiables (carga masiva, 06 RN-06.31): solo
 *   después de la guardia ZIP del módulo (`xlsx-archive-guard.ts`), que verifica
 *   los tamaños **reales** descomprimidos y acota filas y celdas antes de llegar
 *   aquí. Se usa la carga en memoria (`xlsx.load`) y no el lector en streaming:
 *   este vuelca las hojas a archivos temporales en disco cuando
 *   `sharedStrings.xml` va detrás de ellas en el ZIP, que es el orden habitual de
 *   Excel (addendum de ADR-022). Se ignoran los nodos de rango que la librería
 *   expandiría celda a celda (combinaciones, validaciones, formatos condicionales…),
 *   se recorren solo las filas existentes y se lee un archivo a la vez por proceso.
 *   Las fórmulas nunca se evalúan ni se usa su valor en caché: la celda se informa
 *   como `formula`.
 * - **Escritura de texto** (plantilla y archivo de errores de la carga masiva,
 *   `writeTextWorkbook`): escritor en streaming, celdas siempre de texto
 *   (`numFmt '@'`) y neutralizadas con la regla de `csv.ts`; nunca una fórmula.
 * - **Escritura tipada en streaming** (exportación de reportes, `XlsxStreamWriter`,
 *   05 RN-05.47, RN-05.49): cada fila se confirma y sale hacia el `Writable` (la
 *   respuesta HTTP) sin construir el libro en memoria.
 *   - **Sin fórmulas**: ninguna celda se escribe como fórmula; todo texto es celda de
 *     texto (formato `@`) y pasa por la neutralización de `common/csv.ts` (apóstrofo
 *     delante de `=`, `+`, `-`, `@`, tabulador y CR).
 *   - Celdas **tipadas**: números con su formato, fechas como fecha de Excel, porcentajes
 *     como fracción. Los instantes se convierten a la hora local de `timeZone` (Excel no
 *     tiene zonas horarias; la hoja "Filtros" la indica).
 *   - Un número con más de 15 dígitos significativos (precisión de Excel) se escribe como
 *     texto y se cuenta en `textFallbacks` para avisarlo en la hoja "Filtros".
 */

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ---------------------------------------------------------------------------
// Lectura y escritura de texto (carga masiva, 06)
// ---------------------------------------------------------------------------

export type XlsxCellValue =
  | { readonly kind: 'empty' }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'formula' }
  | { readonly kind: 'date' }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'error' };

export interface XlsxRow {
  /** 1 = la fila siguiente al encabezado (fila 2 de Excel). */
  readonly rowNumber: number;
  readonly cells: readonly XlsxCellValue[];
}

export interface XlsxSheetRows {
  readonly sheetName: string;
  /** Fila 1 de la hoja. */
  readonly headers: readonly XlsxCellValue[];
  /** Filas con al menos una celda no vacía. */
  readonly rows: readonly XlsxRow[];
}

export type XlsxReadIssue = 'SHEET_NOT_FOUND' | 'TOO_MANY_ROWS' | 'TOO_MANY_COLUMNS' | 'PARSE_TIMEOUT' | 'UNREADABLE';

export class XlsxReadError extends Error {
  constructor(readonly issue: XlsxReadIssue) {
    super(`XLSX rejected: ${issue}`);
    this.name = 'XlsxReadError';
  }
}

export interface XlsxReadOptions {
  /** Hoja de datos por nombre (sin distinguir mayúsculas); si no existe, la primera hoja visible con datos. */
  readonly preferredSheet: string;
  /**
   * `true`: solo la hoja con ese nombre; si no existe, `SHEET_NOT_FOUND` (sin recurrir a la primera
   * hoja visible). Lo usa la carga inicial por scripts, cuyos libros tienen varias hojas de datos.
   */
  readonly exactSheet?: boolean;
  /** Filas de datos no vacías admitidas. */
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly timeoutMs: number;
}

const EMPTY: XlsxCellValue = { kind: 'empty' };

function textOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((run: { text?: unknown }) => (typeof run.text === 'string' ? run.text : '')).join('');
  }
  return null;
}

/** Valor de una celda de `exceljs`, sin exponer nunca el resultado de una fórmula. */
export function toCellValue(value: unknown): XlsxCellValue {
  if (value === null || value === undefined) return EMPTY;
  if (typeof value === 'number') return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'error' };
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (value instanceof Date) return { kind: 'date' };
  const text = textOf(value);
  if (text !== null) return text === '' ? EMPTY : { kind: 'text', text };
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) return { kind: 'formula' };
    if ('error' in value) return { kind: 'error' };
    if ('text' in value) {
      // Hipervínculo: solo su texto (nunca se sigue la URL).
      const linkText = textOf(value.text);
      return linkText ? { kind: 'text', text: linkText } : EMPTY;
    }
  }
  return { kind: 'error' };
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new XlsxReadError('PARSE_TIMEOUT')), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function pickSheet(workbook: ExcelJS.Workbook, preferred: string, exact = false): ExcelJS.Worksheet | null {
  const sheets = workbook.worksheets;
  const named = sheets.find((sheet) => sheet.name.trim().toLowerCase() === preferred.toLowerCase());
  if (named || exact) return named ?? null;
  return sheets.find((sheet) => sheet.state === 'visible' && sheet.actualRowCount > 0) ?? null;
}

function rowCells(row: ExcelJS.Row, width: number): XlsxCellValue[] {
  const cells: XlsxCellValue[] = [];
  for (let column = 1; column <= width; column += 1) {
    cells.push(toCellValue(row.getCell(column).value));
  }
  return cells;
}

/**
 * Lee la hoja de datos de un XLSX **ya inspeccionado** por la guardia ZIP. La
 * fila 1 es el encabezado; las filas completamente vacías se omiten conservando
 * la numeración de las siguientes.
 */
export async function readSheetRows(buffer: Buffer, options: XlsxReadOptions): Promise<XlsxSheetRows> {
  // Una lectura a la vez por proceso: la carga es CPU y memoria síncronas (revisión E5, M-1).
  const previous = readQueue;
  let release: () => void = () => undefined;
  readQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await readSheetRowsNow(buffer, options);
  } finally {
    release();
  }
}

let readQueue: Promise<void> = Promise.resolve();

/**
 * Nodos de la hoja que `exceljs` expandiría celda a celda al cargar (un rango
 * `A1:XFD1048576` en pocos bytes crearía millones de objetos) o que la carga no
 * necesita: se ignoran. Los hipervínculos ignorados dejan solo el texto de la celda.
 */
const IGNORED_SHEET_NODES = [
  'mergeCells',
  'dataValidations',
  'conditionalFormatting',
  'hyperlinks',
  'autoFilter',
  'cols',
  'rowBreaks',
  'pageMargins',
  'pageSetup',
  'headerFooter',
  'printOptions',
  'picture',
  'drawing',
  'tableParts',
  'sheetProtection',
  'extLst',
];

async function readSheetRowsNow(buffer: Buffer, options: XlsxReadOptions): Promise<XlsxSheetRows> {
  const deadline = Date.now() + options.timeoutMs;
  const workbook = new ExcelJS.Workbook();
  try {
    // `load` acepta el Buffer de Node; los tipos de exceljs declaran uno propio y no listan `ignoreNodes`.
    const loadOptions = { ignoreNodes: IGNORED_SHEET_NODES } as unknown as Parameters<typeof workbook.xlsx.load>[1];
    await withTimeout(workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer, loadOptions), options.timeoutMs);
  } catch (error) {
    if (error instanceof XlsxReadError) throw error;
    throw new XlsxReadError('UNREADABLE');
  }

  const sheet = pickSheet(workbook, options.preferredSheet, options.exactSheet === true);
  if (!sheet) throw new XlsxReadError('SHEET_NOT_FOUND');

  const headerRow = sheet.getRow(1);
  const width = headerRow.cellCount;
  if (width > options.maxColumns) throw new XlsxReadError('TOO_MANY_COLUMNS');
  const headers = rowCells(headerRow, width);
  const rows: XlsxRow[] = [];
  // Solo las filas que existen en el archivo: recorrer 1..rowCount con getRow() crearía
  // un objeto por fila hasta la última (una celda en la fila 1 048 576 = un millón de filas).
  sheet.eachRow({ includeEmpty: false }, (row, excelRow) => {
    if (excelRow === 1) return;
    if (Date.now() > deadline) throw new XlsxReadError('PARSE_TIMEOUT');
    const cells = rowCells(row, width);
    if (cells.every((cell) => cell.kind === 'empty' || (cell.kind === 'text' && cell.text.trim() === ''))) return;
    if (rows.length >= options.maxRows) throw new XlsxReadError('TOO_MANY_ROWS');
    rows.push({ rowNumber: excelRow - 1, cells });
  });
  return { sheetName: sheet.name, headers, rows };
}

export interface XlsxTextColumn {
  readonly header: string;
  /** Ancho en caracteres. */
  readonly width?: number;
}

export interface XlsxTextSheet {
  readonly name: string;
  readonly columns: readonly XlsxTextColumn[];
  readonly rows: readonly (readonly (string | null)[])[];
}

/** Formato de número "Texto" de Excel: conserva ceros a la izquierda y evita la notación científica. */
const TEXT_NUMBER_FORMAT = '@';

/**
 * Escribe un libro de hojas de texto (plantilla y archivo de errores, 06 RN-06.6,
 * RN-06.26): encabezado en negrita y fijo, toda celda de texto y neutralizada.
 */
export async function writeTextWorkbook(sheets: readonly XlsxTextSheet[]): Promise<Buffer> {
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve, reject) => {
    output.on('end', resolve);
    output.on('error', reject);
  });

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: true, useSharedStrings: false });
  for (const definition of sheets) {
    const sheet = workbook.addWorksheet(definition.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = definition.columns.map((column, index) => ({
      key: `c${index}`,
      width: column.width ?? 20,
      style: { numFmt: TEXT_NUMBER_FORMAT },
    }));
    const header = sheet.addRow(definition.columns.map((column) => neutralizeFormula(column.header)));
    header.font = { bold: true };
    header.commit();
    for (const values of definition.rows) {
      const row = sheet.addRow(values.map((value) => (value === null ? null : neutralizeFormula(value))));
      row.eachCell((cell) => {
        cell.numFmt = TEXT_NUMBER_FORMAT;
      });
      row.commit();
    }
    sheet.commit();
  }
  await workbook.commit();
  await finished;
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Escritura tipada en streaming (exportación de reportes, 05 F-39)
// ---------------------------------------------------------------------------

/** Límite de precisión de un número de Excel (IEEE 754 doble). */
export const MAX_EXCEL_SIGNIFICANT_DIGITS = 15;

/** Formatos numéricos y de fecha (RN-05.47). */
export const XLSX_FORMATS = {
  text: '@',
  integer: '0',
  quantity: '#,##0.0000',
  tonnage: '#,##0.000',
  amount: '#,##0.00',
  exchangeRate: '#,##0.00000000',
  percent: '0.00 %',
  date: 'dd/mm/yyyy',
  dateTime: 'dd/mm/yyyy hh:mm',
} as const;

/** Celda tipada. `null` = celda vacía. */
export type XlsxCell =
  | { readonly type: 'text'; readonly value: string | null }
  | { readonly type: 'number'; readonly value: DecimalString | number | null; readonly format: string }
  /** Puntos porcentuales (`'45.00'` = 45 %); se escribe como fracción (0,45) con `0.00 %`. */
  | { readonly type: 'percent'; readonly value: DecimalString | null }
  | { readonly type: 'date'; readonly value: CalendarDate | null }
  | { readonly type: 'dateTime'; readonly value: Date | null };

export const xlsxCell = {
  text: (value: string | null | undefined): XlsxCell => ({ type: 'text', value: value ?? null }),
  number: (value: DecimalString | number | null | undefined, format: string): XlsxCell => ({ type: 'number', value: value ?? null, format }),
  integer: (value: number | null | undefined): XlsxCell => ({ type: 'number', value: value ?? null, format: XLSX_FORMATS.integer }),
  percent: (value: DecimalString | null | undefined): XlsxCell => ({ type: 'percent', value: value ?? null }),
  date: (value: CalendarDate | null | undefined): XlsxCell => ({ type: 'date', value: value ?? null }),
  dateTime: (value: Date | null | undefined): XlsxCell => ({ type: 'dateTime', value: value ?? null }),
} as const;

/** Dígitos significativos de un decimal en texto (`'0012.3400'` → 4). */
export function significantDigits(value: string): number {
  const unsigned = value.trim().replace(/^[-+]/, '');
  const [integerPart = '', fractionPart = ''] = unsigned.split('.');
  const integer = integerPart.replace(/^0+/, '');
  const fraction = fractionPart.replace(/0+$/, '');
  if (integer.length > 0) return integer.length + fraction.length;
  return fraction.replace(/^0+/, '').length;
}

/**
 * Instante → fecha "de pared" en `timeZone`, expresada como UTC (Excel guarda la fecha
 * sin zona y `exceljs` la serializa con los componentes UTC).
 */
export function toExcelWallClock(at: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((entry) => entry.type === type)?.value);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')));
}

function calendarDateToExcel(value: CalendarDate): Date {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

interface ResolvedCell {
  readonly value: string | number | Date | null;
  readonly numFmt: string | undefined;
}

export interface XlsxSheetOptions {
  /** Anchos de columna (caracteres); por defecto, según el encabezado. */
  readonly widths?: readonly number[];
  /** Encabezados en negrita, fila congelada y autofiltro (por defecto `true`). */
  readonly headerRow?: boolean;
}

/** Hoja abierta del libro en *streaming*: las filas se confirman al añadirlas. */
export interface XlsxSheetWriter {
  addRow(cells: readonly XlsxCell[]): void;
  /** Cierra la hoja (obligatorio antes de abrir la siguiente). */
  commit(): void;
}

type StreamWorksheet = ReturnType<ExcelJS.stream.xlsx.WorkbookWriter['addWorksheet']>;

/**
 * Libro XLSX escrito en *streaming* hacia `output`. Uso: `addSheet(...)` → `addRow(...)`
 * por fila → `commit()` de la hoja → siguiente hoja → `finish()`.
 */
export class XlsxStreamWriter {
  private readonly workbook: ExcelJS.stream.xlsx.WorkbookWriter;
  private fallbacks = 0;

  constructor(
    output: Writable,
    private readonly timeZone: string,
  ) {
    this.workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: true, useSharedStrings: false });
    this.workbook.creator = 'Mi Cliente AG';
  }

  /** Números escritos como texto por superar 15 dígitos significativos (RN-05.49). */
  get textFallbacks(): number {
    return this.fallbacks;
  }

  addSheet(name: string, headers: readonly string[], options: XlsxSheetOptions = {}): XlsxSheetWriter {
    const headerRow = options.headerRow !== false;
    const worksheet: StreamWorksheet = this.workbook.addWorksheet(name, headerRow ? { views: [{ state: 'frozen', ySplit: 1 }] } : {});
    worksheet.columns = headers.map((header, index) => ({ width: options.widths?.[index] ?? Math.min(Math.max(header.length + 4, 12), 60) }));
    if (headerRow && headers.length > 0) {
      worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
      const row = worksheet.addRow(headers.map((header) => neutralizeFormula(header)));
      row.font = { bold: true };
      row.commit();
    }
    return {
      addRow: (cells) => {
        const resolved = cells.map((cell) => this.resolve(cell));
        const row = worksheet.addRow(resolved.map((cell) => cell.value));
        resolved.forEach((cell, index) => {
          if (cell.numFmt !== undefined && cell.value !== null) row.getCell(index + 1).numFmt = cell.numFmt;
        });
        row.commit();
      },
      commit: () => worksheet.commit(),
    };
  }

  /** Cierra el libro y termina de escribir en `output`. */
  async finish(): Promise<void> {
    await this.workbook.commit();
  }

  private resolve(cell: XlsxCell): ResolvedCell {
    if (cell.value === null) return { value: null, numFmt: undefined };
    switch (cell.type) {
      case 'text':
        return { value: neutralizeFormula(cell.value), numFmt: XLSX_FORMATS.text };
      case 'number':
        return this.numeric(cell.value, cell.format, 1);
      case 'percent':
        return this.numeric(cell.value, XLSX_FORMATS.percent, 100);
      case 'date':
        return { value: calendarDateToExcel(cell.value), numFmt: XLSX_FORMATS.date };
      case 'dateTime':
        return { value: toExcelWallClock(cell.value, this.timeZone), numFmt: XLSX_FORMATS.dateTime };
    }
  }

  private numeric(value: DecimalString | number, format: string, divisor: number): ResolvedCell {
    const text = typeof value === 'number' ? String(value) : value;
    if (significantDigits(text) > MAX_EXCEL_SIGNIFICANT_DIGITS) {
      this.fallbacks += 1;
      return { value: neutralizeFormula(text), numFmt: XLSX_FORMATS.text };
    }
    return { value: Number(text) / divisor, numFmt: format };
  }
}
