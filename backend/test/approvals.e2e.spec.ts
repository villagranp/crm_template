import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { closeTestContext, createTestContext, createTestUser, type TestContext, tokenWithRoles, uniqueCode } from './support/test-app';

/**
 * Bandeja de aprobaciones de solo lectura (PLAN-ADMIN, D12). Ningún flujo crea
 * solicitudes todavía: las crea la prueba directamente con Prisma.
 */

let ctx: TestContext;
let adminToken: string;
let requestId: string;
let code: string;
let approverId: string;
let auditorRole: { id: string; name: string };

function api() {
  return request(ctx.app.getHttpServer());
}

beforeAll(async () => {
  ctx = await createTestContext();
  adminToken = (await tokenWithRoles(ctx, ['administrador'])).token;

  const requester = await createTestUser(ctx.prisma);
  const approver = await createTestUser(ctx.prisma);
  approverId = approver.id;
  auditorRole = await ctx.prisma.role.findUniqueOrThrow({ where: { code: 'auditor' }, select: { id: true, name: true } });

  code = uniqueCode('APR');
  const created = await ctx.prisma.approvalRequest.create({
    data: {
      code,
      resourceType: 'prueba',
      resourceId: randomUUID(),
      title: `Solicitud ${code}`,
      reason: 'Motivo de prueba',
      status: 'PENDING',
      requestedById: requester.id,
      payload: { descuento: 10 },
      steps: {
        create: [
          { sequence: 2, approverRoleId: auditorRole.id },
          { sequence: 1, approverId: approver.id, status: 'APPROVED', comment: 'Visto', resolvedAt: new Date() },
        ],
      },
    },
  });
  requestId = created.id;
});

afterAll(async () => {
  await ctx?.prisma.approvalRequest.deleteMany({ where: { id: requestId } });
  await closeTestContext(ctx);
});

describe('GET /api/v1/approvals', () => {
  it('200: lista paginada filtrable por estado y búsqueda', async () => {
    const response = await api()
      .get('/api/v1/approvals')
      .query({ search: code, status: 'PENDING' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.pagination).toMatchObject({ totalItems: 1 });
    expect(response.body.data[0]).toMatchObject({
      id: requestId,
      code,
      status: 'PENDING',
      stepCount: 2,
      requestedBy: { displayName: 'Persona De prueba' },
    });
    expect(response.body.data[0]).not.toHaveProperty('payload');
  });

  it('otro estado no la incluye', async () => {
    const response = await api()
      .get('/api/v1/approvals')
      .query({ search: code, status: 'APPROVED' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body.data).toEqual([]);
  });

  it('401 sin token', async () => {
    await api().get('/api/v1/approvals').expect(401);
  });

  it('403 sin aprobaciones.ver', async () => {
    const { token } = await tokenWithRoles(ctx, ['usuario']);
    await api().get('/api/v1/approvals').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('400 con estado u orden inválidos', async () => {
    await api().get('/api/v1/approvals').query({ status: 'OPEN' }).set('Authorization', `Bearer ${adminToken}`).expect(400);
    await api().get('/api/v1/approvals').query({ sortBy: 'payload' }).set('Authorization', `Bearer ${adminToken}`).expect(400);
  });
});

describe('GET /api/v1/approvals/{id}', () => {
  it('200: detalle con los pasos en orden, aprobador y rol', async () => {
    const response = await api().get(`/api/v1/approvals/${requestId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);

    expect(response.body).toMatchObject({ id: requestId, reason: 'Motivo de prueba', payload: { descuento: 10 } });
    expect(response.body.steps).toEqual([
      expect.objectContaining({
        sequence: 1,
        status: 'APPROVED',
        comment: 'Visto',
        approver: { id: approverId, displayName: 'Persona De prueba' },
        approverRole: null,
      }),
      expect.objectContaining({ sequence: 2, status: 'PENDING', approver: null, approverRole: auditorRole }),
    ]);
  });

  it('403 sin aprobaciones.ver', async () => {
    const { token } = await tokenWithRoles(ctx, ['usuario']);
    await api().get(`/api/v1/approvals/${requestId}`).set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('404 si no existe', async () => {
    await api().get(`/api/v1/approvals/${randomUUID()}`).set('Authorization', `Bearer ${adminToken}`).expect(404);
  });

  it('400 si el identificador no es un UUID', async () => {
    await api().get('/api/v1/approvals/no-es-uuid').set('Authorization', `Bearer ${adminToken}`).expect(400);
  });

  it('no hay endpoints de resolución (D12)', async () => {
    await api().post(`/api/v1/approvals/${requestId}/approve`).set('Authorization', `Bearer ${adminToken}`).expect(404);
  });
});
