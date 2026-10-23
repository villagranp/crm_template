import ExcelJS from 'exceljs';
import type request from 'supertest';

import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { CustomerImportProcessor } from '@/modules/customer-imports/customer-import-processor';
import { CustomerImportsService } from '@/modules/customer-imports/customer-imports.service';
import {
  csvFile,
  type FixtureRow,
  minimalXlsxZip,
  oleFile,
  pngFile,
  rawSheetXlsx,
  TEMPLATE_HEADERS,
  xlsxFile,
} from '@/modules/customer-imports/testing/import-fixtures';

import {
  api,
  catalogItemId,
  type CrmUser,
  crmUser,
  EXCLUSIVE_TIMEOUT_MS,
  exclusiveParameters,
  insertCustomer,
  setParameter,
  testCountry,
  uniqueSuffix,
  withParameter,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 6 · Carga masiva de clientes (06 J.1–J.4, J.6; F-42).
 *
 * Todo en un archivo: la suite activa `crm.importaciones.habilitada` mientras
 * corre (y la restaura al final), y un segundo archivo que la cambiara en
 * paralelo rompería al otro. Países propios (`J1`–`J4`), usuarios nuevos y
 * nombres únicos: las aserciones nunca dependen de totales globales.
 */

const ENABLED = 'crm.importaciones.habilitada';
const MAX_ROWS = 'crm.importaciones.max_filas';
const MAX_MB = 'crm.importaciones.max_mb';
const REQUIRED_FIELDS = 'crm.campos_obligatorios';
const CODE_UNIQUENESS = 'crm.clientes.unicidad_codigo';
const DUPLICATE_RULES = 'crm.clientes.reglas_duplicidad';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const IMPORT_CODE = new RegExp(`^IMP-${new Date().getFullYear()}-\\d{4}$`);

let context: TestContext;
let restoreEnabled: () => Promise<void>;
let j1: string;
let j2: string;
let admin: CrmUser;
let author: CrmUser;
let other: CrmUser;

const IMPORT_GRANTS = ['importaciones.ver', 'importaciones.crear'];

function name(label: string): string {
  return `${label} ${uniqueSuffix()} S.A.`;
}

function upload(token: string, buffer: Buffer, filename = 'clientes.csv', contentType = 'text/csv'): request.Test {
  return api(context, token).post('/customer-imports').attach('file', buffer, { filename, contentType });
}

interface ImportBody {
  id: string;
  code: string;
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedRows: number;
  rejectedRows: number;
  warningRows: number;
  failureReason: string | null;
  canConfirm: boolean;
  hasErrorFile: boolean;
  isPurged: boolean;
}

interface RowBody {
  rowNumber: number;
  fileRowNumber: number;
  status: string;
  values: Record<string, string | null> | null;
  issues: { field: string; code: string; message: string; severity: string }[];
  duplicateOfRowNumber: number | null;
  duplicateOfCustomer: { id: string; crmCode: string; legalName: string } | null;
  customer: { id: string; crmCode: string } | null;
}

async function uploadOk(token: string, rows: FixtureRow[], options: Parameters<typeof csvFile>[1] = {}): Promise<ImportBody> {
  const response = await upload(token, csvFile(rows, options)).expect(201);
  return response.body as ImportBody;
}

async function rowsOf(token: string, importId: string, query = ''): Promise<RowBody[]> {
  const response = await api(context, token).get(`/customer-imports/${importId}/rows?pageSize=100${query}`).expect(200);
  return response.body.data as RowBody[];
}

async function confirm(token: string, importBody: ImportBody, includeRowsWithWarnings = false): Promise<ImportBody> {
  const response = await api(context, token)
    .post(`/customer-imports/${importBody.id}/confirmation`)
    .send({ expectedValidRows: importBody.validRows, includeRowsWithWarnings })
    .expect(202);
  expect(response.headers['location']).toBe(`/api/v1/customer-imports/${importBody.id}`);
  await context.app.get(CustomerImportProcessor).whenIdle();
  return (await api(context, token).get(`/customer-imports/${importBody.id}`).expect(200)).body as ImportBody;
}

async function downloadBuffer(token: string, path: string, status = 200): Promise<request.Response> {
  return api(context, token)
    .get(path)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .expect(status);
}

function row(country: string, overrides: FixtureRow = {}): FixtureRow {
  return { legalName: name('Cliente'), country: country, ...overrides };
}

async function countryIso(id: string): Promise<string> {
  return (await context.prisma.country.findUniqueOrThrow({ where: { id } })).isoCode;
}

let J1: string;
let J2: string;

// Cambia parámetros globales de clientes (y depende de ellos): excluye a las demás suites que también lo hacen.
let releaseParameters: (() => Promise<void>) | undefined;

beforeAll(async () => {
  releaseParameters = await exclusiveParameters('crm-customer-parameters');
  context = await createTestContext();
  restoreEnabled = await setParameter(context.prisma, ENABLED, 'true');
  j1 = await testCountry(context.prisma, 'J1');
  j2 = await testCountry(context.prisma, 'J2');
  await testCountry(context.prisma, 'J3', { isActive: false });
  J1 = await countryIso(j1);
  J2 = await countryIso(j2);
  admin = await crmUser(context, { roleCodes: ['administrador'], countryId: j1 });
  author = await crmUser(context, { roleCodes: ['asesor'], grant: IMPORT_GRANTS, countryId: j1 });
  other = await crmUser(context, { roleCodes: ['asesor'], grant: IMPORT_GRANTS, countryId: j1 });
}, EXCLUSIVE_TIMEOUT_MS);

afterAll(async () => {
  await context?.app.get(CustomerImportProcessor).whenIdle();
  await restoreEnabled?.();
  await closeTestContext(context);
  await releaseParameters?.();
});

describe('autenticación y autorización (PF-06.25, AC-06.26)', () => {
  const ID = '00000000-0000-4000-8000-000000000000';
  const endpoints: [string, string][] = [
    ['get', '/customer-imports/settings'],
    ['get', '/customer-imports/template?format=CSV'],
    ['post', '/customer-imports'],
    ['get', '/customer-imports'],
    ['get', `/customer-imports/${ID}`],
    ['get', `/customer-imports/${ID}/rows`],
    ['post', `/customer-imports/${ID}/confirmation`],
    ['post', `/customer-imports/${ID}/cancellation`],
    ['get', `/customer-imports/${ID}/error-file`],
  ];

  it.each(endpoints)('%s %s sin token → 401', async (method, path) => {
    const client = api(context);
    await (method === 'get' ? client.get(path) : client.post(path)).expect(401);
  });

  it.each(endpoints)('%s %s sin importaciones.* → 403', async (method, path) => {
    const user = await crmUser(context, { roleCodes: ['asesor'] });
    const client = api(context, user.token);
    const response = await (method === 'get' ? client.get(path) : client.post(path)).expect(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
  });

  it('con importaciones.ver pero sin importaciones.crear: consulta sí, plantilla, subida, confirmación y cancelación no', async () => {
    const viewer = await crmUser(context, { roleCodes: ['asesor'], grant: ['importaciones.ver'] });
    await api(context, viewer.token).get('/customer-imports/settings').expect(200);
    await api(context, viewer.token).get('/customer-imports').expect(200);
    await api(context, viewer.token).get('/customer-imports/template?format=CSV').expect(403);
    await upload(viewer.token, csvFile([row(J1)])).expect(403);
    await api(context, viewer.token).post(`/customer-imports/${ID}/confirmation`).send({ expectedValidRows: 1 }).expect(403);
    await api(context, viewer.token).post(`/customer-imports/${ID}/cancellation`).expect(403);
  });

  it('subir con importaciones.crear pero sin clientes.crear → 403 (H.1)', async () => {
    const user = await crmUser(context, { roleCodes: ['asesor'], grant: IMPORT_GRANTS, deny: ['clientes.crear'] });
    const response = await upload(user.token, csvFile([row(J1)])).expect(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
  });

  it('subir exige también importaciones.ver: sin él el autor no vería su carga (revisión E5, m-1)', async () => {
    const user = await crmUser(context, { roleCodes: ['asesor'], grant: ['importaciones.crear'] });
    const before = await context.prisma.customerImport.count({ where: { startedById: user.id } });
    expect((await upload(user.token, csvFile([row(J1)])).expect(403)).body.code).toBe('PERMISSION_DENIED');
    expect(await context.prisma.customerImport.count({ where: { startedById: user.id } })).toBe(before);
  });

  it('la opción de menú solo aparece con importaciones.ver', async () => {
    const menuKeys = async (token: string): Promise<string> => JSON.stringify((await api(context, token).get('/me/menu').expect(200)).body);
    expect(await menuKeys(admin.token)).toContain('/integraciones/clientes');
    expect(await menuKeys((await crmUser(context, { roleCodes: ['asesor'] })).token)).not.toContain('/integraciones/clientes');
  });
});

describe('configuración y plantilla (PF-06.1, PF-06.2, PF-06.14, PF-06.54)', () => {
  it('settings refleja los parámetros y aplica los topes duros', async () => {
    const response = await api(context, author.token).get('/customer-imports/settings').expect(200);
    expect(response.body).toMatchObject({ enabled: true, maxFileSizeMb: 10, maxRows: 5000, formats: ['CSV', 'XLSX'], templateVersion: '1' });
    expect(response.body.columns.map((column: { header: string }) => column.header)).toEqual(TEMPLATE_HEADERS);
    expect(response.body.columns.find((column: { key: string }) => column.key === 'legalName')).toMatchObject({ isRequired: true, maxLength: 200 });
    // Responsable (lo completa el alta con quien carga) y estado (valor por defecto) no son obligatorios en el archivo.
    expect(response.body.columns.find((column: { key: string }) => column.key === 'salesOwner').isRequired).toBe(false);
    expect(response.body.columns.find((column: { key: string }) => column.key === 'status').isRequired).toBe(false);

    await withParameter(context.prisma, MAX_ROWS, '20000', async () => {
      expect((await api(context, author.token).get('/customer-imports/settings').expect(200)).body.maxRows).toBe(10_000);
    });
  });

  it('plantilla CSV: BOM, 13 encabezados exactos, nombre con versión y no-store', async () => {
    const response = await downloadBuffer(author.token, '/customer-imports/template?format=CSV');
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('filename="plantilla-clientes-v1.csv"');
    expect(response.headers['cache-control']).toBe('no-store');
    const text = (response.body as Buffer).toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1).trim().split(',')).toEqual(TEMPLATE_HEADERS);
  });

  it('plantilla XLSX: 3 hojas, columnas de texto, valores válidos activos y obligatorios según el parámetro', async () => {
    const itemCode = `TEST-J-${uniqueSuffix()}`;
    const catalog = await context.prisma.catalog.findUniqueOrThrow({ where: { key: 'crm.tipo_empresa' } });
    const item = await context.prisma.catalogItem.create({ data: { catalogId: catalog.id, code: itemCode, label: 'Tipo de prueba', sortOrder: 999 } });
    const download = async (): Promise<ExcelJS.Workbook> => {
      const response = await api(context, admin.token)
        .get('/customer-imports/template?format=XLSX')
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(response.headers['content-disposition']).toContain('plantilla-clientes-v1.xlsx');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(response.body as unknown as ExcelJS.Buffer);
      return workbook;
    };
    const codesOf = (workbook: ExcelJS.Workbook): string[] => {
      const sheet = workbook.getWorksheet('Valores válidos');
      const codes: string[] = [];
      sheet?.eachRow((current, index) => {
        if (index > 1) codes.push(`${String(current.getCell(1).value)}:${String(current.getCell(2).value)}`);
      });
      return codes;
    };
    try {
      const workbook = await download();
      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Clientes', 'Instrucciones', 'Valores válidos']);
      const data = workbook.getWorksheet('Clientes');
      expect((data?.getRow(1).values as unknown[]).slice(1)).toEqual(TEMPLATE_HEADERS);
      expect(data?.getColumn(1).numFmt).toBe('@');
      const codes = codesOf(workbook);
      expect(codes).toEqual(expect.arrayContaining(['País:GT', 'País:SV', 'País:HN', 'País:CR', 'País:VE', 'País:EC', `Tipo de empresa:${itemCode}`, 'Estado:PROSPECTO', 'Calificación:A']));
      expect(codes).not.toEqual(expect.arrayContaining(['País:NI']));
      expect(codes).not.toEqual(expect.arrayContaining(['País:J3']));

      await context.prisma.catalogItem.update({ where: { id: item.id }, data: { isActive: false } });
      await withParameter(context.prisma, REQUIRED_FIELDS, JSON.stringify({ customer: ['legalName', 'countryId', 'statusId', 'salesOwnerId', 'taxId'] }), async () => {
        const after = await download();
        expect(codesOf(after)).not.toEqual(expect.arrayContaining([`Tipo de empresa:${itemCode}`]));
        const instructions = after.getWorksheet('Instrucciones');
        const required: Record<string, string> = {};
        instructions?.eachRow((current) => {
          required[String(current.getCell(1).value)] = String(current.getCell(2).value);
        });
        expect(required).toMatchObject({ 'Razón social': 'Sí', NIT: 'Sí', Ciudad: 'No', 'Versión de plantilla': '1' });
      });
    } finally {
      await context.prisma.catalogItem.delete({ where: { id: item.id } });
    }
  });

  it('plantilla con formato inválido → 400', async () => {
    await api(context, author.token).get('/customer-imports/template?format=XLS').expect(400);
  });
});

describe('subida y vista previa (PF-06.3–PF-06.7, PF-06.19–PF-06.21, PF-06.31–PF-06.35, PF-06.54)', () => {
  it('CSV UTF-8 con BOM y comas: 10 filas válidas, Location y código IMP-AAAA-nnnn', async () => {
    const rows = Array.from({ length: 10 }, () => row(J1, { companyType: 'FERRETERIA', rating: 'A' }));
    const response = await upload(author.token, csvFile(rows)).expect(201);
    expect(response.headers['location']).toBe(`/api/v1/customer-imports/${response.body.id}`);
    expect(response.body).toMatchObject({ status: 'VALIDATED', totalRows: 10, validRows: 10, invalidRows: 0, canConfirm: true, hasErrorFile: false });
    expect(response.body.code).toMatch(IMPORT_CODE);
    const preview = await rowsOf(author.token, response.body.id);
    expect(preview.map((current) => [current.rowNumber, current.fileRowNumber, current.status])).toEqual(
      Array.from({ length: 10 }, (_value, index) => [index + 1, index + 2, 'VALID']),
    );
    expect(preview[0]?.values).toMatchObject({ legalName: rows[0]?.legalName, country: J1, companyType: 'FERRETERIA', taxId: null });
  });

  it('CSV sin BOM con punto y coma (Excel en español) y XLSX con columnas en otro orden y sin acentos', async () => {
    const semicolon = await uploadOk(author.token, [row(J1), row(J1)], { delimiter: ';', bom: false, lineEnding: '\n' });
    expect(semicolon).toMatchObject({ totalRows: 2, validRows: 2 });

    const headers = [...TEMPLATE_HEADERS].reverse().map((header) => header.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase());
    const xlsxRow = row(J1);
    const values = [...TEMPLATE_HEADERS].reverse().map((header) => (header === 'Razón social' ? (xlsxRow.legalName ?? '') : header === 'País' ? J1 : ''));
    const response = await upload(author.token, await xlsxFile([values], { headers }), 'clientes.xlsx', XLSX_TYPE).expect(201);
    expect(response.body).toMatchObject({ format: 'XLSX', totalRows: 1, validRows: 1 });
  });

  it('XLSX: entero largo sin notación científica, ceros a la izquierda, espacios recortados y filas vacías con numeración preservada', async () => {
    const legalName = name('Numérico');
    const cells = (overrides: Record<string, unknown>): unknown[] => TEMPLATE_HEADERS.map((header) => overrides[header] ?? '');
    const buffer = await xlsxFile(
      [
        cells({ 'Razón social': `  ${legalName} `, País: J1, NIT: 1234567890123, 'Código de cliente': `00${uniqueSuffix()}` }),
        [],
        cells({ 'Razón social': name('Otro'), País: J1 }),
      ] as never,
    );
    const body = (await upload(author.token, buffer, 'n.xlsx', XLSX_TYPE).expect(201)).body as ImportBody;
    const preview = await rowsOf(author.token, body.id);
    expect(preview.map((current) => current.rowNumber)).toEqual([1, 3]);
    expect(preview[0]?.values).toMatchObject({ legalName, taxId: '1234567890123' });
    expect(preview[0]?.values?.['customerCode']).toMatch(/^00/);
  });

  it('referencias por clave natural: catálogo por code, país por ISO, responsable por correo y por código de colaborador (admin)', async () => {
    const employeeCode = `EMP-${uniqueSuffix()}`;
    const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: j1, employeeCode });
    const body = await uploadOk(admin.token, [
      row(J1, { companyType: 'CONSTRUCTORA', status: 'ACTIVO', rating: 'B', salesOwner: owner.email }),
      row(J1, { salesOwner: employeeCode }),
      // RN-07.1: el código se compara en forma canónica (recorte + mayúsculas).
      row(J1, { salesOwner: `  ${employeeCode.toLowerCase()} ` }),
    ]);
    expect(body.validRows).toBe(3);
  });

  it('códigos de error idénticos a los del alta manual (PF-06.19) y campo de la plantilla', async () => {
    const badRows: FixtureRow[] = [
      { country: J1 },
      { legalName: name('Sin país') },
      row(J1, { email: 'no-es-correo' }),
      row(J1, { taxId: 'x' }),
      row(J1, { legalName: 'x'.repeat(201) }),
    ];
    const body = await uploadOk(author.token, badRows);
    expect(body).toMatchObject({ totalRows: 5, validRows: 0, invalidRows: 5, canConfirm: false, hasErrorFile: true });
    const preview = await rowsOf(author.token, body.id);
    expect(preview.map((current) => current.issues.map((issue) => `${issue.field}:${issue.code}`))).toEqual([
      ['legalName:REQUIRED_FIELD_MISSING'],
      ['country:REQUIRED_FIELD_MISSING'],
      ['email:VALIDATION_FAILED'],
      ['taxId:INVALID_TAX_ID_FORMAT'],
      ['legalName:MAX_LENGTH'],
    ]);
    expect(preview.every((current) => current.status === 'INVALID')).toBe(true);
    // Mismo código que la API de clientes para los mismos datos.
    const manual = await api(context, author.token).post('/customers').send({ legalName: name('Manual'), countryId: j1, phone: '+1' }).expect(422);
    expect(manual.body.code).toBe('INVALID_PHONE_FORMAT');
    // Ningún mensaje repite el valor de la celda.
    expect(JSON.stringify(preview.map((current) => current.issues))).not.toContain('no-es-correo');
  });

  it('un teléfono con formato inválido para el país pasa como advertencia y se guarda tal cual al confirmar con la marca (ADR-029)', async () => {
    const body = await uploadOk(author.token, [row(J1, { phone: '+1', status: '' })]);
    expect(body).toMatchObject({ totalRows: 1, validRows: 1, invalidRows: 0 });
    const preview = await rowsOf(author.token, body.id);
    expect(preview[0]).toMatchObject({ status: 'VALID' });
    expect(preview[0]?.issues.map((issue) => `${issue.field}:${issue.code}`)).toEqual(['phone:INVALID_PHONE_FORMAT']);

    const final = await confirm(author.token, body, true);
    expect(final).toMatchObject({ status: 'COMPLETED', importedRows: 1, rejectedRows: 0 });
    const customer = await context.prisma.customer.findFirstOrThrow({ where: { sourceImportId: body.id } });
    expect(customer.phone).toBe('+1');
  });

  it('sin la marca de advertencias, la fila con teléfono inválido no se importa', async () => {
    const body = await uploadOk(author.token, [row(J1, { phone: '+1', status: '' })]);
    const final = await confirm(author.token, body, false);
    expect(final).toMatchObject({ importedRows: 0, rejectedRows: 1 });
    expect(await context.prisma.customer.count({ where: { sourceImportId: body.id } })).toBe(0);
  });

  it('catálogo de otro catálogo, inactivo o etiqueta; país inactivo o no admitido; responsable inexistente o ajeno (PF-06.20, PF-06.54)', async () => {
    const outsider = await crmUser(context, { roleCodes: ['asesor'], countryId: j1 });
    const body = await uploadOk(author.token, [
      row(J1, { companyType: 'ALTA' }),
      row(J1, { companyType: 'Ferretería' }),
      row('J3'),
      row('NI'),
      row('ZZ'),
      row(J1, { salesOwner: 'nadie@example.invalid' }),
      row(J1, { salesOwner: outsider.email }),
    ]);
    const preview = await rowsOf(author.token, body.id);
    expect(preview.map((current) => current.issues[0]?.code)).toEqual([
      'INVALID_CATALOG_VALUE',
      'INVALID_CATALOG_VALUE',
      'INVALID_COUNTRY',
      'INVALID_COUNTRY',
      'INVALID_COUNTRY',
      'INVALID_SALES_OWNER',
      'INVALID_SALES_OWNER',
    ]);
  });

  it('fórmulas: celda con fórmula (sin su valor en caché), =HYPERLINK y @SUM → FORMULA_NOT_ALLOWED; +502 sigue válido (PF-06.21, AC-06.33)', async () => {
    const cells = (overrides: Record<string, unknown>): unknown[] => TEMPLATE_HEADERS.map((header) => overrides[header] ?? '');
    const buffer = await xlsxFile(
      [
        cells({ 'Razón social': { formula: '"A"&"B"', result: 'VALOR-CACHE' }, País: J1 }),
        cells({ 'Razón social': '=HYPERLINK("http://x","y")', País: J1 }),
        cells({ 'Razón social': name('Ok'), 'Nombre comercial': '@SUM(A1)', País: J1 }),
        cells({ 'Razón social': name('Teléfono'), Teléfono: '+502 2222 3333', País: J1 }),
      ] as never,
    );
    const body = (await upload(author.token, buffer, 'f.xlsx', XLSX_TYPE).expect(201)).body as ImportBody;
    const preview = await rowsOf(author.token, body.id);
    expect(preview.map((current) => [current.status, current.issues.map((issue) => `${issue.field}:${issue.code}`)])).toEqual([
      ['INVALID', ['legalName:FORMULA_NOT_ALLOWED']],
      ['INVALID', ['legalName:FORMULA_NOT_ALLOWED']],
      ['INVALID', ['tradeName:FORMULA_NOT_ALLOWED']],
      ['VALID', []],
    ]);
    expect(JSON.stringify(preview)).not.toContain('VALOR-CACHE');
    expect(preview[0]?.values?.['legalName']).toBeNull();
  });

  it('duplicados por código dentro del archivo: mismo país → todas DUPLICATE_IN_FILE; otro país → válidas; GLOBAL → duplicadas (PF-06.31)', async () => {
    const code = `ab-${uniqueSuffix()}`;
    const spaced = code.toUpperCase().replace('-', ' ');
    const body = await uploadOk(author.token, [row(J1, { customerCode: code }), row(J1, { customerCode: spaced }), row(J2, { customerCode: code })]);
    const preview = await rowsOf(author.token, body.id);
    expect(preview.map((current) => [current.status, current.duplicateOfRowNumber])).toEqual([
      ['DUPLICATE_IN_FILE', 2],
      ['DUPLICATE_IN_FILE', 1],
      ['VALID', null],
    ]);
    expect(preview[0]?.issues[0]).toMatchObject({ code: 'DUPLICATE_IN_FILE', message: 'El código de cliente se repite en la fila 3 del archivo.' });

    await withParameter(context.prisma, CODE_UNIQUENESS, 'GLOBAL', async () => {
      const global = await uploadOk(author.token, [row(J1, { customerCode: `${code}g` }), row(J2, { customerCode: `${code}G` })]);
      expect((await rowsOf(author.token, global.id)).map((current) => current.status)).toEqual(['DUPLICATE_IN_FILE', 'DUPLICATE_IN_FILE']);
    });
  });

  it('NIT repetido en el archivo: advertencia DUPLICATE_TAX_ID, no rechazo; con código repetido manda el código (PF-06.32)', async () => {
    const taxId = `9${Date.now()}`.slice(0, 10);
    const formatted = `${taxId.slice(0, -1)}-${taxId.slice(-1)}`;
    const code = `nit-${uniqueSuffix()}`;
    const body = await uploadOk(author.token, [
      row(J1, { taxId }),
      row(J1, { taxId: formatted }),
      row(J1, { taxId: `8${taxId.slice(1)}`, customerCode: code }),
      row(J1, { taxId: `8${taxId.slice(1)}`, customerCode: code }),
    ]);
    const preview = await rowsOf(author.token, body.id);
    expect(preview.map((current) => current.status)).toEqual(['VALID', 'VALID', 'DUPLICATE_IN_FILE', 'DUPLICATE_IN_FILE']);
    expect(preview[0]?.issues).toEqual([expect.objectContaining({ field: 'taxId', code: 'DUPLICATE_TAX_ID', severity: 'WARNING', message: expect.stringContaining('fila 3') })]);
    expect(preview[2]?.issues.map((issue) => issue.code)).toEqual(['DUPLICATE_IN_FILE', 'DUPLICATE_TAX_ID']);
    expect(body.warningRows).toBe(4);
    expect((await rowsOf(author.token, body.id, '&hasWarnings=true')).length).toBe(4);
    expect((await rowsOf(author.token, body.id, '&status=VALID&hasWarnings=false')).length).toBe(0);
  });

  it('código de un cliente existente activo, inactivo o eliminado → DUPLICATE_EXISTING sin modificarlo; referencia solo si es visible (PF-06.33, PF-06.34)', async () => {
    const codes = ['act', 'ina', 'del', 'aje'].map((prefix) => `${prefix}-${uniqueSuffix()}`);
    const own = [
      await insertCustomer(context.prisma, { salesOwnerId: author.id, countryId: j1, customerCode: codes[0] ?? '' }),
      await insertCustomer(context.prisma, { salesOwnerId: author.id, countryId: j1, customerCode: codes[1] ?? '', statusCode: 'INACTIVO' }),
      await insertCustomer(context.prisma, { salesOwnerId: author.id, countryId: j1, customerCode: codes[2] ?? '', deletedAt: new Date() }),
    ];
    const foreign = await insertCustomer(context.prisma, { salesOwnerId: other.id, countryId: j1, customerCode: codes[3] ?? '' });
    const before = await context.prisma.customer.findMany({ where: { id: { in: [...own.map((c) => c.id), foreign.id] } }, orderBy: { id: 'asc' } });

    const body = await uploadOk(author.token, codes.map((customerCode) => row(J1, { customerCode, legalName: name('Pisar') })));
    const preview = await rowsOf(author.token, body.id);
    expect(preview.map((current) => [current.status, current.issues[0]?.code])).toEqual(Array(4).fill(['DUPLICATE_EXISTING', 'CUSTOMER_CODE_TAKEN']));
    expect(preview[0]?.duplicateOfCustomer).toEqual({ id: own[0]?.id, crmCode: own[0]?.crmCode, legalName: own[0]?.legalName });
    // Eliminado sin clientes.eliminar y ajeno fuera del alcance OWN: sin referencia (H.4).
    expect(preview[2]?.duplicateOfCustomer).toBeNull();
    expect(preview[3]?.duplicateOfCustomer).toBeNull();
    const after = await context.prisma.customer.findMany({ where: { id: { in: [...own.map((c) => c.id), foreign.id] } }, orderBy: { id: 'asc' } });
    expect(after).toEqual(before);
  });
});

