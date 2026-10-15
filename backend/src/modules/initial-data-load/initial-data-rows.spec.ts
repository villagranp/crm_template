import type { XlsxCellValue } from '@/common/xlsx';

import type { ParsedSheet } from './initial-data-file-reader';
import {
  findDuplicateRows,
  type LoadRow,
  parseOwnerReference,
  sanitizeSheet,
  SheetCollector,
  validateFamilyRows,
  validateMinuteRows,
  validateProductRows,
  validateProjectRows,
} from './initial-data-rows';
import { ENTITY_DEFINITIONS, type LoadSheet } from './initial-data-templates';

const PROJECTS = ENTITY_DEFINITIONS.projects.sheets[0]!;
const FAMILIES = ENTITY_DEFINITIONS.products.sheets[0]!;
const PRODUCTS = ENTITY_DEFINITIONS.products.sheets[1]!;
const MINUTES = ENTITY_DEFINITIONS['safety-minutes'].sheets[0]!;

type Cell = XlsxCellValue | string | null;

function toCell(cell: Cell): XlsxCellValue {
  if (cell === null) return { kind: 'empty' };
  return typeof cell === 'string' ? { kind: 'text', text: cell } : cell;
}

/** Hoja parseada con las columnas en el orden de la plantilla; `rows[i]` por clave de columna. */
function parsed(sheet: LoadSheet, rows: Record<string, Cell>[]): ParsedSheet {
  return {
    sheet,
    columnIndexes: new Map(sheet.columns.map((column, index) => [column.key, index])),
    rows: rows.map((row, index) => ({ fileRow: index + 2, cells: sheet.columns.map((column) => toCell(row[column.key] ?? null)) })),
  };
}

function load(sheet: LoadSheet, rows: Record<string, Cell>[]): { rows: LoadRow[]; collector: SheetCollector } {
  const collector = new SheetCollector(sheet);
  return { rows: sanitizeSheet(parsed(sheet, rows), collector), collector };
}

function errors(collector: SheetCollector): [number | null, string | null, string][] {
  return collector.entries.filter((entry) => entry.status === 'ERROR').map((entry) => [entry.row, entry.column, entry.code]);
}

