import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { calendarDateIn, fromCalendarDate, toCalendarDate } from '@/common/calendar-date';
import { readSheetRows, writeTextWorkbook } from '@/common/xlsx';
import { type CliDeps, EXIT_ERRORS, EXIT_OK, EXIT_REJECTED, runCli } from '@/modules/initial-data-load/cli/load-initial-data.cli';
import { InitialDataLoader } from '@/modules/initial-data-load/initial-data-loader.service';
import { ParameterReader } from '@/modules/parameters/parameter-reader';
import { ProjectClassificationService } from '@/modules/projects/project-classification.service';
import { ENTITY_DEFINITIONS } from '@/modules/initial-data-load/initial-data-templates';

import { catalogItemId, crmUser, EXCLUSIVE_TIMEOUT_MS, exclusiveParameters, insertCustomer, testCountry, uniqueSuffix } from './support/crm-fixtures';
import { closeTestContext, createTestContext, createTestUser, type TestContext } from './support/test-app';

/**
 * Carga inicial de datos por scripts con plantilla (docs/implementation-plans/CARGA-INICIAL.md)
 * contra PostgreSQL: el recorrido completo del CLI (`runCli`, con archivos reales en una carpeta
 * temporal) sobre los servicios de aplicación existentes: `template`, `validate` (no escribe),
 * `apply` (crea y deja auditoría), segunda ejecución idempotente, archivo con errores (no aplica
 * nada), actor inexistente o sin permiso, fecha pasada, familia o cliente inexistentes. Dos
 * pruebas arrancan el script de verdad (`ts-node`) para cubrir el arranque standalone de Nest.
 *
 * `safety_minutes` es una tabla compartida de un mensaje por fecha: esta suite toma el candado
 * de la tabla (como `safety-minutes` y `me-settings`) y usa fechas de 2040.
 */

const COUNTRY_ISO = 'ZW';
const MINUTES_FROM = '2040-03-01';
const MINUTES_TO = '2040-03-31';

let context: TestContext;
let releaseTable: () => Promise<void>;
let workDir: string;
let adminEmail: string;
let adminId: string;
let adminCode: string;
let ownerId: string;
let ownerEmail: string;
let ownerCode: string;
let customerCrmCode: string;
let customerId: string;
let countryId: string;
let plainEmail: string;
let suspendedAdminEmail: string;
let noPermissionAdminEmail: string;

const PROJECT_HEADERS = ENTITY_DEFINITIONS.projects.sheets[0]!.columns.map((column) => column.header);
const FAMILY_HEADERS = ENTITY_DEFINITIONS.products.sheets[0]!.columns.map((column) => column.header);
const PRODUCT_HEADERS = ENTITY_DEFINITIONS.products.sheets[1]!.columns.map((column) => column.header);
const MINUTE_HEADERS = ENTITY_DEFINITIONS['safety-minutes'].sheets[0]!.columns.map((column) => column.header);
const USER_HEADERS = ENTITY_DEFINITIONS.users.sheets[0]!.columns.map((column) => column.header);

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

async function run(argv: string[], env: Record<string, string | undefined> = {}): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const deps: CliDeps = {
    env: { DATABASE_URL: process.env['DATABASE_URL'], ...env },
    cwd: workDir,
    now: () => new Date(),
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    open: async () => ({ loader: context.app.get(InitialDataLoader), close: async () => undefined }),
  };
  const code = await runCli(argv, deps);
  return { code, out: out.join('\n'), err: err.join('\n') };
}

function row(headers: readonly string[], values: Record<string, string>): string {
  return headers.map((header) => (values[header] ?? '').replace(/,/g, ' ')).join(',');
}

async function csvFile(name: string, headers: readonly string[], rows: Record<string, string>[]): Promise<string> {
  const path = join(workDir, name);
  await writeFile(path, [headers.join(','), ...rows.map((values) => row(headers, values))].join('\r\n'), 'utf8');
  return path;
}

async function projectsFile(name: string, rows: Record<string, string>[]): Promise<string> {
  return csvFile(name, PROJECT_HEADERS, rows);
}

const project = (name: string, overrides: Record<string, string> = {}): Record<string, string> => ({
  'Nombre del proyecto': name,
  'Código CRM del cliente': customerCrmCode,
  ...overrides,
});

/**
 * Simula que `crm.campos_obligatorios` (clave `project`) exige además `extra`, **solo en esta app**:
 * el parámetro es global y las suites corren en paralelo sobre el mismo esquema, así que no se
 * cambia en la base (afectaría a `projects.e2e` y a otras).
 */
async function withRequiredProjectFields<T>(extra: string[], work: () => Promise<T>): Promise<T> {
  const reader = context.app.get(ParameterReader, { strict: false });
  const original = reader.get.bind(reader) as (key: string) => Promise<unknown>;
  const spy = jest.spyOn(reader, 'get').mockImplementation((async (key: string) => {
    const value = await original(key);
    if (key !== 'crm.campos_obligatorios') return value;
    const record = value as { project?: string[] };
    return { ...record, project: [...(record.project ?? []), ...extra] };
  }) as typeof reader.get);
  try {
    return await work();
  } finally {
    spy.mockRestore();
  }
}

async function reports(): Promise<string[]> {
  return (await readdir(workDir)).filter((name) => name.startsWith('informe-carga-'));
}

async function readReport(name: string): Promise<string> {
  return (await readFile(join(workDir, name), 'utf8')).replace(/^﻿/, '');
}

async function projectsOfCustomer() {
  return context.prisma.project.findMany({ where: { customerId }, orderBy: { createdAt: 'asc' } });
}

async function auditCount(event: string, subjectId = adminId): Promise<number> {
  return context.prisma.auditLog.count({ where: { event, subjectId } });
}

