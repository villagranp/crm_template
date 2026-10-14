/**
 * Máquina de estados de una carga (06 RN-06.25, `ImportStatus` de `00` §2.1).
 * Las transiciones que dependen de la concurrencia (confirmar, cancelar,
 * terminar, marcar interrumpida) se escriben además de forma condicional en el
 * adaptador (`UPDATE … WHERE status = <origen>`, RN-06.20).
 */

export const IMPORT_STATUSES = ['UPLOADED', 'VALIDATING', 'VALIDATED', 'IMPORTING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const IMPORT_ROW_STATUSES = ['PENDING', 'VALID', 'INVALID', 'DUPLICATE_IN_FILE', 'DUPLICATE_EXISTING', 'IMPORTED', 'REJECTED'] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

/** Filas que nunca se importan: rechazadas en la validación (RN-06.22). */
export const INVALID_ROW_STATUSES: readonly ImportRowStatus[] = ['INVALID', 'DUPLICATE_IN_FILE', 'DUPLICATE_EXISTING'];

/** Filas no importadas que van al archivo de errores (RN-06.26). */
export const NOT_IMPORTED_ROW_STATUSES: readonly ImportRowStatus[] = [...INVALID_ROW_STATUSES, 'REJECTED'];

const TRANSITIONS: Readonly<Record<ImportStatus, readonly ImportStatus[]>> = {
  UPLOADED: ['VALIDATING', 'FAILED'],
  VALIDATING: ['VALIDATED', 'FAILED'],
  VALIDATED: ['IMPORTING', 'CANCELLED'],
  IMPORTING: ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'],
  COMPLETED: [],
  COMPLETED_WITH_ERRORS: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: ImportStatus, to: ImportStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isFinalStatus(status: ImportStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Estados que bloquean otra carga del mismo usuario (RN-06.30) y que pueden quedar huérfanos (RN-06.24). */
export const ACTIVE_IMPORT_STATUSES: readonly ImportStatus[] = ['UPLOADED', 'VALIDATING', 'IMPORTING'];

/** Estado final de una importación según sus filas (RN-06.25). */
export function completionStatus(counts: { readonly totalRows: number; readonly importedRows: number }): 'COMPLETED' | 'COMPLETED_WITH_ERRORS' {
  return counts.importedRows === counts.totalRows ? 'COMPLETED' : 'COMPLETED_WITH_ERRORS';
}
