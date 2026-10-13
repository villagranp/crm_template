import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type request from 'supertest';

import {
  api,
  businessMonthOffset,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertConversionRule,
  insertCustomer,
  insertForecastLine,
  insertOpportunity,
  insertProduct,
  insertProductFamily,
  insertProject,
  insertProjectProduct,
  insertTeam,
  insertUnit,
  testCountry,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 3 · Productos asociados al proyecto, F-19 (03 J: PF-03.81–84, 86–89, 91,
 * AC-03.67, PF-03.112 en lo que toca a productos y PF-03.113 de sus cuatro endpoints).
 *
 * Aislamiento: país de prueba propio `U1`; cada prueba crea sus usuarios, clientes,
 * proyectos, familias, unidades, productos y reglas (unidades con código único, así
 * que ninguna regla de otra suite ni de la semilla demo se aplica). Se compara por
 * pertenencia (proyecto propio), nunca por totales globales.
 */

let context: TestContext;
let u1: string;

const OLD_ACTIVITY = new Date('2026-01-01T00:00:00.000Z');

beforeAll(async () => {
  context = await createTestContext();
  u1 = await testCountry(context.prisma, 'U1', { name: 'Productos Uno' });
});

afterAll(async () => {
  await closeTestContext(context);
});

// ---------------------------------------------------------------------------
// Ayudantes locales
// ---------------------------------------------------------------------------

async function advisor(): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['asesor'], countryId: u1 });
}

/** Proyecto propio de `owner` (cliente propio), con `lastActivityAt` antiguo. */
async function ownProject(owner: CrmUser, options: { projectTypeCode?: string; deletedAt?: Date } = {}): Promise<string> {
  const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: u1 });
  return insertProject(context.prisma, {
    customerId: customer.id,
    ownerId: owner.id,
    countryId: u1,
    lastActivityAt: OLD_ACTIVITY,
    projectTypeId: options.projectTypeCode ? await catalogItemId(context.prisma, 'crm.tipo_proyecto', options.projectTypeCode) : null,
    deletedAt: options.deletedAt ?? null,
  });
}

interface UnitInfo {
  id: string;
  code: string;
  symbol: string;
  dimension: string;
}

async function unit(dimension: 'MASS' | 'COUNT' | 'AREA' = 'COUNT', isActive = true): Promise<UnitInfo> {
  const created = await insertUnit(context.prisma, { dimension, isActive });
  return { id: created.id, code: created.code, symbol: created.code.toLowerCase(), dimension };
}

interface ProductInfo {
  id: string;
  sku: string;
  description: string;
  family: { id: string; code: string; name: string };
}

async function family(): Promise<{ id: string; code: string; name: string }> {
  const id = await insertProductFamily(context.prisma);
  const row = await context.prisma.productFamily.findUniqueOrThrow({ where: { id } });
  return { id, code: row.code, name: row.name };
}

async function product(options: { familyInfo?: { id: string; code: string; name: string }; baseUnitId: string; isActive?: boolean; sku?: string }): Promise<ProductInfo> {
  const familyInfo = options.familyInfo ?? (await family());
  const created = await insertProduct(context.prisma, {
    familyId: familyInfo.id,
    baseUnitId: options.baseUnitId,
    isActive: options.isActive ?? true,
    ...(options.sku ? { sku: options.sku } : {}),
  });
  return { id: created.id, sku: created.sku, description: `Producto ${created.sku}`, family: familyInfo };
}

async function statusId(code: string): Promise<string> {
  return catalogItemId(context.prisma, 'crm.estado_producto_asociado', code);
}

async function status(code: 'PROPUESTO' | 'COTIZADO' | 'ADJUDICADO' | 'DESCARTADO'): Promise<{ id: string; code: string; label: string; isActive: boolean }> {
  const labels = { PROPUESTO: 'Propuesto', COTIZADO: 'Cotizado', ADJUDICADO: 'Adjudicado', DESCARTADO: 'Descartado' } as const;
  return { id: await statusId(code), code, label: labels[code], isActive: code !== 'DESCARTADO' };
}

function productRef(info: ProductInfo, isActive = true): Record<string, unknown> {
  return { id: info.id, sku: info.sku, description: info.description, family: info.family, isActive };
}

function unitRef(info: UnitInfo): Record<string, unknown> {
  return { id: info.id, code: info.code, symbol: info.symbol, dimension: info.dimension };
}

async function lastActivity(projectId: string): Promise<Date> {
  return (await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } })).lastActivityAt;
}

async function audit(event: string, resourceId: string) {
  return context.prisma.auditLog.findMany({ where: { event, resourceId }, orderBy: { occurredAt: 'asc' } });
}

