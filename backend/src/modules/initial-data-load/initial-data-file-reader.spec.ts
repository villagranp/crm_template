import { writeTextWorkbook } from '@/common/xlsx';

import { DEFAULT_READ_LIMITS, type LoadFile, type LoadSource, matchSheetHeaders, readLoadSource } from './initial-data-file-reader';
import { ENTITY_DEFINITIONS } from './initial-data-templates';

const PROJECTS = ENTITY_DEFINITIONS.projects;
const PRODUCTS = ENTITY_DEFINITIONS.products;
const MINUTES = ENTITY_DEFINITIONS['safety-minutes'];
const PROJECT_HEADERS = PROJECTS.sheets[0]!.columns.map((column) => column.header);
const FAMILY_HEADERS = PRODUCTS.sheets[0]!.columns.map((column) => column.header);
const PRODUCT_HEADERS = PRODUCTS.sheets[1]!.columns.map((column) => column.header);

function csv(...lines: string[]): LoadFile {
  return { fileName: 'datos.csv', buffer: Buffer.from(lines.join('\r\n'), 'utf8') };
}

function csvSource(entityFile: LoadFile, families?: LoadFile): LoadSource {
  return { format: 'CSV', files: { projects: entityFile, products: entityFile, 'safety-minutes': entityFile, ...(families ? { families } : {}) } };
}

function projectRow(overrides: Record<string, string> = {}): string {
  const base: Record<string, string> = { 'Nombre del proyecto': 'Torre Ejemplo', 'Código CRM del cliente': 'CLI-1' };
  const values = { ...base, ...overrides };
  return PROJECT_HEADERS.map((header) => values[header] ?? '').join(',');
}

describe('readLoadSource (CSV)', () => {
  it('lee las filas con el número de fila del archivo (el encabezado es la fila 1)', async () => {
    const result = await readLoadSource(PROJECTS, csvSource(csv(PROJECT_HEADERS.join(','), projectRow(), projectRow({ 'Nombre del proyecto': 'Otra' }))));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0]!.rows.map((row) => row.fileRow)).toEqual([2, 3]);
    expect(result.sheets[0]!.columnIndexes.get('name')).toBe(0);
  });

  it('acepta el orden libre de columnas, los acentos y las mayúsculas del encabezado y el separador ;', async () => {
    const reordered = [...PROJECT_HEADERS].reverse().map((header) => header.toUpperCase().normalize('NFD').replace(/\p{M}/gu, ''));
    const result = await readLoadSource(PROJECTS, csvSource(csv(reordered.join(';'), PROJECT_HEADERS.map(() => 'x').join(';'))));
    expect(result.ok).toBe(true);
  });

  it('conserva la posición de las filas vacías en la numeración', async () => {
    const result = await readLoadSource(PROJECTS, csvSource(csv(PROJECT_HEADERS.join(','), projectRow(), ','.repeat(PROJECT_HEADERS.length - 1), projectRow())));
    expect(result.ok && result.sheets[0]!.rows.map((row) => row.fileRow)).toEqual([2, 4]);
  });

  it('rechaza completo el archivo con columnas que faltan, que sobran o repetidas, sin citar datos', async () => {
    const headers = [...PROJECT_HEADERS.slice(1), 'Columna Extra', PROJECT_HEADERS[1]!];
    const result = await readLoadSource(PROJECTS, csvSource(csv(headers.join(','), headers.map(() => 'secreto-123').join(','))));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((problem) => [problem.code, problem.column])).toEqual([
      ['UNKNOWN_COLUMN', 'Columna Extra'],
      ['DUPLICATE_COLUMN', PROJECT_HEADERS[1]],
      ['MISSING_COLUMN', PROJECT_HEADERS[0]],
    ]);
    expect(JSON.stringify(result.problems)).not.toContain('secreto-123');
  });

  it('un archivo sin filas de datos es NO_DATA_ROWS', async () => {
    const result = await readLoadSource(PROJECTS, csvSource(csv(PROJECT_HEADERS.join(','))));
    expect(result).toMatchObject({ ok: false, problems: [{ code: 'NO_DATA_ROWS', row: null }] });
  });

  it('rechaza un archivo vacío, una codificación que no es UTF-8 y un CSV mal formado', async () => {
    const empty = await readLoadSource(PROJECTS, csvSource({ fileName: 'a.csv', buffer: Buffer.alloc(0) }));
    expect(empty).toMatchObject({ ok: false, problems: [{ code: 'EMPTY_FILE' }] });
    const latin1 = await readLoadSource(PROJECTS, csvSource({ fileName: 'a.csv', buffer: Buffer.from([0x4e, 0xf1, 0x61, 0x0a, 0x31]) }));
    expect(latin1).toMatchObject({ ok: false, problems: [{ code: 'INVALID_ENCODING' }] });
    const malformed = await readLoadSource(PROJECTS, csvSource(csv(PROJECT_HEADERS.join(','), '"sin cerrar')));
    expect(malformed).toMatchObject({ ok: false, problems: [{ code: 'MALFORMED_CSV' }] });
  });

  it('rechaza más filas que el límite', async () => {
    const lines = [PROJECT_HEADERS.join(',')];
    for (let index = 0; index < 4; index += 1) lines.push(projectRow({ 'Nombre del proyecto': `P${index}` }));
    const result = await readLoadSource(PROJECTS, csvSource(csv(...lines)), { ...DEFAULT_READ_LIMITS, maxRows: 3 });
    expect(result).toMatchObject({ ok: false, problems: [{ code: 'TOO_MANY_ROWS' }] });
  });

  it('rechaza una extensión o un contenido que no corresponden a un CSV', async () => {
    const wrongExtension = await readLoadSource(PROJECTS, csvSource({ fileName: 'a.txt', buffer: Buffer.from('a,b') }));
    expect(wrongExtension).toMatchObject({ ok: false, problems: [{ code: 'UNSUPPORTED_FILE_TYPE' }] });
    const binary = await readLoadSource(PROJECTS, csvSource({ fileName: 'a.csv', buffer: Buffer.from('%PDF-1.4 ...') }));
    expect(binary).toMatchObject({ ok: false, problems: [{ code: 'UNSUPPORTED_FILE_TYPE' }] });
  });

  it('productos: la hoja de familias del CSV es opcional; si falta se trata como vacía', async () => {
    const products = csv(PRODUCT_HEADERS.join(','), 'SKU-1,Producto,FAM,TON');
    const without = await readLoadSource(PRODUCTS, csvSource(products));
    expect(without.ok && without.sheets.map((sheet) => [sheet.sheet.id, sheet.rows.length])).toEqual([
      ['families', 0],
      ['products', 1],
    ]);
    const withFamilies = await readLoadSource(PRODUCTS, csvSource(products, csv(FAMILY_HEADERS.join(','), 'FAM,Familia,,')));
    expect(withFamilies.ok && withFamilies.sheets.map((sheet) => [sheet.sheet.id, sheet.rows.length])).toEqual([
      ['families', 1],
      ['products', 1],
    ]);
  });

  it('productos: un encabezado erróneo en la hoja de familias rechaza el archivo y nombra la hoja', async () => {
    const result = await readLoadSource(PRODUCTS, csvSource(csv(PRODUCT_HEADERS.join(','), 'SKU-1,Producto,FAM,TON'), csv('Otro', 'x')));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.every((problem) => problem.sheet === 'Familias')).toBe(true);
    expect(result.problems.map((problem) => problem.code)).toContain('MISSING_COLUMN');
  });
});

