import { describeApiError, type ApiErrorView } from '@/lib/api-error-view';
import { ApiError } from '@/services/api/api-error';

import type { CustomerImportSettings } from './customer-imports.api';
import { formatCount, formatMegabytes } from './customer-imports-format';

/**
 * Mensajes en español de los códigos del Módulo 6 (06 §F.1, L.4) y lectura de
 * los `details` de `422 INVALID_IMPORT_FILE`. Se pasan como `overrides` a
 * `describeApiError`; nunca se muestra el `message` del backend. Los mensajes
 * de las incidencias de fila vienen ya en español del servidor y se muestran
 * tal cual.
 */

export const CUSTOMER_IMPORT_ERROR_CODES = {
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

const CODES = CUSTOMER_IMPORT_ERROR_CODES;
const PAYLOAD_TOO_LARGE = 413;
const UNSUPPORTED_MEDIA_TYPE = 415;

export const CUSTOMER_IMPORT_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  [CODES.importsDisabled]: 'La carga masiva no está habilitada en este entorno.',
  [CODES.importInProgress]:
    'Ya tiene una carga validándose o importándose. Espere a que termine antes de subir otra.',
  [CODES.invalidImportFile]: 'El archivo no tiene la estructura de la plantilla.',
  [CODES.fileTooLarge]: 'El archivo supera el tamaño máximo permitido.',
  [CODES.unsupportedFileType]:
    'Solo se admiten archivos CSV (UTF-8) o Excel (.xlsx) sin macros. Los .xls, los libros cifrados y los archivos renombrados no se admiten.',
  [CODES.invalidImportStatus]:
    'La carga ya no está pendiente de confirmar: se confirmó, se canceló o terminó. La pantalla se actualizó.',
  [CODES.importChanged]: 'La carga cambió desde que se mostró. Revise el resumen actualizado y vuelva a confirmar.',
  [CODES.noValidRows]: 'La carga no tiene filas válidas para importar.',
  [CODES.importDataPurged]: 'Los datos de esta carga se eliminaron por la política de retención.',
};

/** `issue` de `422 INVALID_IMPORT_FILE` (backend `customer-import-errors.ts`). */
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

type IssueMessage = (column: string | null, settings: Pick<CustomerImportSettings, 'maxRows'> | undefined) => string;

const FILE_ISSUE_MESSAGES: Readonly<Record<ImportFileIssue, IssueMessage>> = {
  MISSING_COLUMN: (column) => (column ? `Falta la columna obligatoria «${column}».` : 'Falta una columna obligatoria de la plantilla.'),
  UNKNOWN_COLUMN: (column) => (column ? `La columna «${column}» no pertenece a la plantilla.` : 'Hay una columna que no pertenece a la plantilla.'),
  DUPLICATE_COLUMN: (column) => (column ? `La columna «${column}» está repetida.` : 'Hay una columna repetida.'),
  TOO_MANY_COLUMNS: () => 'El archivo tiene más columnas de las que admite la plantilla.',
  EMPTY_FILE: () => 'El archivo está vacío.',
  NO_DATA_ROWS: () => 'El archivo no tiene filas de datos debajo de los encabezados.',
  TOO_MANY_ROWS: (_column, settings) =>
    settings
      ? `El archivo supera el máximo de ${formatCount(settings.maxRows)} filas por carga. Divídalo en varios archivos.`
      : 'El archivo supera el máximo de filas por carga. Divídalo en varios archivos.',
  INVALID_ENCODING: () =>
    'El archivo no está codificado en UTF-8: guarde el CSV como UTF-8 (en Excel, «CSV UTF-8 (delimitado por comas)») y vuelva a subirlo.',
  MALFORMED_CSV: () => 'El CSV está mal formado (por ejemplo, comillas sin cerrar o filas con un número de columnas distinto).',
  SHEET_NOT_FOUND: () => 'El libro no tiene la hoja «Clientes» de la plantilla.',
  ARCHIVE_LIMITS_EXCEEDED: () => 'El archivo Excel supera los límites de seguridad de su contenido comprimido.',
  UNSAFE_CONTENT: () => 'El archivo contiene elementos no permitidos (macros, vínculos externos u otro contenido activo).',
  UNREADABLE_FILE: () => 'No se pudo leer el archivo. Compruebe que no esté dañado y que use la plantilla.',
  PARSE_TIMEOUT: () => 'El archivo tardó demasiado en leerse. Divídalo en archivos más pequeños.',
};

