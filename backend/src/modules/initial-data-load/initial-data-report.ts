import { toCsv } from '@/common/csv';

import { INITIAL_DATA_TEMPLATE_VERSION, type InitialDataEntity } from './initial-data-templates';

/**
 * Informe de la carga inicial: conteos por hoja y una lista de incidencias con hoja, fila,
 * columna y motivo. **Nunca contiene el valor de una celda ni datos de la fila** (PII fuera de
 * consola, logs y archivos de informe): solo números de fila, nombres de columna y motivos que
 * redacta el código.
 */

export type ReportStatus = 'ERROR' | 'WARNING' | 'EXISTS';
export type LoadMode = 'validate' | 'apply';

export interface ReportEntry {
  /** Nombre de la hoja; `null` si el problema es del archivo completo. */
  readonly sheet: string | null;
  /** Fila del archivo (la del encabezado es 1, la primera de datos es 2); `null` si no es de una fila. */
  readonly row: number | null;
  /** Encabezado de la columna; `null` si no es de una columna. */
  readonly column: string | null;
  readonly status: ReportStatus;
  readonly code: string;
  readonly message: string;
}

export interface SheetSummary {
  readonly sheet: string;
  /** Filas de datos leídas. */
  readonly read: number;
  /** Filas válidas que se crearían (validar) o se intentaron crear (aplicar). */
  readonly toCreate: number;
  /** Filas creadas de verdad (solo al aplicar). */
  readonly created: number;
  /** Filas omitidas porque ya existían idénticas. */
  readonly exists: number;
  /** Filas omitidas porque ya existían pero con datos distintos (no se modificaron; `EXISTS_DIFFERENT`). */
  readonly existsDifferent: number;
  /** Filas creadas pero con una advertencia que pide reparación manual (`CLASSIFICATION_FAILED`); no se cuentan en `created`. */
  readonly createdWithWarning: number;
  /** Filas con al menos un error. */
  readonly errors: number;
}

export interface LoadReport {
  readonly entity: InitialDataEntity;
  readonly mode: LoadMode;
  readonly templateVersion: string;
  readonly sheets: readonly SheetSummary[];
  readonly entries: readonly ReportEntry[];
  /** `true` si se escribió algo (solo con `apply` y sin errores de validación). */
  readonly applied: boolean;
  /** Errores de archivo (estructura, tamaño) más filas con error. */
  readonly errorCount: number;
}

export const REPORT_CSV_HEADERS = ['Hoja', 'Fila', 'Columna', 'Estado', 'Código', 'Motivo'] as const;

const STATUS_LABELS: Readonly<Record<ReportStatus, string>> = { ERROR: 'Error', WARNING: 'Advertencia', EXISTS: 'Ya existe (omitida)' };

export function newReport(entity: InitialDataEntity, mode: LoadMode, sheets: readonly SheetSummary[], entries: readonly ReportEntry[], applied: boolean): LoadReport {
  const fileLevelErrors = entries.filter((entry) => entry.status === 'ERROR' && entry.row === null).length;
  const rowErrors = sheets.reduce((total, sheet) => total + sheet.errors, 0);
  return { entity, mode, templateVersion: INITIAL_DATA_TEMPLATE_VERSION, sheets, entries, applied, errorCount: fileLevelErrors + rowErrors };
}

/** Informe de un archivo que no se pudo leer: solo incidencias de archivo. */
export function fileProblemReport(entity: InitialDataEntity, mode: LoadMode, entries: readonly ReportEntry[]): LoadReport {
  return newReport(entity, mode, [], entries, false);
}

export function hasErrors(report: LoadReport): boolean {
  return report.errorCount > 0;
}

/** Código de salida del proceso: 0 sin errores, 1 con errores de validación o de aplicación. */
export function exitCodeOf(report: LoadReport): number {
  return hasErrors(report) ? 1 : 0;
}

/** Texto de la hoja y la fila de una incidencia, para la consola. */
function locationOf(entry: ReportEntry): string {
  const parts = [entry.sheet ? `hoja ${entry.sheet}` : 'archivo', entry.row === null ? null : `fila ${entry.row}`, entry.column ? `columna ${entry.column}` : null];
  return parts.filter((part): part is string => part !== null).join(', ');
}

/** Máximo de incidencias que se listan en consola; el archivo CSV las trae todas. */
export const CONSOLE_ENTRY_LIMIT = 50;

/** Resumen para la consola: conteos y, hasta el límite, las incidencias (sin datos de las filas). */
export function formatReportSummary(report: LoadReport): string[] {
  const lines: string[] = [];
  const modeText = report.mode === 'validate' ? 'validar (no se escribió nada)' : report.applied ? 'aplicar' : 'aplicar (no se aplicó nada)';
  lines.push(`Carga inicial de ${report.entity} - plantilla v${report.templateVersion} - modo: ${modeText}`);
  for (const sheet of report.sheets) {
    const created = report.mode === 'apply' ? ` - creadas ${sheet.created}` : '';
    const different = sheet.existsDifferent > 0 ? ` - ya existen con datos distintos ${sheet.existsDifferent}` : '';
    const warned = sheet.createdWithWarning > 0 ? ` - creadas con advertencia ${sheet.createdWithWarning}` : '';
    lines.push(`  Hoja ${sheet.sheet}: leídas ${sheet.read} - por crear ${sheet.toCreate}${created} - ya existen ${sheet.exists}${different}${warned} - con errores ${sheet.errors}`);
  }
  const shown = report.entries.slice(0, CONSOLE_ENTRY_LIMIT);
  for (const entry of shown) {
    lines.push(`  [${STATUS_LABELS[entry.status]}] ${locationOf(entry)}: ${entry.message} (${entry.code})`);
  }
  if (report.entries.length > shown.length) {
    lines.push(`  ... y ${report.entries.length - shown.length} incidencias más (todas están en el archivo de informe).`);
  }
  if (hasErrors(report)) {
    lines.push(
      report.mode === 'apply' && !report.applied
        ? `Resultado: CON ERRORES (${report.errorCount}). No se aplicó nada: corrija el archivo y vuelva a ejecutar.`
        : `Resultado: CON ERRORES (${report.errorCount}).`,
    );
  } else if (report.mode === 'validate') {
    lines.push('Resultado: SIN ERRORES. Nada se escribió; ejecute `apply` con --actor para cargar.');
  } else {
    lines.push('Resultado: SIN ERRORES. Carga aplicada.');
  }
  const warnings = report.sheets.reduce((total, sheet) => total + sheet.existsDifferent + sheet.createdWithWarning, 0);
  if (warnings > 0) lines.push(`Advertencias: ${warnings} fila(s) requieren revisión manual (ver el informe); no cambian el código de salida.`);
  return lines;
}

/** Archivo CSV de errores y omitidos: hoja, fila, columna, estado, código y motivo. Sin datos de celdas. */
export function buildReportCsv(report: LoadReport): string {
  return toCsv(report.entries, [
    { header: REPORT_CSV_HEADERS[0], value: (entry) => entry.sheet },
    { header: REPORT_CSV_HEADERS[1], value: (entry) => entry.row },
    { header: REPORT_CSV_HEADERS[2], value: (entry) => entry.column },
    { header: REPORT_CSV_HEADERS[3], value: (entry) => STATUS_LABELS[entry.status] },
    { header: REPORT_CSV_HEADERS[4], value: (entry) => entry.code },
    { header: REPORT_CSV_HEADERS[5], value: (entry) => entry.message },
  ]);
}