beforeAll(async () => {
  releaseTable = await exclusiveParameters('safety-minutes-table');
  context = await createTestContext();
  workDir = await mkdtemp(join(tmpdir(), 'carga-inicial-e2e-'));
  await context.prisma.safetyMinute.deleteMany({ where: { displayDate: { gte: fromCalendarDate(MINUTES_FROM), lte: fromCalendarDate(MINUTES_TO) } } });

  countryId = await testCountry(context.prisma, 'ZW');
  const suffix = uniqueSuffix();

  const admin = await createTestUser(context.prisma, { roleCodes: ['administrador'] });
  adminId = admin.id;
  adminEmail = admin.email;
  adminCode = `EMP-CI-A-${suffix}`;
  await context.prisma.user.update({ where: { id: admin.id }, data: { employeeCode: adminCode } });

  const owner = await crmUser(context, { roleCodes: ['asesor'], countryId, employeeCode: `EMP-CI-O-${suffix}` });
  ownerId = owner.id;
  ownerEmail = owner.email;
  ownerCode = `EMP-CI-O-${suffix}`;

  plainEmail = (await createTestUser(context.prisma, { roleCodes: ['usuario'] })).email;
  suspendedAdminEmail = (await createTestUser(context.prisma, { roleCodes: ['administrador'], status: 'SUSPENDED' })).email;
  // Administrador al que una excepción directa le quita el permiso de crear minutos de seguridad.
  noPermissionAdminEmail = (await crmUser(context, { roleCodes: ['administrador'], deny: ['minuto_seguridad.crear'] })).email;

  const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId });
  customerId = customer.id;
  customerCrmCode = customer.crmCode;
}, EXCLUSIVE_TIMEOUT_MS);

afterAll(async () => {
  try {
    await context?.prisma.safetyMinute.deleteMany({ where: { displayDate: { gte: fromCalendarDate(MINUTES_FROM), lte: fromCalendarDate(MINUTES_TO) } } });
    if (workDir) await rm(workDir, { recursive: true, force: true });
    await closeTestContext(context);
  } finally {
    await releaseTable?.();
  }
});

describe('plantillas (template)', () => {
  it('genera el libro XLSX con los códigos activos reales de la base en «Valores válidos»', async () => {
    const result = await run(['template', 'projects', '--out', 'plantillas']);
    expect(result.code).toBe(EXIT_OK);
    const buffer = await readFile(join(workDir, 'plantillas', 'plantilla-proyectos.xlsx'));
    const valid = await readSheetRows(buffer, { preferredSheet: 'Valores válidos', exactSheet: true, maxRows: 500, maxColumns: 5, timeoutMs: 10_000 });
    const codes = valid.rows.map((rowValue) => [rowValue.cells[0], rowValue.cells[1]].map((cell) => (cell?.kind === 'text' ? cell.text : '')).join('|'));
    expect(codes).toEqual(expect.arrayContaining(['País|GT', `País|${COUNTRY_ISO}`, 'Tipo de proyecto|EDIFICIO', 'Sector|COMERCIAL']));
  });

  it('productos en CSV: un archivo por hoja; las unidades válidas salen de la base', async () => {
    expect((await run(['template', 'products', '--format', 'csv', '--out', 'csv-productos'])).code).toBe(EXIT_OK);
    expect((await readdir(join(workDir, 'csv-productos'))).sort()).toEqual(['plantilla-productos-familias.csv', 'plantilla-productos.csv']);
    const xlsx = await run(['template', 'products', '--out', 'xlsx-productos']);
    expect(xlsx.code).toBe(EXIT_OK);
    const buffer = await readFile(join(workDir, 'xlsx-productos', 'plantilla-productos.xlsx'));
    const valid = await readSheetRows(buffer, { preferredSheet: 'Valores válidos', exactSheet: true, maxRows: 500, maxColumns: 5, timeoutMs: 10_000 });
    expect(valid.rows.some((rowValue) => rowValue.cells[1]?.kind === 'text' && rowValue.cells[1].text === 'TON')).toBe(true);
  });
});