describe('sanitizeSheet', () => {
  it('recorta espacios y trata lo vacío como ausente', () => {
    const { rows, collector } = load(PROJECTS, [{ name: '  Torre  ', customerCrmCode: ' CLI-1 ', city: '   ' }]);
    expect(rows[0]!.values).toMatchObject({ name: 'Torre', customerCrmCode: 'CLI-1', city: null });
    expect(collector.entries).toEqual([]);
  });

  it('marca los obligatorios que faltan con su columna y fila', () => {
    const { collector } = load(PROJECTS, [{ name: 'Torre' }, { customerCrmCode: 'CLI-1' }]);
    expect(errors(collector)).toEqual([
      [2, 'Código CRM del cliente', 'REQUIRED_FIELD_MISSING'],
      [3, 'Nombre del proyecto', 'REQUIRED_FIELD_MISSING'],
    ]);
  });

  it.each(['=1+1', '+5', '-5', '@SUMA(A1)', '\t=1', '=HYPERLINK("http://x")'])('un texto libre que empieza por una marca de fórmula (%j) es FORMULA_NOT_ALLOWED', (text) => {
    const { rows, collector } = load(PROJECTS, [{ name: text, customerCrmCode: 'CLI-1' }]);
    expect(errors(collector)).toEqual([[2, 'Nombre del proyecto', 'FORMULA_NOT_ALLOWED']]);
    expect(rows[0]!.values['name']).toBeNull();
  });

  it('una fórmula real de Excel se rechaza sin usar su valor', () => {
    const { collector } = load(PROJECTS, [{ name: { kind: 'formula' }, customerCrmCode: 'CLI-1' }]);
    expect(errors(collector)).toEqual([[2, 'Nombre del proyecto', 'FORMULA_NOT_ALLOWED']]);
  });

  it('el apóstrofo que añade la neutralización del archivo de errores se quita al leer, y la regla se aplica igual', () => {
    expect(errors(load(PROJECTS, [{ name: "'Torre", customerCrmCode: 'CLI-1' }]).collector)).toEqual([]);
    expect(errors(load(PROJECTS, [{ name: "'=1+1", customerCrmCode: 'CLI-1' }]).collector)).toEqual([[2, 'Nombre del proyecto', 'FORMULA_NOT_ALLOWED']]);
  });

  it('una columna de código no admite la regla de fórmulas de texto libre (un código puede empezar por -)', () => {
    const { collector } = load(FAMILIES, [{ code: '-X', name: 'Familia' }]);
    expect(errors(collector)).toEqual([]);
  });

  it('excede la longitud máxima sin repetir el valor', () => {
    const { collector } = load(PROJECTS, [{ name: 'x'.repeat(201), customerCrmCode: 'CLI-1' }]);
    expect(errors(collector)).toEqual([[2, 'Nombre del proyecto', 'MAX_LENGTH']]);
    expect(JSON.stringify(collector.entries)).not.toContain('xxxxxxxx');
  });

  it('una fecha de Excel en una columna de fecha pide el formato de texto; un texto inválido es INVALID_DATE', () => {
    const { rows, collector } = load(PROJECTS, [
      { name: 'A', customerCrmCode: 'CLI-1', estimatedStartDate: { kind: 'date' } },
      { name: 'B', customerCrmCode: 'CLI-1', estimatedStartDate: '2027-02-30' },
      { name: 'C', customerCrmCode: 'CLI-1', estimatedStartDate: '15/01/2027' },
      { name: 'D', customerCrmCode: 'CLI-1', estimatedStartDate: '2027-01-15' },
      { name: 'E', customerCrmCode: 'CLI-1', estimatedStartDate: { kind: 'number', value: 46037 } },
    ]);
    expect(errors(collector)).toEqual([
      [2, 'Fecha estimada de inicio', 'INVALID_DATE'],
      [3, 'Fecha estimada de inicio', 'INVALID_DATE'],
      [4, 'Fecha estimada de inicio', 'INVALID_DATE'],
      [6, 'Fecha estimada de inicio', 'INVALID_DATE'],
    ]);
    expect(rows[3]!.values['estimatedStartDate']).toBe('2027-01-15');
  });

  it('el orden de la familia debe ser un entero de 0 a 100000', () => {
    const { collector } = load(FAMILIES, [
      { code: 'A', name: 'a', sortOrder: '10' },
      { code: 'B', name: 'b', sortOrder: { kind: 'number', value: 7 } },
      { code: 'C', name: 'c', sortOrder: '-1' },
      { code: 'D', name: 'd', sortOrder: '100001' },
      { code: 'E', name: 'e', sortOrder: { kind: 'number', value: 1.5 } },
      { code: 'F', name: 'f', sortOrder: 'diez' },
    ]);
    expect(errors(collector)).toEqual([
      [4, 'Orden', 'INVALID_INTEGER'],
      [5, 'Orden', 'INVALID_INTEGER'],
      [6, 'Orden', 'INVALID_INTEGER'],
      [7, 'Orden', 'INVALID_INTEGER'],
    ]);
  });

  it('booleanos y errores de celda no son texto', () => {
    const { collector } = load(PROJECTS, [{ name: { kind: 'boolean' }, customerCrmCode: { kind: 'error' } }]);
    expect(errors(collector)).toEqual([
      [2, 'Nombre del proyecto', 'INVALID_CELL_TYPE'],
      [2, 'Código CRM del cliente', 'INVALID_CELL_TYPE'],
    ]);
  });

  it('ningún mensaje ni incidencia contiene el valor de la celda', () => {
    const { collector } = load(PROJECTS, [{ name: '=CONFIDENCIAL-PII', customerCrmCode: '', estimatedStartDate: 'valor-secreto' }]);
    expect(JSON.stringify(collector.entries)).not.toMatch(/CONFIDENCIAL|secreto/);
  });
});

describe('findDuplicateRows', () => {
  it('marca todas las filas del grupo apuntando a otra fila', () => {
    const duplicates = findDuplicateRows([
      { fileRow: 2, key: 'a' },
      { fileRow: 3, key: 'b' },
      { fileRow: 4, key: 'a' },
      { fileRow: 5, key: null },
      { fileRow: 6, key: 'a' },
    ]);
    expect([...duplicates]).toEqual([
      [2, 4],
      [4, 2],
      [6, 2],
    ]);
  });
});

