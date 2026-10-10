import { randomUUID } from 'node:crypto';

import request from 'supertest';

import {
  type TestContext,
  TEST_PASSWORD,
  closeTestContext,
  createTestContext,
  createTestUser,
  tokenWithRoles,
  uniqueIp,
} from './support/test-app';

/**
 * Integración de la administración de usuarios (PLAN-ADMIN paso 2: D3, D4,
 * D5, D11, D13). Cada prueba crea sus usuarios; nada depende de totales.
 */

let ctx: TestContext;
let adminToken: string;
let adminId: string;
let userToken: string;

const REASON = 'Cobertura temporal de una baja del equipo';

function api() {
  return request(ctx.app.getHttpServer());
}

function auditRow(event: string, resourceId: string) {
  return ctx.prisma.auditLog.findFirst({ where: { event, resourceId }, orderBy: { occurredAt: 'desc' } });
}

async function roleId(code: string): Promise<string> {
  return (await ctx.prisma.role.findUniqueOrThrow({ where: { code } })).id;
}

beforeAll(async () => {
  ctx = await createTestContext();
  const admin = await tokenWithRoles(ctx, ['administrador']);
  adminToken = admin.token;
  adminId = admin.user.id;
  userToken = (await tokenWithRoles(ctx, ['usuario'])).token;
});

afterAll(async () => {
  await closeTestContext(ctx);
});

