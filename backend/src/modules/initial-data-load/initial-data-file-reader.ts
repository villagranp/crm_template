import { CsvReadError, readCsv } from '@/common/csv-reader';
import { readSheetRows, type XlsxCellValue, XlsxReadError } from '@/common/xlsx';
import { detectImportFileType, type FileTypeRejection, type ImportFileFormat } from '@/modules/customer-imports/file-signature';
import { normalizeHeader } from '@/modules/customer-imports/import-template';
import { ArchiveRejectedError, DEFAULT_ARCHIVE_LIMITS, inspectXlsxArchive } from '@/modules/customer-imports/xlsx-archive-guard';

import type { ReportEntry } from './initial-data-report';
import { type EntityDefinition, type LoadSheet, type SheetId } from './initial-data-templates';

/**
 * Lectura segura del archivo de la carga inicial, en el orden de la carga masiva de clientes
 * (06 RN-06.7–RN-06.11, RN-06.31): tipo real por firma → (XLSX) guardia ZIP → lector (CSV propio o
 * `exceljs` vía `common/xlsx.ts`) → encabezados. Un archivo con columnas que faltan, que sobran o
 * repetidas se rechaza completo. No toca la base ni escribe nada.
 */

export interface LoadReadLimits {
  /** Filas de datos entre todas las hojas del archivo. */
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly parseTimeoutMs: number;
}

/** Valores por defecto, los mismos de la carga masiva de clientes (`crm.importaciones.*`). */
export const LOAD_MAX_ROWS = 5000;
export const LOAD_MAX_COLUMNS = 30;
export const LOAD_PARSE_TIMEOUT_MS = 20_000;
/** Tamaño máximo del archivo (10 MiB, `crm.importaciones.max_mb`). */
export const LOAD_MAX_FILE_BYTES = 10 * 1024 * 1024;

export const DEFAULT_READ_LIMITS: LoadReadLimits = { maxRows: LOAD_MAX_ROWS, maxColumns: LOAD_MAX_COLUMNS, parseTimeoutMs: LOAD_PARSE_TIMEOUT_MS };

export interface LoadFile {
  readonly fileName: string;
  readonly buffer: Buffer;
}

/** XLSX: un libro con todas las hojas. CSV: un archivo por hoja (las hojas opcionales pueden faltar). */
export type LoadSource =
  | { readonly format: 'XLSX'; readonly file: LoadFile }
  | { readonly format: 'CSV'; readonly files: Readonly<Partial<Record<SheetId, LoadFile>>> };

export interface ParsedRow {
  /** Fila del archivo: la del encabezado es 1 y la primera de datos es 2. */
  readonly fileRow: number;
  readonly cells: readonly XlsxCellValue[];
}

export interface ParsedSheet {
  readonly sheet: LoadSheet;
  /** Clave de la columna → posición en el archivo. */
  readonly columnIndexes: ReadonlyMap<string, number>;
  readonly rows: readonly ParsedRow[];
}

export type LoadReadResult =
  | { readonly ok: true; readonly sheets: readonly ParsedSheet[] }
  | { readonly ok: false; readonly problems: readonly ReportEntry[] };

function problem(sheet: string | null, column: string | null, code: string, message: string): ReportEntry {
  return { sheet, row: null, column, status: 'ERROR', code, message };
}

const REJECTION_MESSAGES: Readonly<Record<FileTypeRejection, string>> = {
  UNSUPPORTED_EXTENSION: 'Solo se admiten archivos .csv y .xlsx.',
  OLE_CONTAINER: 'El archivo es un Excel antiguo (.xls) o un libro cifrado: guárdelo como .xlsx sin contraseña.',
  SIGNATURE_MISMATCH: 'El contenido del archivo no corresponde a un .xlsx.',
  BINARY_CONTENT: 'El contenido del archivo no es texto CSV.',
  CONTENT_TYPE_MISMATCH: 'El tipo del archivo no es el esperado.',
};

const XLSX_PROBLEMS: Readonly<Record<XlsxReadError['issue'], { code: string; message: string }>> = {
  SHEET_NOT_FOUND: { code: 'SHEET_NOT_FOUND', message: 'El libro no tiene la hoja de datos con el nombre de la plantilla.' },
  TOO_MANY_ROWS: { code: 'TOO_MANY_ROWS', message: 'El archivo supera el máximo de filas.' },
  TOO_MANY_COLUMNS: { code: 'TOO_MANY_COLUMNS', message: 'La hoja tiene más columnas de las admitidas.' },
  PARSE_TIMEOUT: { code: 'PARSE_TIMEOUT', message: 'La lectura del archivo tardó demasiado y se canceló.' },
  UNREADABLE: { code: 'UNREADABLE_FILE', message: 'No se pudo leer el archivo: está dañado o no es un libro de Excel válido.' },
};