function yearMonth(period: { year: number; month: number }): string {
  return `${period.year}-${String(period.month).padStart(2, '0')}`;
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
// Autenticación, permisos y 404 (PF-03.113, H.1)
// ---------------------------------------------------------------------------

describe('Autenticación, permisos y alcance de los endpoints de productos', () => {
  it('401 sin token en los cuatro endpoints', async () => {
    const id = randomUUID();
    const child = randomUUID();
    const anonymous = api(context);
    for (const response of [
      await anonymous.get(`/projects/${id}/products`),
      await anonymous.post(`/projects/${id}/products`).send({ productId: randomUUID(), quantity: '1' }),
      await anonymous.patch(`/projects/${id}/products/${child}`).send({ quantity: '1' }),
      await anonymous.delete(`/projects/${id}/products/${child}`),
    ]) {
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    }
  });

  it('403 sin el permiso base de cada endpoint (usuario sin proyectos.*)', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const lineId = await insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: base.id });
    const plain = await crmUser(context, { roleCodes: ['usuario'], countryId: u1 });
    const client = api(context, plain.token);

    const get = await client.get(`/projects/${projectId}/products`);
    expect(get.status).toBe(403);
    // El guard global responde sin `details` (el permiso que falta lo dice el contrato OpenAPI).
    expect(get.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [] });
    for (const response of [
      await client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '1' }),
      await client.patch(`/projects/${projectId}/products/${lineId}`).send({ quantity: '2' }),
      await client.delete(`/projects/${projectId}/products/${lineId}`),
    ]) {
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [] });
    }
  });

  it('403 al asesor dueño sin proyectos.editar (lee, pero no asocia, edita ni quita)', async () => {
    const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: u1, deny: ['proyectos.editar'] });
    const projectId = await ownProject(owner);
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const lineId = await insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: base.id });
    const client = api(context, owner.token);

    expect((await client.get(`/projects/${projectId}/products`)).status).toBe(200);
    expect((await client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '1', opportunityId: null })).status).toBe(403);
    expect((await client.patch(`/projects/${projectId}/products/${lineId}`).send({ quantity: '2' })).status).toBe(403);
    expect((await client.delete(`/projects/${projectId}/products/${lineId}`)).status).toBe(403);
    expect((await context.prisma.projectProduct.findUniqueOrThrow({ where: { id: lineId } })).deletedAt).toBeNull();
  });

  it('404 con el proyecto fuera del alcance, eliminado o inexistente', async () => {
    const owner = await advisor();
    const stranger = await advisor();
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const foreign = await ownProject(owner);
    const foreignLine = await insertProjectProduct(context.prisma, { projectId: foreign, productId: item.id, unitId: base.id });
    const deleted = await ownProject(stranger, { deletedAt: new Date() });
    const deletedLine = await insertProjectProduct(context.prisma, { projectId: deleted, productId: item.id, unitId: base.id });
    const missing = randomUUID();
    const client = api(context, stranger.token);

    for (const [projectId, lineId] of [
      [foreign, foreignLine],
      [deleted, deletedLine],
      [missing, randomUUID()],
    ] as const) {
      for (const response of [
        await client.get(`/projects/${projectId}/products`),
        await client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '1' }),
        await client.patch(`/projects/${projectId}/products/${lineId}`).send({ quantity: '2' }),
        await client.delete(`/projects/${projectId}/products/${lineId}`),
      ]) {
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      }
    }
    // Nada cambió en el proyecto ajeno.
    expect(await context.prisma.projectProduct.count({ where: { projectId: foreign, deletedAt: null } })).toBe(1);
    expect((await context.prisma.projectProduct.findUniqueOrThrow({ where: { id: foreignLine } })).quantity.toFixed(4)).toBe('10.0000');
  });

  it('404 con una asociación de otro proyecto, eliminada o inexistente (sin IDOR); 400 con un id mal formado', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const otherProject = await ownProject(owner);
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const otherLine = await insertProjectProduct(context.prisma, { projectId: otherProject, productId: item.id, unitId: base.id });
    const deletedLine = await insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: base.id, deletedAt: new Date() });
    const client = api(context, owner.token);

    for (const lineId of [otherLine, deletedLine, randomUUID()]) {
      const patch = await client.patch(`/projects/${projectId}/products/${lineId}`).send({ quantity: '2' });
      expect(patch.status).toBe(404);
      expect(patch.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      const remove = await client.delete(`/projects/${projectId}/products/${lineId}`);
      expect(remove.status).toBe(404);
      expect(remove.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    }
    const other = await context.prisma.projectProduct.findUniqueOrThrow({ where: { id: otherLine } });
    expect(other.deletedAt).toBeNull();
    expect(other.quantity.toFixed(4)).toBe('10.0000');
    expect(await lastActivity(projectId)).toEqual(OLD_ACTIVITY);

    expect((await client.patch(`/projects/${projectId}/products/no-es-uuid`).send({ quantity: '2' })).status).toBe(400);
    expect((await client.get('/projects/no-es-uuid/products')).status).toBe(400);
  });

  it('el manager con proyectos.administrar asocia en el proyecto de un miembro (201); sin administrar, 403', async () => {
    const member = await advisor();
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: u1 });
    const readOnlyManager = await crmUser(context, { roleCodes: ['manager'], countryId: u1, deny: ['proyectos.administrar'] });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id] });
    await insertTeam(context.prisma, { managerId: readOnlyManager.id, memberIds: [member.id] });
    const projectId = await ownProject(member);
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const other = await product({ baseUnitId: base.id });

    const created = await api(context, manager.token).post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '5' });
    expect(created.status).toBe(201);
    expect(created.body.updatedBy).toEqual({ id: manager.id, displayName: 'Persona De prueba' });

    const readOnly = api(context, readOnlyManager.token);
    expect((await readOnly.get(`/projects/${projectId}/products`)).status).toBe(200);
    const denied = await readOnly.post(`/projects/${projectId}/products`).send({ productId: other.id, quantity: '5' });
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'proyectos.administrar' }] });
    expect((await readOnly.patch(`/projects/${projectId}/products/${created.body.id as string}`).send({ quantity: '6' })).status).toBe(403);
    expect((await readOnly.delete(`/projects/${projectId}/products/${created.body.id as string}`)).status).toBe(403);
    expect(await context.prisma.projectProduct.count({ where: { projectId, deletedAt: null } })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Asociar (PF-03.81–84, 86, 87)
// ---------------------------------------------------------------------------

describe('Asociar un producto (POST)', () => {
  it('asocia con y sin oportunidad del proyecto, con unidad base y estado inicial por defecto (PF-03.81)', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const opportunityId = await insertOpportunity(context.prisma, { projectId, ownerId: owner.id });
    const opportunity = await context.prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const client = api(context, owner.token);

    const withoutOpportunity = await client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '120', notes: '  Nota interna  ' });
    expect(withoutOpportunity.status).toBe(201);
    const firstId = withoutOpportunity.body.id as string;
    expect(withoutOpportunity.headers.location).toBe(`/api/v1/projects/${projectId}/products/${firstId}`);
    expect(withoutOpportunity.body).toEqual({
      id: firstId,
      product: productRef(item),
      opportunity: null,
      quantity: '120.0000',
      unit: unitRef(base),
      conversion: null,
      tonnage: null,
      status: await status('PROPUESTO'),
      notes: 'Nota interna',
      updatedAt: expect.any(String),
      updatedBy: { id: owner.id, displayName: 'Persona De prueba' },
    });

    const withOpportunity = await client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '7.5', opportunityId });
    expect(withOpportunity.status).toBe(201);
    expect(withOpportunity.body).toMatchObject({ opportunity: { id: opportunityId, code: opportunity.code }, quantity: '7.5000', notes: null });

    const stored = await context.prisma.projectProduct.findMany({ where: { projectId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    expect(stored.map((row) => [row.productId, row.opportunityId, row.unitId, row.quantity.toFixed(4), row.createdById])).toEqual([
      [item.id, null, base.id, '120.0000', owner.id],
      [item.id, opportunityId, base.id, '7.5000', owner.id],
    ]);

    // Auditoría con el proyecto en metadata y las notas enmascaradas (DM-29).
    const [entry] = await audit('crm.project_product.created', firstId);
    expect(entry?.resourceType).toBe('crm.project_product');
    expect(entry?.subjectId).toBe(owner.id);
    expect(entry?.metadata).toEqual({ projectId });
    expect(entry?.changes).toMatchObject({
      productId: { before: null, after: item.id },
      quantity: { before: null, after: '120.0000' },
      unitId: { before: null, after: base.id },
      statusId: { before: null, after: await statusId('PROPUESTO') },
      // DM-29: texto libre enmascarado a su primera letra.
      notes: { before: null, after: 'N***' },
    });
    expect(JSON.stringify(entry?.changes)).not.toContain('Nota interna');
  });

  it('acepta cualquier unidad activa y un estado activo explícito', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const base = await unit();
    const other = await unit('MASS');
    const item = await product({ baseUnitId: base.id });

    const response = await api(context, owner.token)
      .post(`/projects/${projectId}/products`)
      .send({ productId: item.id, quantity: '3', unitId: other.id, statusId: await statusId('COTIZADO') });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ unit: unitRef(other), status: await status('COTIZADO') });
  });

  it('rechaza una oportunidad de otro proyecto o eliminada (422 OPPORTUNITY_NOT_IN_PROJECT) y la FK compuesta lo impide en base (PF-03.82)', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const otherProject = await ownProject(owner);
    const foreignOpportunity = await insertOpportunity(context.prisma, { projectId: otherProject, ownerId: owner.id });
    const deletedOpportunity = await insertOpportunity(context.prisma, { projectId, ownerId: owner.id, deletedAt: new Date() });
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const client = api(context, owner.token);

    for (const opportunityId of [foreignOpportunity, deletedOpportunity, randomUUID()]) {
      const response = await client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '1', opportunityId });
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        code: 'OPPORTUNITY_NOT_IN_PROJECT',
        details: [{ field: 'opportunityId', code: 'OPPORTUNITY_NOT_IN_PROJECT', message: 'The opportunity does not belong to the project' }],
      });
    }
    expect(await context.prisma.projectProduct.count({ where: { projectId } })).toBe(0);
    expect(await lastActivity(projectId)).toEqual(OLD_ACTIVITY);

    await expect(
      insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: base.id, opportunityId: foreignOpportunity }),
    ).rejects.toThrow();
  });

  it('calcula el tonelaje con la regla de mayor precedencia PRODUCT > PRODUCT_FAMILY > PROJECT_TYPE > GLOBAL (PF-03.83)', async () => {
    const owner = await advisor();
    const typed = await ownProject(owner, { projectTypeCode: 'VIVIENDA' });
    const untyped = await ownProject(owner);
    const viviendaId = await catalogItemId(context.prisma, 'crm.tipo_proyecto', 'VIVIENDA');
    const base = await unit();
    const familyA = await family();
    const familyB = await family();
    const withProductRule = await product({ familyInfo: familyA, baseUnitId: base.id });
    const withFamilyRule = await product({ familyInfo: familyA, baseUnitId: base.id });
    const withoutOwnRule = await product({ familyInfo: familyB, baseUnitId: base.id });

    const globalRule = await insertConversionRule(context.prisma, { fromUnitId: base.id, factor: '0.001', scope: 'GLOBAL' });
    const typeRule = await insertConversionRule(context.prisma, { fromUnitId: base.id, factor: '0.002', scope: 'PROJECT_TYPE', projectTypeId: viviendaId });
    const familyRule = await insertConversionRule(context.prisma, { fromUnitId: base.id, factor: '0.003', scope: 'PRODUCT_FAMILY', productFamilyId: familyA.id });
    const productRule = await insertConversionRule(context.prisma, { fromUnitId: base.id, factor: '0.00012345', scope: 'PRODUCT', productId: withProductRule.id });
    const client = api(context, owner.token);

    const cases = [
      { projectId: typed, item: withProductRule, quantity: '1000.5', rule: productRule, scope: 'PRODUCT', factor: '0.00012345', tonnage: '0.1235' },
      { projectId: typed, item: withFamilyRule, quantity: '120.5', rule: familyRule, scope: 'PRODUCT_FAMILY', factor: '0.00300000', tonnage: '0.3615' },
      { projectId: typed, item: withoutOwnRule, quantity: '120.5', rule: typeRule, scope: 'PROJECT_TYPE', factor: '0.00200000', tonnage: '0.2410' },
      { projectId: untyped, item: withoutOwnRule, quantity: '120.5', rule: globalRule, scope: 'GLOBAL', factor: '0.00100000', tonnage: '0.1205' },
    ];
    for (const expected of cases) {
      const response = await client.post(`/projects/${expected.projectId}/products`).send({ productId: expected.item.id, quantity: expected.quantity });
      expect(response.status).toBe(201);
      expect(response.body.conversion).toEqual({ ruleId: expected.rule, scope: expected.scope, factor: expected.factor });
      expect(response.body.tonnage).toBe(expected.tonnage);
      const stored = await context.prisma.projectProduct.findUniqueOrThrow({ where: { id: response.body.id as string } });
      expect([stored.conversionRuleId, stored.conversionFactor?.toFixed(8), stored.tonnage?.toFixed(4)]).toEqual([expected.rule, expected.factor, expected.tonnage]);
    }

    // Una regla inactiva no se aplica: con la de producto desactivada, gana la de familia.
    await context.prisma.unitConversionRule.update({ where: { id: productRule }, data: { isActive: false } });
    const otherProject = await ownProject(owner, { projectTypeCode: 'VIVIENDA' });
    const fallback = await client.post(`/projects/${otherProject}/products`).send({ productId: withProductRule.id, quantity: '10' });
    expect(fallback.status).toBe(201);
    expect(fallback.body).toMatchObject({ conversion: { ruleId: familyRule, scope: 'PRODUCT_FAMILY', factor: '0.00300000' }, tonnage: '0.0300' });
  });

  it('sin regla aplicable guarda tonelaje, regla y factor nulos y la línea no suma toneladas (PF-03.84)', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const base = await unit();
    const item = await product({ baseUnitId: base.id });

    const response = await api(context, owner.token).post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '40' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ conversion: null, tonnage: null });
    const stored = await context.prisma.projectProduct.findUniqueOrThrow({ where: { id: response.body.id as string } });
    expect([stored.conversionRuleId, stored.conversionFactor, stored.tonnage]).toEqual([null, null, null]);

    const list = await api(context, owner.token).get(`/projects/${projectId}/products`);
    expect(list.status).toBe(200);
    expect(list.body.totals).toEqual({ tonnage: '0.0000', quantitiesByUnit: [{ unit: unitRef(base), quantity: '40.0000' }], linesWithoutConversion: 1 });
  });

  it('409 PROJECT_PRODUCT_DUPLICATE con el mismo producto activo en el mismo par; con otra oportunidad o tras quitarlo, se acepta (PF-03.86)', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const opportunityA = await insertOpportunity(context.prisma, { projectId, ownerId: owner.id });
    const opportunityB = await insertOpportunity(context.prisma, { projectId, ownerId: owner.id });
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const client = api(context, owner.token);

    const first = await client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '1' });
    expect(first.status).toBe(201);
    const duplicate = await client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '2', opportunityId: null });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({
      code: 'PROJECT_PRODUCT_DUPLICATE',
      details: [{ field: 'productId', projectProductId: first.body.id, productId: item.id, opportunityId: null }],
    });

    const onA = await client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '3', opportunityId: opportunityA });
    expect(onA.status).toBe(201);
    const duplicateOnA = await client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '4', opportunityId: opportunityA });
    expect(duplicateOnA.status).toBe(409);
    expect(duplicateOnA.body).toMatchObject({
      code: 'PROJECT_PRODUCT_DUPLICATE',
      details: [{ field: 'productId', projectProductId: onA.body.id, productId: item.id, opportunityId: opportunityA }],
    });

    // PATCH que mueve una asociación a un par ocupado: mismo 409.
    const onB = await client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '5', opportunityId: opportunityB });
    expect(onB.status).toBe(201);
    const moved = await client.patch(`/projects/${projectId}/products/${onB.body.id as string}`).send({ opportunityId: opportunityA });
    expect(moved.status).toBe(409);
    expect(moved.body).toMatchObject({ code: 'PROJECT_PRODUCT_DUPLICATE', details: [{ field: 'productId', projectProductId: onA.body.id, opportunityId: opportunityA }] });

    // Quitada la primera, el par (proyecto, sin oportunidad) queda libre.
    expect((await client.delete(`/projects/${projectId}/products/${first.body.id as string}`)).status).toBe(204);
    expect((await client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '6' })).status).toBe(201);
    expect(await context.prisma.projectProduct.count({ where: { projectId, deletedAt: null } })).toBe(3);
  });

  it('dos asociaciones idénticas que esperan al bloqueo de la fila del proyecto dejan una sola fila activa: 201 y 409 (RN-03.59)', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const client = api(context, owner.token);

    // RN-03.59 la protege el `FOR UPDATE` del proyecto que toma toda escritura de
    // asociaciones (el bloqueo consultivo por clave era redundante; Revisión E5).
    const holder = holdTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
    });
    let statuses: number[] = [];
    let conflict: request.Response | undefined;
    try {
      await holder.locked;
      const first = await expectWaiting(client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '1' }));
      const second = await expectWaiting(client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '1' }));
      holder.release();
      await holder.done;
      const results = await Promise.all([first(), second()]);
      statuses = results.map((result) => result.status).sort();
      conflict = results.find((result) => result.status === 409);
    } finally {
      holder.release();
    }
    expect(statuses).toEqual([201, 409]);
    expect(conflict?.body).toMatchObject({ code: 'PROJECT_PRODUCT_DUPLICATE', details: [{ field: 'productId', productId: item.id, opportunityId: null }] });
    expect(await context.prisma.projectProduct.count({ where: { projectId, productId: item.id, deletedAt: null } })).toBe(1);
  });

  it('dos asociaciones idénticas en paralelo dejan una sola asociación activa (AC-03.63)', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const client = api(context, owner.token);

    const results = await Promise.all([
      client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '1' }),
      client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '1' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await context.prisma.projectProduct.count({ where: { projectId, productId: item.id, deletedAt: null } })).toBe(1);
  });

  it('asociaciones de productos distintos en paralelo sobre el mismo proyecto se aceptan todas (sin interbloqueo)', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const base = await unit();
    const items = [await product({ baseUnitId: base.id }), await product({ baseUnitId: base.id }), await product({ baseUnitId: base.id })];
    const client = api(context, owner.token);

    const results = await Promise.all(items.map((item) => client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '1' })));
    expect(results.map((result) => result.status)).toEqual([201, 201, 201]);
    expect(await context.prisma.projectProduct.count({ where: { projectId, deletedAt: null } })).toBe(3);
  });

  it('422 con cantidad negativa, producto inactivo o desconocido, unidad desconocida o inactiva y estado de otro catálogo; 400 con forma inválida (PF-03.87)', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const base = await unit();
    const inactiveUnit = await unit('COUNT', false);
    const item = await product({ baseUnitId: base.id });
    const inactive = await product({ baseUnitId: base.id, isActive: false });
    const client = api(context, owner.token);
    const post = (body: Record<string, unknown>) => client.post(`/projects/${projectId}/products`).send(body);

    const negative = await post({ productId: item.id, quantity: '-1' });
    expect(negative.status).toBe(422);
    expect(negative.body).toMatchObject({
      code: 'INVALID_QUANTITY',
      details: [{ field: 'quantity', code: 'INVALID_QUANTITY', message: 'The quantity must be a decimal greater than or equal to zero' }],
    });

    const inactiveProduct = await post({ productId: inactive.id, quantity: '1' });
    expect(inactiveProduct.status).toBe(422);
    expect(inactiveProduct.body).toMatchObject({ code: 'PRODUCT_INACTIVE', details: [{ field: 'productId', code: 'PRODUCT_INACTIVE', message: 'The product is inactive' }] });

    const unknownProduct = await post({ productId: randomUUID(), quantity: '1' });
    expect(unknownProduct.status).toBe(422);
    expect(unknownProduct.body).toMatchObject({ code: 'UNKNOWN_REFERENCE', details: [{ field: 'productId', code: 'UNKNOWN_REFERENCE' }] });

    for (const unitId of [randomUUID(), inactiveUnit.id]) {
      const response = await post({ productId: item.id, quantity: '1', unitId });
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'UNKNOWN_REFERENCE', details: [{ field: 'unitId', code: 'UNKNOWN_REFERENCE' }] });
    }

    const wrongCatalog = await post({ productId: item.id, quantity: '1', statusId: await catalogItemId(context.prisma, 'crm.estado_cliente', 'ACTIVO') });
    expect(wrongCatalog.status).toBe(422);
    expect(wrongCatalog.body).toMatchObject({
      code: 'INVALID_CATALOG_VALUE',
      details: [{ field: 'statusId', catalogKey: 'crm.estado_producto_asociado', reason: 'NOT_FOUND' }],
    });

    for (const body of [
      { productId: item.id, quantity: 'abc' },
      { productId: item.id, quantity: 5 },
      { productId: item.id },
      { productId: 'no-es-uuid', quantity: '1' },
      { productId: item.id, quantity: '1', notes: 'x'.repeat(1001) },
    ]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }

    // Ninguna escritura y `last_activity_at` intacto tras los rechazos (PF-03.112).
    expect(await context.prisma.projectProduct.count({ where: { projectId } })).toBe(0);
    expect(await lastActivity(projectId)).toEqual(OLD_ACTIVITY);

    // La base también rechaza una cantidad negativa (ck_project_products_quantity).
    await expect(insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: base.id, quantity: '-1' })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Editar (PF-03.88, PF-03.91)
