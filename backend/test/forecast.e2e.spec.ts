import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type request from 'supertest';

import { FORECAST_CLOCK, type ForecastClock } from '@/modules/forecast/forecast-clock';

import {
  api,
  type CrmUser,
  crmUser,
  insertConversionRule,
  insertCustomer,
  insertProduct,
  insertProductFamily,
  insertProject,
  insertProjectProduct,
  insertTeam,
  insertUnit,
  testCountry,
  uniqueSuffix,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 3 · Forecast M+6, F-20 (03 J: PF-03.92 en integración, 93, 94, 96, 97, 98, 100,
 * 102, 103, 104, 105, 106, 108, 109, 112 y 113; AC-03.69, 75, 79, 83; alcances OWN, TEAM con
 * subequipos, COUNTRY y ORGANIZATION; roles combinados).
 *
 * Reloj simulado: la app se crea con `FORECAST_CLOCK` sustituido por un reloj mutable (por
 * defecto 2026-10-15 → M = octubre de 2026, ventana noviembre 2026 – abril 2027); las
 * pruebas que lo cambian lo restauran en `afterEach`. No se tocan los parámetros
 * compartidos (`crm.zona_horaria_negocio`, `crm.forecast.horizonte_meses`).
 *
 * Aislamiento: países propios `Y1`–`Y4`; cada prueba crea sus usuarios, proyectos,
 * unidades (código único: ninguna regla ajena aplica), productos y reglas. Se compara por
 * pertenencia (filtro `projectId` con proyectos propios), nunca por totales globales.
 */

const DEFAULT_NOW = new Date('2026-10-15T18:00:00.000Z');

class FakeClock implements ForecastClock {
  current = DEFAULT_NOW;

  now(): Date {
    return this.current;
  }
}

const clock = new FakeClock();
const OLD_ACTIVITY = new Date('2026-01-01T00:00:00.000Z');

let context: TestContext;
let y1: string;
let y2: string;
let y3: string;
let y4: string;
const readerRoleCode = `forecast-lector-${uniqueSuffix().toLowerCase()}`;

beforeAll(async () => {
  context = await createTestContext({ configure: (builder) => builder.overrideProvider(FORECAST_CLOCK).useValue(clock) });
  y1 = await testCountry(context.prisma, 'Y1', { name: 'Forecast Uno' });
  y2 = await testCountry(context.prisma, 'Y2', { name: 'Forecast Dos' });
  y3 = await testCountry(context.prisma, 'Y3', { name: 'Forecast Tres' });
  y4 = await testCountry(context.prisma, 'Y4', { name: 'Forecast Cuatro' });
  // Rol propio de solo lectura con alcance de organización (roles combinados, 03 H.2).
  const view = await context.prisma.permission.findUniqueOrThrow({ where: { code: 'forecast.ver' } });
  await context.prisma.role.create({
    data: { code: readerRoleCode, name: 'Lector de forecast (prueba)', dataScope: 'ORGANIZATION', permissions: { create: [{ permissionId: view.id }] } },
  });
});

afterEach(() => {
  clock.current = DEFAULT_NOW;
});

afterAll(async () => {
  await context?.prisma.userRole.deleteMany({ where: { role: { code: readerRoleCode } } });
  await context?.prisma.role.deleteMany({ where: { code: readerRoleCode } });
  await closeTestContext(context);
});

// ---------------------------------------------------------------------------
// Ayudantes locales
// ---------------------------------------------------------------------------

/** Período a `offset` meses de octubre de 2026 (el M del reloj por defecto). */
function period(offset: number): { year: number; month: number } {
  const index = 2026 * 12 + 9 + offset;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function label(value: { year: number; month: number }): string {
  return `${value.year}-${String(value.month).padStart(2, '0')}`;
}

async function advisor(countryId: string = y1, displayName?: string): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['asesor'], countryId, ...(displayName ? { displayName } : {}) });
}

async function project(owner: { id: string }, countryId: string = y1, options: { deletedAt?: Date; name?: string } = {}): Promise<string> {
  const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId });
  return insertProject(context.prisma, {
    customerId: customer.id,
    ownerId: owner.id,
    countryId,
    lastActivityAt: OLD_ACTIVITY,
    deletedAt: options.deletedAt ?? null,
    ...(options.name ? { name: options.name } : {}),
  });
}

interface UnitInfo {
  id: string;
  code: string;
  symbol: string;
  dimension: string;
}

async function unit(options: { isActive?: boolean; dimension?: 'MASS' | 'COUNT' } = {}): Promise<UnitInfo> {
  const dimension = options.dimension ?? 'COUNT';
  const created = await insertUnit(context.prisma, { dimension, isActive: options.isActive ?? true });
  return { id: created.id, code: created.code, symbol: created.code.toLowerCase(), dimension };
}

interface ProductInfo {
  id: string;
  sku: string;
  familyId: string;
}

async function product(baseUnitId: string, sku?: string): Promise<ProductInfo> {
  const familyId = await insertProductFamily(context.prisma);
  const created = await insertProduct(context.prisma, { familyId, baseUnitId, ...(sku ? { sku } : {}) });
  return { id: created.id, sku: created.sku, familyId };
}

/** Asesor con proyecto propio y un producto asociado en su unidad base. */
async function scenario(owner?: CrmUser, countryId: string = y1): Promise<{ owner: CrmUser; projectId: string; unit: UnitInfo; product: ProductInfo }> {
  const user = owner ?? (await advisor(countryId));
  const projectId = await project(user, countryId);
  const base = await unit();
  const item = await product(base.id);
  await insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: base.id });
  return { owner: user, projectId, unit: base, product: item };
}

function put(token: string, lines: Record<string, unknown>[]): request.Test {
  return api(context, token).put('/forecast/lines').send({ lines });
}

function get(token: string, path: string): request.Test {
  return api(context, token).get(path);
}

async function lastActivity(projectId: string): Promise<Date> {
  return (await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } })).lastActivityAt;
}

async function linesOf(projectId: string) {
  return context.prisma.forecastLine.findMany({ where: { projectId }, orderBy: [{ year: 'asc' }, { month: 'asc' }] });
}

/** Línea insertada sin la API con el asesor indicado (p. ej. asignada por un administrador). */
async function insertLine(options: { projectId: string; productId: string; unitId: string; ownerId: string; at: { year: number; month: number }; quantity?: string }) {
  return context.prisma.forecastLine.create({
    data: {
      projectId: options.projectId,
      productId: options.productId,
      unitId: options.unitId,
      ownerId: options.ownerId,
      year: options.at.year,
      month: options.at.month,
      quantity: options.quantity ?? '5',
    },
  });
}

