import { toCsv } from '@/common/csv';
import { writeTextWorkbook, XLSX_CONTENT_TYPE } from '@/common/xlsx';

import type { ErrorFile } from './error-file';
import type { ImportFileFormat } from './file-signature';
import { IMPORT_COLUMNS, IMPORT_TEMPLATE_VERSION, type ImportColumnKey } from './import-template';

/**
 * Plantilla de carga (06 RN-06.6). CSV: BOM + encabezados. XLSX: hoja `Clientes`
 * (encabezados, columnas de texto), `Instrucciones` (por columna: obligatoria,
 * formato, longitud, ejemplo ficticio; y la versión) y `Valores válidos`
 * (códigos y etiquetas **activos** leídos de la base en el momento de la
 * descarga; nunca una lista fija). No lista usuarios.
 */

export interface TemplateValue {
  readonly group: string;
  readonly code: string;
  readonly label: string;
}

export interface TemplateContent {
  readonly requiredColumns: ReadonlySet<ImportColumnKey>;
  readonly validValues: readonly TemplateValue[];
}

export function templateFileName(format: ImportFileFormat): string {
  return `plantilla-clientes-v${IMPORT_TEMPLATE_VERSION}.${format === 'CSV' ? 'csv' : 'xlsx'}`;
}

export async function buildTemplateFile(format: ImportFileFormat, content: TemplateContent): Promise<ErrorFile> {
  const fileName = templateFileName(format);
  if (format === 'CSV') {
    const csv = toCsv([], IMPORT_COLUMNS.map((column) => ({ header: column.header, value: () => null })));
    return { content: Buffer.from(csv, 'utf8'), fileName, contentType: 'text/csv; charset=utf-8' };
  }
  const workbook = await writeTextWorkbook([
    { name: 'Clientes', columns: IMPORT_COLUMNS.map((column) => ({ header: column.header, width: 24 })), rows: [] },
    {
      name: 'Instrucciones',
      columns: [
        { header: 'Columna', width: 24 },
        { header: 'Obligatoria', width: 12 },
        { header: 'Formato', width: 70 },
        { header: 'Longitud máxima', width: 16 },
        { header: 'Ejemplo', width: 28 },
      ],
      rows: [
        ...IMPORT_COLUMNS.map((column) => [
          column.header,
          content.requiredColumns.has(column.key) ? 'Sí' : 'No',
          column.description,
          column.maxLength === null ? null : String(column.maxLength),
          column.example,
        ]),
        [],
        ['Versión de plantilla', IMPORT_TEMPLATE_VERSION, 'Escriba los datos en la hoja Clientes; todas las columnas deben estar presentes.', null, null],
      ],
    },
    {
      name: 'Valores válidos',
      columns: [
        { header: 'Columna', width: 24 },
        { header: 'Código', width: 20 },
        { header: 'Descripción', width: 40 },
      ],
      rows: content.validValues.map((value) => [value.group, value.code, value.label]),
    },
  ]);
  return { content: workbook, fileName, contentType: XLSX_CONTENT_TYPE };
}
