import { toCsv } from '@/common/csv';
import { writeTextWorkbook, XLSX_CONTENT_TYPE } from '@/common/xlsx';

import type { ImportFileFormat } from './file-signature';
import type { ImportRowStatus } from './import-status';
import { ERROR_FILE_HEADERS, IMPORT_COLUMNS } from './import-template';
import { fileRowNumber } from './import-row-validator';
import type { CustomerImportRowRecord } from './ports/customer-imports.repository.port';

/**
 * Archivo de errores (06 RN-06.26): cada fila no importada con "Fila del
 * archivo", las columnas de la plantilla con los valores leídos, "Estado" y
 * "Errores" (`código: mensaje` separados por `; `), en el formato de la carga.
 * Se genera al vuelo desde `raw_data` (D-06.8). Toda celda pasa por la
 * neutralización de fórmulas de `csv.ts`, también en XLSX, donde además es
 * siempre una celda de texto. Al volver a subirlo, el lector ignora las tres
 * columnas añadidas y quita el apóstrofo de la neutralización.
 */

export const ROW_STATUS_LABELS: Readonly<Record<ImportRowStatus, string>> = {
  PENDING: 'Pendiente',
  VALID: 'Válida',
  INVALID: 'Con errores',
  DUPLICATE_IN_FILE: 'Duplicada en el archivo',
  DUPLICATE_EXISTING: 'Duplicada con un cliente existente',
  IMPORTED: 'Importada',
  REJECTED: 'Rechazada al confirmar',
};

export interface ErrorFile {
  readonly content: Buffer;
  readonly fileName: string;
  readonly contentType: string;
}

const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';

function errorsText(row: CustomerImportRowRecord): string {
  return row.issues.map((issue) => `${issue.code}: ${issue.message}`).join('; ');
}

function rowCells(row: CustomerImportRowRecord): (string | null)[] {
  return [
    String(fileRowNumber(row.rowNumber)),
    ...IMPORT_COLUMNS.map((column) => row.values?.[column.key] ?? null),
    ROW_STATUS_LABELS[row.status],
    errorsText(row),
  ];
}

const HEADERS: readonly string[] = [ERROR_FILE_HEADERS.fileRow, ...IMPORT_COLUMNS.map((column) => column.header), ERROR_FILE_HEADERS.status, ERROR_FILE_HEADERS.errors];

export async function buildErrorFile(format: ImportFileFormat, importCode: string, rows: readonly CustomerImportRowRecord[]): Promise<ErrorFile> {
  const cells = rows.map(rowCells);
  if (format === 'CSV') {
    const csv = toCsv(
      cells,
      HEADERS.map((header, index) => ({ header, value: (row: (string | null)[]) => row[index] ?? null })),
    );
    return { content: Buffer.from(csv, 'utf8'), fileName: `errores-${importCode}.csv`, contentType: CSV_CONTENT_TYPE };
  }
  const content = await writeTextWorkbook([
    {
      name: 'Clientes',
      columns: HEADERS.map((header, index) => ({ header, width: index === HEADERS.length - 1 ? 80 : 22 })),
      rows: cells,
    },
  ]);
  return { content, fileName: `errores-${importCode}.xlsx`, contentType: XLSX_CONTENT_TYPE };
}
