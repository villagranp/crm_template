import { CsvReadError, readCsv } from '@/common/csv-reader';
import { readSheetRows, type XlsxCellValue, XlsxReadError } from '@/common/xlsx';

import { fileProblem, type ImportFileIssue, type ImportFileProblem, InvalidImportFileError, UnsupportedImportFileError } from './customer-import-errors';
import { detectImportFileType, type ImportFileFormat } from './file-signature';
import { type ImportColumnKey, matchHeaders } from './import-template';
import { ArchiveRejectedError, DEFAULT_ARCHIVE_LIMITS, inspectXlsxArchive } from './xlsx-archive-guard';

/**
 * Lectura y validación de estructura del archivo (06 RN-06.7–RN-06.11,
 * RN-06.31), en este orden obligatorio: tipo real por firma → (XLSX) guardia ZIP
 * → lector (CSV propio o `exceljs` vía `common/xlsx.ts`) → encabezados. No toca
 * la base: el servicio decide si registrar la carga.
 *
 * Errores: `UnsupportedImportFileError` (→ `415`, sin registro) o
 * `InvalidImportFileError` (→ `422`, la carga queda `FAILED`).
 */

export interface ImportReadLimits {
  /** Filas de datos efectivas (RN-06.7). */
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly parseTimeoutMs: number;
}

export const IMPORT_MAX_COLUMNS = 30;
export const IMPORT_PARSE_TIMEOUT_MS = 20_000;
/** Hoja de datos de la plantilla (RN-06.6, RN-06.9). */
export const DATA_SHEET_NAME = 'Clientes';

export interface ImportUpload {
  readonly buffer: Buffer;
  readonly originalName: string;
  readonly mimeType: string | undefined;
}

export interface ParsedImportRow {
  readonly rowNumber: number;
  readonly cells: readonly XlsxCellValue[];
}

export interface ParsedImportFile {
  readonly format: ImportFileFormat;
  readonly columnIndexes: ReadonlyMap<ImportColumnKey, number>;
  readonly rows: readonly ParsedImportRow[];
}

/** Lo que necesita el servicio para registrar una carga aunque su estructura sea inválida. */
export type ImportReadResult =
  | { readonly ok: true; readonly file: ParsedImportFile }
  | { readonly ok: false; readonly format: ImportFileFormat; readonly problems: readonly ImportFileProblem[] };

/** Tipo real del archivo; lanza `UnsupportedImportFileError` si no se admite. */
export function detectFormat(upload: ImportUpload): ImportFileFormat {
  const detected = detectImportFileType(upload.buffer, upload.originalName, upload.mimeType);
  if (!detected.ok) throw new UnsupportedImportFileError(detected.reason);
  return detected.format;
}

function headerText(cell: XlsxCellValue): string {
  if (cell.kind === 'text') return cell.text;
  if (cell.kind === 'number') return String(cell.value);
  return '';
}

const CSV_ISSUES: Readonly<Record<CsvReadError['issue'], ImportFileIssue>> = {
  EMPTY_FILE: 'EMPTY_FILE',
  INVALID_ENCODING: 'INVALID_ENCODING',
  MALFORMED_CSV: 'MALFORMED_CSV',
  TOO_MANY_ROWS: 'TOO_MANY_ROWS',
};

const XLSX_ISSUES: Readonly<Record<XlsxReadError['issue'], ImportFileIssue>> = {
  SHEET_NOT_FOUND: 'SHEET_NOT_FOUND',
  TOO_MANY_ROWS: 'TOO_MANY_ROWS',
  TOO_MANY_COLUMNS: 'TOO_MANY_COLUMNS',
  PARSE_TIMEOUT: 'PARSE_TIMEOUT',
  UNREADABLE: 'UNREADABLE_FILE',
};

async function readCells(
  format: ImportFileFormat,
  buffer: Buffer,
  limits: ImportReadLimits,
): Promise<{ headers: string[]; rows: ParsedImportRow[] }> {
  if (format === 'CSV') {
    const csv = readCsv(buffer, { maxRows: limits.maxRows, maxColumns: limits.maxColumns });
    return {
      headers: [...csv.headers],
      rows: csv.rows.map((row) => ({ rowNumber: row.rowNumber, cells: row.cells.map((text): XlsxCellValue => ({ kind: 'text', text })) })),
    };
  }
  // La guardia ZIP SIEMPRE antes de entregar el archivo a la librería (RN-06.31).
  inspectXlsxArchive(buffer, { ...DEFAULT_ARCHIVE_LIMITS, maxColumns: limits.maxColumns, maxDataRows: limits.maxRows });
  const sheet = await readSheetRows(buffer, {
    preferredSheet: DATA_SHEET_NAME,
    maxRows: limits.maxRows,
    maxColumns: limits.maxColumns,
    timeoutMs: limits.parseTimeoutMs,
  });
  return { headers: sheet.headers.map(headerText), rows: [...sheet.rows] };
}

/**
 * Lee el archivo. El tipo ya se detectó con `detectFormat` (el servicio lo hace
 * antes, para no registrar un `415`).
 */
export async function readImportFile(upload: ImportUpload, format: ImportFileFormat, limits: ImportReadLimits): Promise<ImportReadResult> {
  const invalid = (problems: readonly ImportFileProblem[]): ImportReadResult => ({ ok: false, format, problems });
  if (upload.buffer.length === 0) return invalid([fileProblem('EMPTY_FILE')]);

  let content: { headers: string[]; rows: ParsedImportRow[] };
  try {
    content = await readCells(format, upload.buffer, limits);
  } catch (error) {
    if (error instanceof CsvReadError) {
      return invalid([fileProblem(error.reason === 'TOO_MANY_COLUMNS' ? 'TOO_MANY_COLUMNS' : CSV_ISSUES[error.issue])]);
    }
    if (error instanceof XlsxReadError) return invalid([fileProblem(XLSX_ISSUES[error.issue])]);
    if (error instanceof ArchiveRejectedError) {
      if (error.rejection.kind === 'UNSUPPORTED') throw new UnsupportedImportFileError(error.rejection.reason);
      return invalid([fileProblem(error.rejection.issue)]);
    }
    throw error;
  }

  const match = matchHeaders(content.headers);
  if (!match.ok) return invalid(match.issues.map((issue) => fileProblem(issue.issue, issue.column)));
  if (content.rows.length === 0) return invalid([fileProblem('NO_DATA_ROWS')]);
  return { ok: true, file: { format, columnIndexes: match.columnIndexes, rows: content.rows } };
}

export { InvalidImportFileError };