const CSV_PROBLEMS: Readonly<Record<CsvReadError['issue'], { code: string; message: string }>> = {
  EMPTY_FILE: { code: 'EMPTY_FILE', message: 'El archivo está vacío.' },
  INVALID_ENCODING: { code: 'INVALID_ENCODING', message: 'El archivo CSV debe estar codificado en UTF-8.' },
  MALFORMED_CSV: { code: 'MALFORMED_CSV', message: 'El archivo CSV está mal formado (comillas sin cerrar o filas con distinto número de columnas).' },
  TOO_MANY_ROWS: { code: 'TOO_MANY_ROWS', message: 'El archivo supera el máximo de filas.' },
};

function headerText(cell: XlsxCellValue): string {
  if (cell.kind === 'text') return cell.text;
  if (cell.kind === 'number') return String(cell.value);
  return '';
}

/** Encabezado tal como vino en el archivo, recortado y sin saltos de línea, para citarlo en el informe. */
function quotedHeader(raw: string): string {
  return raw.replace(/[\r\n\t]+/g, ' ').slice(0, 60);
}

/**
 * Asigna cada encabezado a su columna (orden libre). Toda columna de la plantilla es obligatoria
 * **en el archivo** aunque el campo sea opcional: una columna desplazada asignaría datos al campo
 * equivocado. Se ignoran los encabezados vacíos del final.
 */
export function matchSheetHeaders(sheet: LoadSheet, headers: readonly string[]): { readonly columnIndexes: Map<string, number>; readonly problems: ReportEntry[] } {
  const problems: ReportEntry[] = [];
  const columnIndexes = new Map<string, number>();
  const byHeader = new Map(sheet.columns.map((column) => [normalizeHeader(column.header), column]));
  const seenUnknown = new Set<string>();
  let last = headers.length - 1;
  while (last >= 0 && (headers[last] ?? '').trim() === '') last -= 1;

  for (let index = 0; index <= last; index += 1) {
    const raw = (headers[index] ?? '').replace(/^[\s ﻿]+|[\s ﻿]+$/g, '');
    const normalized = normalizeHeader(raw);
    const column = byHeader.get(normalized);
    if (!column) {
      if (seenUnknown.has(normalized)) {
        problems.push(problem(sheet.sheetName, quotedHeader(raw), 'DUPLICATE_COLUMN', 'La columna está repetida.'));
      } else {
        problems.push(problem(sheet.sheetName, quotedHeader(raw) || '(sin nombre)', 'UNKNOWN_COLUMN', 'La columna no pertenece a la plantilla.'));
      }
      seenUnknown.add(normalized);
    } else if (columnIndexes.has(column.key)) {
      problems.push(problem(sheet.sheetName, column.header, 'DUPLICATE_COLUMN', 'La columna está repetida.'));
    } else {
      columnIndexes.set(column.key, index);
    }
  }
  for (const column of sheet.columns) {
    if (!columnIndexes.has(column.key)) problems.push(problem(sheet.sheetName, column.header, 'MISSING_COLUMN', 'Falta la columna de la plantilla.'));
  }
  return { columnIndexes, problems };
}

interface RawSheet {
  readonly headers: readonly string[];
  readonly rows: readonly ParsedRow[];
}

function detect(file: LoadFile, expected: ImportFileFormat): ReportEntry | null {
  const detected = detectImportFileType(file.buffer, file.fileName, undefined);
  if (!detected.ok) return problem(null, null, 'UNSUPPORTED_FILE_TYPE', REJECTION_MESSAGES[detected.reason]);
  if (detected.format !== expected) return problem(null, null, 'UNSUPPORTED_FILE_TYPE', REJECTION_MESSAGES.UNSUPPORTED_EXTENSION);
  return null;
}

function readCsvSheet(file: LoadFile, limits: LoadReadLimits): RawSheet {
  const csv = readCsv(file.buffer, { maxRows: limits.maxRows, maxColumns: limits.maxColumns });
  return {
    headers: csv.headers,
    rows: csv.rows.map((row) => ({ fileRow: row.rowNumber + 1, cells: row.cells.map((text): XlsxCellValue => ({ kind: 'text', text })) })),
  };
}

async function readXlsxSheet(file: LoadFile, sheet: LoadSheet, limits: LoadReadLimits): Promise<RawSheet> {
  const data = await readSheetRows(file.buffer, {
    preferredSheet: sheet.sheetName,
    exactSheet: true,
    maxRows: limits.maxRows,
    maxColumns: limits.maxColumns,
    timeoutMs: limits.parseTimeoutMs,
  });
  return { headers: data.headers.map(headerText), rows: data.rows.map((row) => ({ fileRow: row.rowNumber + 1, cells: row.cells })) };
}

