import { randomUUID } from 'node:crypto';

import request from 'supertest';

import {
  type TestContext,
  closeTestContext,
  createTestContext,
  createTestUser,
  tokenWithRoles,
  uniqueCode,
} from './support/test-app';

/**
 * Integración de roles y permisos (PLAN-ADMIN paso 3: D1, D2, D11).
 * Los roles de sistema sólo se usan para comprobar que se rechazan cambios.
 */

let ctx: TestContext;
let adminToken: string;
let userToken: string;

function api() {
  return request(ctx.app.getHttpServer());
}

function auditRow(event: string, resourceId: string) {
  return ctx.prisma.auditLog.findFirst({ where: { event, resourceId }, orderBy: { occurredAt: 'desc' } });
}

async function permissionId(code: string): Promise<string> {
  return (await ctx.prisma.permission.findUniqueOrThrow({ where: { code } })).id;
}

async function systemRoleId(): Promise<string> {
  return (await ctx.prisma.role.findUniqueOrThrow({ where: { code: 'auditor' } })).id;
}

async function createRole(overrides: Record<string, unknown> = {}) {
  const response = await api()
    .post('/api/v1/roles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ code: uniqueCode('rol'), name: 'Rol de prueba', dataScope: 'OWN', ...overrides })
    .expect(201);
  return response.body as { id: string; code: string; permissionCodes: string[] };
}

beforeAll(async () => {
  ctx = await createTestContext();
  adminToken = (await tokenWithRoles(ctx, ['administrador'])).token;
  userToken = (await tokenWithRoles(ctx, ['usuario'])).token;
});

afterAll(async () => {
  await closeTestContext(ctx);
});

describe('GET /roles', () => {
  it('lista paginada con búsqueda', async () => {
    const role = await createRole();
    const response = await api()
      .get('/api/v1/roles')
      .query({ search: role.code })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.pagination.totalItems).toBe(1);
    expect(response.body.data[0]).toMatchObject({ id: role.id, isSystem: false, userCount: 0 });
  });

  it('filtra roles de sistema', async () => {
    const response = await api()
      .get('/api/v1/roles')
      .query({ isSystem: 'true', pageSize: 100 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body.data.every((role: { isSystem: boolean }) => role.isSystem)).toBe(true);
    expect(response.body.data.map((role: { code: string }) => role.code)).toContain('administrador');
  });

  it('401 y 403', async () => {
    await api().get('/api/v1/roles').expect(401);
    await api().get('/api/v1/roles').set('Authorization', `Bearer ${userToken}`).expect(403);
  });
});

describe('POST /roles', () => {
  it('crea con permisos, devuelve Location y audita', async () => {
    const role = await createRole({ permissionIds: [await permissionId('usuarios.ver')] });

    expect(role.permissionCodes).toEqual(['usuarios.ver']);
    expect(await auditRow('role.created', role.id)).not.toBeNull();
  });

  it('409 con un código repetido', async () => {
    const role = await createRole();
    const response = await api()
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: role.code, name: 'Otro', dataScope: 'OWN' })
      .expect(409);
    expect(response.body.code).toBe('RESOURCE_CONFLICT');
  });

  it('400 con un código inválido', async () => {
    await api()
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'Con Espacios', name: 'X', dataScope: 'OWN' })
      .expect(400);
  });

  it('422 con un permiso inexistente', async () => {
    const response = await api()
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: uniqueCode('rol'), name: 'Rol X', dataScope: 'OWN', permissionIds: [randomUUID()] })
      .expect(422);
    expect(response.body.code).toBe('UNKNOWN_REFERENCE');
  });

  it('403 sin roles.crear', async () => {
    await api().post('/api/v1/roles').set('Authorization', `Bearer ${userToken}`).send({}).expect(403);
  });
});