describe('validateFamilyRows', () => {
  it('normaliza el código a mayúsculas, aplica el orden por defecto y devuelve borradores', () => {
    const { rows, collector } = load(FAMILIES, [{ code: ' acero-largo ', name: 'Aceros', description: 'D', sortOrder: '10' }, { code: 'B_2', name: 'Otra' }]);
    expect(validateFamilyRows(rows, collector)).toEqual([
      { fileRow: 2, code: 'ACERO-LARGO', name: 'Aceros', description: 'D', sortOrder: 10 },
      { fileRow: 3, code: 'B_2', name: 'Otra', description: null, sortOrder: 0 },
    ]);
  });

  it('rechaza un código con caracteres no permitidos y detecta duplicados dentro del archivo', () => {
    const { rows, collector } = load(FAMILIES, [
      { code: 'mal código', name: 'a' },
      { code: 'dup', name: 'b' },
      { code: 'DUP', name: 'c' },
    ]);
    expect(validateFamilyRows(rows, collector)).toEqual([]);
    expect(errors(collector)).toEqual([
      [2, 'Código de familia', 'INVALID_FORMAT'],
      [3, 'Código de familia', 'DUPLICATE_IN_FILE'],
      [4, 'Código de familia', 'DUPLICATE_IN_FILE'],
    ]);
    expect(collector.entries.find((entry) => entry.row === 3)!.message).toBe('El código de familia se repite en la fila 4 del archivo.');
  });
});

describe('validateProductRows', () => {
  it('normaliza SKU, familia y unidad a mayúsculas', () => {
    const { rows, collector } = load(PRODUCTS, [{ sku: ' var-3/8 ', description: 'Varilla', family: 'acero', baseUnit: 'und' }]);
    expect(validateProductRows(rows, collector)).toEqual([{ fileRow: 2, sku: 'VAR-3/8', description: 'Varilla', familyCode: 'ACERO', baseUnitCode: 'UND' }]);
  });

  it('rechaza un SKU con caracteres no permitidos, uno repetido y los obligatorios que faltan', () => {
    const { rows, collector } = load(PRODUCTS, [
      { sku: 'a$b', description: 'x', family: 'F', baseUnit: 'U' },
      { sku: 'S1', description: 'x', family: 'F', baseUnit: 'U' },
      { sku: 's1', description: 'x', family: 'F', baseUnit: 'U' },
      { sku: 'S2', description: 'x', family: 'F' },
    ]);
    expect(validateProductRows(rows, collector)).toEqual([]);
    expect(errors(collector)).toEqual([
      [5, 'Código de unidad base', 'REQUIRED_FIELD_MISSING'],
      [2, 'SKU', 'INVALID_FORMAT'],
      [3, 'SKU', 'DUPLICATE_IN_FILE'],
      [4, 'SKU', 'DUPLICATE_IN_FILE'],
    ]);
  });
});

describe('validateProjectRows', () => {
  const base = { name: 'Torre', customerCrmCode: 'cli-2026-00001' };

  it('arma el borrador: cliente y código en mayúsculas, país ISO, responsable por correo o código', () => {
    const { rows, collector } = load(PROJECTS, [
      { ...base, country: 'gt', owner: 'Responsable@Example.Invalid', projectType: 'edificio', sector: 'comercial', code: ' pry-1 ', estimatedStartDate: '2027-01-01', estimatedEndDate: '2027-02-01' },
      { name: 'Otra', customerCrmCode: 'CLI-2', owner: 'ABC123' },
    ]);
    const drafts = validateProjectRows(rows, collector);
    expect(collector.entries).toEqual([]);
    expect(drafts[0]).toMatchObject({
      customerCrmCode: 'CLI-2026-00001',
      countryIso: 'GT',
      owner: { kind: 'email', value: 'responsable@example.invalid' },
      projectTypeCode: 'EDIFICIO',
      sectorCode: 'COMERCIAL',
      code: 'PRY-1',
    });
    expect(drafts[1]).toMatchObject({ countryIso: null, owner: { kind: 'employeeCode', value: 'ABC123' }, projectTypeCode: null, code: null });
  });

  it('la fecha de fin anterior a la de inicio es INVALID_DATE_RANGE; la de decisión no se restringe', () => {
    const { rows, collector } = load(PROJECTS, [
      { ...base, estimatedStartDate: '2027-03-01', estimatedEndDate: '2027-02-01' },
      { ...base, name: 'B', estimatedStartDate: '2027-03-01', estimatedDecisionDate: '2020-01-01' },
    ]);
    expect(validateProjectRows(rows, collector)).toHaveLength(1);
    expect(errors(collector)).toEqual([[2, 'Fecha estimada de fin', 'INVALID_DATE_RANGE']]);
  });

  it('el país debe ser un código de dos letras', () => {
    const { rows, collector } = load(PROJECTS, [{ ...base, country: 'GTM' }, { ...base, name: 'B', country: 'G1' }]);
    validateProjectRows(rows, collector);
    expect(errors(collector)).toEqual([
      [2, 'País', 'INVALID_FORMAT'],
      [3, 'País', 'INVALID_FORMAT'],
    ]);
  });

  it('detecta duplicados por código de proyecto y por cliente + nombre (sin acentos ni mayúsculas)', () => {
    const { rows, collector } = load(PROJECTS, [
      { ...base, name: 'Torre Ñandú', code: 'p1' },
      { ...base, name: 'Otro', code: 'P1' },
      { ...base, name: 'torre nandu' },
      { name: 'Torre Ñandú', customerCrmCode: 'OTRO-CLIENTE' },
    ]);
    const drafts = validateProjectRows(rows, collector);
    expect(errors(collector)).toEqual([
      [2, 'Código de proyecto', 'DUPLICATE_IN_FILE'],
      [3, 'Código de proyecto', 'DUPLICATE_IN_FILE'],
      [2, 'Nombre del proyecto', 'DUPLICATE_IN_FILE'],
      [4, 'Nombre del proyecto', 'DUPLICATE_IN_FILE'],
    ]);
    expect(drafts.map((draft) => draft.fileRow)).toEqual([5]);
  });
});