// ---------------------------------------------------------------------------

describe('Editar una asociación (PATCH)', () => {
  it('recalcula el tonelaje con la regla vigente, audita la diferencia y toca lastActivityAt (PF-03.88)', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const opportunityId = await insertOpportunity(context.prisma, { projectId, ownerId: owner.id });
    const opportunity = await context.prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    const base = await unit();
    const mass = await unit('MASS');
    const familyInfo = await family();
    const item = await product({ familyInfo, baseUnitId: base.id });
    const productRule = await insertConversionRule(context.prisma, { fromUnitId: base.id, factor: '0.5', scope: 'PRODUCT', productId: item.id });
    const familyRule = await insertConversionRule(context.prisma, { fromUnitId: base.id, factor: '0.25', scope: 'PRODUCT_FAMILY', productFamilyId: familyInfo.id });
    const massRule = await insertConversionRule(context.prisma, { fromUnitId: mass.id, factor: '0.001', scope: 'GLOBAL' });
    const client = api(context, owner.token);

    const created = await client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '120', notes: 'Primera' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ tonnage: '60.0000', conversion: { ruleId: productRule } });
    const lineId = created.body.id as string;
    const afterCreate = await lastActivity(projectId);
    expect(afterCreate.getTime()).toBeGreaterThan(OLD_ACTIVITY.getTime());

    // Cambia la regla vigente: la de producto se desactiva; solo cambia la cantidad.
    await context.prisma.unitConversionRule.update({ where: { id: productRule }, data: { isActive: false } });
    const quantityOnly = await client.patch(`/projects/${projectId}/products/${lineId}`).send({ quantity: '200' });
    expect(quantityOnly.status).toBe(200);
    expect(quantityOnly.body).toMatchObject({ quantity: '200.0000', tonnage: '50.0000', conversion: { ruleId: familyRule, scope: 'PRODUCT_FAMILY', factor: '0.25000000' } });
    const afterQuantity = await lastActivity(projectId);
    expect(afterQuantity.getTime()).toBeGreaterThan(afterCreate.getTime());

    const full = await client.patch(`/projects/${projectId}/products/${lineId}`).send({
      unitId: mass.id,
      statusId: await statusId('COTIZADO'),
      opportunityId,
      notes: 'Segunda',
    });
    expect(full.status).toBe(200);
    expect(full.body).toEqual({
      id: lineId,
      product: productRef(item),
      opportunity: { id: opportunityId, code: opportunity.code },
      quantity: '200.0000',
      unit: unitRef(mass),
      conversion: { ruleId: massRule, scope: 'GLOBAL', factor: '0.00100000' },
      tonnage: '0.2000',
      status: await status('COTIZADO'),
      notes: 'Segunda',
      updatedAt: expect.any(String),
      updatedBy: { id: owner.id, displayName: 'Persona De prueba' },
    });
    expect((await lastActivity(projectId)).getTime()).toBeGreaterThan(afterQuantity.getTime());

    const updates = await audit('crm.project_product.updated', lineId);
    expect(updates).toHaveLength(2);
    expect(updates[0]?.metadata).toEqual({ projectId });
    expect(updates[0]?.changes).toEqual({
      quantity: { before: '120.0000', after: '200.0000' },
      conversionRuleId: { before: productRule, after: familyRule },
      conversionFactor: { before: '0.50000000', after: '0.25000000' },
      tonnage: { before: '60.0000', after: '50.0000' },
    });
    expect(updates[1]?.changes).toEqual({
      opportunityId: { before: null, after: opportunityId },
      unitId: { before: base.id, after: mass.id },
      conversionRuleId: { before: familyRule, after: massRule },
      conversionFactor: { before: '0.25000000', after: '0.00100000' },
      tonnage: { before: '50.0000', after: '0.2000' },
      statusId: { before: await statusId('PROPUESTO'), after: await statusId('COTIZADO') },
      notes: { before: 'P***', after: 'S***' },
    });

    // Quitar la oportunidad (null) y una unidad sin regla: sin conversión.
    const noRuleUnit = await unit();
    const cleared = await client.patch(`/projects/${projectId}/products/${lineId}`).send({ opportunityId: null, unitId: noRuleUnit.id, notes: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ opportunity: null, unit: unitRef(noRuleUnit), conversion: null, tonnage: null, notes: null });
  });

  it('un PATCH rechazado (422) no escribe ni toca lastActivityAt (PF-03.112)', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const otherProject = await ownProject(owner);
    const foreignOpportunity = await insertOpportunity(context.prisma, { projectId: otherProject, ownerId: owner.id });
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const lineId = await insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: base.id, quantity: '10' });
    const client = api(context, owner.token);

    const negative = await client.patch(`/projects/${projectId}/products/${lineId}`).send({ quantity: '-5' });
    expect(negative.status).toBe(422);
    expect(negative.body).toMatchObject({ code: 'INVALID_QUANTITY', details: [{ field: 'quantity', code: 'INVALID_QUANTITY' }] });
    const foreign = await client.patch(`/projects/${projectId}/products/${lineId}`).send({ opportunityId: foreignOpportunity });
    expect(foreign.status).toBe(422);
    expect(foreign.body).toMatchObject({ code: 'OPPORTUNITY_NOT_IN_PROJECT', details: [{ field: 'opportunityId' }] });
    const badStatus = await client.patch(`/projects/${projectId}/products/${lineId}`).send({ statusId: randomUUID() });
    expect(badStatus.status).toBe(422);
    expect(badStatus.body).toMatchObject({ code: 'INVALID_CATALOG_VALUE', details: [{ field: 'statusId', catalogKey: 'crm.estado_producto_asociado', reason: 'NOT_FOUND' }] });

    const stored = await context.prisma.projectProduct.findUniqueOrThrow({ where: { id: lineId } });
    expect([stored.quantity.toFixed(4), stored.opportunityId, stored.statusId]).toEqual(['10.0000', null, await statusId('PROPUESTO')]);
    expect(await lastActivity(projectId)).toEqual(OLD_ACTIVITY);
    expect(await audit('crm.project_product.updated', lineId)).toHaveLength(0);
  });

  it('editar no modifica el maestro `products` y la ficha lee la descripción vigente del maestro (PF-03.91)', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const client = api(context, owner.token);
    const created = await client.post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '1' });
    expect(created.status).toBe(201);
    const masterBefore = await context.prisma.product.findUniqueOrThrow({ where: { id: item.id } });

    const patched = await client.patch(`/projects/${projectId}/products/${created.body.id as string}`).send({ quantity: '9', statusId: await statusId('ADJUDICADO') });
    expect(patched.status).toBe(200);
    expect(await context.prisma.product.findUniqueOrThrow({ where: { id: item.id } })).toEqual(masterBefore);

    await context.prisma.product.update({ where: { id: item.id }, data: { description: 'Descripción nueva del maestro' } });
    const list = await client.get(`/projects/${projectId}/products`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].product).toEqual({ ...productRef(item), description: 'Descripción nueva del maestro' });

    // Producto desactivado en el maestro: la asociación se conserva marcada (RN-03.55).
    await context.prisma.product.update({ where: { id: item.id }, data: { isActive: false } });
    const marked = await client.get(`/projects/${projectId}/products`);
    expect(marked.body.data[0].product.isActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Quitar (PF-03.89)
// ---------------------------------------------------------------------------

describe('Quitar una asociación (DELETE)', () => {
  it('sin forecast en la ventana: 204, borrado lógico, fuera de la ficha, auditado y lastActivityAt actualizado', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const lineId = await insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: base.id });
    // Forecast fuera de la ventana M+1…M+6 (mes en curso y M+7) y forecast a cero dentro: no bloquean.
    for (const [offset, quantity] of [
      [0, '5'],
      [7, '5'],
      [2, '0'],
    ] as const) {
      await insertForecastLine(context.prisma, { projectId, productId: item.id, unitId: base.id, ownerId: owner.id, ...businessMonthOffset(offset), quantity });
    }
    const client = api(context, owner.token);

    const response = await client.delete(`/projects/${projectId}/products/${lineId}`);
    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    const stored = await context.prisma.projectProduct.findUniqueOrThrow({ where: { id: lineId } });
    expect(stored.deletedAt).toBeInstanceOf(Date);
    expect(stored.updatedById).toBe(owner.id);
    expect((await client.get(`/projects/${projectId}/products`)).body.data).toEqual([]);
    expect((await lastActivity(projectId)).getTime()).toBeGreaterThan(OLD_ACTIVITY.getTime());
    const [entry] = await audit('crm.project_product.deleted', lineId);
    expect(entry?.metadata).toEqual({ projectId, productId: item.id });

    // Ya quitada: 404.
    expect((await client.delete(`/projects/${projectId}/products/${lineId}`)).status).toBe(404);
  });

  it('con forecast > 0 en la ventana y ninguna otra asociación activa: 409 PRODUCT_HAS_FORECAST con los períodos', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const otherProject = await ownProject(owner);
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const lineId = await insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: base.id });
    for (const [offset, quantity] of [
      [3, '4'],
      [1, '2.5'],
      [2, '0'],
      [6, '1'],
      [7, '9'],
    ] as const) {
      await insertForecastLine(context.prisma, { projectId, productId: item.id, unitId: base.id, ownerId: owner.id, ...businessMonthOffset(offset), quantity });
    }
    const client = api(context, owner.token);

    const response = await client.delete(`/projects/${projectId}/products/${lineId}`);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'PRODUCT_HAS_FORECAST',
      details: [{ productId: item.id, periods: [yearMonth(businessMonthOffset(1)), yearMonth(businessMonthOffset(3)), yearMonth(businessMonthOffset(6))] }],
    });
    expect((await context.prisma.projectProduct.findUniqueOrThrow({ where: { id: lineId } })).deletedAt).toBeNull();
    expect(await lastActivity(projectId)).toEqual(OLD_ACTIVITY);

    // El horizonte sale del parámetro: el forecast de otro proyecto no bloquea.
    const otherLine = await insertProjectProduct(context.prisma, { projectId: otherProject, productId: item.id, unitId: base.id });
    expect((await client.delete(`/projects/${otherProject}/products/${otherLine}`)).status).toBe(204);
  });

  it('con forecast en la ventana pero otra asociación activa del mismo producto: 204', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const opportunityId = await insertOpportunity(context.prisma, { projectId, ownerId: owner.id });
    const base = await unit();
    const item = await product({ baseUnitId: base.id });
    const lineId = await insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: base.id });
    const otherLine = await insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: base.id, opportunityId });
    await insertForecastLine(context.prisma, { projectId, productId: item.id, unitId: base.id, ownerId: owner.id, ...businessMonthOffset(1), quantity: '3' });
    const client = api(context, owner.token);

    expect((await client.delete(`/projects/${projectId}/products/${lineId}`)).status).toBe(204);
    // La última asociación activa ya no puede quitarse.
    const last = await client.delete(`/projects/${projectId}/products/${otherLine}`);
    expect(last.status).toBe(409);
    expect(last.body).toMatchObject({ code: 'PRODUCT_HAS_FORECAST', details: [{ productId: item.id, periods: [yearMonth(businessMonthOffset(1))] }] });
  });
});