describe('proyectos', () => {
  it('validar no escribe nada; apply crea con folio, clasificación y auditoría; repetir es idempotente', async () => {
    const file = await projectsFile('proyectos-ok.csv', [
      project('Torre Carga Inicial A', { 'Fecha estimada de inicio': '2041-01-15', 'Fecha estimada de fin': '2041-12-15', 'Tipo de proyecto': 'EDIFICIO', Sector: 'COMERCIAL', Ciudad: 'Ciudad' }),
      project('Torre Carga Inicial B', { Responsable: ownerEmail, 'Código de proyecto': `PRY-CI-${uniqueSuffix()}`, País: COUNTRY_ISO }),
      project('Torre Carga Inicial C', { Responsable: ownerCode }),
    ]);

    const validated = await run(['validate', 'projects', '--file', file, '--actor', adminEmail]);
    expect(validated).toEqual({ code: EXIT_OK, out: expect.any(String), err: '' });
    expect(validated.out).toContain('Hoja Proyectos: leídas 3 - por crear 3 - ya existen 0 - con errores 0');
    expect(validated.out).toContain('modo: validar (no se escribió nada)');
    expect(await projectsOfCustomer()).toHaveLength(0);
    expect(await auditCount('crm.project.created')).toBe(0);

    const applied = await run(['apply', 'projects', '--file', file, '--actor', adminEmail]);
    expect(applied.code).toBe(EXIT_OK);
    expect(applied.out).toContain('creadas 3');
    expect(applied.err).toBe('');

    const created = await projectsOfCustomer();
    expect(created.map((item) => item.name)).toEqual(['Torre Carga Inicial A', 'Torre Carga Inicial B', 'Torre Carga Inicial C']);
    const [first, second, third] = created;
    expect(first!.code).toMatch(/^PRY-\d{4}-\d{5}$/);
    expect(first).toMatchObject({ ownerId: adminId, countryId, city: 'Ciudad', createdById: adminId });
    expect(first!.projectTypeId).toBe(await catalogItemId(context.prisma, 'crm.tipo_proyecto', 'EDIFICIO'));
    expect(first!.sectorId).toBe(await catalogItemId(context.prisma, 'crm.sector_proyecto', 'COMERCIAL'));
    expect(first!.estimatedStartDate?.toISOString().slice(0, 10)).toBe('2041-01-15');
    expect(second).toMatchObject({ ownerId, countryId });
    expect(second!.code).toMatch(/^PRY-CI-/);
    expect(third!.ownerId).toBe(ownerId);
    expect(await auditCount('crm.project.created')).toBe(3);
    expect(await auditCount('crm.project.classified')).toBe(1);

    const again = await run(['apply', 'projects', '--file', file, '--actor', adminEmail]);
    expect(again.code).toBe(EXIT_OK);
    expect(again.out).toContain('por crear 0 - creadas 0 - ya existen 3 - con errores 0');
    expect(await projectsOfCustomer()).toHaveLength(3);
    expect(await auditCount('crm.project.created')).toBe(3);
    const entries = (await reports()).map((name) => name);
    expect(entries.length).toBeGreaterThan(0);
    const latest = await readReport(entries.at(-1)!);
    expect(latest).toContain('Ya existe (omitida)');
  });

  it('un código ya usado por otro nombre es CODE_CONFLICT y bloquea toda la carga; con cliente y nombre iguales es «ya existe»', async () => {
    const [existing] = await projectsOfCustomer();
    const conflict = await projectsFile('proyectos-codigo.csv', [
      project('Otro nombre completamente distinto', { 'Código de proyecto': existing!.code }),
      project('Fila valida que tampoco debe crearse'),
    ]);
    const result = await run(['apply', 'projects', '--file', conflict, '--actor', adminEmail, '--report', 'conflicto-codigo.csv']);
    expect(result.code).toBe(EXIT_ERRORS);
    expect(result.out).toContain('hoja Proyectos, fila 2, columna Código de proyecto: Ese código de proyecto ya lo usa un proyecto de otro cliente o con otro nombre. (CODE_CONFLICT)');
    expect(await projectsOfCustomer()).toHaveLength(3);

    const same = await projectsFile('proyectos-codigo-igual.csv', [project(existing!.name, { 'Código de proyecto': existing!.code })]);
    const ok = await run(['apply', 'projects', '--file', same, '--actor', adminEmail]);
    expect(ok.code).toBe(EXIT_OK);
    expect(ok.out).toContain('ya existen 1');
    expect(ok.out).not.toContain('con datos distintos');
  });

  it('un proyecto del cliente con el mismo nombre y otro código se omite con la advertencia EXISTS_DIFFERENT y no bloquea (exit 0)', async () => {
    const [existing] = await projectsOfCustomer();
    const file = await projectsFile('proyectos-codigo-distinto.csv', [project(existing!.name, { 'Código de proyecto': `PRY-OTRO-${uniqueSuffix()}` })]);
    const result = await run(['apply', 'projects', '--file', file, '--actor', adminEmail, '--report', 'codigo-distinto.csv']);
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toContain('ya existen 0 - ya existen con datos distintos 1');
    expect(result.out).toContain('[Advertencia]');
    expect(result.out).toContain('Advertencias: 1 fila(s) requieren revisión manual');
    expect(await readReport('codigo-distinto.csv')).toContain('Advertencia,EXISTS_DIFFERENT');
    expect(await projectsOfCustomer()).toHaveLength(3);
  });

  it('con la ciudad parametrizada como obligatoria, validate sale con 1 y apply no escribe nada', async () => {
    const file = await projectsFile('proyectos-ciudad.csv', [
      project('Con ciudad parametrizada', { Ciudad: 'Guatemala' }),
      project('Sin ciudad parametrizada'),
    ]);
    const before = (await projectsOfCustomer()).length;
    await withRequiredProjectFields(['city'], async () => {
      const validated = await run(['validate', 'projects', '--file', file]);
      expect(validated.code).toBe(EXIT_ERRORS);
      expect(validated.out).toContain('fila 3, columna Ciudad: El campo es obligatorio según la parametrización de campos obligatorios de proyectos. (REQUIRED_FIELD_MISSING)');
      const applied = await run(['apply', 'projects', '--file', file, '--actor', adminEmail]);
      expect(applied.code).toBe(EXIT_ERRORS);
      expect(await projectsOfCustomer()).toHaveLength(before);
    });
  });

  it('con la unidad de medida parametrizada como obligatoria al clasificar, clasificar sin ella es un error de fila (ADR-031) y no se aplica nada', async () => {
    const file = await projectsFile('proyectos-unidad.csv', [project('Clasificado con unidad obligatoria', { 'Tipo de proyecto': 'EDIFICIO' })]);
    const before = (await projectsOfCustomer()).length;
    await withRequiredProjectFields(['measureUnitId'], async () => {
      const applied = await run(['apply', 'projects', '--file', file, '--actor', adminEmail]);
      expect(applied.code).toBe(EXIT_ERRORS);
      expect(applied.out).toContain('fila 2, columna Unidad de medida');
      expect(applied.out).toContain('(REQUIRED_FIELD_MISSING)');
    });
    expect(await projectsOfCustomer()).toHaveLength(before);
  });

  it('historial comercial (ADR-031): cliente por código de cliente, clasificación con unidad y cantidad, fase y oportunidad ganada con fecha de decisión histórica', async () => {
    const code = `CI-${uniqueSuffix()}`;
    const historyCustomer = await insertCustomer(context.prisma, { salesOwnerId: ownerId, countryId, customerCode: code });
    const file = await projectsFile('proyectos-historial.csv', [
      {
        'Nombre del proyecto': 'Proyecto con historial ganado',
        'Código de cliente': code.toLowerCase(),
        Responsable: ownerEmail,
        'Tipo de proyecto': 'EDIFICIO',
        'Unidad de medida': 'M2',
        'Cantidad estimada': '1250.5',
        'Fase del cliente': 'CONSTRUCCION',
        'Avance de fase': '40',
        'Comentario de fase': 'Fase en el CRM anterior: Execution',
        'Etapa de oportunidad': 'GANADO',
        'Fecha de oportunidad': '2024-03-10',
        Resultado: 'WON',
        'Motivo del resultado': 'PRECIO',
        'Fecha de decisión': '2024-09-30',
        'Comentario del resultado': 'Motivo en el CRM anterior: Product price',
      },
      {
        'Nombre del proyecto': 'Proyecto con oportunidad abierta',
        'Código de cliente': code,
        'Etapa de oportunidad': 'COTIZANDO',
        'Fecha de oportunidad': '2025-01-20',
      },
    ]);

    const validated = await run(['validate', 'projects', '--file', file, '--actor', adminEmail]);
    expect(validated.code).toBe(EXIT_OK);
    expect(await context.prisma.project.count({ where: { customerId: historyCustomer.id } })).toBe(0);

    const applied = await run(['apply', 'projects', '--file', file, '--actor', adminEmail]);
    expect(applied.code).toBe(EXIT_OK);
    expect(applied.out).toContain('creadas 2');

    const created = await context.prisma.project.findMany({
      where: { customerId: historyCustomer.id },
      orderBy: { createdAt: 'asc' },
      include: { opportunities: { include: { result: true, stage: true } }, phase: true, measureUnit: true },
    });
    const [won, open] = created;
    expect(won).toMatchObject({ ownerId, phaseComment: 'Fase en el CRM anterior: Execution' });
    expect(won!.phase.code).toBe('CONSTRUCCION');
    expect(won!.phaseProgress.toString()).toBe('40');
    expect(won!.measureUnit?.code).toBe('M2');
    expect(won!.estimatedQuantity?.toString()).toBe('1250.5');
    const [opportunity] = won!.opportunities;
    expect(opportunity).toMatchObject({ ownerId });
    expect(opportunity!.stage.code).toBe('GANADO');
    expect(opportunity!.opportunityDate.toISOString().slice(0, 10)).toBe('2024-03-10');
    expect(opportunity!.closedAt).not.toBeNull();
    expect(opportunity!.result).toMatchObject({ outcome: 'WON', comments: 'Motivo en el CRM anterior: Product price' });
    // Los reportes de ganadas usan esta fecha: queda la histórica, no la de la carga.
    expect(opportunity!.result!.decisionDate.toISOString().slice(0, 10)).toBe('2024-09-30');
    expect(opportunity!.result!.reasonId).toBe(await catalogItemId(context.prisma, 'crm.motivo_resultado', 'PRECIO'));
    expect(await context.prisma.opportunityStageHistory.count({ where: { opportunityId: opportunity!.id } })).toBe(2);
    expect(open!.opportunities.map((item) => [item.stage.code, item.result])).toEqual([['COTIZANDO', null]]);

    const again = await run(['apply', 'projects', '--file', file, '--actor', adminEmail]);
    expect(again.out).toContain('por crear 0 - creadas 0 - ya existen 2');
    expect(await context.prisma.opportunity.count({ where: { project: { customerId: historyCustomer.id } } })).toBe(2);
  });

  it('si falla la clasificación tras crear, el proyecto queda en una categoría propia («creada con advertencia»), sin doble conteo, y repetir lo omite', async () => {
    const spy = jest.spyOn(context.app.get(ProjectClassificationService), 'update').mockRejectedValueOnce(new Error('fallo simulado de clasificación'));
    const file = await projectsFile('proyectos-clasificacion.csv', [project('Proyecto con clasificacion fallida', { 'Tipo de proyecto': 'EDIFICIO' })]);
    try {
      const result = await run(['apply', 'projects', '--file', file, '--actor', adminEmail, '--report', 'clasificacion.csv']);
      expect(result.code).toBe(EXIT_OK);
      expect(result.out).toContain('por crear 1 - creadas 0 - ya existen 0 - creadas con advertencia 1 - con errores 0');
      expect(result.out).toContain('(CLASSIFICATION_FAILED)');
      expect(await readReport('clasificacion.csv')).toContain('Advertencia,CLASSIFICATION_FAILED');
      expect(result.out).not.toContain('fallo simulado');
    } finally {
      spy.mockRestore();
    }
    const created = await context.prisma.project.findFirstOrThrow({ where: { customerId, name: 'Proyecto con clasificacion fallida' } });
    expect(created.projectTypeId).toBeNull();
    const again = await run(['apply', 'projects', '--file', file, '--actor', adminEmail]);
    expect(again.out).toContain('por crear 0 - creadas 0 - ya existen 1');
  });

  it('un responsable que no puede ver proyectos queda fuera de lo asignable: INVALID_OWNER con --actor', async () => {
    const file = await projectsFile('proyectos-responsable.csv', [project('Con responsable no asignable', { Responsable: plainEmail })]);
    const result = await run(['validate', 'projects', '--file', file, '--actor', adminEmail]);
    expect(result.code).toBe(EXIT_ERRORS);
    expect(result.out).toContain('fila 2, columna Responsable');
    expect(result.out).toContain('(INVALID_OWNER)');
  });

  it('un encabezado desconocido que empieza por = se neutraliza en el informe CSV', async () => {
    const file = await csvFile('proyectos-encabezado.csv', [...PROJECT_HEADERS, '=CMD'], [{ 'Nombre del proyecto': 'x', 'Código CRM del cliente': customerCrmCode }]);
    const result = await run(['validate', 'projects', '--file', file, '--report', 'encabezado.csv']);
    expect(result.code).toBe(EXIT_ERRORS);
    const report = await readReport('encabezado.csv');
    expect(report).toContain(",'=CMD,");
    expect(report).not.toMatch(/(^|,)=CMD/m);
  });

  it('un archivo con la firma falsa o por encima del tamaño máximo se rechaza', async () => {
    const fake = join(workDir, 'falso.xlsx');
    await writeFile(fake, 'esto no es un libro de Excel');
    const rejected = await run(['validate', 'projects', '--file', fake]);
    expect(rejected.code).toBe(EXIT_ERRORS);
    expect(rejected.out).toContain('(UNSUPPORTED_FILE_TYPE)');

    const big = join(workDir, 'grande.csv');
    await writeFile(big, Buffer.alloc(10 * 1024 * 1024 + 1, 0x61));
    const tooBig = await run(['validate', 'projects', '--file', big]);
    expect(tooBig.code).toBe(EXIT_REJECTED);
    expect(tooBig.err).toContain('tamaño máximo');
  });

  it('un archivo con errores no aplica nada, ni siquiera las filas válidas, y el informe da fila, columna y motivo sin datos', async () => {
    const before = (await projectsOfCustomer()).length;
    const file = await projectsFile('proyectos-errores.csv', [
      project('Proyecto Valido Nuevo ZZ'),
      project('Proyecto-Sensible-Fecha', { 'Fecha estimada de inicio': '31/12/2041' }),
      { 'Nombre del proyecto': 'Proyecto-Sensible-Cliente', 'Código CRM del cliente': 'CLIENTE-INEXISTENTE-QQ' },
      project('', {}),
      project('Proyecto-Sensible-Fin', { 'Fecha estimada de inicio': '2041-05-01', 'Fecha estimada de fin': '2041-04-01' }),
      project('Proyecto-Sensible-Tipo', { 'Tipo de proyecto': 'NO-EXISTE-TIPO' }),
    ]);
    const result = await run(['apply', 'projects', '--file', file, '--actor', adminEmail, '--report', 'errores-proyectos.csv']);
    expect(result.code).toBe(EXIT_ERRORS);
    expect(result.out).toContain('No se aplicó nada');
    expect(await projectsOfCustomer()).toHaveLength(before);

    const report = await readReport('errores-proyectos.csv');
    expect(report.split('\r\n').slice(0, -1)).toEqual([
      'Hoja,Fila,Columna,Estado,Código,Motivo',
      'Proyectos,3,Fecha estimada de inicio,Error,INVALID_DATE,La fecha debe ser una fecha real con el formato AAAA-MM-DD.',
      'Proyectos,4,Código CRM del cliente,Error,UNKNOWN_REFERENCE,No existe un cliente con ese código CRM.',
      'Proyectos,5,Nombre del proyecto,Error,REQUIRED_FIELD_MISSING,El campo es obligatorio.',
      'Proyectos,6,Fecha estimada de fin,Error,INVALID_DATE_RANGE,La fecha de fin no puede ser anterior a la de inicio.',
      'Proyectos,7,Tipo de proyecto,Error,UNKNOWN_REFERENCE,El tipo de proyecto no existe.',
    ]);
    for (const text of [report, result.out, result.err]) {
      expect(text).not.toMatch(/Sensible|INEXISTENTE|NO-EXISTE|31\/12/);
    }
  });

  it('un archivo con columnas que sobran o faltan se rechaza completo con exit 1', async () => {
    const file = await csvFile('proyectos-estructura.csv', [...PROJECT_HEADERS.slice(1), 'Columna Extra'], [{ 'Código CRM del cliente': customerCrmCode, 'Columna Extra': 'x' }]);
    const result = await run(['validate', 'projects', '--file', file]);
    expect(result.code).toBe(EXIT_ERRORS);
    expect(result.out).toContain('hoja Proyectos, columna Columna Extra: La columna no pertenece a la plantilla. (UNKNOWN_COLUMN)');
    expect(result.out).toContain('columna Nombre del proyecto: Falta la columna de la plantilla. (MISSING_COLUMN)');
  });

  it('una fórmula o una celda que empieza por +, - o = en texto libre se rechaza', async () => {
    const file = await projectsFile('proyectos-formulas.csv', [project('=SUMA(1;1)'), project('+Nuevo'), project('-Nuevo'), project('@Nuevo')]);
    const result = await run(['validate', 'projects', '--file', file]);
    expect(result.code).toBe(EXIT_ERRORS);
    expect((result.out.match(/FORMULA_NOT_ALLOWED/g) ?? []).length).toBe(4);
  });

  it('un cliente que el actor no puede usar (eliminado) se reporta; el responsable que no existe también', async () => {
    const deleted = await insertCustomer(context.prisma, { salesOwnerId: ownerId, countryId, deletedAt: new Date() });
    const file = await projectsFile('proyectos-cliente-eliminado.csv', [
      { 'Nombre del proyecto': 'Sobre cliente eliminado', 'Código CRM del cliente': deleted.crmCode },
      project('Con responsable inexistente', { Responsable: 'nadie@example.invalid' }),
    ]);
    const result = await run(['validate', 'projects', '--file', file, '--actor', adminEmail]);
    expect(result.code).toBe(EXIT_ERRORS);
    expect(result.out).toContain('fila 2, columna Código CRM del cliente: El cliente está eliminado. (INACTIVE_REFERENCE)');
    expect(result.out).toContain('fila 3, columna Responsable: No existe un usuario con ese correo o código de colaborador. (UNKNOWN_REFERENCE)');
  });
});