describe('validateMinuteRows', () => {
  it('normaliza los saltos de línea del mensaje y detecta fechas repetidas', () => {
    const { rows, collector } = load(MINUTES, [
      { displayDate: '2030-01-01', message: 'Línea 1\r\nLínea 2' },
      { displayDate: '2030-01-02', message: 'Otro' },
      { displayDate: '2030-01-02', message: 'Repetido' },
    ]);
    const drafts = validateMinuteRows(rows, collector);
    expect(drafts).toEqual([{ fileRow: 2, displayDate: '2030-01-01', message: 'Línea 1\nLínea 2' }]);
    expect(errors(collector)).toEqual([
      [3, 'Fecha de visualización', 'DUPLICATE_IN_FILE'],
      [4, 'Fecha de visualización', 'DUPLICATE_IN_FILE'],
    ]);
  });

  it('rechaza caracteres de control o de formato bidi y un mensaje de más de 1000 caracteres', () => {
    const { rows, collector } = load(MINUTES, [
      { displayDate: '2030-01-01', message: 'Hola\u0007mundo' },
      { displayDate: '2030-01-02', message: 'Texto ‮invertido' },
      { displayDate: '2030-01-03', message: `${'a'.repeat(1000)}` },
      { displayDate: '2030-01-04', message: 'a'.repeat(1001) },
    ]);
    const drafts = validateMinuteRows(rows, collector);
    expect(drafts.map((draft) => draft.fileRow)).toEqual([4]);
    expect(errors(collector)).toEqual([
      [5, 'Mensaje', 'MAX_LENGTH'],
      [2, 'Mensaje', 'INVALID_FORMAT'],
      [3, 'Mensaje', 'INVALID_FORMAT'],
    ]);
  });
});

describe('parseOwnerReference', () => {
  it('distingue el correo (minúsculas) del código de colaborador (tal cual)', () => {
    expect(parseOwnerReference('Persona@Example.Invalid')).toEqual({ kind: 'email', value: 'persona@example.invalid' });
    expect(parseOwnerReference('Emp-0042')).toEqual({ kind: 'employeeCode', value: 'Emp-0042' });
  });
});

describe('SheetCollector', () => {
  it('cuenta filas, no incidencias, y separa errores de omitidas', () => {
    const collector = new SheetCollector(PROJECTS);
    collector.error(2, 'name', 'X', 'a');
    collector.error(2, 'code', 'Y', 'b');
    collector.exists(3, 'code', 'ya existe');
    expect(collector.errorRowCount).toBe(1);
    expect(collector.existingRowCount).toBe(1);
    expect(collector.hasError(2)).toBe(true);
    expect(collector.isExisting(3)).toBe(true);
    expect(collector.entries.map((entry) => entry.status)).toEqual(['ERROR', 'ERROR', 'EXISTS']);
  });
});
