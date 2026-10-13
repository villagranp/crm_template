/**
 * Generación de CSV para exportaciones (PLAN-ADMIN, D13).
 *
 * Además del escapado normal, neutraliza la inyección de fórmulas: una celda
 * que empieza por `=`, `+`, `-`, `@`, tabulador o retorno de carro la ejecuta
 * Excel como fórmula al abrir el archivo. Se antepone un apóstrofo, que Excel
 * muestra como texto.
 *
 * Empieza con BOM para que Excel detecte UTF-8 (acentos y eñes).
 */

export interface CsvColumn<TRow> {
  header: string;
  value: (row: TRow) => string | number | boolean | Date | null | undefined;
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Neutraliza un texto que una hoja de cálculo ejecutaría como fórmula
 * (apóstrofo delante). La reutiliza el escritor XLSX (`xlsx.ts`, ADR-022): CSV y
 * XLSX aplican la misma regla.
 */
export function neutralizeFormula(text: string): string {
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

function cell(raw: string | number | boolean | Date | null | undefined): string {
  if (raw === null || raw === undefined) {
    return '';
  }
  let text = raw instanceof Date ? raw.toISOString() : String(raw);
  if (typeof raw === 'string') {
    text = neutralizeFormula(text);
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<TRow>(rows: readonly TRow[], columns: readonly CsvColumn<TRow>[]): string {
  const lines = [
    columns.map((column) => cell(column.header)).join(','),
    ...rows.map((row) => columns.map((column) => cell(column.value(row))).join(',')),
  ];
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Cabecera con la que una exportación avisa de que se cortó en `MAX_EXPORT_ROWS`. */
export const EXPORT_TRUNCATED_HEADER = 'X-Export-Truncated';

/** Tope de filas de una exportación: evita volcados masivos de datos personales. */
export const MAX_EXPORT_ROWS = 10_000;
