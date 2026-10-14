import {
  BusinessRuleViolationError,
  PayloadTooLargeError,
  ResourceConflictError,
  ResourceNotFoundError,
  UnsupportedMediaTypeError,
} from '@/common/errors/application-error';

/** Códigos de error HTTP del Módulo 6 (06 F.1, L.7 de `docs/api/README.md`). */
export const IMPORT_ERROR_CODES = {
  importsDisabled: 'IMPORTS_DISABLED',
  importInProgress: 'IMPORT_IN_PROGRESS',
  invalidImportFile: 'INVALID_IMPORT_FILE',
  fileTooLarge: 'FILE_TOO_LARGE',
  unsupportedFileType: 'UNSUPPORTED_FILE_TYPE',
  invalidImportStatus: 'INVALID_IMPORT_STATUS',
  importChanged: 'IMPORT_CHANGED',
  noValidRows: 'NO_VALID_ROWS',
  importDataPurged: 'IMPORT_DATA_PURGED',
} as const;

export const CUSTOMER_IMPORT_RESOURCE = 'CustomerImport';
export const IMPORT_FILE_FIELD = 'file';

/** `issue` de `422 INVALID_IMPORT_FILE` (06 F.1 §3; `TOO_MANY_COLUMNS`, `UNSAFE_CONTENT` y `UNREADABLE_FILE`: precisiones de implementación). */
export type ImportFileIssue =
  | 'MISSING_COLUMN'
  | 'UNKNOWN_COLUMN'
  | 'DUPLICATE_COLUMN'
  | 'TOO_MANY_COLUMNS'
  | 'EMPTY_FILE'
  | 'NO_DATA_ROWS'
  | 'TOO_MANY_ROWS'
  | 'INVALID_ENCODING'
  | 'MALFORMED_CSV'
  | 'SHEET_NOT_FOUND'
  | 'ARCHIVE_LIMITS_EXCEEDED'
  | 'UNSAFE_CONTENT'
  | 'UNREADABLE_FILE'
  | 'PARSE_TIMEOUT';

export interface ImportFileProblem {
  readonly field: 'file' | 'columns' | 'rows';
  readonly issue: ImportFileIssue;
  readonly column?: string;
}

const FIELD_BY_ISSUE: Readonly<Record<ImportFileIssue, ImportFileProblem['field']>> = {
  MISSING_COLUMN: 'columns',
  UNKNOWN_COLUMN: 'columns',
  DUPLICATE_COLUMN: 'columns',
  TOO_MANY_COLUMNS: 'columns',
  EMPTY_FILE: 'file',
  NO_DATA_ROWS: 'rows',
  TOO_MANY_ROWS: 'rows',
  INVALID_ENCODING: 'file',
  MALFORMED_CSV: 'file',
  SHEET_NOT_FOUND: 'file',
  ARCHIVE_LIMITS_EXCEEDED: 'file',
  UNSAFE_CONTENT: 'file',
  UNREADABLE_FILE: 'file',
  PARSE_TIMEOUT: 'file',
};

/** Encabezado del archivo citado en la respuesta: acotado (es texto del usuario). */
const MAX_COLUMN_LABEL = 100;

export function fileProblem(issue: ImportFileIssue, column?: string): ImportFileProblem {
  return { field: FIELD_BY_ISSUE[issue], issue, ...(column !== undefined ? { column: column.slice(0, MAX_COLUMN_LABEL) } : {}) };
}

/** Estructura inválida detectada al leer (se convierte en `422` tras registrar la carga como `FAILED`). */
export class InvalidImportFileError extends Error {
  constructor(readonly problems: readonly ImportFileProblem[]) {
    super(`Invalid import file: ${problems.map((problem) => problem.issue).join(', ')}`);
    this.name = 'InvalidImportFileError';
  }
}

/** Tipo real no admitido (`415`), antes de registrar la carga. `reason` va al log, nunca al cliente. */
export class UnsupportedImportFileError extends Error {
  constructor(readonly reason: string) {
    super(`Unsupported import file: ${reason}`);
    this.name = 'UnsupportedImportFileError';
  }
}

/**
 * `failureReason` legible de un fallo de estructura (`MISSING_COLUMN: Razón social`).
 * Solo cita encabezados de la plantilla, nunca texto del archivo (06 D.1).
 */
export function structureFailureReason(problems: readonly ImportFileProblem[], templateHeaders: ReadonlySet<string>): string {
  return problems
    .map((problem) => (problem.column && templateHeaders.has(problem.column) ? `${problem.issue}: ${problem.column}` : problem.issue))
    .join('; ')
    .slice(0, 500);
}

export function importsDisabledError(): ResourceConflictError {
  return new ResourceConflictError('Bulk customer import is not enabled in this environment', [], IMPORT_ERROR_CODES.importsDisabled);
}

export function importInProgressError(): ResourceConflictError {
  return new ResourceConflictError('The user already has an import being validated or imported', [], IMPORT_ERROR_CODES.importInProgress);
}

export function invalidImportFileError(problems: readonly ImportFileProblem[]): BusinessRuleViolationError {
  return new BusinessRuleViolationError(
    IMPORT_ERROR_CODES.invalidImportFile,
    'The file structure is not valid',
    problems.map((problem) => ({ ...problem })),
  );
}

export function fileTooLargeError(maxBytes: number): PayloadTooLargeError {
  return new PayloadTooLargeError(IMPORT_ERROR_CODES.fileTooLarge, 'The file exceeds the maximum allowed size', [
    { field: IMPORT_FILE_FIELD, maxBytes },
  ]);
}

export function unsupportedFileTypeError(): UnsupportedMediaTypeError {
  return new UnsupportedMediaTypeError(IMPORT_ERROR_CODES.unsupportedFileType, 'Only CSV (UTF-8) and XLSX files without macros are accepted', [
    { field: IMPORT_FILE_FIELD, allowedFormats: ['CSV', 'XLSX'] },
  ]);
}

export function invalidImportStatusError(status: string): ResourceConflictError {
  return new ResourceConflictError('The import is not in a status that allows this operation', [{ field: 'status', status }], IMPORT_ERROR_CODES.invalidImportStatus);
}

export function importChangedError(validRows: number): ResourceConflictError {
  return new ResourceConflictError('The import changed since it was displayed', [{ field: 'expectedValidRows', validRows }], IMPORT_ERROR_CODES.importChanged);
}

export function noValidRowsError(): BusinessRuleViolationError {
  return new BusinessRuleViolationError(IMPORT_ERROR_CODES.noValidRows, 'The import has no valid rows to import');
}

export function importDataPurgedError(): ResourceConflictError {
  return new ResourceConflictError('The row data of this import was purged by the retention policy', [], IMPORT_ERROR_CODES.importDataPurged);
}

export function importNotFound(importId: string): ResourceNotFoundError {
  return new ResourceNotFoundError(CUSTOMER_IMPORT_RESOURCE, importId);
}

export function errorFileNotFound(importId: string): ResourceNotFoundError {
  return new ResourceNotFoundError('CustomerImportErrorFile', importId);
}
