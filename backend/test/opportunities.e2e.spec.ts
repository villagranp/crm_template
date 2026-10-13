import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type request from 'supertest';

import {
  api,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertCustomer,
  insertOpportunity,
  insertProduct,
  insertProductFamily,
  insertProject,
  insertProjectProduct,
  insertTeam,
  insertUnit,
  testCountry,
  uniqueSuffix,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext, tokenWithRoles } from './support/test-app';

/**
 * Módulo 3 · Oportunidades, F-17 (03 J: PF-03.54 en lo que toca a etapas, PF-03.56–58,
 * 61–63, 65, 66, 69, 112 y 113 de los endpoints de oportunidades, 122–129, 132).
 * Resultados y reaperturas: `opportunity-results.e2e.spec.ts`.
 *
 * Aislamiento: países propios `V1` (moneda `XOA`), `V2` (moneda USD), `V3` (moneda
 * `XOB`, alcance COUNTRY) y `V4` (moneda `XOC`, foto del tipo de cambio), con monedas y
 * tasas propias. El parámetro de transiciones solo se cambia aquí, y solo la entrada de
 * `CONTACTADO` (la suite de resultados cierra desde `COTIZANDO`). Se compara por
 * pertenencia, nunca por totales globales (otras suites añaden etapas al catálogo).
 */

let context: TestContext;
let v1: string;
let v2: string;
let v3: string;
let v4: string;

const TRANSITIONS = 'crm.oportunidades.transiciones_etapa';
const STALE_DAYS = 'crm.tipos_cambio.dias_aviso_antiguedad';
const OLD_ACTIVITY = new Date('2026-01-01T00:00:00.000Z');

const stage: Record<'CONTACTADO' | 'COTIZANDO' | 'GANADO' | 'PERDIDO', string> = { CONTACTADO: '', COTIZANDO: '', GANADO: '', PERDIDO: '' };

async function upsertRate(prisma: PrismaClient, currencyCode: string, effectiveDate: string, ratePerUsd: string): Promise<void> {
  const date = new Date(`${effectiveDate}T00:00:00.000Z`);
  await prisma.exchangeRate.upsert({
    where: { currencyCode_effectiveDate: { currencyCode, effectiveDate: date } },
    update: { ratePerUsd },
    create: { currencyCode, effectiveDate: date, ratePerUsd, source: 'prueba de integración' },
  });
}

beforeAll(async () => {
  context = await createTestContext();
  const { prisma } = context;
  for (const [code, name] of [
    ['XOA', 'Moneda oportunidades A'],
    ['XOB', 'Moneda oportunidades B'],
    ['XOC', 'Moneda oportunidades C'],
  ] as const) {
    await prisma.currency.upsert({ where: { code }, update: { isActive: true }, create: { code, name, symbol: `${code[2]}$` } });
  }
  v1 = await testCountry(prisma, 'V1', { name: 'Oportunidades Uno', currencyCode: 'XOA' });
  v2 = await testCountry(prisma, 'V2', { name: 'Oportunidades Dos', currencyCode: 'USD' });
  v3 = await testCountry(prisma, 'V3', { name: 'Oportunidades Tres', currencyCode: 'XOB' });
  v4 = await testCountry(prisma, 'V4', { name: 'Oportunidades Cuatro', currencyCode: 'XOC' });
  await upsertRate(prisma, 'XOA', '2026-08-01', '7.60000000');
  await upsertRate(prisma, 'XOA', '2026-09-01', '7.70000000');
  await upsertRate(prisma, 'XOA', '2026-10-01', '7.75000000');
  for (const code of Object.keys(stage) as (keyof typeof stage)[]) {
    stage[code] = await catalogItemId(prisma, 'crm.etapa_oportunidad', code);
  }
});

afterAll(async () => {
  await closeTestContext(context);
});

// ---------------------------------------------------------------------------
// Ayudantes locales
// ---------------------------------------------------------------------------

async function advisor(countryId: string = v1): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['asesor'], countryId });
}

async function projectOf(owner: { id: string }, options: { countryId?: string; phaseCode?: string; phaseProgress?: string } = {}): Promise<string> {
  const countryId = options.countryId ?? v1;
  const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId });
  return insertProject(context.prisma, {
    customerId: customer.id,
    ownerId: owner.id,
    countryId,
    lastActivityAt: OLD_ACTIVITY,
    ...(options.phaseCode ? { phaseCode: options.phaseCode } : {}),
    ...(options.phaseProgress ? { phaseProgress: options.phaseProgress } : {}),
  });
}

/** Rol propio de prueba con un alcance y una lista de permisos (ADR-020). */
async function insertRole(dataScope: 'OWN' | 'TEAM' | 'COUNTRY' | 'ORGANIZATION', permissionCodes: string[]): Promise<string> {
  const code = `test-opo-${randomUUID().slice(0, 8)}`;
  const permissions = await context.prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
  expect(permissions).toHaveLength(permissionCodes.length);
  await context.prisma.role.create({
    data: { code, name: `Rol de prueba ${code}`, dataScope, permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) } },
  });
  return code;
}

function create(user: CrmUser, projectId: string, body: Record<string, unknown> = {}): request.Test {
  return api(context, user.token).post(`/projects/${projectId}/opportunities`).send(body);
}

function changeStage(user: CrmUser, opportunityId: string, body: Record<string, unknown>): request.Test {
  return api(context, user.token).post(`/opportunities/${opportunityId}/stage-changes`).send(body);
}

async function lastActivity(projectId: string): Promise<Date> {
  return (await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } })).lastActivityAt;
}

async function audit(event: string, resourceId: string) {
  return context.prisma.auditLog.findMany({ where: { event, resourceId }, orderBy: { occurredAt: 'asc' } });
}

function businessToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
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

// ---------------------------------------------------------------------------
// Autenticación, permisos y 404 (PF-03.113, AC-03.12)
// ---------------------------------------------------------------------------