describe('roles de sistema (D1)', () => {
  it.each([
    ['PATCH', '', { name: 'Otro' }],
    ['DELETE', '', undefined],
    ['PUT', '/permissions', { ids: [] }],
    ['PUT', '/menu-options', { ids: [] }],
  ])('%s %s responde 409 SYSTEM_RESOURCE_READ_ONLY', async (method, suffix, body) => {
    const url = `/api/v1/roles/${await systemRoleId()}${suffix}`;
    const call =
      method === 'PATCH' ? api().patch(url) : method === 'DELETE' ? api().delete(url) : api().put(url);

    const response = await call.set('Authorization', `Bearer ${adminToken}`).send(body).expect(409);
    expect(response.body.code).toBe('SYSTEM_RESOURCE_READ_ONLY');
  });

  it('se duplica en un rol propio editable y se audita', async () => {
    const code = uniqueCode('auditor-copia');
    const response = await api()
      .post(`/api/v1/roles/${await systemRoleId()}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, name: 'Auditor (copia)' })
      .expect(201);

    expect(response.body).toMatchObject({ code, isSystem: false, userCount: 0 });
    expect(response.body.permissionCodes).toContain('auditoria.exportar');
    expect(await auditRow('role.duplicated', response.body.id)).not.toBeNull();

    await api()
      .patch(`/api/v1/roles/${response.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Auditor regional' })
      .expect(200);
  });
});

describe('roles propios (D2)', () => {
  it('PATCH edita y audita la diferencia', async () => {
    const role = await createRole();

    const response = await api()
      .patch(`/api/v1/roles/${role.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renombrado', dataScope: 'TEAM' })
      .expect(200);

    expect(response.body).toMatchObject({ name: 'Renombrado', dataScope: 'TEAM' });
    const row = await auditRow('role.updated', role.id);
    expect(row?.changes).toMatchObject({ name: { after: 'Renombrado' }, dataScope: { before: 'OWN', after: 'TEAM' } });
  });

  it('PATCH 400 si intenta cambiar el código', async () => {
    const role = await createRole();
    await api().patch(`/api/v1/roles/${role.id}`).set('Authorization', `Bearer ${adminToken}`).send({ code: 'otro' }).expect(400);
  });

  it('PUT permisos y opciones reemplaza y audita', async () => {
    const role = await createRole();
    const option = await ctx.prisma.menuOption.findUniqueOrThrow({ where: { key: 'admin-usuarios' } });

    const permissions = await api()
      .put(`/api/v1/roles/${role.id}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [await permissionId('usuarios.ver'), await permissionId('roles.ver')] })
      .expect(200);
    expect(permissions.body.permissionCodes).toEqual(['roles.ver', 'usuarios.ver']);
    expect(await auditRow('role.permissions_replaced', role.id)).not.toBeNull();

    const options = await api()
      .put(`/api/v1/roles/${role.id}/menu-options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [option.id] })
      .expect(200);
    expect(options.body.menuOptionIds).toEqual([option.id]);
    expect(await auditRow('role.menu_options_replaced', role.id)).not.toBeNull();
  });

  it('DELETE 409 ROLE_IN_USE con usuarios asignados', async () => {
    const role = await createRole();
    const user = await createTestUser(ctx.prisma);
    await ctx.prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

    const response = await api().delete(`/api/v1/roles/${role.id}`).set('Authorization', `Bearer ${adminToken}`).expect(409);
    expect(response.body.code).toBe('ROLE_IN_USE');
  });

  it('DELETE borra lógicamente, audita y deja de aparecer', async () => {
    const role = await createRole();

    await api().delete(`/api/v1/roles/${role.id}`).set('Authorization', `Bearer ${adminToken}`).expect(204);

    const stored = await ctx.prisma.role.findUniqueOrThrow({ where: { id: role.id } });
    expect(stored.deletedAt).not.toBeNull();
    expect(await auditRow('role.deleted', role.id)).not.toBeNull();
    await api().get(`/api/v1/roles/${role.id}`).set('Authorization', `Bearer ${adminToken}`).expect(404);
  });

  it('403 sin roles.editar / roles.eliminar', async () => {
    const role = await createRole();
    await api().patch(`/api/v1/roles/${role.id}`).set('Authorization', `Bearer ${userToken}`).send({}).expect(403);
    await api().delete(`/api/v1/roles/${role.id}`).set('Authorization', `Bearer ${userToken}`).expect(403);
  });
});

describe('GET /permissions', () => {
  it('devuelve el catálogo', async () => {
    const response = await api().get('/api/v1/permissions').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(response.body.map((permission: { code: string }) => permission.code)).toContain('usuarios.ver');
  });

  it('403 sin permisos.ver', async () => {
    await api().get('/api/v1/permissions').set('Authorization', `Bearer ${userToken}`).expect(403);
  });
});