/** Convierte un error de lectura conocido en incidencias; vuelve a lanzar el que no conoce. */
function readFailure(error: unknown, sheetName: string | null): ReportEntry[] {
  if (error instanceof CsvReadError) {
    const info = CSV_PROBLEMS[error.issue];
    if (error.reason === 'TOO_MANY_COLUMNS') return [problem(sheetName, null, 'TOO_MANY_COLUMNS', 'El archivo tiene más columnas de las admitidas.')];
    return [problem(sheetName, null, info.code, info.message)];
  }
  if (error instanceof XlsxReadError) {
    const info = XLSX_PROBLEMS[error.issue];
    return [problem(sheetName, null, info.code, info.message)];
  }
  if (error instanceof ArchiveRejectedError) {
    const { rejection } = error;
    if (rejection.kind === 'UNSUPPORTED') {
      const reason = rejection.reason === 'MACROS' ? 'El libro contiene macros: guárdelo como .xlsx sin macros.' : rejection.reason === 'ENCRYPTED' ? 'El libro está cifrado.' : REJECTION_MESSAGES.SIGNATURE_MISMATCH;
      return [problem(null, null, 'UNSUPPORTED_FILE_TYPE', reason)];
    }
    const message =
      rejection.issue === 'TOO_MANY_ROWS'
        ? 'El archivo supera el máximo de filas.'
        : rejection.issue === 'UNSAFE_CONTENT'
          ? 'El libro contiene contenido no permitido (enlaces externos, DTD u objetos incrustados).'
          : 'El libro supera los límites de tamaño o de estructura admitidos.';
    return [problem(null, null, rejection.issue, message)];
  }
  throw error;
}

/**
 * Lee todas las hojas de la entidad. Devuelve las incidencias de archivo (nunca de filas) si
 * algo falla: tipo, estructura o encabezados.
 */
export async function readLoadSource(definition: EntityDefinition, source: LoadSource, limits: LoadReadLimits = DEFAULT_READ_LIMITS): Promise<LoadReadResult> {
  const problems: ReportEntry[] = [];
  const raw = new Map<SheetId, RawSheet>();

  if (source.format === 'XLSX') {
    const rejected = detect(source.file, 'XLSX');
    if (rejected) return { ok: false, problems: [rejected] };
    if (source.file.buffer.length === 0) return { ok: false, problems: [problem(null, null, 'EMPTY_FILE', 'El archivo está vacío.')] };
    try {
      // La guardia ZIP SIEMPRE antes de entregar el archivo a la librería (RN-06.31).
      inspectXlsxArchive(source.file.buffer, { ...DEFAULT_ARCHIVE_LIMITS, maxColumns: limits.maxColumns, maxDataRows: limits.maxRows });
    } catch (error) {
      return { ok: false, problems: readFailure(error, null) };
    }
    for (const sheet of definition.sheets) {
      try {
        raw.set(sheet.id, await readXlsxSheet(source.file, sheet, limits));
      } catch (error) {
        problems.push(...readFailure(error, sheet.sheetName));
      }
    }
  } else {
    for (const sheet of definition.sheets) {
      const file = source.files[sheet.id];
      if (!file) {
        if (sheet.optionalInCsv) raw.set(sheet.id, { headers: sheet.columns.map((column) => column.header), rows: [] });
        else problems.push(problem(sheet.sheetName, null, 'FILE_NOT_PROVIDED', 'Falta el archivo CSV de esta hoja.'));
        continue;
      }
      const rejected = detect(file, 'CSV');
      if (rejected) {
        problems.push({ ...rejected, sheet: sheet.sheetName });
        continue;
      }
      if (file.buffer.length === 0) {
        problems.push(problem(sheet.sheetName, null, 'EMPTY_FILE', 'El archivo está vacío.'));
        continue;
      }
      try {
        raw.set(sheet.id, readCsvSheet(file, limits));
      } catch (error) {
        problems.push(...readFailure(error, sheet.sheetName));
      }
    }
  }
  if (problems.length > 0) return { ok: false, problems };

  const sheets: ParsedSheet[] = [];
  let total = 0;
  for (const sheet of definition.sheets) {
    const data = raw.get(sheet.id);
    if (!data) continue;
    const match = matchSheetHeaders(sheet, data.headers);
    problems.push(...match.problems);
    total += data.rows.length;
    sheets.push({ sheet, columnIndexes: match.columnIndexes, rows: data.rows });
  }
  if (problems.length > 0) return { ok: false, problems };
  if (total > limits.maxRows) return { ok: false, problems: [problem(null, null, 'TOO_MANY_ROWS', `El archivo supera el máximo de ${limits.maxRows} filas.`)] };
  if (total === 0) return { ok: false, problems: [problem(null, null, 'NO_DATA_ROWS', 'El archivo no tiene filas de datos.')] };
  return { ok: true, sheets };
}
