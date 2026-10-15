import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateProductDto, CreateProductFamilyDto } from '@/modules/products/dto/product-masters.dto';
import { CreateProjectDto } from '@/modules/projects/dto/project.dto';
import { CreateSafetyMinuteDto } from '@/modules/safety-minutes/dto/safety-minute.dto';

import type { ParsedSheet } from './initial-data-file-reader';
import { sanitizeSheet, SheetCollector, validateFamilyRows, validateMinuteRows, validateProductRows, validateProjectRows } from './initial-data-rows';
import { ENTITY_DEFINITIONS, type LoadSheet } from './initial-data-templates';

/**
 * Paridad con las validaciones HTTP. El cargador llama a los servicios sin `ValidationPipe`, que
 * es quien aplica los DTO en la API: cada valor que un DTO de alta rechaza debe rechazarlo también
 * `validate` (y los que acepta, aceptarse). Si un DTO cambia de regla, esta prueba lo delata.
 */

const FAMILIES = ENTITY_DEFINITIONS.products.sheets[0]!;
const PRODUCTS = ENTITY_DEFINITIONS.products.sheets[1]!;
const MINUTES = ENTITY_DEFINITIONS['safety-minutes'].sheets[0]!;
const PROJECTS = ENTITY_DEFINITIONS.projects.sheets[0]!;

const UUID = '3f2b8a52-4a4e-4c53-9f0a-0b6f2b6f6a11';

function loaderRejects(sheet: LoadSheet, row: Record<string, string>, validate: (rows: ReturnType<typeof sanitizeSheet>, collector: SheetCollector) => unknown): boolean {
  const collector = new SheetCollector(sheet);
  const parsed: ParsedSheet = {
    sheet,
    columnIndexes: new Map(sheet.columns.map((column, index) => [column.key, index])),
    rows: [{ fileRow: 2, cells: sheet.columns.map((column) => ({ kind: 'text' as const, text: row[column.key] ?? '' })) }],
  };
  validate(sanitizeSheet(parsed, collector), collector);
  return collector.hasError(2);
}

function dtoRejects<T extends object>(type: new () => T, plain: Record<string, unknown>): boolean {
  return validateSync(plainToInstance(type, plain)).length > 0;
}

interface Case {
  readonly name: string;
  /** Valores del archivo (texto) y su equivalente en el cuerpo del DTO. */
  readonly file: Record<string, string>;
  readonly dto: Record<string, unknown>;
  readonly invalid: boolean;
}

const BASE_FAMILY = { code: 'FAM-1', name: 'Familia', description: 'Descripción', sortOrder: '5' };
const BASE_PRODUCT = { sku: 'VAR-3/8', description: 'Varilla', family: 'FAM-1', baseUnit: 'TON' };
const BASE_MINUTE = { displayDate: '2030-05-01', message: 'Use el casco' };
const BASE_PROJECT = { name: 'Torre', customerCrmCode: 'CLI-000001' };

function familyCase(name: string, file: Partial<typeof BASE_FAMILY>, invalid: boolean): Case {
  const merged = { ...BASE_FAMILY, ...file };
  return { name, file: merged, dto: { ...merged, sortOrder: merged.sortOrder === '' ? undefined : Number(merged.sortOrder) }, invalid };
}

function productCase(name: string, file: Partial<typeof BASE_PRODUCT>, invalid: boolean): Case {
  const merged = { ...BASE_PRODUCT, ...file };
  return { name, file: merged, dto: { sku: merged.sku, description: merged.description, familyId: UUID, baseUnitId: UUID }, invalid };
}

function minuteCase(name: string, file: Partial<typeof BASE_MINUTE>, invalid: boolean): Case {
  const merged = { ...BASE_MINUTE, ...file };
  return { name, file: merged, dto: { ...merged }, invalid };
}

function projectCase(name: string, file: Record<string, string>, invalid: boolean): Case {
  const merged: Record<string, string> = { ...BASE_PROJECT, ...file };
  const dto: Record<string, unknown> = { name: merged['name'], customerId: UUID };
  for (const key of ['city', 'address', 'description', 'estimatedStartDate', 'estimatedEndDate', 'estimatedDecisionDate', 'code']) {
    if (merged[key] !== undefined) dto[key] = merged[key];
  }
  return { name, file: merged, dto, invalid };
}

describe('paridad con los DTO de alta: familias (CreateProductFamilyDto)', () => {
  it.each([
    familyCase('código válido en minúsculas', { code: 'fam_2' }, false),
    familyCase('orden en el límite', { sortOrder: '100000' }, false),
    familyCase('sin descripción ni orden', { description: '', sortOrder: '' }, false),
    familyCase('código con espacio', { code: 'mal código' }, true),
    familyCase('código de 41 caracteres', { code: 'A'.repeat(41) }, true),
    familyCase('código que empieza por guion', { code: '-X' }, true),
    familyCase('nombre vacío', { name: '' }, true),
    familyCase('nombre de 121 caracteres', { name: 'n'.repeat(121) }, true),
    familyCase('descripción de 401 caracteres', { description: 'd'.repeat(401) }, true),
    familyCase('orden mayor al máximo', { sortOrder: '100001' }, true),
    familyCase('orden negativo', { sortOrder: '-1' }, true),
  ])('$name', ({ file, dto, invalid }) => {
    expect(dtoRejects(CreateProductFamilyDto, dto)).toBe(invalid);
    expect(loaderRejects(FAMILIES, file, (rows, collector) => validateFamilyRows(rows, collector))).toBe(invalid);
  });
});