describe('Autenticación, permisos y alcance de los endpoints de oportunidades', () => {
  /** Peticiones perezosas: supertest abre el servidor al crear cada `Test`, así que se crean de una en una. */
  function everyEndpoint(client: ReturnType<typeof api>, projectId: string, opportunityId: string): (() => request.Test)[] {
    return [
      () => client.get('/opportunities'),
      () => client.get('/opportunities/form-options'),
      () => client.get('/opportunities/stage-summary'),
      () => client.get(`/opportunities/${opportunityId}`),
      () => client.patch(`/opportunities/${opportunityId}`).send({ nextAction: 'Llamar' }),
      () => client.post(`/opportunities/${opportunityId}/stage-changes`).send({ toStageId: stage.COTIZANDO }),
      () => client.put(`/opportunities/${opportunityId}/result`).send({ outcome: 'WON', decisionDate: '2026-10-01' }),
      () => client.get(`/opportunities/${opportunityId}/history`),
      () => client.delete(`/opportunities/${opportunityId}`),
      () => client.get(`/projects/${projectId}/opportunities`),
      () => client.post(`/projects/${projectId}/opportunities`).send({}),
    ];
  }

  it('401 sin token en los once endpoints', async () => {
    for (const run of everyEndpoint(api(context), randomUUID(), randomUUID())) {
      const response = await run();
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    }
  });

  it('403 PERMISSION_DENIED sin el permiso base de cada endpoint', async () => {
    const noAccess = await crmUser(context, { roleCodes: ['usuario'], countryId: v1 });
    for (const run of everyEndpoint(api(context, noAccess.token), randomUUID(), randomUUID())) {
      const response = await run();
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'PERMISSION_DENIED' });
    }
  });

  it('404 idéntico con la oportunidad fuera del alcance, eliminada o inexistente; nada cambia (AC-03.12)', async () => {
    const owner = await advisor();
    const stranger = await advisor();
    const projectId = await projectOf(owner);
    const foreign = await insertOpportunity(context.prisma, { projectId, ownerId: owner.id });
    const deleted = await insertOpportunity(context.prisma, { projectId: await projectOf(stranger), ownerId: stranger.id, deletedAt: new Date() });
    const inDeletedProject = await insertOpportunity(context.prisma, {
      projectId: await insertProject(context.prisma, {
        customerId: (await insertCustomer(context.prisma, { salesOwnerId: stranger.id, countryId: v1 })).id,
        ownerId: stranger.id,
        countryId: v1,
        deletedAt: new Date(),
      }),
      ownerId: stranger.id,
    });
    const client = api(context, stranger.token);
    for (const id of [foreign, deleted, inDeletedProject, randomUUID()]) {
      for (const run of [
        () => client.get(`/opportunities/${id}`),
        () => client.patch(`/opportunities/${id}`).send({ nextAction: 'Llamar' }),
        () => client.post(`/opportunities/${id}/stage-changes`).send({ toStageId: stage.COTIZANDO }),
        () => client.get(`/opportunities/${id}/history`),
      ]) {
        const response = await run();
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' });
      }
    }
    // Proyecto ajeno: lista, alta y opciones con `projectId` → 404 sin revelar el proyecto.
    for (const run of [
      () => client.get(`/projects/${projectId}/opportunities`),
      () => create(stranger, projectId),
      () => client.get(`/opportunities/form-options?projectId=${projectId}`),
    ]) {
      const response = await run();
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    }
    const row = await context.prisma.opportunity.findUniqueOrThrow({ where: { id: foreign } });
    expect(row.stageId).toBe(stage.CONTACTADO);
    expect(row.nextAction).toBeNull();
    expect(await context.prisma.opportunity.count({ where: { projectId } })).toBe(1);
  });

  it('400 con un id mal formado y con un cuerpo con campos extra', async () => {
    const owner = await advisor();
    const client = api(context, owner.token);
    expect((await client.get('/opportunities/no-es-uuid')).status).toBe(400);
    expect((await client.get('/projects/no-es-uuid/opportunities')).status).toBe(400);
    const projectId = await projectOf(owner);
    const extra = await create(owner, projectId, { campo: 'x' });
    expect(extra.status).toBe(400);
    expect(extra.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

// ---------------------------------------------------------------------------
// Alta (PF-03.56, PF-03.57, PF-03.58)
// ---------------------------------------------------------------------------

describe('Alta de oportunidades', () => {
  it('alta mínima: 201, Location, código OPO, etapa por defecto, fecha de negocio, historial inicial, lastActivityAt y auditoría (PF-03.56)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const response = await create(owner, projectId, { description: 'Juan Pérez pidió cotización', nextAction: 'Enviar cotización' }).expect(201);

    const id = response.body.id as string;
    expect(response.headers['location']).toBe(`/api/v1/opportunities/${id}`);
    expect(response.body.code).toMatch(/^OPO-\d{4}-\d{5}$/);
    expect(response.body).toMatchObject({
      project: { id: projectId },
      stage: { id: stage.CONTACTADO, code: 'CONTACTADO', isClosed: false, outcome: null, order: 1 },
      opportunityDate: businessToday(),
      owner: { id: owner.id },
      estimatedAmount: null,
      currencyCode: null,
      exchangeRate: null,
      exchangeRateDate: null,
      estimatedAmountUsd: null,
      result: null,
      closedAt: null,
      productLines: 0,
      createdBy: { id: owner.id },
      capabilities: { canEdit: true, canClose: true, canReopen: false, canDelete: false },
    });
    expect(response.body).not.toHaveProperty('warnings');
    expect((response.body.allowedTransitions as { code: string }[]).map((item) => item.code)).toEqual(['COTIZANDO', 'GANADO', 'PERDIDO']);

    const history = await context.prisma.opportunityStageHistory.findMany({ where: { opportunityId: id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStageId: null, toStageId: stage.CONTACTADO, changedById: owner.id, comment: null });
    expect((await lastActivity(projectId)).getTime()).toBeGreaterThan(OLD_ACTIVITY.getTime());

    const [entry] = await audit('crm.opportunity.created', id);
    expect(entry).toMatchObject({ resourceType: 'crm.opportunity', subjectId: owner.id, metadata: { projectId } });
    expect(entry?.changes).toMatchObject({ stageId: { before: null, after: stage.CONTACTADO }, description: { before: null, after: 'J***' }, nextAction: { before: null, after: 'E***' } });
  });

  it('dos altas concurrentes obtienen códigos distintos (secuencia con bloqueo)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const [first, second] = await Promise.all([create(owner, projectId), create(owner, projectId)]);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.code).not.toBe(second.body.code);
    expect(await context.prisma.opportunity.count({ where: { projectId } })).toBe(2);
  });

  it('etapa inicial cerrada → 422 INVALID_INITIAL_STAGE; de otro catálogo → 422 INVALID_CATALOG_VALUE; nada se crea (PF-03.57, AC-03.42)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const closed = await create(owner, projectId, { stageId: stage.GANADO }).expect(422);
    expect(closed.body).toMatchObject({
      code: 'INVALID_INITIAL_STAGE',
      details: [{ field: 'stageId', code: 'INVALID_INITIAL_STAGE', stageCode: 'GANADO' }],
    });
    const otherCatalog = await create(owner, projectId, { stageId: await catalogItemId(context.prisma, 'crm.fase_cliente', 'DISENO') }).expect(422);
    expect(otherCatalog.body).toMatchObject({ code: 'INVALID_CATALOG_VALUE', details: [{ field: 'stageId', catalogKey: 'crm.etapa_oportunidad', reason: 'NOT_FOUND' }] });
    const chosen = await create(owner, projectId, { stageId: stage.COTIZANDO }).expect(201);
    expect(chosen.body.stage).toMatchObject({ code: 'COTIZANDO' });
    expect(await context.prisma.opportunity.count({ where: { projectId } })).toBe(1);
  });

  it('proyecto ajeno visible sin `administrar` → 403; manager con `administrar` en su equipo → 201 y puede asignar a un miembro; otro asesor sin `administrar` → 403 FIELD_NOT_EDITABLE; usuario inactivo → 422 INVALID_OWNER', async () => {
    const member = await advisor();
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: v1 });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id] });
    const projectId = await projectOf(member);

    const reader = await crmUser(context, { roleCodes: [await insertRole('COUNTRY', ['oportunidades.ver', 'oportunidades.crear'])], countryId: v1 });
    const denied = await create(reader, projectId).expect(403);
    expect(denied.body).toMatchObject({ code: 'PERMISSION_DENIED' });

    const fieldDenied = await create(member, projectId, { ownerId: manager.id }).expect(403);
    expect(fieldDenied.body).toMatchObject({ code: 'FIELD_NOT_EDITABLE', details: [{ field: 'ownerId', requiredPermission: 'oportunidades.administrar' }] });

    const inactive = await crmUser(context, { roleCodes: ['asesor'], countryId: v1, status: 'SUSPENDED' });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [inactive.id] });
    const invalid = await create(manager, projectId, { ownerId: inactive.id }).expect(422);
    expect(invalid.body).toMatchObject({ code: 'INVALID_OWNER', details: [{ field: 'ownerId', code: 'INVALID_OWNER' }] });

    const assigned = await create(manager, projectId, { ownerId: member.id }).expect(201);
    expect(assigned.body).toMatchObject({ owner: { id: member.id }, createdBy: { id: manager.id } });
    expect(await context.prisma.opportunity.count({ where: { projectId } })).toBe(1);
  });

  it('monto sin moneda → 422 CURRENCY_REQUIRED; moneda sin monto → 422 REQUIRED_FIELD_MISSING; negativos y campos del servidor → 400 (PF-03.58, PF-03.128)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const missing = await create(owner, projectId, { estimatedAmount: '100' }).expect(422);
    expect(missing.body).toMatchObject({ code: 'CURRENCY_REQUIRED', details: [{ field: 'currencyCode', code: 'CURRENCY_REQUIRED' }] });
    const noAmount = await create(owner, projectId, { currencyCode: 'USD' }).expect(422);
    expect(noAmount.body).toMatchObject({ code: 'REQUIRED_FIELD_MISSING', details: [{ field: 'estimatedAmount' }] });
    for (const body of [
      { estimatedAmount: '-1', currencyCode: 'USD' },
      { estimatedTonnage: '-0.5' },
      { estimatedAmount: '100', currencyCode: 'USD', exchangeRate: '1' },
      { estimatedAmount: '100', currencyCode: 'USD', estimatedAmountUsd: '100' },
      { estimatedAmount: '100', currencyCode: 'USD', exchangeRateDate: '2026-10-01' },
      { opportunityDate: '2026-02-30' },
    ]) {
      const response = await create(owner, projectId, body);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    expect(await context.prisma.opportunity.count({ where: { projectId } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Estimación: moneda y tipo de cambio (C.11)
// ---------------------------------------------------------------------------

describe('Estimación en USD o en la moneda del país (C.11)', () => {
  it('alta en la moneda del país: la tasa de mayor vigencia ≤ fecha, equivalente en USD y sin avisos; en USD tasa 1 y sin fecha (PF-03.122, AC-03.87)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const local = await create(owner, projectId, { opportunityDate: '2026-10-10', estimatedAmount: '7750', currencyCode: 'xoa' }).expect(201);
    expect(local.body).toMatchObject({
      estimatedAmount: '7750.0000',
      currencyCode: 'XOA',
      exchangeRate: '7.75000000',
      exchangeRateDate: '2026-10-01',
      estimatedAmountUsd: '1000.0000',
    });
    expect(local.body).not.toHaveProperty('warnings');
    const september = await create(owner, projectId, { opportunityDate: '2026-09-15', estimatedAmount: '77', currencyCode: 'XOA' }).expect(201);
    expect(september.body).toMatchObject({ exchangeRate: '7.70000000', exchangeRateDate: '2026-09-01', estimatedAmountUsd: '10.0000' });

    const usd = await create(owner, projectId, { opportunityDate: '2026-10-10', estimatedAmount: '2500.5', currencyCode: 'USD', estimatedTonnage: '12.5' }).expect(201);
    expect(usd.body).toMatchObject({
      estimatedAmount: '2500.5000',
      currencyCode: 'USD',
      exchangeRate: '1.00000000',
      exchangeRateDate: null,
      estimatedAmountUsd: '2500.5000',
      estimatedTonnage: '12.5000',
    });
    const row = await context.prisma.opportunity.findUniqueOrThrow({ where: { id: local.body.id as string } });
    expect(row.estimatedAmountUsd?.toFixed(4)).toBe('1000.0000');
    expect(row.exchangeRateDate?.toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('moneda de otro país, inexistente o no USD en un país de USD → 422 CURRENCY_NOT_ALLOWED; nada se guarda (PF-03.123, AC-03.88)', async () => {
    const owner = await advisor();
    const local = await projectOf(owner);
    const dollarized = await projectOf(owner, { countryId: v2 });
    const other = await create(owner, local, { estimatedAmount: '10', currencyCode: 'XOB' }).expect(422);
    expect(other.body).toMatchObject({
      code: 'CURRENCY_NOT_ALLOWED',
      details: [{ field: 'currencyCode', code: 'CURRENCY_NOT_ALLOWED', currencyCode: 'XOB', allowedCurrencyCodes: ['USD', 'XOA'] }],
    });
    await create(owner, local, { estimatedAmount: '10', currencyCode: 'ZZQ' }).expect(422);
    const usdOnly = await create(owner, dollarized, { estimatedAmount: '10', currencyCode: 'XOA' }).expect(422);
    expect(usdOnly.body).toMatchObject({ code: 'CURRENCY_NOT_ALLOWED', details: [{ allowedCurrencyCodes: ['USD'] }] });
    expect(await context.prisma.opportunity.count({ where: { projectId: { in: [local, dollarized] } } })).toBe(0);
  });

  it('sin tasa con vigencia ≤ fecha → 422 EXCHANGE_RATE_NOT_FOUND sin crear ni modificar nada; en USD se acepta (PF-03.124, AC-03.89)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const rejected = await create(owner, projectId, { opportunityDate: '2026-07-15', estimatedAmount: '100', currencyCode: 'XOA' }).expect(422);
    expect(rejected.body).toMatchObject({
      code: 'EXCHANGE_RATE_NOT_FOUND',
      details: [{ field: 'currencyCode', code: 'EXCHANGE_RATE_NOT_FOUND', currencyCode: 'XOA', date: '2026-07-15' }],
    });
    expect(await context.prisma.opportunity.count({ where: { projectId } })).toBe(0);
    expect(await lastActivity(projectId)).toEqual(OLD_ACTIVITY);

    const created = await create(owner, projectId, { opportunityDate: '2026-07-15', estimatedAmount: '100', currencyCode: 'USD' }).expect(201);
    const id = created.body.id as string;
    const before = await context.prisma.opportunity.findUniqueOrThrow({ where: { id } });
    const edit = await api(context, owner.token).patch(`/opportunities/${id}`).send({ currencyCode: 'XOA', nextAction: 'Llamar' }).expect(422);
    expect(edit.body).toMatchObject({ code: 'EXCHANGE_RATE_NOT_FOUND' });
    const after = await context.prisma.opportunity.findUniqueOrThrow({ where: { id } });
    expect(after).toEqual(before);
  });

  it('tasa más antigua que el umbral → guardada con `warnings` EXCHANGE_RATE_STALE; dentro del umbral sin avisos; el parámetro rige sin reiniciar (PF-03.125, AC-03.90)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const stale = await create(owner, projectId, { opportunityDate: '2026-11-15', estimatedAmount: '775', currencyCode: 'XOA' }).expect(201);
    expect(stale.body).toMatchObject({ exchangeRate: '7.75000000', exchangeRateDate: '2026-10-01', estimatedAmountUsd: '100.0000' });
    expect(stale.body.warnings).toEqual([
      {
        code: 'EXCHANGE_RATE_STALE',
        message: expect.any(String),
        details: { currencyCode: 'XOA', exchangeRateDate: '2026-10-01', referenceDate: '2026-11-15', ageDays: 45, thresholdDays: 31 },
      },
    ]);
    const fresh = await create(owner, projectId, { opportunityDate: '2026-10-11', estimatedAmount: '775', currencyCode: 'XOA' }).expect(201);
    expect(fresh.body).not.toHaveProperty('warnings');

    // PATCH que recalcula también avisa.
    const patched = await api(context, owner.token).patch(`/opportunities/${fresh.body.id as string}`).send({ opportunityDate: '2026-11-20' }).expect(200);
    expect(patched.body.warnings).toEqual([expect.objectContaining({ code: 'EXCHANGE_RATE_STALE', details: expect.objectContaining({ ageDays: 50 }) })]);

    const admin = await tokenWithRoles(context, ['administrador']);
    const original = (await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: STALE_DAYS } })).value;
    try {
      await api(context, admin.token).patch(`/parameters/${STALE_DAYS}`).send({ value: '60' }).expect(200);
      const relaxed = await create(owner, projectId, { opportunityDate: '2026-11-15', estimatedAmount: '775', currencyCode: 'XOA' }).expect(201);
      expect(relaxed.body).not.toHaveProperty('warnings');
    } finally {
      await context.prisma.systemParameter.update({ where: { key: STALE_DAYS }, data: { value: original } });
    }
  });

  it('foto: tasas nuevas o corregidas no alteran lo guardado; editar otros campos no recalcula; cambiar la fecha recalcula y audita la diferencia (PF-03.127, AC-03.91)', async () => {
    const owner = await advisor(v4);
    const projectId = await projectOf(owner, { countryId: v4 });
    await upsertRate(context.prisma, 'XOC', '2026-10-01', '7.75000000');
    const created = await create(owner, projectId, { opportunityDate: '2026-10-10', estimatedAmount: '7750', currencyCode: 'XOC' }).expect(201);
    const id = created.body.id as string;

    await upsertRate(context.prisma, 'XOC', '2026-10-05', '7.80000000');
    await upsertRate(context.prisma, 'XOC', '2026-10-01', '7.90000000');
    const unchanged = await api(context, owner.token).get(`/opportunities/${id}`).expect(200);
    expect(unchanged.body).toMatchObject({ exchangeRate: '7.75000000', exchangeRateDate: '2026-10-01', estimatedAmountUsd: '1000.0000' });

    await api(context, owner.token).patch(`/opportunities/${id}`).send({ nextAction: 'Visitar obra', description: 'Seguimiento' }).expect(200);
    const sameStage = await changeStage(owner, id, { toStageId: stage.COTIZANDO }).expect(201);
    expect(sameStage.body).toMatchObject({ exchangeRate: '7.75000000', estimatedAmountUsd: '1000.0000' });
    const [firstUpdate] = await audit('crm.opportunity.updated', id);
    expect(Object.keys(firstUpdate?.changes as object).sort()).toEqual(['description', 'nextAction']);

    // Mismo monto con otra escala: no es un cambio (foto intacta, sin auditoría nueva).
    await api(context, owner.token).patch(`/opportunities/${id}`).send({ estimatedAmount: '7750.00' }).expect(200);
    expect(await audit('crm.opportunity.updated', id)).toHaveLength(1);

    const redated = await api(context, owner.token).patch(`/opportunities/${id}`).send({ opportunityDate: '2026-10-12' }).expect(200);
    expect(redated.body).toMatchObject({ exchangeRate: '7.80000000', exchangeRateDate: '2026-10-05', estimatedAmountUsd: '993.5897' });
    const updates = await audit('crm.opportunity.updated', id);
    expect(updates).toHaveLength(2);
    expect(updates[1]?.changes).toEqual({
      opportunityDate: { before: '2026-10-10', after: '2026-10-12' },
      exchangeRate: { before: '7.75000000', after: '7.80000000' },
      exchangeRateDate: { before: '2026-10-01', after: '2026-10-05' },
      estimatedAmountUsd: { before: '1000.0000', after: '993.5897' },
    });
  });

  it('PATCH con monto y moneda nulos borra los cinco campos (PF-03.128, AC-03.92)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const created = await create(owner, projectId, { opportunityDate: '2026-10-10', estimatedAmount: '7750', currencyCode: 'XOA' }).expect(201);
    const id = created.body.id as string;
    const half = await api(context, owner.token).patch(`/opportunities/${id}`).send({ estimatedAmount: null }).expect(422);
    expect(half.body).toMatchObject({ code: 'REQUIRED_FIELD_MISSING', details: [{ field: 'estimatedAmount' }] });
    const cleared = await api(context, owner.token).patch(`/opportunities/${id}`).send({ estimatedAmount: null, currencyCode: null }).expect(200);
    expect(cleared.body).toMatchObject({ estimatedAmount: null, currencyCode: null, exchangeRate: null, exchangeRateDate: null, estimatedAmountUsd: null });
    const row = await context.prisma.opportunity.findUniqueOrThrow({ where: { id } });
    expect([row.estimatedAmount, row.currencyCode, row.exchangeRate, row.exchangeRateDate, row.estimatedAmountUsd]).toEqual([null, null, null, null, null]);
    const forbidden = await api(context, owner.token).patch(`/opportunities/${id}`).send({ estimatedAmountUsd: '5' }).expect(400);
    expect(forbidden.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('form-options: monedas admitidas y por defecto del proyecto; USD solo en un país de USD; sin projectId solo la base (PF-03.129, AC-03.93)', async () => {
    const owner = await advisor();
    const local = await projectOf(owner);
    const dollarized = await projectOf(owner, { countryId: v2 });
    const client = api(context, owner.token);

    const withProject = await client.get(`/opportunities/form-options?projectId=${local}`).expect(200);
    expect(withProject.body.currencies).toEqual({
      allowed: [
        { code: 'USD', name: expect.any(String), symbol: expect.any(String), decimals: expect.any(Number) },
        { code: 'XOA', name: 'Moneda oportunidades A', symbol: 'A$', decimals: expect.any(Number) },
      ],
      defaultCode: 'XOA',
    });
    expect((await client.get(`/opportunities/form-options?projectId=${dollarized}`).expect(200)).body.currencies).toEqual({
      allowed: [expect.objectContaining({ code: 'USD' })],
      defaultCode: 'USD',
    });

    const plain = await client.get('/opportunities/form-options').expect(200);
    expect(plain.body).not.toHaveProperty('currencies');
    expect(plain.body).toMatchObject({ baseCurrencyCode: 'USD', defaults: { stageId: stage.CONTACTADO, opportunityDate: businessToday() } });
    expect(plain.body.stages).toEqual(
      expect.arrayContaining([
        { id: stage.CONTACTADO, code: 'CONTACTADO', label: 'Contactado', order: 1, isClosed: false, outcome: null },
        { id: stage.GANADO, code: 'GANADO', label: 'Ganado', order: 3, isClosed: true, outcome: 'WON' },
      ]),
    );
    expect(plain.body.outcomes).toEqual([
      expect.objectContaining({ code: 'WON', stageOutcome: 'WON', requiresReason: false, requiresAwardedPercent: false }),
      expect.objectContaining({ code: 'LOST', stageOutcome: 'LOST', requiresReason: true, requiresAwardedPercent: false }),
      expect.objectContaining({ code: 'PARTIAL', stageOutcome: 'WON', requiresReason: false, requiresAwardedPercent: true }),
    ]);
    expect(plain.body.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PROYECTO_CANCELADO', appliesTo: ['LOST'] })]));

    const notUuid = await client.get('/opportunities/form-options?projectId=x').expect(400);
    expect(notUuid.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

// ---------------------------------------------------------------------------
// Edición, detalle y propiedad
// ---------------------------------------------------------------------------

describe('Edición y detalle', () => {
  it('el responsable edita siguiente acción y fecha: 200, solo los campos cambiados en auditoría, lastActivityAt; un PATCH sin cambios no audita (AC-03.43)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const id = (await create(owner, projectId).expect(201)).body.id as string;
    await context.prisma.project.update({ where: { id: projectId }, data: { lastActivityAt: OLD_ACTIVITY } });

    const edited = await api(context, owner.token).patch(`/opportunities/${id}`).send({ nextAction: 'Llamar a compras', nextActionDate: '2026-11-02', estimatedTonnage: '80' }).expect(200);
    expect(edited.body).toMatchObject({ nextAction: 'Llamar a compras', nextActionDate: '2026-11-02', estimatedTonnage: '80.0000', updatedBy: { id: owner.id } });
    expect((await lastActivity(projectId)).getTime()).toBeGreaterThan(OLD_ACTIVITY.getTime());
    const [entry] = await audit('crm.opportunity.updated', id);
    expect(entry?.changes).toEqual({
      nextAction: { before: null, after: 'L***' },
      nextActionDate: { before: null, after: '2026-11-02' },
      estimatedTonnage: { before: null, after: '80.0000' },
    });

    await context.prisma.project.update({ where: { id: projectId }, data: { lastActivityAt: OLD_ACTIVITY } });
    await api(context, owner.token).patch(`/opportunities/${id}`).send({ nextAction: 'Llamar a compras', estimatedTonnage: '80.00' }).expect(200);
    expect(await audit('crm.opportunity.updated', id)).toHaveLength(1);
    expect(await lastActivity(projectId)).toEqual(OLD_ACTIVITY);
  });

  it('reasignar el asesor: sin `administrar` → 403 FIELD_NOT_EDITABLE; el manager del equipo → 200; fuera de su alcance → 422 INVALID_OWNER', async () => {
    const member = await advisor();
    const outsider = await advisor();
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: v1 });
    const colleague = await advisor();
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id, colleague.id] });
    const id = (await create(member, await projectOf(member)).expect(201)).body.id as string;

    const denied = await api(context, member.token).patch(`/opportunities/${id}`).send({ ownerId: colleague.id }).expect(403);
    expect(denied.body).toMatchObject({ code: 'FIELD_NOT_EDITABLE', details: [{ field: 'ownerId', requiredPermission: 'oportunidades.administrar' }] });
    const invalid = await api(context, manager.token).patch(`/opportunities/${id}`).send({ ownerId: outsider.id }).expect(422);
    expect(invalid.body).toMatchObject({ code: 'INVALID_OWNER' });
    const reassigned = await api(context, manager.token).patch(`/opportunities/${id}`).send({ ownerId: colleague.id }).expect(200);
    expect(reassigned.body).toMatchObject({ owner: { id: colleague.id }, capabilities: { canEdit: true, canReopen: false, canDelete: true } });
  });

  it('roles combinados: lectura ORGANIZATION + asesor OWN ve oportunidades ajenas en solo lectura y no las modifica (AGENTS §9.4)', async () => {
    const owner = await advisor(v3);
    const projectId = await projectOf(owner, { countryId: v3 });
    const id = (await create(owner, projectId).expect(201)).body.id as string;
    const combined = await crmUser(context, { roleCodes: ['asesor', await insertRole('ORGANIZATION', ['oportunidades.ver'])], countryId: v1 });
    const client = api(context, combined.token);

    const detail = await client.get(`/opportunities/${id}`).expect(200);
    expect(detail.body).toMatchObject({ capabilities: { canEdit: false, canClose: false, canReopen: false, canDelete: false }, allowedTransitions: [] });
    expect((await client.get(`/projects/${projectId}/opportunities`).expect(200)).body.data.map((item: { id: string }) => item.id)).toEqual([id]);
    expect((await client.patch(`/opportunities/${id}`).send({ nextAction: 'x' })).status).toBe(403);
    expect((await changeStage(combined, id, { toStageId: stage.COTIZANDO })).status).toBe(403);
    // Crear en el proyecto ajeno: lo ve, pero `oportunidades.crear` solo da lo propio.
    expect((await create(combined, projectId)).status).toBe(403);
    expect((await context.prisma.opportunity.findUniqueOrThrow({ where: { id } })).nextAction).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Visibilidad por alcance (H.2, DM-13)
// ---------------------------------------------------------------------------

describe('Visibilidad por alcance (OWN, TEAM con subequipo, COUNTRY, ORGANIZATION)', () => {
  it('cada perfil ve exactamente las oportunidades de su alcance; un filtro por asesor ajeno no amplía nada', async () => {
    const asesor = await advisor();
    const subMember = await advisor();
    const countryOwner = await advisor(v3);
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: v1 });
    const parent = await insertTeam(context.prisma, { managerId: manager.id });
    await insertTeam(context.prisma, { parentId: parent, memberIds: [subMember.id] });
    const countryHead = await crmUser(context, { roleCodes: ['responsable-pais'], countryId: v3 });
    const admin = await crmUser(context, { roleCodes: ['administrador'] });

    const own = (await create(asesor, await projectOf(asesor)).expect(201)).body.id as string;
    const team = (await create(subMember, await projectOf(subMember)).expect(201)).body.id as string;
    const country = (await create(countryOwner, await projectOf(countryOwner, { countryId: v3 })).expect(201)).body.id as string;
    // DM-13: la oportunidad propia del asesor en un proyecto ajeno es visible para él.
    const foreignProject = await projectOf(countryOwner, { countryId: v3 });
    const inForeign = await insertOpportunity(context.prisma, { projectId: foreignProject, ownerId: asesor.id });
    const all = [own, team, country, inForeign];

    async function visible(user: CrmUser, ownerIds: string[] = [asesor.id, subMember.id, countryOwner.id]): Promise<string[]> {
      const response = await api(context, user.token).get(`/opportunities?pageSize=100&ownerId=${ownerIds.join(',')}`).expect(200);
      return (response.body.data as { id: string }[]).map((item) => item.id).filter((id) => all.includes(id)).sort();
    }
    expect(await visible(asesor)).toEqual([own, inForeign].sort());
    expect(await visible(manager)).toEqual([team]);
    expect(await visible(countryHead)).toEqual([country, inForeign].sort());
    expect(await visible(admin)).toEqual([...all].sort());
    expect(await visible(asesor, [subMember.id])).toEqual([]);
    // La oportunidad propia es visible por sí misma, pero el proyecto ajeno no se abre por ella.
    await api(context, asesor.token).get(`/opportunities/${inForeign}`).expect(200);
    await api(context, asesor.token).get(`/projects/${foreignProject}/opportunities`).expect(404);
  });
});

// ---------------------------------------------------------------------------
// Transiciones (PF-03.61, PF-03.62, PF-03.65) e independencia de la fase (PF-03.54)
// ---------------------------------------------------------------------------

describe('Transiciones de etapa', () => {
  it('con el mapa por defecto: permitidas, misma etapa → 422 STAGE_UNCHANGED, cerrada → abierta sin `administrar` → 403; historial completo (PF-03.61, PF-03.65, AC-03.47)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const id = (await create(owner, projectId).expect(201)).body.id as string;

    const first = await changeStage(owner, id, { toStageId: stage.COTIZANDO, comment: 'Pidió precios' }).expect(201);
    expect(first.body).toMatchObject({ stage: { code: 'COTIZANDO' }, closedAt: null });
    expect((first.body.allowedTransitions as { code: string }[]).map((item) => item.code)).toEqual(['CONTACTADO', 'GANADO', 'PERDIDO']);
    await changeStage(owner, id, { toStageId: stage.CONTACTADO }).expect(201);
    await changeStage(owner, id, { toStageId: stage.COTIZANDO }).expect(201);

    const same = await changeStage(owner, id, { toStageId: stage.COTIZANDO }).expect(422);
    expect(same.body).toMatchObject({ code: 'STAGE_UNCHANGED', details: [{ field: 'toStageId', code: 'STAGE_UNCHANGED', stageCode: 'COTIZANDO' }] });

    const history = await api(context, owner.token).get(`/opportunities/${id}/history`).expect(200);
    expect(history.body.results).toEqual([]);
    const stages = history.body.stages as { fromStage: { code: string } | null; toStage: { code: string }; comment: string | null; changedBy: { id: string } }[];
    expect(stages).toHaveLength(4);
    expect(stages.map((item) => [item.fromStage?.code ?? null, item.toStage.code])).toEqual([
      ['CONTACTADO', 'COTIZANDO'],
      ['COTIZANDO', 'CONTACTADO'],
      ['CONTACTADO', 'COTIZANDO'],
      [null, 'CONTACTADO'],
    ]);
    expect(stages[3]?.changedBy.id).toBe(owner.id);
    expect(stages[2]?.comment).toBe('Pidió precios');
    const [stageAudit] = await audit('crm.opportunity.stage_changed', id);
    expect(stageAudit?.changes).toEqual({ stageId: { before: stage.CONTACTADO, after: stage.COTIZANDO }, comment: { before: null, after: 'P***' } });

    const lost = await insertOpportunity(context.prisma, { projectId, ownerId: owner.id, stageCode: 'PERDIDO', outcome: 'LOST' });
    const reopen = await changeStage(owner, lost, { toStageId: stage.COTIZANDO, comment: 'Volvió a llamar' }).expect(403);
    expect(reopen.body).toMatchObject({ code: 'PERMISSION_DENIED' });
    expect((await context.prisma.opportunity.findUniqueOrThrow({ where: { id: lost } })).stageId).toBe(stage.PERDIDO);
  });

  it('el parámetro de transiciones rige sin redesplegar; destinos inactivos se ignoran; una etapa no listada usa la regla de respaldo (PF-03.62, AC-03.45, PF-03.60)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const id = (await create(owner, projectId).expect(201)).body.id as string;
    const catalog = await context.prisma.catalog.findUniqueOrThrow({ where: { key: 'crm.etapa_oportunidad' } });
    const inactive = await context.prisma.catalogItem.create({
      data: { catalogId: catalog.id, code: `TEST-OPO-INACT-${uniqueSuffix()}`, label: 'Etapa inactiva de prueba', metadata: { order: 7, isClosed: false, outcome: null, inFunnel: true }, sortOrder: 990, isActive: false },
    });
    const admin = await tokenWithRoles(context, ['administrador']);
    const original = (await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: TRANSITIONS } })).value;
    const map = JSON.parse(original) as Record<string, string[]>;
    try {
      await api(context, admin.token)
        .patch(`/parameters/${TRANSITIONS}`)
        .send({ value: JSON.stringify({ ...map, CONTACTADO: ['COTIZANDO', 'PERDIDO'] }) })
        .expect(200);
      const detail = await api(context, owner.token).get(`/opportunities/${id}`).expect(200);
      expect((detail.body.allowedTransitions as { code: string }[]).map((item) => item.code)).toEqual(['COTIZANDO', 'PERDIDO']);
      const rejected = await changeStage(owner, id, {
        toStageId: stage.GANADO,
        result: { outcome: 'WON', decisionDate: '2026-10-10' },
      }).expect(422);
      expect(rejected.body).toMatchObject({
        code: 'INVALID_STAGE_TRANSITION',
        details: [{ field: 'toStageId', code: 'INVALID_STAGE_TRANSITION', fromStageCode: 'CONTACTADO', toStageCode: 'GANADO' }],
      });
    } finally {
      await context.prisma.systemParameter.update({ where: { key: TRANSITIONS }, data: { value: original } });
    }

    // Destino inactivo: no se ofrece y pedirlo es un valor de catálogo inválido.
    const toInactive = await changeStage(owner, id, { toStageId: inactive.id }).expect(422);
    expect(toInactive.body).toMatchObject({ code: 'INVALID_CATALOG_VALUE', details: [{ field: 'toStageId', reason: 'INACTIVE' }] });

    // Regla de respaldo: una etapa abierta nueva, no listada en el mapa, va a cualquier etapa activa.
    const negotiating = await context.prisma.catalogItem.create({
      data: { catalogId: catalog.id, code: `TEST-OPO-NEG-${uniqueSuffix()}`, label: 'Negociando (prueba)', metadata: { order: 2, isClosed: false, outcome: null, inFunnel: true }, sortOrder: 991 },
    });
    try {
      const fromNew = await insertOpportunity(context.prisma, { projectId, ownerId: owner.id, stageCode: negotiating.code });
      const detail = await api(context, owner.token).get(`/opportunities/${fromNew}`).expect(200);
      const codes = (detail.body.allowedTransitions as { code: string }[]).map((item) => item.code);
      expect(codes).toEqual(expect.arrayContaining(['CONTACTADO', 'COTIZANDO', 'GANADO', 'PERDIDO']));
      expect(codes).not.toContain(negotiating.code);
      expect(codes).not.toContain(inactive.code);
      await changeStage(owner, fromNew, { toStageId: stage.COTIZANDO }).expect(201);
    } finally {
      await context.prisma.catalogItem.update({ where: { id: negotiating.id }, data: { isActive: false } });
    }
  });

  it('cambiar de etapa no toca la fase del proyecto; un proyecto FINALIZADO admite crear y mover oportunidades (PF-03.54, AC-03.39)', async () => {
    const owner = await advisor();
    const finalized = await projectOf(owner, { phaseCode: 'FINALIZADO', phaseProgress: '100' });
    const building = await projectOf(owner, { phaseCode: 'CONSTRUCCION', phaseProgress: '55.5' });
    for (const projectId of [finalized, building]) {
      const before = await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      const id = (await create(owner, projectId).expect(201)).body.id as string;
      await changeStage(owner, id, { toStageId: stage.COTIZANDO }).expect(201);
      const after = await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      expect([after.phaseId, after.phaseProgress.toFixed(2), after.phaseUpdatedAt]).toEqual([before.phaseId, before.phaseProgress.toFixed(2), before.phaseUpdatedAt]);
      expect(await context.prisma.projectPhaseHistory.count({ where: { projectId } })).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Pipeline: filtros, orden y tablero (PF-03.63, PF-03.66, PF-03.132)
// ---------------------------------------------------------------------------

describe('Pipeline: lista, filtros, orden y tablero', () => {
  it('filtros por etapa y asesor; stage-summary coincide con la lista; varias oportunidades por proyecto (PF-03.63, PF-03.66, AC-03.46, AC-03.48)', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: v1 });
    const first = await advisor();
    const second = await advisor();
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [first.id, second.id] });
    const projectId = await projectOf(first);
    const a = (await create(first, projectId).expect(201)).body.id as string;
    const b = (await create(manager, projectId, { ownerId: second.id }).expect(201)).body.id as string;
    const c = (await create(first, projectId).expect(201)).body.id as string;
    await changeStage(first, c, { toStageId: stage.COTIZANDO }).expect(201);
    const client = api(context, manager.token);

    const inProject = await api(context, first.token).get(`/projects/${projectId}/opportunities?sortBy=code&sortOrder=asc`).expect(200);
    expect(inProject.body.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
    expect((inProject.body.data as { id: string }[]).map((item) => item.id).sort()).toEqual([a, b, c].sort());

    const filtered = await client.get(`/opportunities?projectId=${projectId}&stageId=${stage.CONTACTADO}&ownerId=${first.id}`).expect(200);
    expect((filtered.body.data as { id: string }[]).map((item) => item.id)).toEqual([a]);

    const summary = await client.get(`/opportunities/stage-summary?projectId=${projectId}`).expect(200);
    const counts = Object.fromEntries((summary.body.stages as { stage: { code: string }; count: number }[]).map((item) => [item.stage.code, item.count]));
    expect(counts).toMatchObject({ CONTACTADO: 2, COTIZANDO: 1, GANADO: 0, PERDIDO: 0 });
    const order = (summary.body.stages as { stage: { order: number } }[]).map((item) => item.stage.order);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    const open = await client.get(`/projects/${projectId}/opportunities?status=OPEN`).expect(200);
    expect(open.body.pagination.totalItems).toBe(3);
    expect((await client.get(`/projects/${projectId}/opportunities?status=CLOSED`).expect(200)).body.pagination.totalItems).toBe(0);
  });

  it('sortBy=estimatedAmountUsd ordena por el equivalente en USD con monedas mezcladas (PF-03.132, AC-03.94)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const thousand = (await create(owner, projectId, { opportunityDate: '2026-10-10', estimatedAmount: '7750', currencyCode: 'XOA' }).expect(201)).body.id;
    const fifteenHundred = (await create(owner, projectId, { estimatedAmount: '1500', currencyCode: 'USD' }).expect(201)).body.id;
    const fiveHundred = (await create(owner, projectId, { opportunityDate: '2026-10-10', estimatedAmount: '3875', currencyCode: 'XOA' }).expect(201)).body.id;
    const none = (await create(owner, projectId).expect(201)).body.id;
    const ascending = await api(context, owner.token).get(`/opportunities?projectId=${projectId}&sortBy=estimatedAmountUsd&sortOrder=asc`).expect(200);
    expect((ascending.body.data as { id: string }[]).map((item) => item.id)).toEqual([fiveHundred, thousand, fifteenHundred, none]);
    const row = (ascending.body.data as Record<string, unknown>[])[0];
    expect(row).toMatchObject({ estimatedAmount: '3875.0000', currencyCode: 'XOA', exchangeRate: '7.75000000', estimatedAmountUsd: '500.0000' });
    const descending = await api(context, owner.token).get(`/opportunities?projectId=${projectId}&sortBy=estimatedAmountUsd&sortOrder=desc`).expect(200);
    expect((descending.body.data as { id: string }[]).map((item) => item.id)).toEqual([fifteenHundred, thousand, fiveHundred, none]);
  });

  it('consulta inválida: sortBy fuera de la lista, pageSize 101, fechas sin campo → 400; rango invertido → 422 INVALID_DATE_RANGE', async () => {
    const owner = await advisor();
    const client = api(context, owner.token);
    for (const query of ['sortBy=name', 'pageSize=101', 'dateFrom=2026-01-01', 'status=ALL', 'outcome=WIN', 'stageId=x']) {
      const response = await client.get(`/opportunities?${query}`);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    const inverted = await client.get('/opportunities?dateField=opportunityDate&dateFrom=2026-02-01&dateTo=2026-01-01').expect(422);
    expect(inverted.body).toMatchObject({ code: 'INVALID_DATE_RANGE', details: [{ field: 'dateTo', code: 'INVALID_DATE_RANGE', startField: 'dateFrom' }] });
    const decision = await client.get('/opportunities/stage-summary?decisionFrom=2026-02-01&decisionTo=2026-01-01').expect(422);
    expect(decision.body).toMatchObject({ code: 'INVALID_DATE_RANGE', details: [{ field: 'decisionTo', startField: 'decisionFrom' }] });
  });

  it('filtro por fecha de la oportunidad y de siguiente acción; búsqueda por código y nombre del proyecto', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    await context.prisma.project.update({ where: { id: projectId }, data: { name: `Torre Álamo ${uniqueSuffix()}` } });
    const early = await create(owner, projectId, { opportunityDate: '2026-03-01', nextActionDate: '2026-03-10' }).expect(201);
    const late = await create(owner, projectId, { opportunityDate: '2026-05-01' }).expect(201);
    const client = api(context, owner.token);
    const byDate = await client.get(`/opportunities?projectId=${projectId}&dateField=opportunityDate&dateFrom=2026-04-01`).expect(200);
    expect((byDate.body.data as { id: string }[]).map((item) => item.id)).toEqual([late.body.id]);
    const byNext = await client.get(`/opportunities?projectId=${projectId}&dateField=nextActionDate&dateTo=2026-03-31`).expect(200);
    expect((byNext.body.data as { id: string }[]).map((item) => item.id)).toEqual([early.body.id]);
    const byName = await client.get(`/opportunities?search=torre%20alamo&projectId=${projectId}`).expect(200);
    expect(byName.body.pagination.totalItems).toBe(2);
    const byCode = await client.get(`/opportunities?projectId=${projectId}&search=${(early.body.code as string).toLowerCase()}`).expect(200);
    expect((byCode.body.data as { id: string }[]).map((item) => item.id)).toEqual([early.body.id]);
  });
});

// ---------------------------------------------------------------------------
// Eliminación (PF-03.69) y concurrencia determinista
// ---------------------------------------------------------------------------

describe('Eliminación lógica', () => {
  it('abierta sin dependencias → 204 y fuera de listas y conteos; cerrada → 409 OPPORTUNITY_CLOSED; con productos activos → 409; sin permiso → 403 (PF-03.69, AC-03.50)', async () => {
    const owner = await advisor();
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: v1 });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [owner.id] });
    const projectId = await projectOf(owner);
    const free = (await create(owner, projectId).expect(201)).body.id as string;
    const closed = await insertOpportunity(context.prisma, { projectId, ownerId: owner.id, stageCode: 'GANADO', outcome: 'WON' });
    const withProduct = (await create(owner, projectId).expect(201)).body.id as string;
    const unit = await insertUnit(context.prisma);
    const product = await insertProduct(context.prisma, { familyId: await insertProductFamily(context.prisma), baseUnitId: unit.id });
    await insertProjectProduct(context.prisma, { projectId, productId: product.id, unitId: unit.id, opportunityId: withProduct });

    expect((await api(context, owner.token).delete(`/opportunities/${free}`)).status).toBe(403);
    const closedResponse = await api(context, manager.token).delete(`/opportunities/${closed}`).expect(409);
    expect(closedResponse.body).toMatchObject({ code: 'OPPORTUNITY_CLOSED', details: [{ stageId: stage.GANADO, stageCode: 'GANADO' }] });
    const dependencies = await api(context, manager.token).delete(`/opportunities/${withProduct}`).expect(409);
    expect(dependencies.body).toMatchObject({ code: 'OPPORTUNITY_HAS_DEPENDENCIES', details: [{ dependency: 'activeProducts', count: 1 }] });

    await context.prisma.project.update({ where: { id: projectId }, data: { lastActivityAt: OLD_ACTIVITY } });
    await api(context, manager.token).delete(`/opportunities/${free}`).expect(204);
    expect((await lastActivity(projectId)).getTime()).toBeGreaterThan(OLD_ACTIVITY.getTime());
    await api(context, owner.token).get(`/opportunities/${free}`).expect(404);
    const list = await api(context, owner.token).get(`/projects/${projectId}/opportunities`).expect(200);
    expect((list.body.data as { id: string }[]).map((item) => item.id).sort()).toEqual([closed, withProduct].sort());
    const summary = await api(context, owner.token).get(`/opportunities/stage-summary?projectId=${projectId}`).expect(200);
    expect((summary.body.stages as { stage: { code: string }; count: number }[]).find((item) => item.stage.code === 'CONTACTADO')?.count).toBe(1);
    const row = await context.prisma.opportunity.findUniqueOrThrow({ where: { id: free } });
    expect(row.deletedAt).not.toBeNull();
    expect(await context.prisma.opportunityStageHistory.count({ where: { opportunityId: free } })).toBe(1);
    expect(await audit('crm.opportunity.deleted', free)).toHaveLength(1);
  });
});