describe('actor y entorno', () => {
  it.each([
    ['inexistente', () => 'no-existe@example.invalid', 'No existe un usuario'],
    ['sin rol de administrador', () => plainEmail, 'rol de administrador'],
    ['suspendido', () => suspendedAdminEmail, 'no está activo'],
    ['administrador sin el permiso de la entidad', () => noPermissionAdminEmail, 'permiso necesario'],
  ])('apply con un actor %s se rechaza (exit 2) y no escribe nada', async (_name, actor, fragment) => {
    const before = await context.prisma.safetyMinute.count({ where: { displayDate: { gte: fromCalendarDate(MINUTES_FROM), lte: fromCalendarDate(MINUTES_TO) } } });
    const file = await csvFile('minutos-actor.csv', MINUTE_HEADERS, [{ 'Fecha de visualización': '2040-03-20', Mensaje: 'Mensaje de prueba' }]);
    const result = await run(['apply', 'safety-minutes', '--file', file, '--actor', actor()]);
    expect(result.code).toBe(EXIT_REJECTED);
    expect(result.err).toContain(fragment);
    expect(result.err).not.toContain(actor());
    const after = await context.prisma.safetyMinute.count({ where: { displayDate: { gte: fromCalendarDate(MINUTES_FROM), lte: fromCalendarDate(MINUTES_TO) } } });
    expect(after).toBe(before);
  });

  it('validate con --actor sin el permiso de la entidad también se rechaza (exit 2)', async () => {
    const file = await csvFile('minutos-validar-actor.csv', MINUTE_HEADERS, [{ 'Fecha de visualización': '2040-03-23', Mensaje: 'Mensaje de prueba' }]);
    const result = await run(['validate', 'safety-minutes', '--file', file, '--actor', noPermissionAdminEmail]);
    expect(result.code).toBe(EXIT_REJECTED);
    expect(result.err).toContain('permiso necesario');
  });

  it('apply sin --actor ni siquiera abre la aplicación (exit 2)', async () => {
    const result = await run(['apply', 'safety-minutes', '--file', join(workDir, 'minutos-actor.csv')]);
    expect(result.code).toBe(EXIT_REJECTED);
    expect(result.err).toContain('--actor');
  });

  it('el actor se identifica también por código de colaborador', async () => {
    const file = await csvFile('minutos-codigo-actor.csv', MINUTE_HEADERS, [{ 'Fecha de visualización': '2040-03-21', Mensaje: 'Mensaje con actor por código' }]);
    const result = await run(['apply', 'safety-minutes', '--file', file, '--actor', adminCode]);
    expect(result.code).toBe(EXIT_OK);
    const stored = await context.prisma.safetyMinute.findUniqueOrThrow({ where: { displayDate: fromCalendarDate('2040-03-21') } });
    expect(stored.createdById).toBe(adminId);
  });

  it('en producción apply exige --confirm-production; con la confirmación aplica', async () => {
    const file = await csvFile('minutos-prod.csv', MINUTE_HEADERS, [{ 'Fecha de visualización': '2040-03-22', Mensaje: 'Mensaje en producción simulada' }]);
    const denied = await run(['apply', 'safety-minutes', '--file', file, '--actor', adminEmail], { NODE_ENV: 'production' });
    expect(denied.code).toBe(EXIT_REJECTED);
    expect(denied.err).toContain('--confirm-production');
    expect(await context.prisma.safetyMinute.count({ where: { displayDate: fromCalendarDate('2040-03-22') } })).toBe(0);
    const allowed = await run(['apply', 'safety-minutes', '--file', file, '--actor', adminEmail, '--confirm-production'], { NODE_ENV: 'production' });
    expect(allowed.code).toBe(EXIT_OK);
    expect(await context.prisma.safetyMinute.count({ where: { displayDate: fromCalendarDate('2040-03-22') } })).toBe(1);
  });
});