describe('paridad con los DTO de alta: productos (CreateProductDto)', () => {
  it.each([
    productCase('SKU válido con barra y minúsculas', { sku: 'var-3/8 x' }, false),
    productCase('SKU de 60 caracteres', { sku: 'A'.repeat(60) }, false),
    productCase('SKU con signo no permitido', { sku: 'a$b' }, true),
    productCase('SKU de 61 caracteres', { sku: 'A'.repeat(61) }, true),
    productCase('SKU que empieza por guion', { sku: '-A' }, true),
    productCase('descripción vacía', { description: '' }, true),
    productCase('descripción de 301 caracteres', { description: 'd'.repeat(301) }, true),
  ])('$name', ({ file, dto, invalid }) => {
    expect(dtoRejects(CreateProductDto, dto)).toBe(invalid);
    expect(loaderRejects(PRODUCTS, file, (rows, collector) => validateProductRows(rows, collector))).toBe(invalid);
  });
});

describe('paridad con los DTO de alta: minutos de seguridad (CreateSafetyMinuteDto)', () => {
  it.each([
    minuteCase('mensaje de 1000 caracteres', { message: 'a'.repeat(1000) }, false),
    minuteCase('CRLF cuenta como un solo salto al medir', { message: `${'a'.repeat(499)}\r\n${'a'.repeat(499)}` }, false),
    minuteCase('mensaje de 1001 caracteres', { message: 'a'.repeat(1001) }, true),
    minuteCase('un emoji cuenta como un carácter (como en el DTO)', { message: '\u{1F600}'.repeat(501) }, false),
    minuteCase('1001 emojis', { message: '\u{1F600}'.repeat(1001) }, true),
    minuteCase('carácter de control', { message: 'Hola\u0007mundo' }, true),
    minuteCase('carácter bidi', { message: 'Texto ‮invertido' }, true),
    minuteCase('solo rellenos invisibles', { message: '​​' }, true),
    minuteCase('mensaje vacío', { message: '' }, true),
    minuteCase('fecha inexistente', { displayDate: '2030-02-30' }, true),
    minuteCase('fecha con otro formato', { displayDate: '01/05/2030' }, true),
  ])('$name', ({ file, dto, invalid }) => {
    expect(dtoRejects(CreateSafetyMinuteDto, dto)).toBe(invalid);
    expect(loaderRejects(MINUTES, file, (rows, collector) => validateMinuteRows(rows, collector))).toBe(invalid);
  });
});

describe('paridad con los DTO de alta: proyectos (CreateProjectDto)', () => {
  it.each([
    projectCase('nombre de 200 caracteres', { name: 'n'.repeat(200) }, false),
    projectCase('ciudad, dirección y descripción en el límite', { city: 'c'.repeat(120), address: 'a'.repeat(300), description: 'd'.repeat(10000) }, false),
    projectCase('fechas válidas', { estimatedStartDate: '2027-01-15', estimatedEndDate: '2027-12-15', estimatedDecisionDate: '2026-12-01' }, false),
    projectCase('código de 30 caracteres', { code: 'A'.repeat(30) }, false),
    projectCase('nombre de 201 caracteres', { name: 'n'.repeat(201) }, true),
    projectCase('nombre vacío', { name: '' }, true),
    projectCase('ciudad de 121 caracteres', { city: 'c'.repeat(121) }, true),
    projectCase('dirección de 301 caracteres', { address: 'a'.repeat(301) }, true),
    projectCase('descripción de 10001 caracteres', { description: 'd'.repeat(10001) }, true),
    projectCase('código de 31 caracteres', { code: 'A'.repeat(31) }, true),
    projectCase('fecha de inicio inexistente', { estimatedStartDate: '2027-02-30' }, true),
    projectCase('fecha de fin con otro formato', { estimatedEndDate: '15/12/2027' }, true),
    projectCase('fecha de decisión inexistente', { estimatedDecisionDate: '2026-13-01' }, true),
  ])('$name', ({ file, dto, invalid }) => {
    expect(dtoRejects(CreateProjectDto, dto)).toBe(invalid);
    expect(loaderRejects(PROJECTS, file, (rows, collector) => validateProjectRows(rows, collector))).toBe(invalid);
  });

  it('el cargador es más estricto que el DTO en el código manual: solo letras, dígitos, guion y guion bajo', () => {
    for (const code of ['=1+1', '@x', 'con espacio', 'a.b']) {
      expect(dtoRejects(CreateProjectDto, { name: 'Torre', customerId: UUID, code })).toBe(false);
      expect(loaderRejects(PROJECTS, { ...BASE_PROJECT, code }, (rows, collector) => validateProjectRows(rows, collector))).toBe(true);
    }
  });
});
