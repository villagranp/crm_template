import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readCsv } from '@/common/csv-reader';
import { readSheetRows, type XlsxCellValue } from '@/common/xlsx';
import { normalizeHeader } from '@/modules/customer-imports/import-template';

import { buildTemplateFiles, templateValueRows } from './initial-data-template-files';
import {
  csvFileName,
  ENTITY_DEFINITIONS,
  INITIAL_DATA_ENTITIES,
  INITIAL_DATA_TEMPLATE_VERSION,
  type InitialDataEntity,
  isInitialDataEntity,
  sanitizableColumn,
} from './initial-data-templates';
import type { TemplateValueSet } from './ports/initial-data-lookup.port';

/** Plantillas versionadas del repositorio: `docs/templates/` (raíz del repo). */
const TEMPLATES_DIR = resolve(__dirname, '../../../../docs/templates');

const VALUES: TemplateValueSet = {
  countries: [{ code: 'GT', label: 'Guatemala' }],
  projectTypes: [{ code: 'EDIFICIO', label: 'Edificio' }],
  sectors: [{ code: 'COMERCIAL', label: 'Comercial' }],
  units: [{ code: 'TON', label: 'Tonelada' }],
  families: [{ code: 'ACERO-LARGO', label: 'Aceros largos' }],
};

const READ = { maxRows: 100, maxColumns: 30, timeoutMs: 10_000 };

function text(cell: XlsxCellValue | undefined): string {
  return cell?.kind === 'text' ? cell.text : '';
}

describe('definición de las plantillas de la carga inicial', () => {
  it.each(INITIAL_DATA_ENTITIES)('%s: claves y encabezados normalizados únicos por hoja', (entity) => {
    for (const sheet of ENTITY_DEFINITIONS[entity].sheets) {
      const keys = sheet.columns.map((column) => column.key);
      const headers = sheet.columns.map((column) => normalizeHeader(column.header));
      expect(new Set(keys).size).toBe(keys.length);
      expect(new Set(headers).size).toBe(headers.length);
    }
  });

  it('las familias se procesan antes que los productos y solo ellas son una hoja CSV opcional', () => {
    const sheets = ENTITY_DEFINITIONS.products.sheets;
    expect(sheets.map((sheet) => sheet.id)).toEqual(['families', 'products']);
    expect(sheets.map((sheet) => sheet.optionalInCsv)).toEqual([true, false]);
    expect(csvFileName('plantilla-productos', sheets[0]!)).toBe('plantilla-productos-familias.csv');
    expect(csvFileName('plantilla-productos', sheets[1]!)).toBe('plantilla-productos.csv');
  });

  it('reconoce las entidades válidas', () => {
    expect(INITIAL_DATA_ENTITIES.every(isInitialDataEntity)).toBe(true);
    expect(isInitialDataEntity('customers')).toBe(false);
  });

  it('las columnas de texto libre se sanean como texto y el resto como código', () => {
    const name = ENTITY_DEFINITIONS.projects.sheets[0]!.columns.find((column) => column.key === 'name')!;
    const date = ENTITY_DEFINITIONS.projects.sheets[0]!.columns.find((column) => column.key === 'estimatedStartDate')!;
    expect(sanitizableColumn(name)).toMatchObject({ kind: 'text', isFreeText: true, maxLength: 200 });
    expect(sanitizableColumn(date)).toMatchObject({ kind: 'code', isFreeText: false });
  });

  it('el proyecto exige solo nombre y cliente; el resto es opcional', () => {
    const required = ENTITY_DEFINITIONS.projects.sheets[0]!.columns.filter((column) => column.required).map((column) => column.key);
    expect(required).toEqual(['name', 'customerCrmCode']);
  });
});

