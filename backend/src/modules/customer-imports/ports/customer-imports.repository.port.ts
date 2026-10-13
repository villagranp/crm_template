import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';

import type { ImportRowValues } from '../cell-sanitizer';
import type { ImportFileFormat } from '../file-signature';
import type { StoredImportIssue } from '../import-issues';
import type { ImportRowStatus, ImportStatus } from '../import-status';

/**
 * Puerto de datos de la carga masiva (06 L.1): `customer_imports` y
 * `customer_import_rows`. Sin conceptos de Prisma (ADR-004). Las transiciones de
 * estado son **condicionales** (`WHERE status = <origen>`): devuelven `false` si
 * otra petición ya cambió el estado (RN-06.20).
 */
export const CUSTOMER_IMPORTS_REPOSITORY = Symbol('CUSTOMER_IMPORTS_REPOSITORY');

export interface ImportUserRef {
  readonly id: string;
  readonly displayName: string;
}

export interface CustomerImportRecord {
  readonly id: string;
  readonly code: string;
  readonly format: ImportFileFormat;
  readonly originalFileName: string;
  readonly status: ImportStatus;
  readonly templateVersion: string | null;
  readonly totalRows: number;
  readonly validRows: number;
  readonly invalidRows: number;
  readonly importedRows: number;
  readonly failureReason: string | null;
  readonly startedBy: ImportUserRef;
  readonly validatedAt: Date | null;
  readonly confirmedBy: ImportUserRef | null;
  readonly confirmedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Recuentos derivados de las filas (no son columnas de `customer_imports`). */
export interface CustomerImportRowStats {
  readonly rejectedRows: number;
  /** Filas con al menos una advertencia (RN-06.18). */
  readonly warningRows: number;
  /** `INVALID`, `DUPLICATE_*` y `REJECTED` (RN-06.26). */
  readonly notImportedRows: number;
  /** Alguna fila con `raw_data` purgado (RN-06.29). */
  readonly isPurged: boolean;
}

export interface CustomerImportDetailRecord extends CustomerImportRecord {
  readonly stats: CustomerImportRowStats;
}

export interface ReferencedCustomer {
  readonly id: string;
  readonly crmCode: string;
  readonly legalName: string;
  readonly salesOwnerId: string;
  readonly countryId: string;
  readonly isDeleted: boolean;
}

export interface CustomerImportRowRecord {
  readonly id: string;
  readonly rowNumber: number;
  readonly status: ImportRowStatus;
  /** `null` si se purgó (RN-06.29). */
  readonly values: ImportRowValues | null;
  readonly issues: readonly StoredImportIssue[];
  readonly duplicateOfRowNumber: number | null;
  readonly duplicateOf: ReferencedCustomer | null;
  readonly customer: { readonly id: string; readonly crmCode: string } | null;
}

export interface NewImportRow {
  readonly rowNumber: number;
  readonly values: ImportRowValues;
  readonly status: Exclude<ImportRowStatus, 'PENDING' | 'IMPORTED' | 'REJECTED'>;
  readonly issues: readonly StoredImportIssue[];
  readonly duplicateOfRowNumber: number | null;
  readonly duplicateOfCustomerId: string | null;
}

export interface NewCustomerImport {
  readonly code: string;
  readonly format: ImportFileFormat;
  readonly originalFileName: string;
  readonly templateVersion: string;
  readonly startedById: string;
}

export const IMPORT_SORT_FIELDS = ['createdAt', 'code', 'status'] as const;
export type ImportSortField = (typeof IMPORT_SORT_FIELDS)[number];

export interface ImportSearchCriteria extends PageRequest {
  readonly sortBy?: ImportSortField;
  /** `null` = todas (alcance `ORGANIZATION`); si no, solo las de ese usuario (H.4). */
  readonly visibleStarterId: string | null;
  readonly startedById?: string;
  readonly statuses?: readonly ImportStatus[];
  readonly createdFrom?: Date;
  readonly createdTo?: Date;
  readonly search?: string;
}

export interface ImportRowCriteria extends PageRequest {
  readonly statuses?: readonly ImportRowStatus[];
  readonly hasWarnings?: boolean;
}

/** Fila `VALID` pendiente de importar (RN-06.21). */
export interface PendingImportRow {
  readonly id: string;
  readonly rowNumber: number;
  readonly values: ImportRowValues | null;
  readonly issues: readonly StoredImportIssue[];
}

export interface StaleImportFilter {
  /** Señal de vida (`updated_at`) anterior a este instante = interrumpida (RN-06.24). */
  readonly staleBefore: Date;
  readonly importId?: string;
  readonly startedById?: string;
}

export interface CustomerImportsRepository {
  /** Serializa las subidas de un usuario (`SELECT … FOR UPDATE` sobre su fila de `users`, RN-06.30). */
  lockStarter(userId: string, tx: TransactionContext): Promise<void>;
  hasActiveImport(userId: string, tx: TransactionContext): Promise<boolean>;
  /** Crea la carga en `VALIDATING` (la subida valida en la misma petición). */
  create(input: NewCustomerImport, tx: TransactionContext): Promise<string>;
  /** Guarda las filas y pasa `VALIDATING → VALIDATED` con contadores y `validatedAt`, todo en una transacción. */
  saveValidation(importId: string, rows: readonly NewImportRow[]): Promise<boolean>;
  /** `from → FAILED` con su motivo y `completedAt`. */
  fail(importId: string, from: readonly ImportStatus[], failureReason: string): Promise<boolean>;

  findById(importId: string): Promise<CustomerImportDetailRecord | null>;
  search(criteria: ImportSearchCriteria): Promise<Page<CustomerImportRecord>>;
  findRows(importId: string, criteria: ImportRowCriteria): Promise<Page<CustomerImportRowRecord>>;
  /** Filas no importadas, en orden, para el archivo de errores (RN-06.26). */
  listNotImportedRows(importId: string): Promise<CustomerImportRowRecord[]>;

  /** `VALIDATED → IMPORTING` con quién y cuándo confirmó (RN-06.20). */
  startImporting(importId: string, confirmedById: string): Promise<boolean>;
  /** `VALIDATED → CANCELLED`. */
  cancel(importId: string): Promise<boolean>;
  listPendingRows(importId: string): Promise<PendingImportRow[]>;
  /** `VALID → IMPORTED` dentro de la transacción del alta; `false` si la fila ya no está `VALID`. */
  markRowImported(rowId: string, customerId: string, tx: TransactionContext): Promise<boolean>;
  /** `VALID → REJECTED` con sus incidencias. */
  markRowRejected(rowId: string, issues: readonly StoredImportIssue[], duplicateOfCustomerId: string | null): Promise<boolean>;
  /** Señal de vida: actualiza `updated_at` mientras la carga siga `IMPORTING` (RN-06.24). */
  touch(importId: string): Promise<void>;
  /** `IMPORTING → COMPLETED | COMPLETED_WITH_ERRORS` con contadores recalculados desde las filas (RN-06.25). */
  complete(importId: string): Promise<ImportStatus | null>;
  /**
   * Marca `FAILED (PROCESS_INTERRUPTED)` las cargas activas sin señal de vida; sus
   * filas aún `VALID` pasan a `REJECTED` con `interruptedIssue`; recalcula contadores.
   * Devuelve los ids marcados.
   */
  failStale(filter: StaleImportFilter, interruptedIssue: StoredImportIssue): Promise<string[]>;
  /** Sustituye por `{}` el `raw_data` de las cargas cerradas (o creadas) antes de `before` (RN-06.29). */
  purgeRowData(before: Date): Promise<number>;
}

export type { Page };
