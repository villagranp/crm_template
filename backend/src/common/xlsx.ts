import type { Writable } from 'node:stream';

import { stream as excelStream } from 'exceljs';

import type { CalendarDate } from './calendar-date';
import { neutralizeFormula } from './csv';
import type { DecimalString } from './decimal';

/**
 * Envoltorio de `exceljs` (ADR-022): **ninguna otra pieza de producción importa la
 * librería**. Solo escritura, en *streaming* (`stream.xlsx.WorkbookWriter`): cada fila
 * se confirma y sale hacia el `Writable` (la respuesta HTTP) sin construir el libro en
 * memoria. La lectura de archivos no confiables (carga masiva, 06) se añadirá aquí con
 * sus guardas.
 *
 * Reglas (05 RN-05.47, RN-05.49):
 *
 * - **Sin fórmulas**: ninguna celda se escribe como fórmula; todo texto es celda de
 *   texto (formato `@`) y pasa por la neutralización de `common/csv.ts` (apóstrofo
 *   delante de `=`, `+`, `-`, `@`, tabulador y CR).
 * - Celdas **tipadas**: números con su formato, fechas como fecha de Excel, porcentajes
 *   como fracción. Los instantes se convierten a la hora local de `timeZone` (Excel no
 *   tiene zonas horarias; la hoja "Filtros" la indica).
 * - Un número con más de 15 dígitos significativos (precisión de Excel) se escribe como
 *   texto y se cuenta en `textFallbacks` para avisarlo en la hoja "Filtros".
 */

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

type StreamWorksheet = ReturnType<excelStream.xlsx.WorkbookWriter['addWorksheet']>;

/**
 * Libro XLSX escrito en *streaming* hacia `output`. Uso: `addSheet(...)` → `addRow(...)`
 * por fila → `commit()` de la hoja → siguiente hoja → `finish()`.
 */
export class XlsxStreamWriter {
  private readonly workbook: excelStream.xlsx.WorkbookWriter;
  private fallbacks = 0;

  constructor(
    output: Writable,
    private readonly timeZone: string,
  ) {
    this.workbook = new excelStream.xlsx.WorkbookWriter({ stream: output, useStyles: true, useSharedStrings: false });
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
