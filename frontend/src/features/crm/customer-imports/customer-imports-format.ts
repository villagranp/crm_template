import type { ListQuery } from '@/lib/query-keys';

import type {
  CustomerImport,
  CustomerImportSettings,
  ImportColumn,
  ImportFileFormat,
  ImportRowStatus,
  ImportStatus,
} from './customer-imports.api';

/** Etiquetas y formatos de la carga masiva de clientes (06 §E). */

const LOCALE = 'es-MX';
const EMPTY = '—';
const BYTES_PER_MB = 1024 * 1024;

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const numberFormatter = new Intl.NumberFormat(LOCALE);
const sizeFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

/** Aviso de `settings.enabled = false` (06 §E.1, AC-06.25). */
export const IMPORTS_DISABLED_NOTICE = 'La carga masiva no está habilitada en este entorno';

/** Texto que sustituye los valores purgados por retención (RN-06.29, 06 §E.4). */
export const PURGED_VALUES_TEXT = 'Datos eliminados por política de retención';

export const IMPORT_STATUS_LABELS: Readonly<Record<ImportStatus, string>> = {
  UPLOADED: 'Subida',
  VALIDATING: 'Validando',
  VALIDATED: 'Pendiente de confirmar',
  IMPORTING: 'Importando',
  COMPLETED: 'Completada',
  COMPLETED_WITH_ERRORS: 'Completada con errores',
  FAILED: 'Fallida',
  CANCELLED: 'Cancelada',
};

export type ChipTone = 'default' | 'info' | 'success' | 'warning' | 'error';

export const IMPORT_STATUS_TONES: Readonly<Record<ImportStatus, ChipTone>> = {
  UPLOADED: 'default',
  VALIDATING: 'default',
  VALIDATED: 'info',
  IMPORTING: 'info',
  COMPLETED: 'success',
  COMPLETED_WITH_ERRORS: 'warning',
  FAILED: 'error',
  CANCELLED: 'default',
};

export const IMPORT_ROW_STATUS_LABELS: Readonly<Record<ImportRowStatus, string>> = {
  PENDING: 'Pendiente',
  VALID: 'Válida',
  INVALID: 'Con errores',
  DUPLICATE_IN_FILE: 'Duplicada en el archivo',
  DUPLICATE_EXISTING: 'Duplicada de un cliente existente',
  IMPORTED: 'Importada',
  REJECTED: 'Rechazada',
};

export const IMPORT_ROW_STATUS_TONES: Readonly<Record<ImportRowStatus, ChipTone>> = {
  PENDING: 'default',
  VALID: 'info',
  INVALID: 'error',
  DUPLICATE_IN_FILE: 'error',
  DUPLICATE_EXISTING: 'error',
  IMPORTED: 'success',
  REJECTED: 'warning',
};

export const IMPORT_FORMAT_LABELS: Readonly<Record<ImportFileFormat, string>> = {
  CSV: 'CSV',
  XLSX: 'Excel (.xlsx)',
};

const FORMAT_EXTENSIONS: Readonly<Record<ImportFileFormat, string>> = {
  CSV: '.csv',
  XLSX: '.xlsx',
};

/** `accept` del selector de archivo. */
export const IMPORT_FILE_ACCEPT = '.csv,.xlsx';

export function formatImportStatus(status: string): string {
  return IMPORT_STATUS_LABELS[status as ImportStatus] ?? status;
}

export function formatImportFormat(format: string): string {
  return IMPORT_FORMAT_LABELS[format as ImportFileFormat] ?? format;
}

export function formatDateTime(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return EMPTY;
  }
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? EMPTY : dateTimeFormatter.format(date);
}

export function formatCount(value: number): string {
  return numberFormatter.format(value);
}

export function formatMegabytes(megabytes: number): string {
  return `${sizeFormatter.format(megabytes)} MB`;
}

/** Texto o "—" si está vacío. */
export function orDash(value: string | null | undefined): string {
  return value?.trim() ? value : EMPTY;
}

/** "CSV o Excel (.xlsx)" según los formatos de `settings`. */
export function describeFormats(formats: readonly ImportFileFormat[]): string {
  const labels = formats.map((format) => IMPORT_FORMAT_LABELS[format] ?? format);
  if (labels.length <= 1) {
    return labels.join('');
  }
  return `${labels.slice(0, -1).join(', ')} o ${labels[labels.length - 1]}`;
}

/**
 * Comprobación previa del archivo elegido (06 §E.3, AC-06.3): extensión y
 * tamaño contra `settings`. Es sólo comodidad: el servidor detecta el tipo
 * real por firma y vuelve a validarlo todo. Devuelve el mensaje o `null`.
 */
export function precheckImportFile(file: File, settings: Pick<CustomerImportSettings, 'formats' | 'maxFileSizeMb'>): string | null {
  const name = file.name.toLowerCase();
  const allowed = settings.formats.filter((format) => name.endsWith(FORMAT_EXTENSIONS[format]));
  if (allowed.length === 0) {
    return `El archivo debe ser ${describeFormats(settings.formats)}. Descargue la plantilla para ver el formato esperado.`;
  }
  if (file.size === 0) {
    return 'El archivo está vacío.';
  }
  if (file.size > settings.maxFileSizeMb * BYTES_PER_MB) {
    return `El archivo supera el tamaño máximo de ${formatMegabytes(settings.maxFileSizeMb)}.`;
  }
  return null;
}