describe('GET /users', () => {
  it('lista paginada con filtros y orden', async () => {
    const target = await createTestUser(ctx.prisma, { roleCodes: ['auditor'] });

    const response = await api()
      .get('/api/v1/users')
      .query({ search: target.email, roleCode: 'auditor', status: 'ACTIVE', sortBy: 'email', sortOrder: 'asc' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.pagination).toMatchObject({ page: 1, totalItems: 1 });
    expect(response.body.data[0]).toMatchObject({ id: target.id, roles: ['auditor'], status: 'ACTIVE' });
  });

  it('401 sin token', async () => {
    await api().get('/api/v1/users').expect(401);
  });

  it('403 sin usuarios.ver', async () => {
    await api().get('/api/v1/users').set('Authorization', `Bearer ${userToken}`).expect(403);
  });

  it('400 con un campo de orden fuera de la lista blanca', async () => {
    await api().get('/api/v1/users').query({ sortBy: 'passwordHash' }).set('Authorization', `Bearer ${adminToken}`).expect(400);
  });
});

describe('GET /users/:id', () => {
  it('devuelve el detalle con roles y asignaciones directas', async () => {
    const target = await createTestUser(ctx.prisma, { roleCodes: ['usuario'] });

    const response = await api().get(`/api/v1/users/${target.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);

    expect(response.body).toMatchObject({ id: target.id, email: target.email, directPermissions: [], directMenuOptions: [] });
    expect(response.body.roles.map((role: { code: string }) => role.code)).toEqual(['usuario']);
    expect(response.body).not.toHaveProperty('hasCompletedActivation');
  });

  it('404 si no existe', async () => {
    await api().get(`/api/v1/users/${randomUUID()}`).set('Authorization', `Bearer ${adminToken}`).expect(404);
  });

  it('403 sin permiso', async () => {
    await api().get(`/api/v1/users/${adminId}`).set('Authorization', `Bearer ${userToken}`).expect(403);
  });
});

describe('POST /users', () => {
  it('crea, devuelve Location y audita user.created', async () => {
    const email = `alta-${randomUUID()}@integration.test`;

    const response = await api()
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, firstName: 'Alta', lastName: 'Nueva', roleIds: [await roleId('usuario')] })
      .expect(201);

    expect(response.headers.location).toBe(`/api/v1/users/${response.body.id}`);
    expect(response.body).toMatchObject({ email, status: 'INVITED', roles: ['usuario'] });
    expect(await auditRow('user.created', response.body.id)).not.toBeNull();
  });

  it('409 con un correo repetido', async () => {
    const existing = await createTestUser(ctx.prisma);
    await api()
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: existing.email, firstName: 'A', lastName: 'B', roleIds: [await roleId('usuario')] })
      .expect(409);
  });

  it('422 con un rol inexistente', async () => {
    const response = await api()
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: `x-${randomUUID()}@integration.test`, firstName: 'A', lastName: 'B', roleIds: [randomUUID()] })
      .expect(422);
    expect(response.body.code).toBe('UNKNOWN_REFERENCE');
  });

  it('400 con datos inválidos', async () => {
    await api()
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'no-es-correo', firstName: '', lastName: 'B', roleIds: [] })
      .expect(400);
  });

  it('403 sin usuarios.crear', async () => {
    await api().post('/api/v1/users').set('Authorization', `Bearer ${userToken}`).send({}).expect(403);
  });
});

describe('PATCH /users/:id', () => {
  it('actualiza y audita la diferencia', async () => {
    const target = await createTestUser(ctx.prisma);

    const response = await api()
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ jobTitle: 'Analista' })
      .expect(200);

    expect(response.body.jobTitle).toBe('Analista');
    const row = await auditRow('user.updated', target.id);
    expect(row?.changes).toEqual({ jobTitle: { before: null, after: 'Analista' } });
  });

  it('400 si intenta cambiar el estado: sólo con suspend/reactivate', async () => {
    const target = await createTestUser(ctx.prisma);
    await api()
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SUSPENDED' })
      .expect(400);
  });

  it('403 sin usuarios.editar', async () => {
    await api().patch(`/api/v1/users/${adminId}`).set('Authorization', `Bearer ${userToken}`).send({}).expect(403);
  });
});

describe('POST /users/:id/suspend y /reactivate (D3, D4)', () => {
  it('suspende, cierra sus sesiones y audita; reactivar lo devuelve', async () => {
    const target = await createTestUser(ctx.prisma);
    const login = await api()
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', uniqueIp())
      .send({ email: target.email, password: TEST_PASSWORD })
      .expect(200);
    const targetToken = login.body.accessToken as string;
    const cookie = (login.headers['set-cookie'] as unknown as string[]).find((value) => value.startsWith('refresh_token='));

    const suspended = await api()
      .post(`/api/v1/users/${target.id}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Revisión de un incidente de seguridad' })
      .expect(200);
    expect(suspended.body.status).toBe('SUSPENDED');

    // El refresh ya no sirve y el access token vigente deja de dar acceso.
    const refresh = await api()
      .post('/api/v1/auth/refresh')
      .set('X-Forwarded-For', uniqueIp())
      .set('Cookie', cookie?.split(';')[0] ?? '');
    expect([401, 403]).toContain(refresh.status);
    await api().get('/api/v1/me').set('Authorization', `Bearer ${targetToken}`).expect(401);

    const sessions = await ctx.prisma.userSession.findMany({ where: { userId: target.id } });
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);

    const row = await auditRow('user.suspended', target.id);
    expect(row?.changes).toEqual({ status: { before: 'ACTIVE', after: 'SUSPENDED' } });

    // Nunca cambió su contraseña inicial: vuelve como INVITED.
    const reactivated = await api()
      .post(`/api/v1/users/${target.id}/reactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(reactivated.body.status).toBe('INVITED');
    expect(await auditRow('user.reactivated', target.id)).not.toBeNull();
  });

  it('409 SELF_LOCKOUT al suspenderse a sí mismo', async () => {
    const response = await api()
      .post(`/api/v1/users/${adminId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
    expect(response.body.code).toBe('SELF_LOCKOUT');
  });

  it('409 INVALID_STATUS_TRANSITION al reactivar a alguien activo', async () => {
    const target = await createTestUser(ctx.prisma);
    const response = await api()
      .post(`/api/v1/users/${target.id}/reactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
    expect(response.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('400 con una razón demasiado corta', async () => {
    const target = await createTestUser(ctx.prisma);
    await api()
      .post(`/api/v1/users/${target.id}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'corta' })
      .expect(400);
  });

  it('401 y 403', async () => {
    const target = await createTestUser(ctx.prisma);
    await api().post(`/api/v1/users/${target.id}/suspend`).expect(401);
    await api().post(`/api/v1/users/${target.id}/suspend`).set('Authorization', `Bearer ${userToken}`).expect(403);
  });
});

describe('PUT /users/:id/roles (D3)', () => {
  it('reemplaza los roles y audita', async () => {
    const target = await createTestUser(ctx.prisma);

    await api()
      .put(`/api/v1/users/${target.id}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [await roleId('auditor')] })
      .expect(204);

    const row = await auditRow('user.roles_replaced', target.id);
    expect(row?.changes).toEqual({ roles: { before: ['usuario'], after: ['auditor'] } });
  });

  it('409 SELF_LOCKOUT al quitarse su propio rol de administrador', async () => {
    const response = await api()
      .put(`/api/v1/users/${adminId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [await roleId('usuario')] })
      .expect(409);
    expect(response.body.code).toBe('SELF_LOCKOUT');
  });

  it('400 con lista vacía', async () => {
    const target = await createTestUser(ctx.prisma);
    await api().put(`/api/v1/users/${target.id}/roles`).set('Authorization', `Bearer ${adminToken}`).send({ ids: [] }).expect(400);
  });

  it('403 sin usuarios.editar', async () => {
    await api().put(`/api/v1/users/${adminId}/roles`).set('Authorization', `Bearer ${userToken}`).send({ ids: [] }).expect(403);
  });
});

describe('PUT /users/:id/permissions y /menu-options (D5)', () => {
  it('guarda la excepción con razón y caducidad, la audita y expone su origen', async () => {
    const target = await createTestUser(ctx.prisma);
    const permission = await ctx.prisma.permission.findUniqueOrThrow({ where: { code: 'usuarios.exportar' } });
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();

    await api()
      .put(`/api/v1/users/${target.id}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignments: [{ targetId: permission.id, effect: 'GRANT', reason: REASON, expiresAt }] })
      .expect(204);

    expect(await auditRow('user.permissions_replaced', target.id)).not.toBeNull();

    const access = await api().get(`/api/v1/users/${target.id}/access`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(access.body.permissions).toContain('usuarios.exportar');
    expect(access.body.origins).toContainEqual({
      code: 'usuarios.exportar',
      effective: true,
      roles: [],
      grant: { reason: REASON, expiresAt },
      deny: null,
    });
  });

  it('400 sin razón suficiente', async () => {
    const target = await createTestUser(ctx.prisma);
    const permission = await ctx.prisma.permission.findUniqueOrThrow({ where: { code: 'usuarios.ver' } });
    await api()
      .put(`/api/v1/users/${target.id}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignments: [{ targetId: permission.id, effect: 'GRANT', reason: 'corta' }] })
      .expect(400);
  });

  it('opciones directas: guarda, audita y 403 sin opciones.configurar', async () => {
    const target = await createTestUser(ctx.prisma);
    const option = await ctx.prisma.menuOption.findUniqueOrThrow({ where: { key: 'admin-usuarios' } });

    await api()
      .put(`/api/v1/users/${target.id}/menu-options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignments: [{ targetId: option.id, effect: 'DENY', reason: REASON }] })
      .expect(204);
    expect(await auditRow('user.menu_options_replaced', target.id)).not.toBeNull();

    await api()
      .put(`/api/v1/users/${target.id}/menu-options`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ assignments: [] })
      .expect(403);
  });
});

describe('GET /users/export (D13)', () => {
  it('devuelve CSV con los filtros y audita la exportación', async () => {
    const target = await createTestUser(ctx.prisma);

    const response = await api()
      .get('/api/v1/users/export')
      .query({ search: target.email })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['x-export-truncated']).toBe('false');
    expect(response.text).toContain(target.email);
    expect(response.text.split('\r\n').filter(Boolean)).toHaveLength(2);

    const row = await ctx.prisma.auditLog.findFirst({
      where: { event: 'user.exported', subjectId: adminId },
      orderBy: { occurredAt: 'desc' },
    });
    expect(row?.metadata).toMatchObject({ rowCount: 1, search: target.email });
  });

  it('403 con usuarios.ver pero sin usuarios.exportar', async () => {
    const { token } = await tokenWithRoles(ctx, ['auditor']);
    await api().get('/api/v1/users/export').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('401 sin token', async () => {
    await api().get('/api/v1/users/export').expect(401);
  });
});
