import type { Page } from '@/infrastructure/database/ports/pagination';

import type { CustomerImportView, CustomerImportRowView, ImportSettings } from './customer-imports.service';
import type {
  CustomerImportListItemDto,
  CustomerImportResponseDto,
  CustomerImportRowDto,
  CustomerImportSettingsResponseDto,
  PaginatedCustomerImportRowsDto,
  PaginatedCustomerImportsDto,
} from './dto/customer-import.dto';
import { fileRowNumber } from './import-row-validator';
import type { CustomerImportRecord } from './ports/customer-imports.repository.port';

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function pagination<T>(page: Page<T>): PaginatedCustomerImportsDto['pagination'] {
  return { page: page.page, pageSize: page.pageSize, totalItems: page.totalItems, totalPages: Math.ceil(page.totalItems / page.pageSize) };
}

export function toSettingsDto(settings: ImportSettings): CustomerImportSettingsResponseDto {
  return {
    enabled: settings.enabled,
    maxFileSizeMb: settings.maxMb,
    maxRows: settings.maxRows,
    formats: [...settings.formats],
    templateVersion: settings.templateVersion,
    columns: settings.columns.map((column) => ({ ...column })),
  };
}

export function toListItemDto(record: CustomerImportRecord): CustomerImportListItemDto {
  return {
    id: record.id,
    code: record.code,
    format: record.format,
    originalFileName: record.originalFileName,
    status: record.status,
    totalRows: record.totalRows,
    validRows: record.validRows,
    invalidRows: record.invalidRows,
    importedRows: record.importedRows,
    startedBy: { ...record.startedBy },
    createdAt: record.createdAt.toISOString(),
    completedAt: iso(record.completedAt),
  };
}

export function toPaginatedImportsDto(page: Page<CustomerImportRecord>): PaginatedCustomerImportsDto {
  return { data: page.items.map(toListItemDto), pagination: pagination(page) };
}

export function toResponseDto(view: CustomerImportView): CustomerImportResponseDto {
  const { record, capabilities } = view;
  return {
    ...toListItemDto(record),
    templateVersion: record.templateVersion,
    rejectedRows: record.stats.rejectedRows,
    warningRows: record.stats.warningRows,
    failureReason: record.failureReason,
    validatedAt: iso(record.validatedAt),
    confirmedBy: record.confirmedBy ? { ...record.confirmedBy } : null,
    confirmedAt: iso(record.confirmedAt),
    isPurged: record.stats.isPurged,
    canConfirm: capabilities.canConfirm,
    canCancel: capabilities.canCancel,
    hasErrorFile: capabilities.hasErrorFile,
  };
}

export function toRowDto(view: CustomerImportRowView): CustomerImportRowDto {
  const { row } = view;
  return {
    rowNumber: row.rowNumber,
    fileRowNumber: fileRowNumber(row.rowNumber),
    status: row.status,
    values: row.values ? { ...row.values } : null,
    issues: row.issues.map((issue) => ({ field: issue.field, code: issue.code, message: issue.message, severity: issue.severity })),
    duplicateOfRowNumber: row.duplicateOfRowNumber,
    duplicateOfCustomer: view.duplicateOfCustomer ? { ...view.duplicateOfCustomer } : null,
    customer: row.customer ? { ...row.customer } : null,
  };
}

export function toPaginatedRowsDto(page: Page<CustomerImportRowView>): PaginatedCustomerImportRowsDto {
  return { data: page.items.map(toRowDto), pagination: pagination(page) };
}