// ---------------------------------------------------------------------------
// Listado y totales (AC-03.67)
// ---------------------------------------------------------------------------

describe('Listado y totales de productos (AC-03.67)', () => {
  it('suma solo estados activos con tonelaje, agrupa cantidades por unidad, cuenta las líneas sin conversión y calcula sobre todas las líneas', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const varUnit = await unit('COUNT');
    const kgUnit = await unit('MASS');
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const proposed = await product({ baseUnitId: varUnit.id, sku: `TEST-SKU-${suffix}-A` });
    const quoted = await product({ baseUnitId: kgUnit.id, sku: `TEST-SKU-${suffix}-B` });
    const discarded = await product({ baseUnitId: varUnit.id, sku: `TEST-SKU-${suffix}-C` });
    const withoutRule = await product({ baseUnitId: varUnit.id, sku: `TEST-SKU-${suffix}-D` });
    const removed = await product({ baseUnitId: varUnit.id, sku: `TEST-SKU-${suffix}-E` });
    await insertConversionRule(context.prisma, { fromUnitId: varUnit.id, factor: '0.01', scope: 'PRODUCT', productId: proposed.id });
    await insertConversionRule(context.prisma, { fromUnitId: kgUnit.id, factor: '0.001', scope: 'PRODUCT', productId: quoted.id });
    await insertConversionRule(context.prisma, { fromUnitId: varUnit.id, factor: '1', scope: 'PRODUCT', productId: discarded.id });
    const client = api(context, owner.token);

    const lines: Record<string, string> = {};
    for (const [key, body] of [
      ['A', { productId: proposed.id, quantity: '100' }],
      ['B', { productId: quoted.id, quantity: '50', statusId: await statusId('COTIZADO') }],
      ['C', { productId: discarded.id, quantity: '999', statusId: await statusId('DESCARTADO') }],
      ['D', { productId: withoutRule.id, quantity: '30' }],
    ] as const) {
      const response = await client.post(`/projects/${projectId}/products`).send(body);
      expect(response.status).toBe(201);
      lines[key] = response.body.id as string;
    }
    await insertProjectProduct(context.prisma, { projectId, productId: removed.id, unitId: varUnit.id, quantity: '500', deletedAt: new Date() });

    const expectedTotals = {
      tonnage: '1.0500',
      quantitiesByUnit: [
        { unit: unitRef(varUnit), quantity: '130.0000' },
        { unit: unitRef(kgUnit), quantity: '50.0000' },
      ].sort((a, b) => (String(a.unit.code) < String(b.unit.code) ? -1 : 1)),
      linesWithoutConversion: 1,
    };

    const list = await client.get(`/projects/${projectId}/products`);
    expect(list.status).toBe(200);
    expect(list.body.totals).toEqual(expectedTotals);
    expect(list.body.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 4, totalPages: 1 });
    // Orden por defecto: SKU ascendente.
    expect(list.body.data.map((line: { id: string }) => line.id)).toEqual([lines.A, lines.B, lines.C, lines.D]);
    const byId = new Map<string, { status: { code: string; isActive: boolean }; tonnage: string | null }>(
      list.body.data.map((line: { id: string; status: { code: string; isActive: boolean }; tonnage: string | null }) => [line.id, line]),
    );
    expect(byId.get(lines.C as string)).toMatchObject({ status: { code: 'DESCARTADO', isActive: false }, tonnage: '999.0000' });
    expect(byId.get(lines.D as string)).toMatchObject({ status: { code: 'PROPUESTO', isActive: true }, tonnage: null });

    // Los totales son de todas las líneas, no de la página.
    const page = await client.get(`/projects/${projectId}/products?page=2&pageSize=1`);
    expect(page.status).toBe(200);
    expect(page.body.data.map((line: { id: string }) => line.id)).toEqual([lines.B]);
    expect(page.body.pagination).toEqual({ page: 2, pageSize: 1, totalItems: 4, totalPages: 4 });
    expect(page.body.totals).toEqual(expectedTotals);

    const descending = await client.get(`/projects/${projectId}/products?sortBy=createdAt&sortOrder=desc`);
    expect(descending.status).toBe(200);
    expect(descending.body.data.map((line: { id: string }) => line.id)).toEqual([lines.D, lines.C, lines.B, lines.A]);
    expect((await client.get(`/projects/${projectId}/products?sortBy=quantity`)).status).toBe(400);
  });

  it('un proyecto sin productos devuelve una lista vacía y totales a cero', async () => {
    const owner = await advisor();
    const projectId = await ownProject(owner);
    const list = await api(context, owner.token).get(`/projects/${projectId}/products`);
    expect(list.status).toBe(200);
    expect(list.body).toEqual({
      data: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      totals: { tonnage: '0.0000', quantitiesByUnit: [], linesWithoutConversion: 0 },
    });
  });
});
