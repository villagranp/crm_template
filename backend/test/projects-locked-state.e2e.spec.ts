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
  insertUnit,
  testCountry,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 3 · Revisión E5: las decisiones de una escritura se toman sobre el estado
 * **bloqueado**, no sobre la lectura previa (03 "Precisiones", Revisión E5: M2, M3, M4) y
 * los UUID se comparan normalizados (m1).
 *
 * Patrón determinista: una transacción de la prueba sostiene `FOR UPDATE` sobre la fila del
 * proyecto, la petición queda esperando ese bloqueo (ya hizo su lectura previa), la prueba
 * cambia el estado dentro de su transacción y la libera.
 *
 * Aislamiento: país propio `Z1` (moneda USD); roles de prueba propios, borrados al final.
 */

let context: TestContext;
let z1: string;
const roleCodes: string[] = [];
const COUNTRY_EDITOR = [
  'proyectos.ver',
  'proyectos.editar',
  'oportunidades.ver',
  'oportunidades.editar',
  'oportunidades.cerrar',
];

beforeAll(async () => {
  context = await createTestContext();
  z1 = await testCountry(context.prisma, 'Z1', { name: 'Estado bloqueado', currencyCode: 'USD' });
});

afterAll(async () => {
  await context?.prisma.userRole.deleteMany({ where: { role: { code: { in: roleCodes } } } });
  await context?.prisma.role.deleteMany({ where: { code: { in: roleCodes } } });
  await closeTestContext(context);
});

// ---------------------------------------------------------------------------
// Ayudantes locales
// ---------------------------------------------------------------------------

/** Rol propio con alcance COUNTRY: ve todo lo del país, edita solo lo suyo (sin `administrar`). */
async function countryEditor(): Promise<CrmUser> {
  const code = `test-lock-${randomUUID().slice(0, 8)}`;
  const permissions = await context.prisma.permission.findMany({ where: { code: { in: COUNTRY_EDITOR } } });
  expect(permissions).toHaveLength(COUNTRY_EDITOR.length);
  await context.prisma.role.create({
    data: { code, name: `Editor de país ${code}`, dataScope: 'COUNTRY', permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) } },
  });
  roleCodes.push(code);
  return crmUser(context, { roleCodes: [code], countryId: z1 });
}

async function advisor(): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['asesor'], countryId: z1 });
}

async function projectOf(owner: { id: string }): Promise<string> {
  const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: z1 });
  return insertProject(context.prisma, { customerId: customer.id, ownerId: owner.id, countryId: z1 });
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

/**
 * Retiene la fila del proyecto (`FOR UPDATE`) en una transacción de la prueba, lanza `send`
 * (que hace su lectura previa y queda esperando el bloqueo), aplica `change` **con el
 * bloqueo todavía tomado**, confirma y devuelve la respuesta.
 */
async function whileWaiting(projectId: string, send: () => request.Test, change: (tx: PrismaClient) => Promise<void>): Promise<request.Response> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  let signalLocked: () => void = () => undefined;
  const locked = new Promise<void>((resolve) => (signalLocked = resolve));
  const done = context.prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
      signalLocked();
      await released;
      await change(tx as unknown as PrismaClient);
    },
    { timeout: 20_000 },
  );
  try {
    await locked;
    const response = await expectWaiting(send());
    release();
    await done;
    return await response();
  } finally {
    release();
  }
}

// ---------------------------------------------------------------------------
// M2 · Oportunidades: plan de la estimación sobre la fila bloqueada
// ---------------------------------------------------------------------------