describe('usuarios (ADR-030)', () => {
  it('validar no escribe; apply da de alta con rol, país, código y equipo y deja auditoría; repetir reporta «ya existe»', async () => {
    const tag = uniqueSuffix().toLowerCase();
    const team = await context.prisma.team.upsert({ where: { code: 'CONST' }, update: {}, create: { code: 'CONST', name: 'Construcción' } });
    const rows = [
      { Correo: `Carga.Uno.${tag}@example.invalid`, Nombre: 'Carga', Apellido: 'Uno', 'Código de colaborador': `ec-u1-${tag}`, País: COUNTRY_ISO, Rol: 'asesor', Equipo: 'const' },
      { Correo: `carga.dos.${tag}@example.invalid`, Nombre: 'Carga', Apellido: 'Dos', 'Código de colaborador': `ec-u2-${tag}`, País: COUNTRY_ISO, Rol: 'asesor', Equipo: '' },
    ];
    const file = await csvFile('usuarios-ok.csv', USER_HEADERS, rows);

    const validated = await run(['validate', 'users', '--file', file]);
    expect(validated.code).toBe(EXIT_OK);
    expect(await context.prisma.user.count({ where: { emailNormalized: { in: rows.map((item) => item.Correo.toLowerCase()) } } })).toBe(0);

    const applied = await run(['apply', 'users', '--file', file, '--actor', adminEmail]);
    expect(applied.code).toBe(EXIT_OK);
    const stored = await context.prisma.user.findMany({
      where: { emailNormalized: { in: rows.map((item) => item.Correo.toLowerCase()) } },
      include: { roles: { include: { role: true } }, teams: true },
      orderBy: { emailNormalized: 'asc' },
    });
    // Orden por correo: «dos» antes que «uno». El correo se guarda en minúsculas y el código en mayúsculas.
    expect(stored.map((user) => [user.email, user.employeeCode, user.countryId, user.status, user.roles.map((entry) => entry.role.code)])).toEqual([
      [rows[1]!.Correo, `EC-U2-${tag}`.toUpperCase(), countryId, 'INVITED', ['asesor']],
      [rows[0]!.Correo.toLowerCase(), `EC-U1-${tag}`.toUpperCase(), countryId, 'INVITED', ['asesor']],
    ]);
    expect(stored[1]!.teams.map((entry) => entry.teamId)).toEqual([team.id]);
    expect(stored[0]!.teams).toHaveLength(0);
    // Nacen sin vínculo con Entra ID: se vinculan después por oid.
    expect(await context.prisma.userIdentity.count({ where: { userId: { in: stored.map((user) => user.id) } } })).toBe(0);
    expect(await context.prisma.auditLog.count({ where: { event: 'user.created', resourceId: { in: stored.map((user) => user.id) } } })).toBe(2);

    const again = await run(['apply', 'users', '--file', file, '--actor', adminEmail]);
    expect(again.code).toBe(EXIT_OK);
    expect(again.out).toContain('por crear 0 - creadas 0 - ya existen 2 - con errores 0');
  });
});