describe('plantillas generadas', () => {
  it.each(INITIAL_DATA_ENTITIES)('%s en CSV: un archivo por hoja, BOM y encabezados del código', async (entity) => {
    const files = await buildTemplateFiles(entity, 'CSV', VALUES);
    const definition = ENTITY_DEFINITIONS[entity];
    expect(files.map((file) => file.fileName)).toEqual(definition.sheets.map((sheet) => csvFileName(definition.fileBase, sheet)));
    files.forEach((file, index) => {
      expect(file.content.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
      const header = file.content.toString('utf8').replace(/^﻿/, '').split(/\r?\n/)[0];
      expect(header).toBe(definition.sheets[index]!.columns.map((column) => column.header).join(','));
    });
  });

  it.each(INITIAL_DATA_ENTITIES)('%s en XLSX: hojas de datos vacías, Instrucciones con versión y Valores válidos', async (entity) => {
    const [file] = await buildTemplateFiles(entity, 'XLSX', VALUES);
    expect(file!.fileName).toBe(`${ENTITY_DEFINITIONS[entity].fileBase}.xlsx`);
    for (const sheet of ENTITY_DEFINITIONS[entity].sheets) {
      const data = await readSheetRows(file!.content, { preferredSheet: sheet.sheetName, exactSheet: true, ...READ });
      expect(data.headers.map(text)).toEqual(sheet.columns.map((column) => column.header));
      expect(data.rows).toEqual([]);
    }
    const instructions = await readSheetRows(file!.content, { preferredSheet: 'Instrucciones', exactSheet: true, ...READ });
    const version = instructions.rows.find((row) => text(row.cells[0]) === 'Versión de plantilla');
    expect(text(version?.cells[1])).toBe(INITIAL_DATA_TEMPLATE_VERSION);
    const valid = await readSheetRows(file!.content, { preferredSheet: 'Valores válidos', exactSheet: true, ...READ });
    expect(valid.rows.map((row) => [text(row.cells[0]), text(row.cells[1])])).toEqual(templateValueRows(entity, VALUES).map((row) => [row.group, row.code]));
  });

  it('los valores válidos de proyectos son países, tipos y sectores; los de productos, unidades y familias existentes', () => {
    expect(templateValueRows('projects', VALUES).map((row) => [row.group, row.code])).toEqual([
      ['País', 'GT'],
      ['Tipo de proyecto', 'EDIFICIO'],
      ['Sector', 'COMERCIAL'],
    ]);
    expect(templateValueRows('products', VALUES).map((row) => [row.group, row.code])).toEqual([
      ['Código de unidad base', 'TON'],
      ['Código de familia (existentes)', 'ACERO-LARGO'],
    ]);
    expect(templateValueRows('safety-minutes', VALUES)).toEqual([]);
  });

  it('nunca trae datos reales: los ejemplos usan el dominio .invalid o son ficticios', () => {
    const examples = INITIAL_DATA_ENTITIES.flatMap((entity) => ENTITY_DEFINITIONS[entity].sheets.flatMap((sheet) => sheet.columns.map((column) => column.example)));
    const emails = examples.filter((example) => example.includes('@'));
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.every((email) => email.endsWith('.invalid'))).toBe(true);
  });
});

/** AC: los encabezados de las plantillas versionadas coinciden con los que lee el código (versión de plantilla). */
describe('plantillas versionadas en docs/templates', () => {
  const entities = INITIAL_DATA_ENTITIES as readonly InitialDataEntity[];

  it.each(entities)('%s: los CSV versionados traen exactamente los encabezados del código', (entity) => {
    const definition = ENTITY_DEFINITIONS[entity];
    for (const sheet of definition.sheets) {
      const file = readFileSync(resolve(TEMPLATES_DIR, csvFileName(definition.fileBase, sheet)));
      const csv = readCsv(file, { maxRows: 10 });
      expect(csv.headers).toEqual(sheet.columns.map((column) => column.header));
      expect(csv.rows).toEqual([]);
    }
  });

  it.each(entities)('%s: el XLSX versionado trae las hojas, los encabezados y la versión del código', async (entity) => {
    const definition = ENTITY_DEFINITIONS[entity];
    const buffer = readFileSync(resolve(TEMPLATES_DIR, `${definition.fileBase}.xlsx`));
    for (const sheet of definition.sheets) {
      const data = await readSheetRows(buffer, { preferredSheet: sheet.sheetName, exactSheet: true, ...READ });
      expect(data.sheetName).toBe(sheet.sheetName);
      expect(data.headers.map(text)).toEqual(sheet.columns.map((column) => column.header));
      expect(data.rows).toEqual([]);
    }
    const instructions = await readSheetRows(buffer, { preferredSheet: 'Instrucciones', exactSheet: true, ...READ });
    const version = instructions.rows.find((row) => text(row.cells[0]) === 'Versión de plantilla');
    expect(text(version?.cells[1])).toBe(INITIAL_DATA_TEMPLATE_VERSION);
  });
});