describe('PATCH /opportunities/:id decide sobre la fila bloqueada (M2)', () => {
  it('el monto que guardó A mientras B esperaba sobrevive al PATCH de B ajeno a la estimación; la auditoría parte del estado bloqueado', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const client = api(context, owner.token);
    const created = await client.post(`/projects/${projectId}/opportunities`).send({ estimatedAmount: '100', currencyCode: 'USD', opportunityDate: '2026-10-01' });
    expect(created.status).toBe(201);
    const opportunityId = created.body.id as string;

    const response = await whileWaiting(
      projectId,
      () => client.patch(`/opportunities/${opportunityId}`).send({ nextAction: 'Llamar' }),
      async (tx) => {
        // A: nuevo monto (los cinco campos coherentes), confirmado antes de que B lea bajo el bloqueo.
        await tx.opportunity.update({ where: { id: opportunityId }, data: { estimatedAmount: '900', estimatedAmountUsd: '900' } });
      },
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ estimatedAmount: '900.0000', estimatedAmountUsd: '900.0000', currencyCode: 'USD', nextAction: 'Llamar' });
    const row = await context.prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    expect(row.estimatedAmount?.toFixed(4)).toBe('900.0000');
    expect(row.nextAction).toBe('Llamar');
    const [entry] = await context.prisma.auditLog.findMany({ where: { event: 'crm.opportunity.updated', resourceId: opportunityId } });
    const changes = entry?.changes as Record<string, unknown>;
    expect(Object.keys(changes)).toEqual(['nextAction']);
  });
});

// ---------------------------------------------------------------------------
// M3 · Productos asociados: edición sobre la asociación bloqueada
// ---------------------------------------------------------------------------

describe('PATCH /projects/:id/products/:ppId sobre el estado bloqueado (M3)', () => {
  async function association(owner: CrmUser): Promise<{ projectId: string; lineId: string }> {
    const projectId = await projectOf(owner);
    const base = await insertUnit(context.prisma);
    const item = await insertProduct(context.prisma, { familyId: await insertProductFamily(context.prisma), baseUnitId: base.id });
    const lineId = await insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: base.id, quantity: '10' });
    return { projectId, lineId };
  }

  it('quitada por otra petición mientras esperaba el bloqueo → 404 RESOURCE_NOT_FOUND (nunca 500) y nada escrito', async () => {
    const owner = await advisor();
    const { projectId, lineId } = await association(owner);
    const response = await whileWaiting(
      projectId,
      () => api(context, owner.token).patch(`/projects/${projectId}/products/${lineId}`).send({ quantity: '20' }),
      async (tx) => {
        await tx.projectProduct.update({ where: { id: lineId }, data: { deletedAt: new Date() } });
      },
    );
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' });
    const row = await context.prisma.projectProduct.findUniqueOrThrow({ where: { id: lineId } });
    expect(row.quantity.toFixed(4)).toBe('10.0000');
  });

  it('una cantidad concurrente sobrevive a un PATCH solo de notas: se escribe solo la columna que cambia', async () => {
    const owner = await advisor();
    const { projectId, lineId } = await association(owner);
    const response = await whileWaiting(
      projectId,
      () => api(context, owner.token).patch(`/projects/${projectId}/products/${lineId}`).send({ notes: 'Revisar' }),
      async (tx) => {
        await tx.projectProduct.update({ where: { id: lineId }, data: { quantity: '50' } });
      },
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ quantity: '50.0000', notes: 'Revisar' });
    const [entry] = await context.prisma.auditLog.findMany({ where: { event: 'crm.project_product.updated', resourceId: lineId } });
    expect(Object.keys(entry?.changes as Record<string, unknown>)).toEqual(['notes']);
  });
});

// ---------------------------------------------------------------------------
// M4 · Política y rango de fechas sobre el registro bloqueado
// ---------------------------------------------------------------------------

