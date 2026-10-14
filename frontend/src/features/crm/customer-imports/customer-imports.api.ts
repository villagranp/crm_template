import type { ListQuery } from '@/lib/query-keys';
import { httpClient, type DownloadedFile, type UploadOptions } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

/**
 * Cliente HTTP del Módulo 6, carga masiva de clientes (06 §F.1, F-42). Los
 * tipos reflejan los DTO del backend
 * (`backend/src/modules/customer-imports/dto/customer-import.dto.ts`), nunca
 * el modelo de datos. Subida con `httpClient.upload` (progreso) y descargas con
 * `httpClient.download` (el token no viaja en un `<a href>`).
 */

const IMPORTS_PATH = '/customer-imports';

/** Campo único del multipart de la subida (06 F.1 §3). */
export const IMPORT_FILE_FIELD = 'file';

export const IMPORT_FILE_FORMATS = ['CSV', 'XLSX'] as const;
export type ImportFileFormat = (typeof IMPORT_FILE_FORMATS)[number];

/** `ImportStatus` (06 RN-06.25). */
export const IMPORT_STATUSES = [
  'UPLOADED',
  'VALIDATING',
  'VALIDATED',
  'IMPORTING',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'CANCELLED',
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

/** Estados transitorios: el detalle se consulta cada 2 s mientras dure uno (06 §E.4). */
export const ACTIVE_IMPORT_STATUSES: readonly ImportStatus[] = ['UPLOADED', 'VALIDATING', 'IMPORTING'];

/** `ImportRowStatus`. */
export const IMPORT_ROW_STATUSES = [
  'PENDING',
  'VALID',
  'INVALID',
  'DUPLICATE_IN_FILE',
  'DUPLICATE_EXISTING',
  'IMPORTED',
  'REJECTED',
] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export type ImportIssueSeverity = 'ERROR' | 'WARNING';

export interface ImportColumn {
  /** Clave estable (`legalName`, `country`…); es el `field` de las incidencias de fila. */
  key: string;
  /** Encabezado de la plantilla (`Razón social`). */
  header: string;
  isRequired: boolean;
  maxLength: number | null;
  description: string;
}

/** `CustomerImportSettingsResponseDto` (F.1 §1). */
export interface CustomerImportSettings {
  enabled: boolean;
  maxFileSizeMb: number;
  maxRows: number;
  formats: ImportFileFormat[];
  templateVersion: string;
  columns: ImportColumn[];
}

export interface ImportUserRef {
  id: string;
  displayName: string;
}

/** `CustomerImportListItemDto`. */
export interface CustomerImportListItem {
  id: string;
  code: string;
  format: ImportFileFormat;
  originalFileName: string;
  status: ImportStatus;
  totalRows: number;
  validRows: number;
  /** `INVALID` + `DUPLICATE_IN_FILE` + `DUPLICATE_EXISTING`. */
  invalidRows: number;
  importedRows: number;
  startedBy: ImportUserRef;
  createdAt: string;
  completedAt: string | null;
}

/** `CustomerImportResponseDto`: los `can*`/`has*` los calcula el backend para el usuario actual. */
export interface CustomerImport extends CustomerImportListItem {
  templateVersion: string | null;
  /** Rechazadas al confirmar. */
  rejectedRows: number;
  /** Filas (de cualquier estado) con al menos una advertencia. */
  warningRows: number;
  /** `MISSING_COLUMN: Razón social; EMPTY_FILE`, `PROCESS_INTERRUPTED`… */
  failureReason: string | null;
  validatedAt: string | null;
  confirmedBy: ImportUserRef | null;
  confirmedAt: string | null;
  isPurged: boolean;
  canConfirm: boolean;
  canCancel: boolean;
  hasErrorFile: boolean;
}

export interface ImportRowValues {
  customerCode: string | null;
  legalName: string | null;
  tradeName: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  companyType: string | null;
  status: string | null;
  rating: string | null;
  salesOwner: string | null;
  taxId: string | null;
}

export interface ImportRowIssue {
  /** Clave de columna de la plantilla o `row`. */
  field: string;
  code: string;
  /** En español, del servidor; nunca repite el valor de la celda (AC-06.14). */
  message: string;
  severity: ImportIssueSeverity;
}

/** `CustomerImportRowDto`. */
export interface CustomerImportRow {
  rowNumber: number;
  /** La fila que el usuario ve en Excel (`rowNumber + 1`). */
  fileRowNumber: number;
  status: ImportRowStatus;
  /** `null` si los datos se purgaron por retención. */
  values: ImportRowValues | null;
  issues: ImportRowIssue[];
  duplicateOfRowNumber: number | null;
  /** Sólo si el usuario puede ver ese cliente (06 H.4). */
  duplicateOfCustomer: { id: string; crmCode: string; legalName: string } | null;
  /** Cliente creado (filas `IMPORTED`). */
  customer: { id: string; crmCode: string } | null;
}

/** Cuerpo de `POST /customer-imports/{id}/confirmation`. */
export interface ConfirmCustomerImportInput {
  /** Filas válidas que mostraba la pantalla; si no coincide → `409 IMPORT_CHANGED`. */
  expectedValidRows: number;
  includeRowsWithWarnings: boolean;
}

/** Lista blanca de `sortBy` de `GET /customer-imports`. */
export const IMPORT_SORT_FIELDS = ['createdAt', 'code', 'status'] as const;

function importPath(importId: string): string {
  return `${IMPORTS_PATH}/${encodeURIComponent(importId)}`;
}

export function getCustomerImportSettings(): Promise<CustomerImportSettings> {
  return httpClient.get<CustomerImportSettings>(`${IMPORTS_PATH}/settings`);
}

export function downloadCustomerImportTemplate(format: ImportFileFormat): Promise<DownloadedFile> {
  return httpClient.download(`${IMPORTS_PATH}/template`, { query: { format } });
}

/** Sube y valida el archivo (proceso síncrono): responde `201` con la carga en `VALIDATED`. */
export function uploadCustomerImport(file: File, options: UploadOptions = {}): Promise<CustomerImport> {
  const body = new FormData();
  body.append(IMPORT_FILE_FIELD, file);
  return httpClient.upload<CustomerImport>(IMPORTS_PATH, body, options);
}

export function listCustomerImports(query: ListQuery): Promise<PaginatedResponse<CustomerImportListItem>> {
  return httpClient.get<PaginatedResponse<CustomerImportListItem>>(IMPORTS_PATH, { query });
}

export function getCustomerImport(importId: string): Promise<CustomerImport> {
  return httpClient.get<CustomerImport>(importPath(importId));
}

export function listCustomerImportRows(importId: string, query: ListQuery): Promise<PaginatedResponse<CustomerImportRow>> {
  return httpClient.get<PaginatedResponse<CustomerImportRow>>(`${importPath(importId)}/rows`, { query });
}

export function confirmCustomerImport(importId: string, input: ConfirmCustomerImportInput): Promise<CustomerImport> {
  return httpClient.post<CustomerImport>(`${importPath(importId)}/confirmation`, { body: input });
}

export function cancelCustomerImport(importId: string): Promise<CustomerImport> {
  return httpClient.post<CustomerImport>(`${importPath(importId)}/cancellation`);
}

export function downloadCustomerImportErrorFile(importId: string): Promise<DownloadedFile> {
  return httpClient.download(`${importPath(importId)}/error-file`);
}