describe('estructura y tipo de archivo (PF-06.15–PF-06.18, PF-06.26, AC-06.5–AC-06.7)', () => {
  async function structureIssue(buffer: Buffer, filename = 'x.csv', contentType = 'text/csv'): Promise<{ issue: string; importId: string }> {
    const response = await upload(author.token, buffer, filename, contentType).expect(422);
    expect(response.body.code).toBe('INVALID_IMPORT_FILE');
    const history = await api(context, author.token).get('/customer-imports?pageSize=1&sortBy=createdAt&sortOrder=desc').expect(200);
    const latest = history.body.data[0];
    expect(latest).toMatchObject({ status: 'FAILED', totalRows: 0 });
    const detail = await api(context, author.token).get(`/customer-imports/${latest.id}`).expect(200);
    expect(detail.body.failureReason).toBeTruthy();
    expect(await context.prisma.customerImportRow.count({ where: { importId: latest.id } })).toBe(0);
    return { issue: response.body.details[0].issue as string, importId: latest.id as string };
  }

  it.each([
    ['vacío', Buffer.alloc(0), 'EMPTY_FILE'],
    ['solo encabezados', csvFile([]), 'NO_DATA_ROWS'],
    ['Windows-1252', Buffer.from([...Buffer.from(`${TEMPLATE_HEADERS.join(',')}\n`, 'utf8'), 0x50, 0xe9, 0x72, 0x65, 0x7a, 0x0a]), 'INVALID_ENCODING'],
    ['comillas sin cerrar', Buffer.concat([csvFile([]), Buffer.from('"sin cierre,GT\n')]), 'MALFORMED_CSV'],
  ])('%s → 422 con el issue y la carga FAILED en el historial sin filas', async (_label, buffer, issue) => {
    expect((await structureIssue(buffer)).issue).toBe(issue);
  });

  it('más filas que el máximo efectivo → TOO_MANY_ROWS', async () => {
    await withParameter(context.prisma, MAX_ROWS, '3', async () => {
      expect((await structureIssue(csvFile([row(J1), row(J1), row(J1), row(J1)]))).issue).toBe('TOO_MANY_ROWS');
    });
  });

  it('columna faltante, desconocida y repetida → 422 con el nombre; failureReason solo con encabezados de la plantilla', async () => {
    const headers = [...TEMPLATE_HEADERS.filter((header) => header !== 'Ciudad'), 'Columna rara', 'NIT'];
    const response = await upload(author.token, csvFile([row(J1)], { headers })).expect(422);
    expect(response.body.details).toEqual([
      { field: 'columns', issue: 'UNKNOWN_COLUMN', column: 'Columna rara' },
      { field: 'columns', issue: 'DUPLICATE_COLUMN', column: 'NIT' },
      { field: 'columns', issue: 'MISSING_COLUMN', column: 'Ciudad' },
    ]);
    const latest = (await api(context, author.token).get('/customer-imports?pageSize=1').expect(200)).body.data[0];
    const detail = (await api(context, author.token).get(`/customer-imports/${latest.id}`).expect(200)).body as ImportBody;
    expect(detail.failureReason).toBe('UNKNOWN_COLUMN; DUPLICATE_COLUMN: NIT; MISSING_COLUMN: Ciudad');
  });

  it.each([
    ['.xls real (OLE)', oleFile(), 'clientes.xls', 'application/vnd.ms-excel'],
    ['XLSX cifrada (OLE)', oleFile(), 'cifrada.xlsx', XLSX_TYPE],
    ['XLSX con vbaProject.bin', minimalXlsxZip([{ name: 'xl/vbaProject.bin', data: Buffer.from('macro') }]), 'macro.xlsx', XLSX_TYPE],
    ['PNG renombrado a .csv', pngFile(), 'imagen.csv', 'text/csv'],
    ['CSV renombrado a .xlsx', csvFile([]), 'texto.xlsx', XLSX_TYPE],
  ])('%s → 415 UNSUPPORTED_FILE_TYPE sin registrar la carga (PF-06.16)', async (_label, buffer, filename, contentType) => {
    const before = await context.prisma.customerImport.count({ where: { startedById: author.id } });
    const response = await upload(author.token, buffer, filename, contentType).expect(415);
    expect(response.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(await context.prisma.customerImport.count({ where: { startedById: author.id } })).toBe(before);
  });

  it('bomba ZIP y 1 000 entradas → 422 ARCHIVE_LIMITS_EXCEEDED sin disparar la memoria (PF-06.26)', async () => {
    const heapBefore = process.memoryUsage().heapUsed;
    const bomb = minimalXlsxZip([{ name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(100 * 1024 * 1024, 0x20) }]);
    expect((await structureIssue(bomb, 'bomba.xlsx', XLSX_TYPE)).issue).toBe('ARCHIVE_LIMITS_EXCEEDED');
    const many = minimalXlsxZip(Array.from({ length: 1000 }, (_value, index) => ({ name: `xl/media/${index}.bin`, data: Buffer.from('x') })));
    expect((await structureIssue(many, 'muchas.xlsx', XLSX_TYPE)).issue).toBe('ARCHIVE_LIMITS_EXCEEDED');
    expect(process.memoryUsage().heapUsed - heapBefore).toBeLessThan(150 * 1024 * 1024);
  });

  it('XLSX diminuto con una celda en la fila 1 048 576 y rangos de hoja completa: se lee sin expandirlos (revisión E5, B-1)', async () => {
    const legalName = name('Dispersa');
    const headerCells = TEMPLATE_HEADERS.map((header, index) => `<c r="${String.fromCharCode(65 + index)}1" t="inlineStr"><is><t>${header}</t></is></c>`).join('');
    const dataRow = `<row r="1048576"><c r="B1048576" t="inlineStr"><is><t>${legalName}</t></is></c><c r="D1048576" t="inlineStr"><is><t>${J1}</t></is></c></row>`;
    const ranges = '<mergeCells count="1"><mergeCell ref="A3:XFD1048575"/></mergeCells><dataValidations count="1"><dataValidation type="list" sqref="A2:XFD1048576"><formula1>"S,N"</formula1></dataValidation></dataValidations>';
    const buffer = rawSheetXlsx(`<row r="1">${headerCells}</row>${dataRow}`, ranges);
    expect(buffer.length).toBeLessThan(20 * 1024);
    const heapBefore = process.memoryUsage().heapUsed;
    const started = Date.now();
    const body = (await upload(author.token, buffer, 'dispersa.xlsx', XLSX_TYPE).expect(201)).body as ImportBody;
    expect(Date.now() - started).toBeLessThan(5000);
    expect(process.memoryUsage().heapUsed - heapBefore).toBeLessThan(200 * 1024 * 1024);
    expect(body).toMatchObject({ totalRows: 1, validRows: 1 });
    expect((await rowsOf(author.token, body.id))[0]).toMatchObject({ rowNumber: 1048575, fileRowNumber: 1048576 });
  });

  it('XLSX con DTD y entidad externa → 422 UNSAFE_CONTENT (PF-06.27)', async () => {
    const xxe = '<?xml version="1.0"?><!DOCTYPE w [<!ENTITY e SYSTEM "file:///etc/passwd">]><worksheet>&e;</worksheet>';
    expect((await structureIssue(minimalXlsxZip([{ name: 'xl/worksheets/sheet1.xml', data: Buffer.from(xxe) }]), 'xxe.xlsx', XLSX_TYPE)).issue).toBe('UNSAFE_CONTENT');
  });

  it('archivo mayor que el tamaño efectivo → 413 FILE_TOO_LARGE; sin archivo, con dos o con campos extra → 400 (PF-06.17)', async () => {
    await withParameter(context.prisma, MAX_MB, '1', async () => {
      const response = await upload(author.token, Buffer.alloc(1024 * 1024 + 1, 0x61)).expect(413);
      expect(response.body.code).toBe('FILE_TOO_LARGE');
    });
    await api(context, author.token).post('/customer-imports').field('nota', 'x').expect(400);
    const twoFiles = await api(context, author.token)
      .post('/customer-imports')
      .attach('file', csvFile([row(J1)]), { filename: 'a.csv', contentType: 'text/csv' })
      .attach('file', csvFile([row(J1)]), { filename: 'b.csv', contentType: 'text/csv' })
      .expect(400);
    expect(twoFiles.body.code).toBe('VALIDATION_FAILED');
    const extraField = await api(context, author.token)
      .post('/customer-imports')
      .field('nota', 'x')
      .attach('file', csvFile([row(J1)]), { filename: 'a.csv', contentType: 'text/csv' })
      .expect(400);
    expect(extraField.body.details[0].field).toBe('file');
  });
});

describe('confirmación e importación (PF-06.8–PF-06.10, PF-06.13, PF-06.22, PF-06.35–PF-06.40, PF-06.51, PF-06.52)', () => {
  it('confirmar 10 válidas → 202 IMPORTING y COMPLETED con 10 clientes del alta del Módulo 2 (PF-06.9, PF-06.8, PF-06.10)', async () => {
    const rows = Array.from({ length: 10 }, () => row(J1, { status: '' }));
    const body = await uploadOk(author.token, rows);
    const response = await api(context, author.token).post(`/customer-imports/${body.id}/confirmation`).send({ expectedValidRows: 10 }).expect(202);
    expect(response.body).toMatchObject({ status: 'IMPORTING', canConfirm: false, canCancel: false });
    await context.app.get(CustomerImportProcessor).whenIdle();
    const final = (await api(context, author.token).get(`/customer-imports/${body.id}`).expect(200)).body as ImportBody;
    expect(final).toMatchObject({ status: 'COMPLETED', importedRows: 10, rejectedRows: 0 });

    const customers = await context.prisma.customer.findMany({ where: { sourceImportId: body.id }, include: { status: true }, orderBy: { crmCode: 'asc' } });
    expect(customers).toHaveLength(10);
    expect(new Set(customers.map((customer) => customer.createdById))).toEqual(new Set([author.id]));
    expect(new Set(customers.map((customer) => customer.status.code))).toEqual(new Set(['PROSPECTO']));
    const numbers = customers.map((customer) => Number(customer.crmCode.replace(/\D/g, ''))).sort((a, b) => a - b);
    expect(numbers.at(-1)! - numbers[0]!).toBeGreaterThanOrEqual(9);
    const imported = await rowsOf(author.token, body.id);
    expect(imported.every((current) => current.status === 'IMPORTED' && current.customer !== null)).toBe(true);

    const audits = await context.prisma.auditLog.findMany({ where: { event: 'crm.customer.created', resourceId: { in: customers.map((customer) => customer.id) } } });
    expect(audits).toHaveLength(10);
    expect(audits.every((audit) => (audit.metadata as Record<string, unknown>)['source'] === 'IMPORT')).toBe(true);
    expect(audits.map((audit) => (audit.metadata as Record<string, unknown>)['rowNumber']).sort()).toEqual([1, 10, 2, 3, 4, 5, 6, 7, 8, 9]);

    // El cliente importado es un cliente normal: lo ve su responsable en la búsqueda del Módulo 2.
    const search = await api(context, author.token).get(`/customers?search=${encodeURIComponent(rows[0]?.legalName ?? '')}`).expect(200);
    expect(search.body.data.map((customer: { id: string }) => customer.id)).toContain(imported[0]?.customer?.id);
  });

  it('una celda «Correo» con varios correos: el cliente queda con el primero y los demás como contactos (ADR-028)', async () => {
    const tag = Date.now().toString(36);
    const body = await uploadOk(author.token, [
      row(J1, { email: `uno-${tag}@example.invalid, dos-${tag}@example.invalid; DOS-${tag}@example.invalid, tres-${tag}@example.invalid`, status: '' }),
    ]);
    expect(body.validRows).toBe(1);
    const final = await confirm(author.token, body);
    expect(final).toMatchObject({ status: 'COMPLETED', importedRows: 1, rejectedRows: 0 });

    const customer = await context.prisma.customer.findFirstOrThrow({ where: { sourceImportId: body.id } });
    expect(customer.email).toBe(`uno-${tag}@example.invalid`);
    const contacts = await context.prisma.contact.findMany({ where: { customerId: customer.id }, orderBy: { email: 'asc' } });
    expect(contacts.map((contact) => contact.email)).toEqual([`dos-${tag}@example.invalid`, `tres-${tag}@example.invalid`]);
    expect(contacts.every((contact) => contact.firstName === 'Contacto' && contact.isActive)).toBe(true);
  });

  it('errores de confirmación: sin filas válidas 422, expectedValidRows distinto 409, ya completada o cancelada 409 (PF-06.22, PF-06.13)', async () => {
    const invalid = await uploadOk(author.token, [{ country: J1 }]);
    const noRows = await api(context, author.token).post(`/customer-imports/${invalid.id}/confirmation`).send({ expectedValidRows: 1 }).expect(422);
    expect(noRows.body.code).toBe('NO_VALID_ROWS');

    const valid = await uploadOk(author.token, [row(J1), row(J1)]);
    const changed = await api(context, author.token).post(`/customer-imports/${valid.id}/confirmation`).send({ expectedValidRows: 3 }).expect(409);
    expect(changed.body).toMatchObject({ code: 'IMPORT_CHANGED', details: [{ field: 'expectedValidRows', validRows: 2 }] });
    await api(context, author.token).post(`/customer-imports/${valid.id}/confirmation`).send({ expectedValidRows: 0 }).expect(400);
    await api(context, author.token).post(`/customer-imports/${valid.id}/confirmation`).send({ expectedValidRows: 2, extra: true }).expect(400);

    const cancelled = await api(context, author.token).post(`/customer-imports/${valid.id}/cancellation`).expect(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', canConfirm: false });
    const afterCancel = await api(context, author.token).post(`/customer-imports/${valid.id}/confirmation`).send({ expectedValidRows: 2 }).expect(409);
    expect(afterCancel.body.code).toBe('INVALID_IMPORT_STATUS');
    await api(context, author.token).post(`/customer-imports/${valid.id}/cancellation`).expect(409);
    expect(await context.prisma.customer.count({ where: { sourceImportId: valid.id } })).toBe(0);
  });

  it('carga ajena: el otro asesor no la ve (404); el administrador (ORGANIZATION) la ve y la confirma (PF-06.23, D-06.10)', async () => {
    const body = await uploadOk(author.token, [row(J1)]);
    await api(context, other.token).get(`/customer-imports/${body.id}`).expect(404);
    await api(context, other.token).get(`/customer-imports/${body.id}/rows`).expect(404);
    await api(context, other.token).post(`/customer-imports/${body.id}/confirmation`).send({ expectedValidRows: 1 }).expect(404);
    await api(context, other.token).post(`/customer-imports/${body.id}/cancellation`).expect(404);
    await api(context, other.token).get(`/customer-imports/${body.id}/error-file`).expect(404);
    await api(context, author.token).get('/customer-imports/not-a-uuid').expect(400);

    const final = await confirm(admin.token, body);
    expect(final.status).toBe('COMPLETED');
    const customer = await context.prisma.customer.findFirstOrThrow({ where: { sourceImportId: body.id } });
    expect(customer.createdById).toBe(admin.id);
    const detail = await context.prisma.customerImport.findUniqueOrThrow({ where: { id: body.id } });
    expect(detail.confirmedById).toBe(admin.id);
  });

  it('razón social parecida con AVISAR: VALID con advertencia; sin la marca REJECTED, con la marca importada (PF-06.35, AC-06.12)', async () => {
    const legalName = name('Parecida');
    await insertCustomer(context.prisma, { salesOwnerId: author.id, countryId: j1, legalName });
    const first = await uploadOk(author.token, [row(J1, { legalName: legalName.toUpperCase() })]);
    const [warned] = await rowsOf(author.token, first.id);
    expect(warned).toMatchObject({ status: 'VALID', issues: [{ field: 'legalName', code: 'POSSIBLE_DUPLICATE', severity: 'WARNING' }] });
    const rejected = await confirm(author.token, first, false);
    expect(rejected).toMatchObject({ status: 'COMPLETED_WITH_ERRORS', importedRows: 0, rejectedRows: 1 });
    expect((await rowsOf(author.token, first.id))[0]).toMatchObject({ status: 'REJECTED', issues: [{ code: 'POSSIBLE_DUPLICATE', severity: 'ERROR' }] });

    const second = await uploadOk(author.token, [row(J1, { legalName: legalName.toUpperCase() })]);
    expect((await confirm(author.token, second, true)).status).toBe('COMPLETED');
  });

  it('NIT de un existente del mismo país (también eliminado): advertencia; otro país o nit = NO, sin advertencia (PF-06.51)', async () => {
    const taxId = `7${Date.now()}`.slice(0, 10);
    const existing = await insertCustomer(context.prisma, { salesOwnerId: author.id, countryId: j1, taxId, deletedAt: new Date() });
    const body = await uploadOk(author.token, [row(J1, { taxId }), row(J2, { taxId })]);
    const preview = await rowsOf(author.token, body.id);
    expect(preview.map((current) => current.issues.map((issue) => issue.code))).toEqual([['DUPLICATE_TAX_ID'], []]);
    await withParameter(context.prisma, DUPLICATE_RULES, '{"razonSocialNormalizada":"AVISAR","nit":"NO"}', async () => {
      const silent = await uploadOk(author.token, [row(J1, { taxId })]);
      expect((await rowsOf(author.token, silent.id))[0]?.issues).toEqual([]);
    });
    const final = await confirm(author.token, body, true);
    expect(final.status).toBe('COMPLETED');
    const twins = await context.prisma.customer.count({ where: { countryId: j1, taxIdNormalized: taxId } });
    expect(twins).toBe(2);
    expect((await context.prisma.customer.findUniqueOrThrow({ where: { id: existing.id } })).deletedAt).not.toBeNull();
  });

  it('dos filas con el mismo NIT, confirmadas con la marca → ambas IMPORTED; un NIT nuevo creado fuera de la carga → REJECTED (PF-06.52)', async () => {
    const taxId = `6${Date.now()}`.slice(0, 10);
    const body = await uploadOk(author.token, [row(J1, { taxId }), row(J1, { taxId })]);
    expect((await confirm(author.token, body, true)).importedRows).toBe(2);

    const lateTax = `5${Date.now()}`.slice(0, 10);
    const late = await uploadOk(author.token, [row(J1, { taxId: lateTax }), row(J1, { taxId: lateTax })]);
    await insertCustomer(context.prisma, { salesOwnerId: author.id, countryId: j1, taxId: lateTax });
    const final = await confirm(author.token, late, true);
    expect(final).toMatchObject({ importedRows: 0, rejectedRows: 2 });
    expect((await rowsOf(author.token, late.id)).map((current) => current.issues[0]?.code)).toEqual(['DUPLICATE_TAX_ID', 'DUPLICATE_TAX_ID']);
  });

  it('fallo parcial: código tomado y catálogo desactivado entre validación y confirmación (PF-06.36, AC-06.18)', async () => {
    const catalog = await context.prisma.catalog.findUniqueOrThrow({ where: { key: 'crm.tipo_empresa' } });
    const item = await context.prisma.catalogItem.create({ data: { catalogId: catalog.id, code: `TEST-J-${uniqueSuffix()}`, label: 'Temporal', sortOrder: 998 } });
    try {
      const code = `pf-${uniqueSuffix()}`;
      const rows = [row(J1), row(J1), row(J1, { customerCode: code }), row(J1, { companyType: item.code }), row(J1)];
      const body = await uploadOk(author.token, rows);
      expect(body.validRows).toBe(5);
      await api(context, author.token).post('/customers').send({ legalName: name('Manual'), countryId: j1, customerCode: code }).expect(201);
      await context.prisma.catalogItem.update({ where: { id: item.id }, data: { isActive: false } });

      const final = await confirm(author.token, body);
      expect(final).toMatchObject({ status: 'COMPLETED_WITH_ERRORS', validRows: 5, importedRows: 3, rejectedRows: 2 });
      const preview = await rowsOf(author.token, body.id);
      expect(preview.map((current) => [current.status, current.issues[0]?.code ?? null])).toEqual([
        ['IMPORTED', null],
        ['IMPORTED', null],
        ['REJECTED', 'CUSTOMER_CODE_TAKEN'],
        ['REJECTED', 'INVALID_CATALOG_VALUE'],
        ['IMPORTED', null],
      ]);
      expect(preview[2]?.duplicateOfCustomer).not.toBeNull();
      // Integridad: ningún cliente sin su fila IMPORTED ni fila IMPORTED sin cliente.
      const customers = await context.prisma.customer.count({ where: { sourceImportId: body.id } });
      const importedRows = await context.prisma.customerImportRow.count({ where: { importId: body.id, status: 'IMPORTED', customerId: { not: null } } });
      expect(customers).toBe(3);
      expect(importedRows).toBe(3);
    } finally {
      await context.prisma.catalogItem.delete({ where: { id: item.id } });
    }
  });

  it('dos usuarios confirman a la vez cargas con el mismo código → un solo cliente (PF-06.38)', async () => {
    const code = `cc-${uniqueSuffix()}`;
    const first = await uploadOk(author.token, [row(J1, { customerCode: code })]);
    const second = await uploadOk(other.token, [row(J1, { customerCode: code })]);
    await Promise.all([
      api(context, author.token).post(`/customer-imports/${first.id}/confirmation`).send({ expectedValidRows: 1 }).expect(202),
      api(context, other.token).post(`/customer-imports/${second.id}/confirmation`).send({ expectedValidRows: 1 }).expect(202),
    ]);
    await context.app.get(CustomerImportProcessor).whenIdle();
    expect(await context.prisma.customer.count({ where: { countryId: j1, customerCodeNormalized: code.replace('-', '').toUpperCase() } })).toBe(1);
    const statuses = await context.prisma.customerImportRow.findMany({ where: { importId: { in: [first.id, second.id] } }, select: { status: true, errors: true } });
    expect(statuses.map((current) => current.status).sort()).toEqual(['IMPORTED', 'REJECTED']);
    expect(JSON.stringify(statuses)).toContain('CUSTOMER_CODE_TAKEN');
  });

  it('doble confirmación simultánea de la misma carga → una 202 y otra 409; cada fila una vez (PF-06.39)', async () => {
    const body = await uploadOk(author.token, [row(J1), row(J1)]);
    const responses = await Promise.all(
      [1, 2].map(() => api(context, author.token).post(`/customer-imports/${body.id}/confirmation`).send({ expectedValidRows: 2 })),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([202, 409]);
    await context.app.get(CustomerImportProcessor).whenIdle();
    expect(await context.prisma.customer.count({ where: { sourceImportId: body.id } })).toBe(2);
  });

  it('dos subidas simultáneas del mismo usuario: una 201 y otra 409 IMPORT_IN_PROGRESS (RN-06.30, revisión E5, m-8)', async () => {
    const user = await crmUser(context, { roleCodes: ['asesor'], grant: IMPORT_GRANTS, countryId: j1 });
    // La primera es grande para que siga validándose cuando llega la segunda.
    const big = csvFile(Array.from({ length: 1500 }, () => row(J1)));
    const responses = await Promise.all([upload(user.token, big), upload(user.token, big)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body.code).toBe('IMPORT_IN_PROGRESS');
    expect(await context.prisma.customerImport.count({ where: { startedById: user.id } })).toBe(1);
  });

  it('confirmar con otra carga del autor importándose → 409 IMPORT_IN_PROGRESS (RN-06.30, revisión E5, m-2)', async () => {
    const user = await crmUser(context, { roleCodes: ['asesor'], grant: IMPORT_GRANTS, countryId: j1 });
    const first = await uploadOk(user.token, [row(J1)]);
    const second = await uploadOk(user.token, [row(J1)]);
    await context.prisma.$executeRaw`UPDATE customer_imports SET status = 'IMPORTING', updated_at = now() WHERE id = ${first.id}::uuid`;
    const busy = await api(context, user.token).post(`/customer-imports/${second.id}/confirmation`).send({ expectedValidRows: 1 }).expect(409);
    expect(busy.body.code).toBe('IMPORT_IN_PROGRESS');
    expect((await context.prisma.customerImport.findUniqueOrThrow({ where: { id: second.id } })).status).toBe('VALIDATED');
  });

  it('una carga activa por usuario → 409 IMPORT_IN_PROGRESS; sin señal de vida 15 min → FAILED (PROCESS_INTERRUPTED) (PF-06.29, PF-06.40)', async () => {
    const user = await crmUser(context, { roleCodes: ['asesor'], grant: IMPORT_GRANTS, countryId: j1 });
    const body = await uploadOk(user.token, [row(J1), row(J1)]);
    // Simula un proceso de importación activo (con señal de vida reciente).
    await context.prisma.$executeRaw`UPDATE customer_imports SET status = 'IMPORTING', updated_at = now() WHERE id = ${body.id}::uuid`;
    const busy = await upload(user.token, csvFile([row(J1)])).expect(409);
    expect(busy.body.code).toBe('IMPORT_IN_PROGRESS');

    // Una fila ya importada antes de la interrupción permanece.
    const customer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: j1 });
    await context.prisma.$executeRaw`UPDATE customer_import_rows SET status = 'IMPORTED', customer_id = ${customer.id}::uuid WHERE import_id = ${body.id}::uuid AND row_number = 1`;
    await context.prisma.$executeRaw`UPDATE customer_imports SET updated_at = now() - interval '16 minutes' WHERE id = ${body.id}::uuid`;
    const detail = (await api(context, user.token).get(`/customer-imports/${body.id}`).expect(200)).body as ImportBody;
    expect(detail).toMatchObject({ status: 'FAILED', failureReason: 'PROCESS_INTERRUPTED', importedRows: 1, rejectedRows: 1 });
    expect((await rowsOf(user.token, body.id)).map((current) => [current.status, current.issues.at(-1)?.code ?? null])).toEqual([
      ['IMPORTED', null],
      ['REJECTED', 'IMPORT_INTERRUPTED'],
    ]);
    expect(await context.prisma.customer.count({ where: { id: customer.id } })).toBe(1);
    await upload(user.token, csvFile([row(J1)])).expect(201);
  });
});

describe('historial, archivo de errores, purga y habilitación (PF-06.11, PF-06.12, PF-06.24, PF-06.28, PF-06.30, PF-06.41, PF-06.45)', () => {
  it('historial: solo las propias (OWN), todas con ORGANIZATION; paginación, orden y filtros (PF-06.11)', async () => {
    const user = await crmUser(context, { roleCodes: ['asesor'], grant: IMPORT_GRANTS, countryId: j1 });
    const first = await uploadOk(user.token, [row(J1)]);
    const second = (await upload(user.token, csvFile([row(J1)]), 'especial-octubre.csv').expect(201)).body as ImportBody;
    await upload(user.token, csvFile([])).expect(422);

    const own = (await api(context, user.token).get('/customer-imports?pageSize=2&sortBy=createdAt&sortOrder=asc').expect(200)).body;
    expect(own.pagination).toMatchObject({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    expect(own.data.map((item: { id: string }) => item.id)).toEqual([first.id, second.id]);
    expect(own.data[0]).toMatchObject({ format: 'CSV', startedBy: { id: user.id }, totalRows: 1, validRows: 1 });

    const failed = (await api(context, user.token).get('/customer-imports?status=FAILED').expect(200)).body;
    expect(failed.data).toHaveLength(1);
    const bySearch = (await api(context, user.token).get('/customer-imports?search=ESPECIAL').expect(200)).body;
    expect(bySearch.data.map((item: { id: string }) => item.id)).toEqual([second.id]);
    const byCode = (await api(context, user.token).get(`/customer-imports?search=${first.code}`).expect(200)).body;
    expect(byCode.data.map((item: { id: string }) => item.id)).toEqual([first.id]);
    const future = (await api(context, user.token).get(`/customer-imports?createdFrom=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`).expect(200)).body;
    expect(future.data).toEqual([]);
    const byStatusSort = (await api(context, user.token).get('/customer-imports?sortBy=status&sortOrder=asc').expect(200)).body;
    expect(byStatusSort.data.map((item: { status: string }) => item.status)).toEqual(['VALIDATED', 'VALIDATED', 'FAILED']);

    // `startedById` no amplía el alcance de un OWN; el administrador ve las ajenas y filtra por autor.
    const sneaky = (await api(context, other.token).get(`/customer-imports?startedById=${user.id}`).expect(200)).body;
    expect(sneaky.data.some((item: { startedBy: { id: string } }) => item.startedBy.id === user.id)).toBe(false);
    const adminView = (await api(context, admin.token).get(`/customer-imports?startedById=${user.id}`).expect(200)).body;
    expect(adminView.pagination.totalItems).toBe(3);
    await api(context, user.token).get('/customer-imports?sortBy=originalFileName').expect(400);
    await api(context, user.token).get('/customer-imports?pageSize=101').expect(400);
  });

  it('archivo de errores CSV: solo filas no importadas, columnas, neutralización y se puede volver a subir corregido (PF-06.12, PF-06.28)', async () => {
    const good = row(J1);
    const bad: FixtureRow[] = [
      { legalName: '=cmd', country: J1 },
      { legalName: name('Correo uno'), country: J1, email: '+1' },
      { legalName: name('Correo dos'), country: J1, email: '-2' },
      { legalName: '@x', country: J1 },
    ];
    const body = await uploadOk(author.token, [good, ...bad]);
    const response = await downloadBuffer(author.token, `/customer-imports/${body.id}/error-file`);
    expect(response.headers['content-disposition']).toContain(`errores-${body.code}.csv`);
    expect(response.headers['cache-control']).toBe('no-store');
    const text = (response.body as Buffer).toString('utf8').slice(1);
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toBe(['Fila del archivo', ...TEMPLATE_HEADERS, 'Estado de la fila', 'Errores'].join(','));
    expect(lines).toHaveLength(5);
    expect(lines[1]?.startsWith("3,,'=cmd,")).toBe(true);
    expect(lines[2]).toContain(",'+1,");
    expect(lines[3]).toContain(",'-2,");
    expect(lines[4]?.startsWith("6,,'@x,")).toBe(true);
    expect(lines[1]).toContain('Con errores');
    expect(lines[1]).toContain('FORMULA_NOT_ALLOWED: ');
    expect(text).not.toContain(good.legalName ?? 'nunca');
    const audit = await context.prisma.auditLog.findFirst({ where: { event: 'crm.customer_import.error_file_downloaded', resourceId: body.id } });
    expect(audit?.metadata).toMatchObject({ rows: 4 });

    // Corregido y vuelto a subir: el lector ignora las columnas añadidas y quita el apóstrofo.
    const fixed = text
      .replace("'=cmd", name('Corregida'))
      .replace("'+1", 'uno@example.invalid')
      .replace("'-2", 'dos@example.invalid')
      .replace("'@x", name('Arroba'));
    const reupload = (await upload(author.token, Buffer.from(fixed, 'utf8')).expect(201)).body as ImportBody;
    expect(reupload).toMatchObject({ totalRows: 4, validRows: 4 });
  });

  it('archivo de errores XLSX: celdas de texto neutralizadas; sin filas no importadas → 404 (PF-06.12, PF-06.28, PF-06.30)', async () => {
    const cells = (overrides: Record<string, unknown>): unknown[] => TEMPLATE_HEADERS.map((header) => overrides[header] ?? '');
    const buffer = await xlsxFile([cells({ 'Razón social': name('Tel'), País: J1, Correo: '+1' }), cells({ 'Razón social': name('Ok'), País: J1 })] as never);
    const body = (await upload(author.token, buffer, 'e.xlsx', XLSX_TYPE).expect(201)).body as ImportBody;
    const response = await downloadBuffer(author.token, `/customer-imports/${body.id}/error-file`);
    expect(response.headers['content-type']).toContain(XLSX_TYPE);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('Clientes');
    expect(sheet?.rowCount).toBe(2);
    const cell = sheet?.getRow(2).getCell(TEMPLATE_HEADERS.indexOf('Correo') + 2);
    expect(cell?.value).toBe("'+1");
    expect(cell?.type).toBe(ExcelJS.ValueType.String);

    const clean = await uploadOk(author.token, [row(J1)]);
    await downloadBuffer(author.token, `/customer-imports/${clean.id}/error-file`, 404);
  });

  it('purga de retención: raw_data vacío, estados e incidencias conservados, archivo de errores 409 (PF-06.45, PF-06.30, AC-06.23)', async () => {
    const old = await uploadOk(author.token, [row(J1), { country: J1 }]);
    const recent = await uploadOk(author.token, [{ country: J1 }]);
    await context.prisma.$executeRaw`UPDATE customer_imports SET status = 'CANCELLED', completed_at = now() - interval '91 days' WHERE id = ${old.id}::uuid`;

    const result = await context.app.get(CustomerImportsService).purgeExpiredRowData();
    expect(result.purgedRows).toBeGreaterThanOrEqual(2);
    const purgedRows = await rowsOf(author.token, old.id);
    expect(purgedRows.map((current) => [current.values, current.status, current.issues.map((issue) => issue.code)])).toEqual([
      [null, 'VALID', []],
      [null, 'INVALID', ['REQUIRED_FIELD_MISSING']],
    ]);
    const detail = (await api(context, author.token).get(`/customer-imports/${old.id}`).expect(200)).body as ImportBody;
    expect(detail).toMatchObject({ isPurged: true, hasErrorFile: false, totalRows: 2, validRows: 1 });
    const purged = await api(context, author.token).get(`/customer-imports/${old.id}/error-file`).expect(409);
    expect(purged.body.code).toBe('IMPORT_DATA_PURGED');
    expect((await rowsOf(author.token, recent.id))[0]?.values).not.toBeNull();
    // Idempotente.
    await context.app.get(CustomerImportsService).purgeExpiredRowData();
    expect((await rowsOf(author.token, old.id))[0]?.values).toBeNull();
  });

  it('auditoría de cada operación y logs sin valores de celda, correos ni nombre de archivo (PF-06.41, AC-06.28)', async () => {
    const logger = context.app.get(AppLogger);
    const calls: unknown[] = [];
    const spies = (['info', 'warn', 'error'] as const).map((level) =>
      jest.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
        calls.push(args);
      }),
    );
    try {
      const legalName = name('Secreta');
      const email = `secreto-${uniqueSuffix().toLowerCase()}@empresa.example`;
      const body = (await upload(author.token, csvFile([row(J1, { legalName, email }), { country: J1 }]), 'nombre-confidencial.csv').expect(201)).body as ImportBody;
      await confirm(author.token, body);
      await api(context, author.token).get(`/customer-imports/${body.id}/error-file`).expect(200);
      const serialized = JSON.stringify(calls);
      expect(serialized).toContain(body.id);
      expect(serialized).not.toContain(legalName);
      expect(serialized).not.toContain(email);
      expect(serialized).not.toContain('nombre-confidencial');

      const events = await context.prisma.auditLog.findMany({ where: { resourceId: body.id }, orderBy: { occurredAt: 'asc' } });
      expect(events.map((event) => event.event)).toEqual([
        'crm.customer_import.uploaded',
        'crm.customer_import.validated',
        'crm.customer_import.confirmed',
        'crm.customer_import.completed',
        'crm.customer_import.error_file_downloaded',
      ]);
      expect(JSON.stringify(events)).not.toContain(legalName);
      expect(JSON.stringify(events)).not.toContain('nombre-confidencial');
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });

  it('deshabilitada: subir, confirmar y cancelar → 409 IMPORTS_DISABLED; historial, detalle y filas → 200 (PF-06.24, AC-06.25)', async () => {
    const body = await uploadOk(author.token, [row(J1)]);
    await withParameter(context.prisma, ENABLED, 'false', async () => {
      expect((await upload(author.token, csvFile([row(J1)])).expect(409)).body.code).toBe('IMPORTS_DISABLED');
      expect((await api(context, author.token).post(`/customer-imports/${body.id}/confirmation`).send({ expectedValidRows: 1 }).expect(409)).body.code).toBe('IMPORTS_DISABLED');
      expect((await api(context, author.token).post(`/customer-imports/${body.id}/cancellation`).expect(409)).body.code).toBe('IMPORTS_DISABLED');
      await api(context, author.token).get('/customer-imports').expect(200);
      const detail = (await api(context, author.token).get(`/customer-imports/${body.id}`).expect(200)).body as ImportBody;
      expect(detail.canConfirm).toBe(false);
      await api(context, author.token).get(`/customer-imports/${body.id}/rows`).expect(200);
      expect((await api(context, author.token).get('/customer-imports/settings').expect(200)).body.enabled).toBe(false);
    });
  });
});

describe('rendimiento (PF-06.44)', () => {
  it('5 000 filas válidas se validan en menos de 15 s', async () => {
    const user = await crmUser(context, { roleCodes: ['asesor'], grant: IMPORT_GRANTS, countryId: j1 });
    const suffix = uniqueSuffix();
    const rows = Array.from({ length: 5000 }, (_value, index) => ({ legalName: `Rendimiento ${suffix} ${index} S.A.`, country: J1 }));
    const started = Date.now();
    const body = (await upload(user.token, csvFile(rows)).expect(201)).body as ImportBody;
    const elapsed = Date.now() - started;
    expect(body).toMatchObject({ totalRows: 5000, validRows: 5000 });
    expect(elapsed).toBeLessThan(15_000);
  }, 60_000);
});

describe('catálogo de estados de cliente por defecto', () => {
  it('el estado por defecto existe (precondición de PF-06.8)', async () => {
    await expect(catalogItemId(context.prisma, 'crm.estado_cliente', 'PROSPECTO')).resolves.toEqual(expect.any(String));
  });
});
