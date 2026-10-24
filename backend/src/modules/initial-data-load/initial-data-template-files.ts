import { toCsv } from '@/common/csv';
import { writeTextWorkbook, XLSX_CONTENT_TYPE } from '@/common/xlsx';

import {
  csvFileName,
  entityDefinition,
  INITIAL_DATA_TEMPLATE_VERSION,
  type InitialDataEntity,
  type LoadSheet,
} from './initial-data-templates';
import type { TemplateValueSet } from './ports/initial-data-lookup.port';

/**
 * Generación de las plantillas de la carga inicial (mismo patrón que
 * `customer-imports/template-file.ts`). CSV: BOM + encabezados, un archivo por hoja (las familias
 * con el sufijo `-familias`). XLSX: una hoja de datos por cada hoja de la entidad (columnas de
 * texto), «Instrucciones» (por columna: obligatoria, formato, longitud, ejemplo ficticio y la
 * versión) y «Valores válidos» (códigos y etiquetas activos que recibe quien llama; nunca una
 * lista fija aquí). La hoja de datos va vacía: los ejemplos están en «Instrucciones» para que un
 * ejemplo olvidado no se cargue.
 */

export interface TemplateFile {
  readonly fileName: string;
  readonly content: Buffer;
  readonly contentType: string;
}

export type TemplateFormat = 'CSV' | 'XLSX';

export interface TemplateValueRow {
  readonly group: string;
  readonly code: string;
  readonly label: string;
}

function headerOf(sheet: LoadSheet, key: string): string {
  return sheet.columns.find((column) => column.key === key)?.header ?? key;
}

/** Filas de la hoja «Valores válidos» de cada entidad, agrupadas por el encabezado de la columna que las usa. */
export function templateValueRows(entity: InitialDataEntity, values: TemplateValueSet): TemplateValueRow[] {
  const sheets = entityDefinition(entity).sheets;
  const rows = (group: string, items: readonly { code: string; label: string }[]): TemplateValueRow[] => items.map((item) => ({ group, code: item.code, label: item.label }));
  if (entity === 'projects') {
    const sheet = sheets[0] as LoadSheet;
    return [
      ...rows(headerOf(sheet, 'country'), values.countries),
      ...rows(headerOf(sheet, 'projectType'), values.projectTypes),
      ...rows(headerOf(sheet, 'sector'), values.sectors),
      ...rows(headerOf(sheet, 'measureUnit'), values.units),
      ...rows(headerOf(sheet, 'phase'), values.phases),
      ...rows(headerOf(sheet, 'opportunityStage'), values.stages),
      ...rows(headerOf(sheet, 'result'), values.outcomes),
      ...rows(headerOf(sheet, 'resultReason'), values.reasons),
    ];
  }
  if (entity === 'products') {
    const products = sheets.find((sheet) => sheet.id === 'products') as LoadSheet;
    return [...rows(headerOf(products, 'baseUnit'), values.units), ...rows(`${headerOf(products, 'family')} (existentes)`, values.families)];
  }
  return [];
}

export function xlsxTemplateFileName(entity: InitialDataEntity): string {
  return `${entityDefinition(entity).fileBase}.xlsx`;
}

export async function buildTemplateFiles(entity: InitialDataEntity, format: TemplateFormat, values: TemplateValueSet): Promise<TemplateFile[]> {
  const definition = entityDefinition(entity);
  if (format === 'CSV') {
    return definition.sheets.map((sheet) => ({
      fileName: csvFileName(definition.fileBase, sheet),
      // BOM + LF, igual que los CSV versionados en `docs/templates/` (el lector acepta LF y CRLF).
      content: Buffer.from(toCsv([], sheet.columns.map((column) => ({ header: column.header, value: () => null }))).replace(/\r\n/g, '\n'), 'utf8'),
      contentType: 'text/csv; charset=utf-8',
    }));
  }

  const dataSheets = definition.sheets.map((sheet) => ({
    name: sheet.sheetName,
    columns: sheet.columns.map((column) => ({ header: column.header, width: 26 })),
    rows: [],
  }));
  const instructionRows: (string | null)[][] = definition.sheets.flatMap((sheet) =>
    sheet.columns.map((column) => [
      sheet.sheetName,
      column.header,
      column.required ? 'Sí' : 'No',
      column.description,
      column.maxLength === null ? null : String(column.maxLength),
      column.example,
    ]),
  );
  const workbook = await writeTextWorkbook([
    ...dataSheets,
    {
      name: 'Instrucciones',
      columns: [
        { header: 'Hoja', width: 16 },
        { header: 'Columna', width: 28 },
        { header: 'Obligatoria', width: 12 },
        { header: 'Formato', width: 80 },
        { header: 'Longitud máxima', width: 16 },
        { header: 'Ejemplo', width: 30 },
      ],
      rows: [
        ...instructionRows,
        [],
        ['Versión de plantilla', INITIAL_DATA_TEMPLATE_VERSION, null, 'Escriba los datos en las hojas de datos; todas las columnas deben estar presentes.', null, null],
      ],
    },
    {
      name: 'Valores válidos',
      columns: [
        { header: 'Columna', width: 34 },
        { header: 'Código', width: 20 },
        { header: 'Descripción', width: 40 },
      ],
      rows: templateValueRows(entity, values).map((row) => [row.group, row.code, row.label]),
    },
  ]);
  return [{ fileName: xlsxTemplateFileName(entity), content: workbook, contentType: XLSX_CONTENT_TYPE }];
}