const UNKNOWN_FILE_ISSUE = 'El archivo no tiene la estructura esperada.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Mensaje de un problema de estructura, citando el encabezado si lo hay. */
export function fileIssueMessage(
  issue: string,
  column: string | null,
  settings?: Pick<CustomerImportSettings, 'maxRows'>,
): string {
  const describe = FILE_ISSUE_MESSAGES[issue as ImportFileIssue];
  return describe ? describe(column?.trim() || null, settings) : UNKNOWN_FILE_ISSUE;
}

/** Problemas de estructura de un `422 INVALID_IMPORT_FILE`, uno por línea y sin repetir. */
export function importFileProblems(error: unknown, settings?: Pick<CustomerImportSettings, 'maxRows'>): string[] {
  if (!(error instanceof ApiError) || error.code !== CODES.invalidImportFile) {
    return [];
  }
  const messages = error.details.flatMap((detail) => {
    if (!isRecord(detail) || typeof detail.issue !== 'string') {
      return [];
    }
    return [fileIssueMessage(detail.issue, typeof detail.column === 'string' ? detail.column : null, settings)];
  });
  return [...new Set(messages)];
}

/** Motivos que no son de estructura (06 D.1, RN-06.24). */
const FAILURE_REASON_MESSAGES: Readonly<Record<string, string>> = {
  PROCESS_INTERRUPTED: 'La importación se interrumpió antes de terminar.',
  VALIDATION_ERROR: 'Ocurrió un error inesperado al validar el archivo.',
};

/**
 * `failureReason` de una carga `FAILED` como lista legible. El backend la
 * escribe como `ISSUE: encabezado; ISSUE` (fallo de estructura) o como un
 * código (`PROCESS_INTERRUPTED`).
 */
export function describeFailureReason(reason: string | null, settings?: Pick<CustomerImportSettings, 'maxRows'>): string[] {
  if (!reason?.trim()) {
    return [];
  }
  const messages = reason
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf(':');
      const code = (separator >= 0 ? part.slice(0, separator) : part).trim();
      const column = separator >= 0 ? part.slice(separator + 1).trim() : null;
      return FAILURE_REASON_MESSAGES[code] ?? fileIssueMessage(code, column, settings);
    });
  return [...new Set(messages)];
}

/**
 * Error de una subida (06 §E.3). El `413` puede llegar de NGINX sin cuerpo
 * JSON (`code = HTTP_ERROR`): se trata igual que `FILE_TOO_LARGE`.
 */
export function describeUploadError(error: unknown, settings?: Pick<CustomerImportSettings, 'maxFileSizeMb'>): ApiErrorView {
  const view = describeApiError(error, CUSTOMER_IMPORT_ERROR_MESSAGES);
  if (view.statusCode === PAYLOAD_TOO_LARGE) {
    return {
      ...view,
      message: settings
        ? `El archivo supera el tamaño máximo de ${formatMegabytes(settings.maxFileSizeMb)}.`
        : (CUSTOMER_IMPORT_ERROR_MESSAGES[CODES.fileTooLarge] ?? view.message),
    };
  }
  if (view.statusCode === UNSUPPORTED_MEDIA_TYPE) {
    return { ...view, message: CUSTOMER_IMPORT_ERROR_MESSAGES[CODES.unsupportedFileType] ?? view.message };
  }
  return view;
}

/** Mensaje traducido de cualquier otro error del módulo. */
export function describeImportError(error: unknown): ApiErrorView {
  return describeApiError(error, CUSTOMER_IMPORT_ERROR_MESSAGES);
}

/** `true` si el error es de un código concreto. */
export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}

/** Mensaje con la referencia para soporte. */
export function withReference(view: ApiErrorView): string {
  return view.correlationId ? `${view.message} Referencia: ${view.correlationId}` : view.message;
}