/** Encabezado de la columna de una incidencia (`legalName` → "Razón social"; `row` → "Fila"). */
export function issueFieldLabel(field: string, columns: readonly ImportColumn[] | undefined): string {
  if (field === 'row') {
    return 'Fila';
  }
  return columns?.find((column) => column.key === field)?.header ?? field;
}

// --- Filtro de filas del detalle (06 §E.4) ---

export const ROW_VIEWS = ['VALID', 'WARNINGS', 'INVALID', 'DUPLICATE_IN_FILE', 'DUPLICATE_EXISTING', 'IMPORTED', 'REJECTED'] as const;
export type RowView = (typeof ROW_VIEWS)[number];

export const ROW_VIEW_LABELS: Readonly<Record<RowView | '', string>> = {
  '': 'Todas',
  VALID: 'Válidas',
  WARNINGS: 'Con advertencias',
  INVALID: 'Con errores',
  DUPLICATE_IN_FILE: 'Duplicadas en archivo',
  DUPLICATE_EXISTING: 'Duplicadas existentes',
  IMPORTED: 'Importadas',
  REJECTED: 'Rechazadas',
};

export function isRowView(value: string | undefined): value is RowView {
  return ROW_VIEWS.includes(value as RowView);
}

/** Parámetros de `GET /customer-imports/{id}/rows` de una vista del filtro. */
export function rowViewQuery(view: string | undefined): ListQuery {
  if (!isRowView(view)) {
    return {};
  }
  return view === 'WARNINGS' ? { hasWarnings: 'true' } : { status: view };
}

// --- Filtros del historial (06 §E.1) ---

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Fecha del filtro (`YYYY-MM-DD`, la del `<input type="date">`) como instante
 * ISO 8601 del inicio o del final de ese día en la zona del usuario. `null` si
 * no es una fecha válida (un enlace manipulado no deja la tabla en error).
 */
export function calendarDateToIso(value: string | undefined, edge: 'start' | 'end'): string | null {
  const match = value ? CALENDAR_DATE.exec(value) : null;
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const date =
    edge === 'start'
      ? new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0)
      : new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// --- Progreso, pasos y confirmación ---

export interface ImportProgress {
  processed: number;
  total: number;
  /** 0–100. */
  percent: number;
}

/** Progreso de `IMPORTING`: `importadas + rechazadas / válidas` (06 §E.4). */
export function importProgress(data: Pick<CustomerImport, 'importedRows' | 'rejectedRows' | 'validRows'>): ImportProgress {
  const processed = data.importedRows + data.rejectedRows;
  const total = data.validRows;
  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  return { processed, total, percent };
}

export const IMPORT_STEPS = ['Archivo', 'Validación', 'Confirmación', 'Resultado'] as const;

export interface ImportStepState {
  /** Índice del paso en curso; `IMPORT_STEPS.length` si terminaron todos. */
  activeStep: number;
  /** Paso que terminó mal (fallo o cancelación), si lo hay. */
  failedStep: number | null;
  /** Texto bajo el paso fallido. */
  failedLabel: string | null;
}

/** Paso del indicador Archivo → Validación → Confirmación → Resultado según el estado. */
export function importStepState(data: Pick<CustomerImport, 'status' | 'confirmedAt'>): ImportStepState {
  switch (data.status) {
    case 'UPLOADED':
    case 'VALIDATING':
      return { activeStep: 1, failedStep: null, failedLabel: null };
    case 'VALIDATED':
      return { activeStep: 2, failedStep: null, failedLabel: null };
    case 'IMPORTING':
      return { activeStep: 3, failedStep: null, failedLabel: null };
    case 'COMPLETED':
    case 'COMPLETED_WITH_ERRORS':
      return { activeStep: IMPORT_STEPS.length, failedStep: null, failedLabel: null };
    case 'CANCELLED':
      return { activeStep: 2, failedStep: 2, failedLabel: 'Cancelada' };
    case 'FAILED':
      return data.confirmedAt
        ? { activeStep: 3, failedStep: 3, failedLabel: 'Interrumpida' }
        : { activeStep: 1, failedStep: 1, failedLabel: 'Archivo rechazado' };
    default:
      return { activeStep: 0, failedStep: null, failedLabel: null };
  }
}

export interface ConfirmationSummary {
  /** Clientes que se crearán. */
  toImport: number;
  /** Filas del archivo que no se importarán. */
  notImported: number;
}

/**
 * Resumen del diálogo de confirmación (06 §E.4, RN-06.18): sin la casilla, las
 * filas válidas con advertencias no se importan.
 */
export function confirmationSummary(
  data: Pick<CustomerImport, 'totalRows' | 'validRows'>,
  validRowsWithWarnings: number,
  includeRowsWithWarnings: boolean,
): ConfirmationSummary {
  const toImport = includeRowsWithWarnings ? data.validRows : Math.max(0, data.validRows - validRowsWithWarnings);
  return { toImport, notImported: Math.max(0, data.totalRows - toImport) };
}

/** "1 fila" / "3 filas". */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}