describe('minutos de seguridad', () => {
  it('validar no escribe; apply crea con auditoría; la segunda ejecución reporta «ya existe»', async () => {
    const file = await csvFile('minutos-ok.csv', MINUTE_HEADERS, [
      { 'Fecha de visualización': '2040-03-05', Mensaje: 'Use siempre el casco' },
      { 'Fecha de visualización': '2040-03-06', Mensaje: 'Revise los arneses' },
    ]);
    const validated = await run(['validate', 'safety-minutes', '--file', file]);
    expect(validated.code).toBe(EXIT_OK);
    expect(await context.prisma.safetyMinute.count({ where: { displayDate: { in: [fromCalendarDate('2040-03-05'), fromCalendarDate('2040-03-06')] } } })).toBe(0);

    const applied = await run(['apply', 'safety-minutes', '--file', file, '--actor', adminEmail]);
    expect(applied.code).toBe(EXIT_OK);
    const stored = await context.prisma.safetyMinute.findMany({
      where: { displayDate: { in: [fromCalendarDate('2040-03-05'), fromCalendarDate('2040-03-06')] } },
      orderBy: { displayDate: 'asc' },
    });
    expect(stored.map((item) => [toCalendarDate(item.displayDate), item.message, item.createdById])).toEqual([
      ['2040-03-05', 'Use siempre el casco', adminId],
      ['2040-03-06', 'Revise los arneses', adminId],
    ]);
    const events = await context.prisma.auditLog.findMany({ where: { event: 'safety_minute.created', resourceId: { in: stored.map((item) => item.id) } } });
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.subjectId === adminId)).toBe(true);

    const again = await run(['apply', 'safety-minutes', '--file', file, '--actor', adminEmail]);
    expect(again.code).toBe(EXIT_OK);
    expect(again.out).toContain('por crear 0 - creadas 0 - ya existen 2 - con errores 0');
    expect(await context.prisma.safetyMinute.count({ where: { displayDate: { in: [fromCalendarDate('2040-03-05'), fromCalendarDate('2040-03-06')] } } })).toBe(2);
    expect(await context.prisma.auditLog.count({ where: { event: 'safety_minute.created', resourceId: { in: stored.map((item) => item.id) } } })).toBe(2);
  });

  it('una fecha pasada es un error y con ella no se aplica ni la fila válida', async () => {
    const timeZone = (await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: 'crm.zona_horaria_negocio' } })).value;
    const today = calendarDateIn(new Date(), timeZone);
    const yesterday = toCalendarDate(new Date(fromCalendarDate(today).getTime() - 86_400_000));
    const file = await csvFile('minutos-pasada.csv', MINUTE_HEADERS, [
      { 'Fecha de visualización': '2040-03-10', Mensaje: 'Mensaje válido que no debe crearse' },
      { 'Fecha de visualización': yesterday, Mensaje: 'Mensaje con fecha pasada' },
    ]);
    const result = await run(['apply', 'safety-minutes', '--file', file, '--actor', adminEmail]);
    expect(result.code).toBe(EXIT_ERRORS);
    expect(result.out).toContain('fila 3, columna Fecha de visualización: La fecha ya pasó');
    expect(result.out).toContain('(PAST_DATE)');
    expect(result.out).not.toContain('Mensaje con fecha pasada');
    expect(await context.prisma.safetyMinute.count({ where: { displayDate: fromCalendarDate('2040-03-10') } })).toBe(0);
  });

  it('un mensaje con HTML de control o más de 1000 caracteres y fechas repetidas se reportan todos', async () => {
    const file = await csvFile('minutos-invalidos.csv', MINUTE_HEADERS, [
      { 'Fecha de visualización': '2040-03-11', Mensaje: 'x'.repeat(1001) },
      { 'Fecha de visualización': '2040-03-12', Mensaje: 'uno' },
      { 'Fecha de visualización': '2040-03-12', Mensaje: 'dos' },
      { 'Fecha de visualización': 'mañana', Mensaje: 'tres' },
    ]);
    const result = await run(['validate', 'safety-minutes', '--file', file]);
    expect(result.code).toBe(EXIT_ERRORS);
    expect(result.out).toMatch(/fila 2, columna Mensaje.*MAX_LENGTH/);
    expect(result.out).toMatch(/fila 3, columna Fecha de visualización.*DUPLICATE_IN_FILE/);
    expect(result.out).toMatch(/fila 4, columna Fecha de visualización.*DUPLICATE_IN_FILE/);
    expect(result.out).toMatch(/fila 5, columna Fecha de visualización.*INVALID_DATE/);
  });
});