describe('autorización y fechas decididas bajo el bloqueo (M4)', () => {
  it('PATCH /projects/:id: asesor reasignado mientras esperaba → el antiguo dueño sin administrar recibe 403 y nada cambia', async () => {
    const owner = await countryEditor();
    const other = await countryEditor();
    const projectId = await projectOf(owner);
    const response = await whileWaiting(
      projectId,
      () => api(context, owner.token).patch(`/projects/${projectId}`).send({ name: 'Renombrado' }),
      async (tx) => {
        await tx.project.update({ where: { id: projectId }, data: { ownerId: other.id } });
      },
    );
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'PERMISSION_DENIED' });
    expect((await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } })).name).toBe('Proyecto de prueba');
  });

  it('PATCH /projects/:id: fin estimado cambiado mientras esperaba → 422 INVALID_DATE_RANGE (nunca 500 por ck_projects_estimated_dates)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const response = await whileWaiting(
      projectId,
      () => api(context, owner.token).patch(`/projects/${projectId}`).send({ estimatedStartDate: '2027-03-01' }),
      async (tx) => {
        await tx.project.update({ where: { id: projectId }, data: { estimatedEndDate: new Date('2027-02-01T00:00:00.000Z') } });
      },
    );
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      code: 'INVALID_DATE_RANGE',
      details: [{ field: 'estimatedEndDate', code: 'INVALID_DATE_RANGE', startField: 'estimatedStartDate' }],
    });
    expect((await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } })).estimatedStartDate).toBeNull();
  });

  it('POST /projects/:id/products: asesor reasignado mientras esperaba → 403 sin asociar', async () => {
    const owner = await countryEditor();
    const other = await countryEditor();
    const projectId = await projectOf(owner);
    const base = await insertUnit(context.prisma);
    const item = await insertProduct(context.prisma, { familyId: await insertProductFamily(context.prisma), baseUnitId: base.id });
    const response = await whileWaiting(
      projectId,
      () => api(context, owner.token).post(`/projects/${projectId}/products`).send({ productId: item.id, quantity: '1' }),
      async (tx) => {
        await tx.project.update({ where: { id: projectId }, data: { ownerId: other.id } });
      },
    );
    expect(response.status).toBe(403);
    expect(await context.prisma.projectProduct.count({ where: { projectId } })).toBe(0);
  });

  it('cambio de etapa: oportunidad reasignada mientras esperaba → 403 (canClose sobre la fila bloqueada), sin cerrar', async () => {
    const owner = await countryEditor();
    const other = await countryEditor();
    const projectId = await projectOf(owner);
    const opportunityId = await insertOpportunity(context.prisma, { projectId, ownerId: owner.id, stageCode: 'COTIZANDO' });
    const won = await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'GANADO');
    const response = await whileWaiting(
      projectId,
      () =>
        api(context, owner.token)
          .post(`/opportunities/${opportunityId}/stage-changes`)
          .send({ toStageId: won, result: { outcome: 'WON', decisionDate: '2026-10-05' } }),
      async (tx) => {
        await tx.opportunity.update({ where: { id: opportunityId }, data: { ownerId: other.id } });
        await tx.project.update({ where: { id: projectId }, data: { ownerId: other.id } });
      },
    );
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'PERMISSION_DENIED' });
    const row = await context.prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    expect(row.stageId).toBe(await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'COTIZANDO'));
    expect(await context.prisma.opportunityResult.count({ where: { opportunityId } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// m1 · UUID normalizados
// ---------------------------------------------------------------------------

describe('UUID en mayúsculas (m1)', () => {
  it('indicarse a sí mismo como asesor con otra capitalización no es un cambio ni exige administrar', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const client = api(context, owner.token);
    const response = await client.patch(`/projects/${projectId}`).send({ ownerId: owner.id.toUpperCase() });
    expect(response.status).toBe(200);
    expect(await context.prisma.auditLog.count({ where: { event: 'crm.project.updated', resourceId: projectId } })).toBe(0);

    const created = await client.post(`/projects/${projectId}/opportunities`).send({ ownerId: owner.id.toUpperCase() });
    expect(created.status).toBe(201);
    expect(created.body.owner.id).toBe(owner.id);
  });

  it('una asociación movida a la misma oportunidad escrita en mayúsculas no cuenta como cambio de clave', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const opportunityId = await insertOpportunity(context.prisma, { projectId, ownerId: owner.id });
    const base = await insertUnit(context.prisma);
    const item = await insertProduct(context.prisma, { familyId: await insertProductFamily(context.prisma), baseUnitId: base.id });
    const lineId = await insertProjectProduct(context.prisma, { projectId, productId: item.id, unitId: base.id, opportunityId });
    const response = await api(context, owner.token)
      .patch(`/projects/${projectId}/products/${lineId}`)
      .send({ opportunityId: opportunityId.toUpperCase(), unitId: base.id.toUpperCase() });
    expect(response.status).toBe(200);
    expect(response.body.opportunity).toMatchObject({ id: opportunityId });
    expect(await context.prisma.auditLog.count({ where: { event: 'crm.project_product.updated', resourceId: lineId } })).toBe(0);
  });
});