describe('Concurrencia y última actualización (PF-03.112)', () => {
  it('una escritura espera a quien sostiene el bloqueo del proyecto y luego se aplica', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const id = (await create(owner, projectId).expect(201)).body.id as string;
    const holder = holdTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
    });
    await holder.locked;
    let response: request.Response;
    try {
      const pending = await expectWaiting(changeStage(owner, id, { toStageId: stage.COTIZANDO }));
      holder.release();
      await holder.done;
      response = await pending();
    } finally {
      holder.release();
    }
    expect(response.status).toBe(201);
  });

  it('dos cambios a la misma etapa en paralelo: uno 201 y otro 422 STAGE_UNCHANGED (decidido con la fila bloqueada)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const id = (await create(owner, projectId).expect(201)).body.id as string;
    const holder = holdTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
    });
    await holder.locked;
    let statuses: number[] = [];
    try {
      const first = await expectWaiting(changeStage(owner, id, { toStageId: stage.COTIZANDO }));
      const second = await expectWaiting(changeStage(owner, id, { toStageId: stage.COTIZANDO }));
      holder.release();
      await holder.done;
      statuses = (await Promise.all([first(), second()])).map((result) => result.status).sort();
    } finally {
      holder.release();
    }
    expect(statuses).toEqual([201, 422]);
    expect(await context.prisma.opportunityStageHistory.count({ where: { opportunityId: id } })).toBe(2);
  });

  it('eliminar mientras otra transacción asocia un producto a la oportunidad: espera y responde 409 (sin TOCTOU)', async () => {
    const owner = await advisor();
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: v1 });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [owner.id] });
    const projectId = await projectOf(owner);
    const id = (await create(owner, projectId).expect(201)).body.id as string;
    const unit = await insertUnit(context.prisma);
    const product = await insertProduct(context.prisma, { familyId: await insertProductFamily(context.prisma), baseUnitId: unit.id });
    const status = await catalogItemId(context.prisma, 'crm.estado_producto_asociado', 'PROPUESTO');
    const holder = holdTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
      await tx.projectProduct.create({ data: { projectId, productId: product.id, unitId: unit.id, quantity: '1', opportunityId: id, statusId: status } });
    });
    await holder.locked;
    let response: request.Response;
    try {
      const pending = await expectWaiting(api(context, manager.token).delete(`/opportunities/${id}`));
      holder.release();
      await holder.done;
      response = await pending();
    } finally {
      holder.release();
    }
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'OPPORTUNITY_HAS_DEPENDENCIES' });
    expect((await context.prisma.opportunity.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
  });

  it('cada mutación actualiza last_activity_at del proyecto; una fallida (422) no lo cambia', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const id = (await create(owner, projectId).expect(201)).body.id as string;
    const steps: [string, () => request.Test, number][] = [
      ['patch', () => api(context, owner.token).patch(`/opportunities/${id}`).send({ nextAction: 'Llamar' }), 200],
      ['stage', () => changeStage(owner, id, { toStageId: stage.COTIZANDO }), 201],
    ];
    for (const [, run, expected] of steps) {
      await context.prisma.project.update({ where: { id: projectId }, data: { lastActivityAt: OLD_ACTIVITY } });
      await run().expect(expected);
      expect((await lastActivity(projectId)).getTime()).toBeGreaterThan(OLD_ACTIVITY.getTime());
    }
    await context.prisma.project.update({ where: { id: projectId }, data: { lastActivityAt: OLD_ACTIVITY } });
    await changeStage(owner, id, { toStageId: stage.COTIZANDO }).expect(422);
    await api(context, owner.token).patch(`/opportunities/${id}`).send({ estimatedAmount: '5' }).expect(422);
    expect(await lastActivity(projectId)).toEqual(OLD_ACTIVITY);
  });
});