describe('productos y familias', () => {
  async function workbook(name: string, families: string[][], products: string[][]): Promise<string> {
    const buffer = await writeTextWorkbook([
      { name: 'Familias', columns: FAMILY_HEADERS.map((header) => ({ header })), rows: families },
      { name: 'Productos', columns: PRODUCT_HEADERS.map((header) => ({ header })), rows: products },
    ]);
    const path = join(workDir, name);
    await writeFile(path, buffer);
    return path;
  }

  it('libro XLSX: las familias se crean antes que los productos, con auditoría; repetir es idempotente', async () => {
    const suffix = uniqueSuffix();
    const familyCode = `CI-FAM-${suffix}`;
    const skuA = `CI-SKU-${suffix}-A`;
    const skuB = `CI-SKU-${suffix}-B`;
    const file = await workbook(
      'productos.xlsx',
      [[familyCode.toLowerCase(), `Familia ${suffix}`, 'Descripción de la familia', '7']],
      [
        [skuA.toLowerCase(), 'Producto A', familyCode, 'TON'],
        [skuB, 'Producto B', familyCode.toLowerCase(), 'und'],
      ],
    );

    const validated = await run(['validate', 'products', '--file', file]);
    expect(validated.code).toBe(EXIT_OK);
    expect(await context.prisma.productFamily.count({ where: { code: familyCode } })).toBe(0);
    expect(await context.prisma.product.count({ where: { sku: { in: [skuA, skuB] } } })).toBe(0);

    const applied = await run(['apply', 'products', '--file', file, '--actor', adminEmail]);
    expect(applied.code).toBe(EXIT_OK);
    expect(applied.out).toContain('Hoja Familias: leídas 1 - por crear 1 - creadas 1 - ya existen 0 - con errores 0');
    expect(applied.out).toContain('Hoja Productos: leídas 2 - por crear 2 - creadas 2 - ya existen 0 - con errores 0');

    const family = await context.prisma.productFamily.findUniqueOrThrow({ where: { code: familyCode } });
    expect(family).toMatchObject({ name: `Familia ${suffix}`, description: 'Descripción de la familia', sortOrder: 7, isActive: true, createdById: adminId });
    const products = await context.prisma.product.findMany({ where: { sku: { in: [skuA, skuB] } }, include: { baseUnit: true }, orderBy: { sku: 'asc' } });
    expect(products.map((item) => [item.sku, item.familyId, item.baseUnit.code, item.createdById])).toEqual([
      [skuA, family.id, 'TON', adminId],
      [skuB, family.id, 'UND', adminId],
    ]);
    expect(await context.prisma.auditLog.count({ where: { event: 'crm.product_family.created', resourceId: family.id, subjectId: adminId } })).toBe(1);
    expect(await context.prisma.auditLog.count({ where: { event: 'crm.product.created', resourceId: { in: products.map((item) => item.id) }, subjectId: adminId } })).toBe(2);

    const again = await run(['apply', 'products', '--file', file, '--actor', adminEmail]);
    expect(again.code).toBe(EXIT_OK);
    expect(again.out).toContain('Hoja Familias: leídas 1 - por crear 0 - creadas 0 - ya existen 1 - con errores 0');
    expect(again.out).toContain('Hoja Productos: leídas 2 - por crear 0 - creadas 0 - ya existen 2 - con errores 0');
    expect(await context.prisma.product.count({ where: { sku: { in: [skuA, skuB] } } })).toBe(2);

    // Mismo SKU con otra descripción y otra familia con otro nombre: se omite SIN modificar y con advertencia (exit 0).
    const changed = await workbook(
      'productos-distintos.xlsx',
      [[familyCode, 'Nombre cambiado', 'Descripción de la familia', '7']],
      [[skuA, 'Descripción cambiada', familyCode, 'TON']],
    );
    const different = await run(['apply', 'products', '--file', changed, '--actor', adminEmail]);
    expect(different.code).toBe(EXIT_OK);
    expect(different.out).toContain('ya existen con datos distintos 1');
    expect(different.out).toContain('(EXISTS_DIFFERENT)');
    expect(different.out).toContain('Advertencias: 2 fila(s)');
    expect((await context.prisma.product.findUniqueOrThrow({ where: { sku: skuA } })).description).toBe('Producto A');
    expect((await context.prisma.productFamily.findUniqueOrThrow({ where: { code: familyCode } })).name).toBe(`Familia ${suffix}`);
    expect(await context.prisma.auditLog.count({ where: { event: 'crm.product.created', resourceId: { in: products.map((item) => item.id) } } })).toBe(2);
  });

  it('CSV: el archivo de productos usa el de familias de al lado; un producto con familia inexistente bloquea toda la carga', async () => {
    const suffix = uniqueSuffix();
    const familyCode = `CI-FAM-CSV-${suffix}`;
    const base = join(workDir, `catalogo-${suffix}`);
    await writeFile(`${base}-familias.csv`, [FAMILY_HEADERS.join(','), row(FAMILY_HEADERS, { 'Código de familia': familyCode, Nombre: 'Familia CSV' })].join('\r\n'));
    await writeFile(
      `${base}.csv`,
      [
        PRODUCT_HEADERS.join(','),
        row(PRODUCT_HEADERS, { SKU: `CI-CSV-${suffix}-1`, Descripción: 'Bueno', 'Código de familia': familyCode, 'Código de unidad base': 'TON' }),
        row(PRODUCT_HEADERS, { SKU: `CI-CSV-${suffix}-2`, Descripción: 'Malo', 'Código de familia': 'FAMILIA-QUE-NO-EXISTE', 'Código de unidad base': 'TON' }),
      ].join('\r\n'),
    );
    const result = await run(['apply', 'products', '--file', `${base}.csv`, '--actor', adminEmail]);
    expect(result.code).toBe(EXIT_ERRORS);
    expect(result.out).toContain('hoja Productos, fila 3, columna Código de familia: La familia no existe ni está definida en la hoja Familias del archivo. (UNKNOWN_REFERENCE)');
    expect(await context.prisma.productFamily.count({ where: { code: familyCode } })).toBe(0);
    expect(await context.prisma.product.count({ where: { sku: { startsWith: `CI-CSV-${suffix}` } } })).toBe(0);
    expect(result.out).not.toContain('FAMILIA-QUE-NO-EXISTE');
  });

  it('un SKU o una unidad inexistente y una familia inactiva son errores de fila', async () => {
    const suffix = uniqueSuffix();
    const inactive = await context.prisma.productFamily.create({ data: { code: `CI-INACT-${suffix}`, name: 'Inactiva', isActive: false } });
    const file = await workbook(
      `productos-errores-${suffix}.xlsx`,
      [],
      [
        [`CI-E-${suffix}-1`, 'Unidad mala', inactive.code, 'XX'],
        [`CI-E-${suffix}-2`, 'Familia inactiva', inactive.code, 'TON'],
      ],
    );
    const result = await run(['validate', 'products', '--file', file]);
    expect(result.code).toBe(EXIT_ERRORS);
    expect(result.out).toContain('INACTIVE_REFERENCE');
    expect(result.out).toContain('columna Código de unidad base: La unidad base no existe. (UNKNOWN_REFERENCE)');
  });
});

