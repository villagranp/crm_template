import type { XlsxCellValue } from '@/common/xlsx';
import type { CustomerDraft } from '@/modules/customers/customer-validation.service';
import { startsWithFormula } from '@/modules/customers/customer-normalization';

import { IMPORT_ISSUE_CODES, importIssue, type StoredImportIssue } from './import-issues';
import { IMPORT_COLUMNS, type ImportColumnKey } from './import-template';

/**
 * Lectura de celdas como texto (06 RN-06.11): recorte de espacios (incluido el
 * espacio duro), cadena vacía = ausente, enteros sin decimales ni notación
 * científica, fórmulas, fechas, booleanos y errores de celda como incidencias.
 * Las incidencias nunca repiten el valor.
 */

const EDGE_SPACES = /^[\s\u00a0\ufeff]+|[\s\u00a0\ufeff]+$/g;

/**
 * Apóstrofo que añade la neutralización del archivo de errores (`csv.ts`,
 * RN-06.26) delante de `=`, `+`, `-`, `@`, tabulador o CR: se quita al leer para
 * que el archivo corregido se pueda volver a subir (AC-06.20). Tras quitarlo, la
 * regla de fórmulas se aplica igual.
 */
const NEUTRALIZED_PREFIX = /^'(?=[=+\-@\t\r])/;

/**
 * Lo que el saneamiento necesita de una columna. `ImportColumn` lo cumple; la carga inicial por
 * scripts (`initial-data-load`) lo reutiliza con sus propias columnas.
 */
export interface SanitizableColumn {
  readonly key: string;
  readonly maxLength: number | null;
  readonly kind: 'code' | 'text';
  readonly isFreeText: boolean;
}

export interface SanitizedCell {
  /**
   * Texto leído. Se conserva aunque tenga una incidencia de texto (empieza por
   * `=`, longitud), para que el archivo de errores muestre qué corregir (se
   * neutraliza al escribirlo). `null` si está vacía o si no hay texto fiable que
   * conservar: una fórmula real (ni ella ni su valor en caché), una fecha, un
   * booleano, un error de celda o un decimal en una columna de código.
   */
  readonly value: string | null;
  readonly issue: StoredImportIssue | null;
}

function cellIssue(column: SanitizableColumn, code: string, value: string | null = null): SanitizedCell {
  return { value, issue: importIssue(column.key, code) };
}

function sanitizeText(column: SanitizableColumn, input: string): SanitizedCell {
  const raw = input.replace(NEUTRALIZED_PREFIX, '');
  const value = raw.replace(EDGE_SPACES, '');
  // La regla de fórmulas mira el valor crudo (el tabulador inicial es justo lo que se busca, 02 RN-02.32).
  if (column.isFreeText && startsWithFormula(raw)) return cellIssue(column, IMPORT_ISSUE_CODES.formulaNotAllowed, value || null);
  if (value === '') return { value: null, issue: null };
  if (column.maxLength !== null && [...value].length > column.maxLength) return cellIssue(column, IMPORT_ISSUE_CODES.maxLength, value);
  return { value, issue: null };
}

function sanitizeNumber(column: SanitizableColumn, value: number): SanitizedCell {
  if (Number.isInteger(value)) {
    // Un entero mayor que 2^53 ya perdió dígitos en Excel: no se puede leer como texto fiable.
    if (!Number.isSafeInteger(value)) return cellIssue(column, IMPORT_ISSUE_CODES.invalidCellType);
    return sanitizeText(column, BigInt(value).toString());
  }
  if (column.kind === 'code') return cellIssue(column, IMPORT_ISSUE_CODES.invalidCellType);
  return sanitizeText(column, String(value));
}

export function sanitizeCell(column: SanitizableColumn, cell: XlsxCellValue): SanitizedCell {
  switch (cell.kind) {
    case 'empty':
      return { value: null, issue: null };
    case 'text':
      return sanitizeText(column, cell.text);
    case 'number':
      return sanitizeNumber(column, cell.value);
    case 'formula':
      return cellIssue(column, IMPORT_ISSUE_CODES.formulaNotAllowed);
    default:
      return cellIssue(column, IMPORT_ISSUE_CODES.invalidCellType);
  }
}

export type ImportRowValues = Readonly<Record<ImportColumnKey, string | null>>;

export interface SanitizedRow {
  readonly values: ImportRowValues;
  readonly issues: readonly StoredImportIssue[];
}

/** Fila del archivo → valores por columna e incidencias de celda. */
export function sanitizeRow(cells: readonly XlsxCellValue[], columnIndexes: ReadonlyMap<ImportColumnKey, number>): SanitizedRow {
  const values = {} as Record<ImportColumnKey, string | null>;
  const issues: StoredImportIssue[] = [];
  for (const column of IMPORT_COLUMNS) {
    const index = columnIndexes.get(column.key);
    const cell = index === undefined ? undefined : cells[index];
    const result = sanitizeCell(column, cell ?? { kind: 'empty' });
    values[column.key] = result.value;
    if (result.issue) issues.push(result.issue);
  }
  return { values, issues };
}

/** Borrador del Módulo 2 (modo `BY_NATURAL_KEY`) a partir de los valores leídos (RN-06.12). */
export function toCustomerDraft(values: ImportRowValues): CustomerDraft {
  return { ...values };
}

/** Valores guardados en `raw_data` (sin confiar en su forma: filas purgadas o antiguas). */
export function parseRowValues(value: unknown): ImportRowValues | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length === 0) return null;
  const values = {} as Record<ImportColumnKey, string | null>;
  for (const column of IMPORT_COLUMNS) {
    const current = record[column.key];
    values[column.key] = typeof current === 'string' ? current : null;
  }
  return values;
}