describe('readLoadSource (XLSX)', () => {
  async function workbook(sheets: { name: string; headers: readonly string[]; rows: (string | null)[][] }[]): Promise<LoadSource> {
    const buffer = await writeTextWorkbook(sheets.map((sheet) => ({ name: sheet.name, columns: sheet.headers.map((header) => ({ header })), rows: sheet.rows })));
    return { format: 'XLSX', file: { fileName: 'datos.xlsx', buffer } };
  }

  it('lee cada hoja por su nombre exacto con el número de fila de Excel', async () => {
    const source = await workbook([
      { name: 'Familias', headers: FAMILY_HEADERS, rows: [['FAM', 'Familia', null, null]] },
      { name: 'Productos', headers: PRODUCT_HEADERS, rows: [['SKU-1', 'P1', 'FAM', 'TON'], ['SKU-2', 'P2', 'FAM', 'TON']] },
    ]);
    const result = await readLoadSource(PRODUCTS, source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sheets.map((sheet) => [sheet.sheet.id, sheet.rows.map((row) => row.fileRow)])).toEqual([
      ['families', [2]],
      ['products', [2, 3]],
    ]);
  });

  it('exige todas las hojas: no recurre a la primera hoja si falta una', async () => {
    const source = await workbook([{ name: 'Productos', headers: PRODUCT_HEADERS, rows: [['SKU-1', 'P1', 'FAM', 'TON']] }]);
    const result = await readLoadSource(PRODUCTS, source);
    expect(result).toMatchObject({ ok: false, problems: [{ code: 'SHEET_NOT_FOUND', sheet: 'Familias' }] });
  });

  it('rechaza una firma que no es un XLSX, un contenedor OLE y un ZIP dañado', async () => {
    const notZip = await readLoadSource(MINUTES, { format: 'XLSX', file: { fileName: 'a.xlsx', buffer: Buffer.from('no es un zip') } });
    expect(notZip).toMatchObject({ ok: false, problems: [{ code: 'UNSUPPORTED_FILE_TYPE' }] });
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
    expect(await readLoadSource(MINUTES, { format: 'XLSX', file: { fileName: 'a.xlsx', buffer: ole } })).toMatchObject({
      ok: false,
      problems: [{ code: 'UNSUPPORTED_FILE_TYPE' }],
    });
    const truncated = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]);
    const damaged = await readLoadSource(MINUTES, { format: 'XLSX', file: { fileName: 'a.xlsx', buffer: truncated } });
    expect(damaged.ok).toBe(false);
  });

  it('las celdas de texto llegan como texto (las de otro tipo se distinguen al sanear)', async () => {
    const source = await workbook([{ name: 'Minutos', headers: MINUTES.sheets[0]!.columns.map((column) => column.header), rows: [['2030-01-01', 'Mensaje']] }]);
    const result = await readLoadSource(MINUTES, source);
    expect(result.ok && result.sheets[0]!.rows[0]!.cells).toEqual([
      { kind: 'text', text: '2030-01-01' },
      { kind: 'text', text: 'Mensaje' },
    ]);
  });
});

describe('matchSheetHeaders', () => {
  const sheet = PROJECTS.sheets[0]!;

  it('ignora los encabezados vacíos del final', () => {
    const match = matchSheetHeaders(sheet, [...PROJECT_HEADERS, '', '  ']);
    expect(match.problems).toEqual([]);
    expect(match.columnIndexes.size).toBe(sheet.columns.length);
  });

  it('recorta y neutraliza el encabezado desconocido que cita en el informe', () => {
    const match = matchSheetHeaders(sheet, [...PROJECT_HEADERS, `Extra\n${'x'.repeat(100)}`]);
    expect(match.problems).toHaveLength(1);
    expect(match.problems[0]!.column).not.toContain('\n');
    expect(match.problems[0]!.column!.length).toBeLessThanOrEqual(60);
  });
});