describe('arranque real del script (ts-node, contexto standalone de Nest)', () => {
  const backendDir = resolve(__dirname, '..');

  function script(args: string[]) {
    const result = spawnSync(`pnpm exec ts-node --transpile-only scripts/load-initial-data.ts ${args.join(' ')}`, {
      cwd: backendDir,
      env: { ...process.env },
      shell: true,
      encoding: 'utf8',
      timeout: 120_000,
    });
    return { code: result.status, out: result.stdout, err: result.stderr };
  }

  it('validate de un archivo válido sale con 0, muestra la base y el esquema sin credenciales y no escribe', async () => {
    const file = await csvFile('minutos-script.csv', MINUTE_HEADERS, [{ 'Fecha de visualización': '2040-03-25', Mensaje: 'Mensaje desde el script' }]);
    const result = script(['validate', 'safety-minutes', '--file', `"${file}"`]);
    expect(result.err).toBe('');
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/Base de datos: .+\/.+ \(esquema integration_[a-z0-9_]+\)/);
    expect(result.out).toContain('por crear 1');
    expect(result.out).not.toMatch(/postgres(ql)?:\/\/|password|contrase/i);
    expect(await context.prisma.safetyMinute.count({ where: { displayDate: fromCalendarDate('2040-03-25') } })).toBe(0);
  }, 150_000);

  it('apply con un actor inexistente sale con 2 y no escribe; un archivo con errores sale con 1', async () => {
    const file = await csvFile('minutos-script-2.csv', MINUTE_HEADERS, [{ 'Fecha de visualización': '2040-03-26', Mensaje: 'Mensaje desde el script' }]);
    const rejected = script(['apply', 'safety-minutes', '--file', `"${file}"`, '--actor', 'nadie@example.invalid']);
    expect(rejected.code).toBe(2);
    expect(rejected.err).toContain('No existe un usuario');
    expect(await context.prisma.safetyMinute.count({ where: { displayDate: fromCalendarDate('2040-03-26') } })).toBe(0);

    const bad = await csvFile('minutos-script-3.csv', MINUTE_HEADERS, [{ 'Fecha de visualización': 'no-es-fecha', Mensaje: 'x' }]);
    const failed = script(['validate', 'safety-minutes', '--file', `"${bad}"`, '--report', `"${join(workDir, 'script-errores.csv')}"`]);
    expect(failed.code).toBe(1);
    expect(failed.out).toContain('INVALID_DATE');
    expect(await readReport('script-errores.csv')).toContain('Minutos,2,Fecha de visualización,Error,INVALID_DATE');
  }, 300_000);
});