/** Abre una transacción que ejecuta `hold` y queda abierta hasta `release()` (patrón de customers-concurrency). */
function holdTransaction(hold: (tx: PrismaClient) => Promise<void>): { locked: Promise<void>; release: () => void; done: Promise<void> } {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  let signalLocked: () => void = () => undefined;
  const locked = new Promise<void>((resolve) => (signalLocked = resolve));
  const done = context.prisma.$transaction(
    async (tx) => {
      await hold(tx as unknown as PrismaClient);
      signalLocked();
      await released;
    },
    { timeout: 20_000 },
  );
  return { locked, release, done };
}

/** Lanza la petición y comprueba que sigue pendiente tras 500 ms (espera al bloqueo). */
async function expectWaiting(test: request.Test): Promise<() => Promise<request.Response>> {
  let settled = false;
  const pending = test.then((response) => {
    settled = true;
    return response;
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(settled).toBe(false);
  return () => pending;
}

interface CellBody {
  year: number;
  month: number;
  offset: number;
  lineId: string | null;
  quantity: string | null;
  tonnage: string | null;
  editable: boolean;
  hasConversion: boolean;
  owner: { id: string } | null;
  updatedAt: string | null;
  updatedBy: { id: string; displayName: string } | null;
  unit: UnitInfo | null;
}

interface RowBody {
  project: { id: string; owner: { id: string } };
  product: { id: string };
  cells: CellBody[];
  canEdit: boolean;
  lastUpdatedAt: string | null;
  rowTotals: { tonnage: string; quantitiesByUnit: { unit: UnitInfo; quantity: string }[] };
  unit: UnitInfo;
  conversion: { ruleId: string; scope: string; factor: string } | null;
}

function rowsOf(response: request.Response): RowBody[] {
  return response.body.data as RowBody[];
}

function pairs(response: request.Response): string[] {
  return rowsOf(response)
    .map((row) => `${row.project.id}|${row.product.id}`)
    .sort();
}

function cell(row: RowBody | undefined, at: { year: number; month: number }): CellBody | undefined {
  return row?.cells.find((item) => item.year === at.year && item.month === at.month);
}

// ---------------------------------------------------------------------------
// Autenticación y permisos base (PF-03.113)
// ---------------------------------------------------------------------------

describe('Autenticación y permisos de los endpoints del forecast', () => {
  const body = { lines: [{ projectId: randomUUID(), productId: randomUUID(), year: 2026, month: 11, quantity: '1' }] };

  it('401 sin token en los cuatro endpoints', async () => {
    const anonymous = api(context);
    for (const response of [
      await anonymous.get('/forecast/window'),
      await anonymous.get('/forecast/rows'),
      await anonymous.get('/forecast/totals'),
      await anonymous.put('/forecast/lines').send(body),
    ]) {
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    }
  });

  it('403 sin el permiso base en los cuatro endpoints', async () => {
    const plain = await crmUser(context, { roleCodes: ['usuario'], countryId: y1 });
    const client = api(context, plain.token);
    for (const response of [
      await client.get('/forecast/window'),
      await client.get('/forecast/rows'),
      await client.get('/forecast/totals'),
      await client.put('/forecast/lines').send(body),
    ]) {
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'PERMISSION_DENIED' });
    }
  });

  it('cada endpoint exige su propio permiso: sin forecast.ver no lee; sin forecast.editar no guarda', async () => {
    const noView = await crmUser(context, { roleCodes: ['asesor'], countryId: y1, deny: ['forecast.ver'] });
    for (const path of ['/forecast/window', '/forecast/rows', '/forecast/totals']) {
      expect((await get(noView.token, path)).status).toBe(403);
    }
    const { projectId, product: item } = await scenario();
    const noEdit = await crmUser(context, { roleCodes: ['asesor'], countryId: y1, deny: ['forecast.editar'] });
    expect((await get(noEdit.token, '/forecast/rows')).status).toBe(200);
    const response = await put(noEdit.token, [{ projectId, productId: item.id, ...period(1), quantity: '1' }]);
    expect(response.status).toBe(403);
    expect(await linesOf(projectId)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Ventana (AC-03.69, PF-03.92 de punta a punta)
// ---------------------------------------------------------------------------

describe('GET /forecast/window', () => {
  it('reloj por defecto (octubre): M y M+1 … M+6 en America/Guatemala', async () => {
    const user = await advisor();
    const response = await get(user.token, '/forecast/window').expect(200);
    expect(response.body).toEqual({
      timeZone: 'America/Guatemala',
      current: { year: 2026, month: 10 },
      periods: [1, 2, 3, 4, 5, 6].map((offset) => ({ offset, ...period(offset), label: label(period(offset)) })),
    });
  });

  it('2026-12-15 → enero–junio de 2027; 2026-12-31 23:30 en Guatemala (ya enero en UTC) → la misma ventana', async () => {
    const user = await advisor();
    const expected = [1, 2, 3, 4, 5, 6].map((month) => ({ offset: month, year: 2027, month, label: `2027-0${month}` }));
    clock.current = new Date('2026-12-15T18:00:00.000Z');
    expect((await get(user.token, '/forecast/window').expect(200)).body).toEqual({ timeZone: 'America/Guatemala', current: { year: 2026, month: 12 }, periods: expected });
    clock.current = new Date('2027-01-01T05:30:00.000Z');
    expect((await get(user.token, '/forecast/window').expect(200)).body).toEqual({ timeZone: 'America/Guatemala', current: { year: 2026, month: 12 }, periods: expected });
  });
});

// ---------------------------------------------------------------------------
// Filas (PF-03.93, PF-03.102)
// ---------------------------------------------------------------------------

describe('GET /forecast/rows', () => {
  it('filas = asociaciones activas visibles ∪ pares con líneas en la ventana; sin asociación quitada, sin proyecto eliminado (PF-03.93)', async () => {
    const owner = await advisor();
    const projectId = await project(owner);
    const deletedProject = await project(owner, y1, { deletedAt: new Date() });
    const base = await unit();
    const associated = await product(base.id);
    const onlyLines = await product(base.id);
    const removed = await product(base.id);
    const pastOnly = await product(base.id);
    await insertProjectProduct(context.prisma, { projectId, productId: associated.id, unitId: base.id });
    await insertProjectProduct(context.prisma, { projectId, productId: removed.id, unitId: base.id, deletedAt: new Date() });
    await insertProjectProduct(context.prisma, { projectId: deletedProject, productId: associated.id, unitId: base.id });
    await insertLine({ projectId, productId: onlyLines.id, unitId: base.id, ownerId: owner.id, at: period(2) });
    await insertLine({ projectId, productId: pastOnly.id, unitId: base.id, ownerId: owner.id, at: period(-1) });

    const response = await get(owner.token, `/forecast/rows?projectId=${projectId},${deletedProject}`).expect(200);
    expect(pairs(response)).toEqual([`${projectId}|${associated.id}`, `${projectId}|${onlyLines.id}`].sort());
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
    const row = rowsOf(response).find((item) => item.product.id === onlyLines.id);
    expect(row?.cells.map((item) => [item.offset, item.lineId !== null, item.editable])).toEqual([
      [1, false, true],
      [2, true, true],
      [3, false, true],
      [4, false, true],
      [5, false, true],
      [6, false, true],
    ]);
    expect(row?.canEdit).toBe(true);
    // El par solo con líneas pasadas aparece en el historial.
    const history = await get(owner.token, `/forecast/rows?projectId=${projectId}&mode=HISTORY&from=${label(period(-1))}&to=${label(period(-1))}`).expect(200);
    expect(pairs(history)).toContain(`${projectId}|${pastOnly.id}`);
  });

  it('forma completa de la fila y de las celdas: fecha y autor por celda, la más reciente por fila (PF-03.102, AC-03.76)', async () => {
    const owner = await advisor(y1, 'Asesora Forecast');
    const { projectId, unit: base, product: item } = await scenario(owner);
    const first = await put(owner.token, [{ projectId, productId: item.id, ...period(1), quantity: '12.5', notes: 'Nota' }]).expect(200);
    const second = await put(owner.token, [{ projectId, productId: item.id, ...period(3), quantity: '4' }]).expect(200);

    const response = await get(owner.token, `/forecast/rows?projectId=${projectId}`).expect(200);
    const [row] = rowsOf(response);
    const projectRow = await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const family = await context.prisma.productFamily.findUniqueOrThrow({ where: { id: item.familyId } });
    expect(row).toMatchObject({
      project: { id: projectId, code: projectRow.code, name: projectRow.name, owner: { id: owner.id, displayName: 'Asesora Forecast' } },
      product: { id: item.id, sku: item.sku, description: `Producto ${item.sku}`, family: { id: family.id, code: family.code, name: family.name } },
      unit: base,
      conversion: null,
      canEdit: true,
      lastUpdatedAt: second.body.lines[0].updatedAt,
      rowTotals: { tonnage: '0.0000', quantitiesByUnit: [{ unit: base, quantity: '16.5000' }] },
    });
    expect(cell(row, period(1))).toEqual({
      ...period(1),
      offset: 1,
      lineId: first.body.lines[0].lineId,
      quantity: '12.5000',
      unit: base,
      tonnage: null,
      hasConversion: false,
      owner: { id: owner.id, displayName: 'Asesora Forecast' },
      updatedAt: first.body.lines[0].updatedAt,
      updatedBy: { id: owner.id, displayName: 'Asesora Forecast' },
      editable: true,
    });
    expect(cell(row, period(2))).toEqual({
      ...period(2),
      offset: 2,
      lineId: null,
      quantity: null,
      unit: null,
      tonnage: null,
      hasConversion: false,
      owner: null,
      updatedAt: null,
      updatedBy: null,
      editable: true,
    });
  });

  it('400 con una consulta mal formada; 422 con períodos fuera de la ventana o un rango inválido', async () => {
    const user = await advisor();
    for (const path of [
      '/forecast/rows?mode=OTRO',
      '/forecast/rows?pageSize=101',
      '/forecast/rows?sortBy=name',
      '/forecast/rows?periods=2026-13',
      `/forecast/rows?from=${label(period(-2))}`,
      `/forecast/rows?mode=HISTORY&periods=${label(period(-1))}`,
      '/forecast/rows?projectId=no-es-uuid',
    ]) {
      const response = await get(user.token, path);
      expect({ path, status: response.status, code: response.body.code }).toEqual({ path, status: 400, code: 'VALIDATION_FAILED' });
    }
    const outside = await get(user.token, `/forecast/rows?periods=${label(period(0))},${label(period(7))}`).expect(422);
    expect(outside.body).toMatchObject({
      code: 'FORECAST_PERIOD_OUT_OF_WINDOW',
      details: [
        { field: 'periods[0]', code: 'FORECAST_PERIOD_OUT_OF_WINDOW', period: label(period(0)) },
        { field: 'periods[1]', code: 'FORECAST_PERIOD_OUT_OF_WINDOW', period: label(period(7)) },
      ],
    });
    expect((await get(user.token, `/forecast/totals?periods=${label(period(-1))}`)).status).toBe(422);
    const reversed = await get(user.token, `/forecast/rows?mode=HISTORY&from=${label(period(-1))}&to=${label(period(-2))}`).expect(422);
    expect(reversed.body).toMatchObject({ code: 'INVALID_DATE_RANGE', details: [{ field: 'to', code: 'INVALID_DATE_RANGE', startField: 'from' }] });
    const tooLong = await get(user.token, `/forecast/rows?mode=HISTORY&from=${label(period(-24))}&to=${label(period(0))}`).expect(422);
    expect(tooLong.body).toMatchObject({ code: 'INVALID_DATE_RANGE', details: [{ field: 'to', maxMonths: 24 }] });
    expect((await get(user.token, `/forecast/rows?mode=HISTORY&from=${label(period(-23))}&to=${label(period(0))}`)).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Guardado: upsert, validación y tonelaje (PF-03.94, 96, 97, 98, 104)
// ---------------------------------------------------------------------------

describe('PUT /forecast/lines', () => {
  it('upsert: crea, actualiza la misma línea sin segunda fila, repetir el cuerpo → unchanged; 0 conserva la fila (PF-03.94, AC-03.70)', async () => {
    const { owner, projectId, unit: base, product: item } = await scenario();
    const key = { projectId, productId: item.id, ...period(1) };

    const created = await put(owner.token, [{ ...key, quantity: '10' }]).expect(200);
    expect(created.body).toEqual({
      created: 1,
      updated: 0,
      unchanged: 0,
      lines: [{ lineId: expect.any(String), ...key, quantity: '10.0000', unit: base, tonnage: null, updatedAt: expect.any(String) }],
    });
    const lineId = created.body.lines[0].lineId as string;
    const updated = await put(owner.token, [{ ...key, quantity: '15' }]).expect(200);
    expect(updated.body).toMatchObject({ created: 0, updated: 1, unchanged: 0, lines: [{ lineId, quantity: '15.0000' }] });
    const again = await put(owner.token, [{ ...key, quantity: '15.0' }]).expect(200);
    expect(again.body).toMatchObject({ created: 0, updated: 0, unchanged: 1, lines: [{ lineId, quantity: '15.0000', updatedAt: updated.body.lines[0].updatedAt }] });
    await put(owner.token, [{ ...key, quantity: '0' }]).expect(200);

    const stored = await linesOf(projectId);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: lineId, quantity: expect.anything(), ownerId: owner.id, unitId: base.id, createdById: owner.id, updatedById: owner.id });
    expect(stored[0]?.quantity.toFixed(4)).toBe('0.0000');
    // La base impide la segunda fila aunque se inserte directamente.
    await expect(insertLine({ projectId, productId: item.id, unitId: base.id, ownerId: owner.id, at: period(1) })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('lote con una negativa: 422 con su índice y nada guardado; clave repetida → FORECAST_DUPLICATE_IN_BATCH; 501 líneas → 400 (PF-03.96)', async () => {
    const { owner, projectId, product: item } = await scenario();
    const negative = await put(owner.token, [
      { projectId, productId: item.id, ...period(1), quantity: '1' },
      { projectId, productId: item.id, ...period(2), quantity: '-3' },
      { projectId, productId: item.id, ...period(3), quantity: '2' },
    ]).expect(422);
    expect(negative.body).toMatchObject({
      code: 'INVALID_QUANTITY',
      details: [{ field: 'lines[1].quantity', code: 'INVALID_QUANTITY', message: 'The quantity must be a decimal greater than or equal to zero', index: 1 }],
    });
    const duplicate = await put(owner.token, [
      { projectId, productId: item.id, ...period(1), quantity: '1' },
      { projectId, productId: item.id, ...period(1), quantity: '2' },
    ]).expect(422);
    expect(duplicate.body).toMatchObject({
      code: 'FORECAST_DUPLICATE_IN_BATCH',
      details: [{ field: 'lines[1].month', code: 'FORECAST_DUPLICATE_IN_BATCH', index: 1, duplicateOfIndex: 0 }],
    });
    const tooMany = await put(
      owner.token,
      Array.from({ length: 501 }, (_, index) => ({ projectId, productId: item.id, year: 2027, month: (index % 12) + 1, quantity: '1' })),
    ).expect(400);
    expect(tooMany.body).toMatchObject({ code: 'VALIDATION_FAILED', details: [expect.objectContaining({ field: 'lines' })] });
    expect((await put(owner.token, [])).status).toBe(400);
    // Campos del servidor nunca se aceptan del cliente (asignación masiva, H.3).
    const injected = await put(owner.token, [{ projectId, productId: item.id, ...period(1), quantity: '1', tonnage: '9' }]).expect(400);
    expect(injected.body.details).toEqual([expect.objectContaining({ field: 'lines.0.tonnage' })]);
    expect(await linesOf(projectId)).toHaveLength(0);
  });

  it('mes en curso, pasado y M+7 → 422 FORECAST_PERIOD_OUT_OF_WINDOW (PF-03.97, AC-03.72)', async () => {
    const { owner, projectId, product: item } = await scenario();
    const response = await put(owner.token, [
      { projectId, productId: item.id, ...period(0), quantity: '1' },
      { projectId, productId: item.id, ...period(-1), quantity: '1' },
      { projectId, productId: item.id, ...period(7), quantity: '1' },
      { projectId, productId: item.id, ...period(6), quantity: '1' },
    ]).expect(422);
    expect(response.body).toMatchObject({
      code: 'FORECAST_PERIOD_OUT_OF_WINDOW',
      details: [
        { field: 'lines[0].month', code: 'FORECAST_PERIOD_OUT_OF_WINDOW', index: 0, period: label(period(0)) },
        { field: 'lines[1].month', index: 1, period: label(period(-1)) },
        { field: 'lines[2].month', index: 2, period: label(period(7)) },
      ],
    });
    expect(response.body.details).toHaveLength(3);
    expect(await linesOf(projectId)).toHaveLength(0);
  });

  it('tonelaje con regla (foto de regla y factor) y sin regla; la regla de producto gana a la global (PF-03.98, AC-03.73)', async () => {
    const owner = await advisor();
    const projectId = await project(owner);
    const kg = await unit({ dimension: 'MASS' });
    const loose = await unit();
    const withGlobal = await product(kg.id);
    const withProductRule = await product(kg.id);
    const withoutRule = await product(loose.id);
    const globalRule = await insertConversionRule(context.prisma, { fromUnitId: kg.id, factor: '0.001' });
    const productRule = await insertConversionRule(context.prisma, { fromUnitId: kg.id, factor: '0.002', scope: 'PRODUCT', productId: withProductRule.id });
    for (const [item, base] of [
      [withGlobal, kg],
      [withProductRule, kg],
      [withoutRule, loose],
    ] as const) {
      await insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: base.id });
    }

    const response = await put(owner.token, [
      { projectId, productId: withGlobal.id, ...period(1), quantity: '1500' },
      { projectId, productId: withProductRule.id, ...period(1), quantity: '1500' },
      { projectId, productId: withoutRule.id, ...period(1), quantity: '120' },
    ]).expect(200);
    expect(response.body.lines.map((line: { tonnage: string | null }) => line.tonnage)).toEqual(['1.5000', '3.0000', null]);
    const stored = await linesOf(projectId);
    const byProduct = new Map(stored.map((line) => [line.productId, line]));
    expect(byProduct.get(withGlobal.id)).toMatchObject({ conversionRuleId: globalRule });
    expect(byProduct.get(withGlobal.id)?.conversionFactor?.toFixed(8)).toBe('0.00100000');
    expect(byProduct.get(withProductRule.id)).toMatchObject({ conversionRuleId: productRule });
    expect(byProduct.get(withoutRule.id)).toMatchObject({ conversionRuleId: null, conversionFactor: null, tonnage: null });

    const rows = await get(owner.token, `/forecast/rows?projectId=${projectId}&sortBy=productSku&sortOrder=asc`).expect(200);
    const ruleRow = rowsOf(rows).find((row) => row.product.id === withGlobal.id);
    expect(ruleRow?.conversion).toEqual({ ruleId: globalRule, scope: 'GLOBAL', factor: '0.00100000' });
    expect(cell(ruleRow, period(1))).toMatchObject({ tonnage: '1.5000', hasConversion: true });
    expect(cell(ruleRow, period(2))).toMatchObject({ lineId: null, hasConversion: true });
    const looseRow = rowsOf(rows).find((row) => row.product.id === withoutRule.id);
    expect(looseRow?.conversion).toBeNull();
    expect(cell(looseRow, period(1))).toMatchObject({ tonnage: null, hasConversion: false });
  });

  it('unidad: por defecto la de la asociación (sin oportunidad primero); otra unidad activa se admite; inexistente o inactiva → UNKNOWN_REFERENCE', async () => {
    const { owner, projectId, unit: associationUnit, product: item } = await scenario();
    const other = await unit();
    const inactive = await unit({ isActive: false });
    const response = await put(owner.token, [
      { projectId, productId: item.id, ...period(1), quantity: '1' },
      { projectId, productId: item.id, ...period(2), quantity: '1', unitId: other.id },
    ]).expect(200);
    expect(response.body.lines.map((line: { unit: UnitInfo }) => line.unit.id)).toEqual([associationUnit.id, other.id]);
    // Una línea existente sin unitId conserva su unidad.
    const kept = await put(owner.token, [{ projectId, productId: item.id, ...period(2), quantity: '2' }]).expect(200);
    expect(kept.body.lines[0].unit.id).toBe(other.id);

    const invalid = await put(owner.token, [
      { projectId, productId: item.id, ...period(3), quantity: '1', unitId: randomUUID() },
      { projectId, productId: item.id, ...period(4), quantity: '1', unitId: inactive.id },
    ]).expect(422);
    expect(invalid.body).toMatchObject({
      code: 'UNKNOWN_REFERENCE',
      details: [
        { field: 'lines[0].unitId', code: 'UNKNOWN_REFERENCE', index: 0 },
        { field: 'lines[1].unitId', code: 'UNKNOWN_REFERENCE', index: 1 },
      ],
    });
  });

  it('producto no asociado o con la asociación quitada → 422 PRODUCT_NOT_ASSOCIATED y nada guardado (PF-03.104, AC-03.78)', async () => {
    const { owner, projectId, unit: base, product: item } = await scenario();
    const notAssociated = await product(base.id);
    const removed = await product(base.id);
    await insertProjectProduct(context.prisma, { projectId, productId: removed.id, unitId: base.id, deletedAt: new Date() });
    const response = await put(owner.token, [
      { projectId, productId: item.id, ...period(1), quantity: '1' },
      { projectId, productId: notAssociated.id, ...period(1), quantity: '1' },
      { projectId, productId: removed.id, ...period(1), quantity: '1' },
    ]).expect(422);
    expect(response.body).toMatchObject({
      code: 'PRODUCT_NOT_ASSOCIATED',
      details: [
        { field: 'lines[1].productId', code: 'PRODUCT_NOT_ASSOCIATED', message: 'The product has no active association with the project', index: 1 },
        { field: 'lines[2].productId', code: 'PRODUCT_NOT_ASSOCIATED', index: 2 },
      ],
    });
    expect(await linesOf(projectId)).toHaveLength(0);
  });

  it('lastActivityAt: se actualiza al guardar, no cambia con un 422 ni con un lote sin cambios (PF-03.112, AC-03.85)', async () => {
    const { owner, projectId, unit: base, product: item } = await scenario();
    const notAssociated = await product(base.id);
    await put(owner.token, [
      { projectId, productId: item.id, ...period(1), quantity: '1' },
      { projectId, productId: notAssociated.id, ...period(1), quantity: '1' },
    ]).expect(422);
    expect(await lastActivity(projectId)).toEqual(OLD_ACTIVITY);

    await put(owner.token, [{ projectId, productId: item.id, ...period(1), quantity: '1' }]).expect(200);
    const touched = await lastActivity(projectId);
    expect(touched.getTime()).toBeGreaterThan(OLD_ACTIVITY.getTime());
    await put(owner.token, [{ projectId, productId: item.id, ...period(1), quantity: '1' }]).expect(200);
    expect(await lastActivity(projectId)).toEqual(touched);
  });

  it('auditoría solo de las líneas cambiadas, con notas enmascaradas; contadores created/updated/unchanged (PF-03.106, AC-03.80)', async () => {
    const { owner, projectId, product: item } = await scenario();
    const initial = await put(owner.token, [
      { projectId, productId: item.id, ...period(1), quantity: '1' },
      { projectId, productId: item.id, ...period(2), quantity: '2' },
      { projectId, productId: item.id, ...period(3), quantity: '3' },
    ]).expect(200);
    const since = new Date();
    const response = await put(owner.token, [
      { projectId, productId: item.id, ...period(1), quantity: '1' },
      { projectId, productId: item.id, ...period(2), quantity: '2' },
      { projectId, productId: item.id, ...period(3), quantity: '30', notes: 'Cliente confirmó por teléfono' },
      { projectId, productId: item.id, ...period(4), quantity: '4' },
      { projectId, productId: item.id, ...period(5), quantity: '5' },
    ]).expect(200);
    expect(response.body).toMatchObject({ created: 2, updated: 1, unchanged: 2 });
    const lineIds = response.body.lines.map((line: { lineId: string }) => line.lineId) as string[];
    const audits = await context.prisma.auditLog.findMany({
      where: { resourceType: 'crm.forecast_line', resourceId: { in: lineIds }, occurredAt: { gte: since } },
      orderBy: { occurredAt: 'asc' },
    });
    expect(audits).toHaveLength(3);
    expect(audits.map((entry) => [entry.event, entry.resourceId]).sort()).toEqual(
      [
        ['crm.forecast_line.updated', initial.body.lines[2].lineId],
        ['crm.forecast_line.created', lineIds[3]],
        ['crm.forecast_line.created', lineIds[4]],
      ].sort(),
    );
    const updatedAudit = audits.find((entry) => entry.event === 'crm.forecast_line.updated');
    expect(updatedAudit?.metadata).toEqual({ projectId, productId: item.id, ...period(3) });
    expect(updatedAudit?.changes).toMatchObject({ quantity: expect.anything() });
    expect(JSON.stringify(updatedAudit?.changes)).not.toContain('teléfono');
  });
});

// ---------------------------------------------------------------------------
// Historia con reloj simulado (PF-03.103, AC-03.77)
// ---------------------------------------------------------------------------

describe('Historia: el mes que sale de la ventana se conserva y es de solo lectura', () => {
  it('líneas de noviembre guardadas en octubre: en diciembre no están en la ventana pero sí en base y en HISTORY', async () => {
    const { owner, projectId, product: item } = await scenario();
    const saved = await put(owner.token, [
      { projectId, productId: item.id, year: 2026, month: 11, quantity: '5' },
      { projectId, productId: item.id, year: 2026, month: 12, quantity: '6' },
      { projectId, productId: item.id, year: 2027, month: 1, quantity: '7' },
    ]).expect(200);

    clock.current = new Date('2026-12-15T18:00:00.000Z');
    const window = await get(owner.token, `/forecast/rows?projectId=${projectId}`).expect(200);
    const [row] = rowsOf(window);
    expect(row?.cells.map((item) => label(item))).toEqual(['2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06']);
    expect(cell(row, { year: 2027, month: 1 })).toMatchObject({ quantity: '7.0000', editable: true, offset: 1 });
    expect(await linesOf(projectId)).toHaveLength(3);

    const history = await get(owner.token, `/forecast/rows?projectId=${projectId}&mode=HISTORY&from=2026-11&to=2026-12`).expect(200);
    const [past] = rowsOf(history);
    expect(past?.canEdit).toBe(true);
    expect(past?.cells).toEqual([
      expect.objectContaining({ year: 2026, month: 11, offset: -1, quantity: '5.0000', editable: false, updatedAt: saved.body.lines[0].updatedAt }),
      expect.objectContaining({ year: 2026, month: 12, offset: 0, quantity: '6.0000', editable: false }),
    ]);
    const totals = await get(owner.token, `/forecast/totals?projectId=${projectId}&mode=HISTORY&from=2026-11&to=2026-12`).expect(200);
    expect(totals.body.quantitiesByUnit[0].total).toBe('11.0000');

    const rejected = await put(owner.token, [{ projectId, productId: item.id, year: 2026, month: 11, quantity: '9' }]).expect(422);
    expect(rejected.body).toMatchObject({ code: 'FORECAST_PERIOD_OUT_OF_WINDOW', details: [{ field: 'lines[0].month', period: '2026-11' }] });
  });
});

// ---------------------------------------------------------------------------
// Totales y filtros (AC-03.74, PF-03.100, AC-03.75)
// ---------------------------------------------------------------------------

describe('Totales y filtros', () => {
  it('toneladas solo de líneas con regla, cantidades por unidad sin mezclar, acumulado y líneas sin conversión (AC-03.74)', async () => {
    const owner = await advisor();
    const projectId = await project(owner);
    const kg = await unit({ dimension: 'MASS' });
    const loose = await unit();
    await insertConversionRule(context.prisma, { fromUnitId: kg.id, factor: '0.001' });
    const steel = await product(kg.id);
    const bars = await product(loose.id);
    await insertProjectProduct(context.prisma, { projectId, productId: steel.id, unitId: kg.id });
    await insertProjectProduct(context.prisma, { projectId, productId: bars.id, unitId: loose.id });
    await put(owner.token, [
      { projectId, productId: steel.id, ...period(1), quantity: '1000' },
      { projectId, productId: bars.id, ...period(1), quantity: '120' },
      { projectId, productId: steel.id, ...period(2), quantity: '500.5' },
    ]).expect(200);

    const response = await get(owner.token, `/forecast/totals?projectId=${projectId}`).expect(200);
    expect(response.body.periods).toEqual([
      { ...period(1), offset: 1, tonnage: '1.0000', accumulatedTonnage: '1.0000' },
      { ...period(2), offset: 2, tonnage: '0.5005', accumulatedTonnage: '1.5005' },
      ...[3, 4, 5, 6].map((offset) => ({ ...period(offset), offset, tonnage: '0.0000', accumulatedTonnage: '1.5005' })),
    ]);
    expect(response.body.windowTonnage).toBe('1.5005');
    expect(response.body.linesWithoutConversion).toBe(1);
    const byUnit = new Map((response.body.quantitiesByUnit as { unit: UnitInfo; total: string; byPeriod: { quantity: string }[] }[]).map((entry) => [entry.unit.id, entry]));
    expect(byUnit.size).toBe(2);
    expect(byUnit.get(kg.id)).toMatchObject({ unit: kg, total: '1500.5000' });
    expect(byUnit.get(kg.id)?.byPeriod.map((entry) => entry.quantity)).toEqual(['1000.0000', '500.5000', '0.0000', '0.0000', '0.0000', '0.0000']);
    expect(byUnit.get(loose.id)).toMatchObject({ unit: loose, total: '120.0000' });
  });

  it('filas y totales reflejan exactamente cada filtro y sus combinaciones (PF-03.100, AC-03.75)', async () => {
    const countryHead = await crmUser(context, { roleCodes: ['responsable-pais'], countryId: y2 });
    const ownerA = await advisor(y2);
    const ownerB = await advisor(y2);
    const suffix = uniqueSuffix();
    const projectP = await project(ownerA, y2, { name: `Torre Águila ${suffix}` });
    const projectQ = await project(ownerB, y2);
    const ton = await unit({ dimension: 'MASS' });
    await insertConversionRule(context.prisma, { fromUnitId: ton.id, factor: '1' });
    const x = await product(ton.id, `TEST-SKU-X-${suffix}`);
    const y = await product(ton.id);
    for (const projectId of [projectP, projectQ]) {
      for (const item of [x, y]) await insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: ton.id });
    }
    // Un solo lote sobre dos proyectos ajenos del país (responsable con forecast.administrar).
    await put(countryHead.token, [
      { projectId: projectP, productId: x.id, ...period(1), quantity: '10' },
      { projectId: projectP, productId: y.id, ...period(2), quantity: '20' },
      { projectId: projectQ, productId: x.id, ...period(1), quantity: '30' },
      { projectId: projectQ, productId: y.id, ...period(3), quantity: '40' },
    ]).expect(200);

    const base = `projectId=${projectP},${projectQ}`;
    const cases: [string, string[], string][] = [
      ['', [`${projectP}|${x.id}`, `${projectP}|${y.id}`, `${projectQ}|${x.id}`, `${projectQ}|${y.id}`], '100.0000'],
      [`&productId=${x.id}`, [`${projectP}|${x.id}`, `${projectQ}|${x.id}`], '40.0000'],
      [`&projectId=${projectP}`, [`${projectP}|${x.id}`, `${projectP}|${y.id}`], '30.0000'],
      [`&ownerId=${ownerB.id}`, [`${projectQ}|${x.id}`, `${projectQ}|${y.id}`], '70.0000'],
      [`&periods=${label(period(1))}`, [`${projectP}|${x.id}`, `${projectP}|${y.id}`, `${projectQ}|${x.id}`, `${projectQ}|${y.id}`], '40.0000'],
      [`&productId=${y.id}&ownerId=${ownerA.id}&periods=${label(period(2))}`, [`${projectP}|${y.id}`], '20.0000'],
      [`&search=${encodeURIComponent(`torre aguila ${suffix.toLowerCase()}`)}`, [`${projectP}|${x.id}`, `${projectP}|${y.id}`], '30.0000'],
      [`&search=${encodeURIComponent(x.sku.toLowerCase())}`, [`${projectP}|${x.id}`, `${projectQ}|${x.id}`], '40.0000'],
    ];
    for (const [filter, expectedPairs, tonnage] of cases) {
      const query = filter.startsWith('&projectId=') ? filter.slice(1) : `${base}${filter}`;
      const rowsResponse = await get(countryHead.token, `/forecast/rows?${query}`).expect(200);
      const totalsResponse = await get(countryHead.token, `/forecast/totals?${query}`).expect(200);
      expect({ filter, pairs: pairs(rowsResponse), tonnage: totalsResponse.body.windowTonnage }).toEqual({ filter, pairs: [...expectedPairs].sort(), tonnage });
    }
    const filteredCells = await get(countryHead.token, `/forecast/rows?${base}&periods=${label(period(3))},${label(period(1))}`).expect(200);
    expect(rowsOf(filteredCells)[0]?.cells.map((item) => item.offset)).toEqual([1, 3]);

    // Paginación sobre pares (sin JOIN que multiplique) y orden por SKU.
    const page = await get(countryHead.token, `/forecast/rows?${base}&pageSize=1&page=2&sortBy=productSku&sortOrder=asc`).expect(200);
    expect(page.body.pagination).toEqual({ page: 2, pageSize: 1, totalItems: 4, totalPages: 4 });
    const ordered = await get(countryHead.token, `/forecast/rows?${base}&sortBy=productSku&sortOrder=asc`).expect(200);
    expect(rowsOf(page)[0]?.product.id).toBe(rowsOf(ordered)[1]?.product.id);
    const recent = await get(countryHead.token, `/forecast/rows?${base}&sortBy=updatedAt&sortOrder=desc`).expect(200);
    expect(rowsOf(recent)).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Alcances, roles combinados y edición ajena (PF-03.105, PF-03.109, AC-03.79, AC-03.83)
// ---------------------------------------------------------------------------

describe('Visibilidad por alcance y política de edición', () => {
  it('OWN: el asesor ve solo lo suyo; el proyecto ajeno no aparece y su PUT da el mismo 404 que uno inexistente (PF-03.109, AC-03.83)', async () => {
    const mine = await scenario();
    const theirs = await scenario();
    await put(theirs.owner.token, [{ projectId: theirs.projectId, productId: theirs.product.id, ...period(1), quantity: '9' }]).expect(200);

    const rows = await get(mine.owner.token, `/forecast/rows?projectId=${mine.projectId},${theirs.projectId}`).expect(200);
    expect(pairs(rows)).toEqual([`${mine.projectId}|${mine.product.id}`]);
    const totals = await get(mine.owner.token, `/forecast/totals?projectId=${theirs.projectId}`).expect(200);
    expect(totals.body).toMatchObject({ windowTonnage: '0.0000', quantitiesByUnit: [], linesWithoutConversion: 0 });

    const foreign = await put(mine.owner.token, [{ projectId: theirs.projectId, productId: theirs.product.id, ...period(1), quantity: '1' }]).expect(404);
    const missingId = randomUUID();
    const missing = await put(mine.owner.token, [{ projectId: missingId, productId: theirs.product.id, ...period(1), quantity: '1' }]).expect(404);
    const deleted = await project(mine.owner, y1, { deletedAt: new Date() });
    const deletedResponse = await put(mine.owner.token, [{ projectId: deleted, productId: theirs.product.id, ...period(1), quantity: '1' }]).expect(404);
    expect(foreign.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND', message: missing.body.message, details: [{ resource: 'Project', identifier: theirs.projectId }] });
    expect(missing.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND', details: [{ resource: 'Project', identifier: missingId }] });
    expect(deletedResponse.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND', details: [{ resource: 'Project', identifier: deleted }] });
    expect((await linesOf(theirs.projectId)).map((line) => line.quantity.toFixed(4))).toEqual(['9.0000']);
  });

  it('línea propia en un proyecto no visible: la fila aparece solo con esa celda y en solo lectura (H.1, DM-13)', async () => {
    const lineOwner = await advisor();
    const other = await scenario();
    await insertLine({ projectId: other.projectId, productId: other.product.id, unitId: other.unit.id, ownerId: lineOwner.id, at: period(2), quantity: '3' });
    await insertLine({ projectId: other.projectId, productId: other.product.id, unitId: other.unit.id, ownerId: other.owner.id, at: period(3), quantity: '4' });

    const rows = await get(lineOwner.token, `/forecast/rows?projectId=${other.projectId}`).expect(200);
    const [row] = rowsOf(rows);
    expect(pairs(rows)).toEqual([`${other.projectId}|${other.product.id}`]);
    expect(row?.canEdit).toBe(false);
    expect(row?.cells.filter((item) => item.lineId !== null).map((item) => [item.offset, item.quantity, item.owner?.id])).toEqual([[2, '3.0000', lineOwner.id]]);
    expect(row?.cells.every((item) => !item.editable)).toBe(true);
    expect((await get(lineOwner.token, `/forecast/totals?projectId=${other.projectId}`).expect(200)).body.quantitiesByUnit[0].total).toBe('3.0000');
    expect((await put(lineOwner.token, [{ projectId: other.projectId, productId: other.product.id, ...period(2), quantity: '1' }])).status).toBe(404);
  });

  it('asesor dueño con ownerId distinto del asesor del proyecto → 403 FIELD_NOT_EDITABLE (AC-03.79)', async () => {
    const { owner, projectId, product: item } = await scenario();
    const colleague = await advisor();
    const response = await put(owner.token, [
      { projectId, productId: item.id, ...period(1), quantity: '1', ownerId: owner.id },
      { projectId, productId: item.id, ...period(2), quantity: '1', ownerId: colleague.id },
    ]).expect(403);
    expect(response.body).toMatchObject({
      code: 'FIELD_NOT_EDITABLE',
      details: [{ field: 'lines[1].ownerId', requiredPermission: 'forecast.administrar' }],
    });
    expect(await linesOf(projectId)).toHaveLength(0);
  });

  it('TEAM con subequipos: el manager ve y edita el forecast del miembro del subequipo, asigna asesor del alcance y no uno de fuera (AC-03.79)', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: y1 });
    const member = await advisor();
    const outsider = await advisor();
    const parent = await insertTeam(context.prisma, { managerId: manager.id });
    await insertTeam(context.prisma, { parentId: parent, memberIds: [member.id] });
    const memberScenario = await scenario(member);
    const outsiderScenario = await scenario(outsider);

    const rows = await get(manager.token, `/forecast/rows?projectId=${memberScenario.projectId},${outsiderScenario.projectId}`).expect(200);
    expect(pairs(rows)).toEqual([`${memberScenario.projectId}|${memberScenario.product.id}`]);
    expect(rowsOf(rows)[0]?.canEdit).toBe(true);

    const key = { projectId: memberScenario.projectId, productId: memberScenario.product.id };
    const saved = await put(manager.token, [
      { ...key, ...period(1), quantity: '5' },
      { ...key, ...period(2), quantity: '6', ownerId: manager.id },
    ]).expect(200);
    expect(saved.body.created).toBe(2);
    const stored = await linesOf(memberScenario.projectId);
    expect(stored.map((line) => [line.month, line.ownerId, line.updatedById])).toEqual([
      [period(1).month, member.id, manager.id],
      [period(2).month, manager.id, manager.id],
    ]);
    const invalid = await put(manager.token, [{ ...key, ...period(3), quantity: '1', ownerId: outsider.id }]).expect(422);
    expect(invalid.body).toMatchObject({ code: 'INVALID_OWNER', details: [{ field: 'lines[0].ownerId', code: 'INVALID_OWNER', index: 0 }] });
    expect((await put(manager.token, [{ projectId: outsiderScenario.projectId, productId: outsiderScenario.product.id, ...period(1), quantity: '1' }])).status).toBe(404);
  });

  it('COUNTRY y ORGANIZATION: el responsable de país ve los proyectos de su país; el administrador, todos', async () => {
    const countryHead = await crmUser(context, { roleCodes: ['responsable-pais'], countryId: y3 });
    const admin = await crmUser(context, { roleCodes: ['administrador'], countryId: y3 });
    const inCountry = await scenario(await advisor(y3), y3);
    const otherCountry = await scenario(await advisor(y4), y4);
    const both = `projectId=${inCountry.projectId},${otherCountry.projectId}`;

    const countryRows = await get(countryHead.token, `/forecast/rows?${both}`).expect(200);
    expect(pairs(countryRows)).toEqual([`${inCountry.projectId}|${inCountry.product.id}`]);
    expect(rowsOf(countryRows)[0]?.canEdit).toBe(true);
    expect((await put(countryHead.token, [{ projectId: otherCountry.projectId, productId: otherCountry.product.id, ...period(1), quantity: '1' }])).status).toBe(404);

    const adminRows = await get(admin.token, `/forecast/rows?${both}`).expect(200);
    expect(pairs(adminRows)).toEqual([`${inCountry.projectId}|${inCountry.product.id}`, `${otherCountry.projectId}|${otherCountry.product.id}`].sort());
    expect(rowsOf(adminRows).every((row) => row.canEdit)).toBe(true);
    await put(admin.token, [{ projectId: otherCountry.projectId, productId: otherCountry.product.id, ...period(1), quantity: '1', ownerId: admin.id }]).expect(200);
  });

  it('roles combinados: lector de organización + asesor ve más filas, pero lo ajeno es de solo lectura y su PUT → 403 (PF-03.105)', async () => {
    const reader = await crmUser(context, { roleCodes: ['asesor', readerRoleCode], countryId: y1 });
    const own = await scenario(reader);
    const foreign = await scenario(await advisor(y4), y4);

    const rows = await get(reader.token, `/forecast/rows?projectId=${own.projectId},${foreign.projectId}`).expect(200);
    const canEdit = new Map(rowsOf(rows).map((row) => [row.project.id, row.canEdit]));
    expect(canEdit).toEqual(
      new Map([
        [own.projectId, true],
        [foreign.projectId, false],
      ]),
    );
    expect(rowsOf(rows).find((row) => row.project.id === foreign.projectId)?.cells.every((item) => !item.editable)).toBe(true);

    const denied = await put(reader.token, [{ projectId: foreign.projectId, productId: foreign.product.id, ...period(1), quantity: '1' }]).expect(403);
    expect(denied.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'forecast.administrar' }] });
    await put(reader.token, [{ projectId: own.projectId, productId: own.product.id, ...period(1), quantity: '1' }]).expect(200);
    expect(await linesOf(foreign.projectId)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Concurrencia determinista (PF-03.108, AC-03.82)
// ---------------------------------------------------------------------------

describe('Concurrencia', () => {
  it('otra transacción modifica la línea: el PUT espera su bloqueo y responde 409 FORECAST_LINE_STALE sin guardar nada', async () => {
    const { owner, projectId, product: item } = await scenario();
    const saved = await put(owner.token, [{ projectId, productId: item.id, ...period(1), quantity: '1' }]).expect(200);
    const lineId = saved.body.lines[0].lineId as string;
    const seenAt = saved.body.lines[0].updatedAt as string;

    const holder = holdTransaction(async (tx) => {
      await tx.$executeRaw`UPDATE forecast_lines SET quantity = 99, updated_at = now() WHERE id = ${lineId}::uuid`;
    });
    let response: request.Response | undefined;
    try {
      await holder.locked;
      const pending = await expectWaiting(
        put(owner.token, [
          { projectId, productId: item.id, ...period(2), quantity: '7' },
          { projectId, productId: item.id, ...period(1), quantity: '2', expectedUpdatedAt: seenAt },
        ]),
      );
      holder.release();
      await holder.done;
      response = await pending();
    } finally {
      holder.release();
    }
    const current = await context.prisma.forecastLine.findUniqueOrThrow({ where: { id: lineId } });
    expect(response?.status).toBe(409);
    expect(response?.body).toMatchObject({ code: 'FORECAST_LINE_STALE', details: [{ index: 1, lineId, updatedAt: current.updatedAt.toISOString() }] });
    expect(current.quantity.toFixed(4)).toBe('99.0000');
    expect(await linesOf(projectId)).toHaveLength(1);
  });

  it('expectedUpdatedAt vigente: se guarda; el anterior al guardado de otro → 409 (AC-03.82)', async () => {
    const { owner, projectId, product: item } = await scenario();
    const key = { projectId, productId: item.id, ...period(1) };
    const first = await put(owner.token, [{ ...key, quantity: '1' }]).expect(200);
    const seen = first.body.lines[0].updatedAt as string;
    const second = await put(owner.token, [{ ...key, quantity: '2', expectedUpdatedAt: seen }]).expect(200);
    expect(second.body.updated).toBe(1);
    const stale = await put(owner.token, [{ ...key, quantity: '3', expectedUpdatedAt: seen }]).expect(409);
    expect(stale.body.details).toEqual([{ index: 0, lineId: first.body.lines[0].lineId, updatedAt: second.body.lines[0].updatedAt }]);
  });

  it('un FOR UPDATE sobre el proyecto (p. ej. su eliminación) hace esperar al PUT, que termina al liberarse', async () => {
    const { owner, projectId, product: item } = await scenario();
    const holder = holdTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
    });
    let response: request.Response | undefined;
    try {
      await holder.locked;
      const pending = await expectWaiting(put(owner.token, [{ projectId, productId: item.id, ...period(1), quantity: '1' }]));
      holder.release();
      await holder.done;
      response = await pending();
    } finally {
      holder.release();
    }
    expect(response?.status).toBe(200);
    expect(await linesOf(projectId)).toHaveLength(1);
  });

  it('un proyecto eliminado mientras el PUT espera su bloqueo → 404 y nada guardado', async () => {
    const { owner, projectId, product: item } = await scenario();
    const holder = holdTransaction(async (tx) => {
      await tx.$executeRaw`UPDATE projects SET deleted_at = now() WHERE id = ${projectId}::uuid`;
    });
    let response: request.Response | undefined;
    try {
      await holder.locked;
      const pending = await expectWaiting(put(owner.token, [{ projectId, productId: item.id, ...period(1), quantity: '1' }]));
      holder.release();
      await holder.done;
      response = await pending();
    } finally {
      holder.release();
    }
    expect(response?.status).toBe(404);
    expect(await linesOf(projectId)).toHaveLength(0);
  });
});
