import request from 'supertest';

import { type TestContext, closeTestContext, createTestContext, tokenWithRoles, uniqueCode } from './support/test-app';

/**
 * Integración de opciones de menú y módulos (PLAN-ADMIN paso 4: D6, D7, D11).
 * Las opciones de sistema sólo se usan para comprobar que se rechazan cambios.
 */

let ctx: TestContext;
let adminToken: string;
let userToken: string;
let moduleId: string;

function api() {
  return request(ctx.app.getHttpServer());
}

function auditRow(event: string, resourceId: string) {
  return ctx.prisma.auditLog.findFirst({ where: { event, resourceId }, orderBy: { occurredAt: 'desc' } });
}

function createOption(body: Record<string, unknown>) {
  return api()
    .post('/api/v1/menu-options')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ moduleId, key: uniqueCode('opcion'), label: 'Opción de prueba', ...body });
}

async function createGroup(parentId: string | null = null): Promise<string> {
  const response = await createOption({ kind: 'GROUP', parentId }).expect(201);
  return response.body.id as string;
}

beforeAll(async () => {
  ctx = await createTestContext();
  adminToken = (await tokenWithRoles(ctx, ['administrador'])).token;
  userToken = (await tokenWithRoles(ctx, ['usuario'])).token;
  moduleId = (await ctx.prisma.appModule.findUniqueOrThrow({ where: { key: 'administracion' } })).id;
});

afterAll(async () => {
  await closeTestContext(ctx);
});

describe('lecturas', () => {
  it('GET /menu-options incluye las inactivas', async () => {
    const created = await createOption({ kind: 'GROUP', isActive: false }).expect(201);

    const response = await api().get('/api/v1/menu-options').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(response.body).toContainEqual(expect.objectContaining({ id: created.body.id, isActive: false }));
  });

  it('GET /menu-options/routes devuelve el registro', async () => {
    const response = await api().get('/api/v1/menu-options/routes').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(response.body).toContainEqual({ path: '/administracion/usuarios', label: 'Usuarios' });
  });

  it('GET /modules', async () => {
    const response = await api().get('/api/v1/modules').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(response.body.map((module: { key: string }) => module.key)).toContain('administracion');
  });

  it('401 y 403', async () => {
    await api().get('/api/v1/menu-options').expect(401);
    for (const path of ['/api/v1/menu-options', '/api/v1/menu-options/routes', '/api/v1/modules']) {
      await api().get(path).set('Authorization', `Bearer ${userToken}`).expect(403);
    }
  });
});

describe('POST /menu-options (D6)', () => {
  it('crea un LINK hacia una ruta registrada y audita', async () => {
    const parentId = await createGroup();
    const response = await createOption({ kind: 'LINK', path: '/administracion/roles', parentId }).expect(201);

    expect(response.headers.location).toBe(`/api/v1/menu-options/${response.body.id}`);
    expect(response.body).toMatchObject({ kind: 'LINK', parentId, isSystem: false });
    expect(await auditRow('menu_option.created', response.body.id)).not.toBeNull();
  });

  it('422 ROUTE_NOT_REGISTERED', async () => {
    const response = await createOption({ kind: 'LINK', path: '/no-existe' }).expect(422);
    expect(response.body.code).toBe('ROUTE_NOT_REGISTERED');
  });

  it('422 si un GROUP lleva ruta', async () => {
    const response = await createOption({ kind: 'GROUP', path: '/administracion/roles' }).expect(422);
    expect(response.body.code).toBe('INVALID_MENU_STRUCTURE');
  });

  it('409 con una clave repetida', async () => {
    const key = uniqueCode('opcion');
    await createOption({ key, kind: 'GROUP' }).expect(201);
    await createOption({ key, kind: 'GROUP' }).expect(409);
  });

  it('400 con una clave inválida', async () => {
    await createOption({ key: 'Mayúsculas', kind: 'GROUP' }).expect(400);
  });

  it('403 sin opciones.crear', async () => {
    await api().post('/api/v1/menu-options').set('Authorization', `Bearer ${userToken}`).send({}).expect(403);
  });
});

describe('PATCH /menu-options/:id (D7)', () => {
  it('edita una opción propia y audita', async () => {
    const id = await createGroup();
    const response = await api()
      .patch(`/api/v1/menu-options/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Nuevo nombre', isActive: false })
      .expect(200);

    expect(response.body).toMatchObject({ label: 'Nuevo nombre', isActive: false });
    expect((await auditRow('menu_option.updated', id))?.changes).toMatchObject({ label: { after: 'Nuevo nombre' } });
  });

  it('400 si intenta cambiar la clave', async () => {
    const id = await createGroup();
    await api().patch(`/api/v1/menu-options/${id}`).set('Authorization', `Bearer ${adminToken}`).send({ key: 'otra' }).expect(400);
  });

  it('409 SYSTEM_RESOURCE_READ_ONLY al cambiar la ruta de una opción de sistema', async () => {
    const system = await ctx.prisma.menuOption.findUniqueOrThrow({ where: { key: 'admin-usuarios' } });
    const response = await api()
      .patch(`/api/v1/menu-options/${system.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ path: '/administracion/roles' })
      .expect(409);
    expect(response.body.code).toBe('SYSTEM_RESOURCE_READ_ONLY');
  });

  it('422 MENU_CYCLE al meter un grupo dentro de su hijo', async () => {
    const parent = await createGroup();
    const child = await createGroup(parent);

    const response = await api()
      .patch(`/api/v1/menu-options/${parent}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ parentId: child })
      .expect(422);
    expect(response.body.code).toBe('MENU_CYCLE');
  });

  it('403 sin opciones.editar', async () => {
    const id = await createGroup();
    await api().patch(`/api/v1/menu-options/${id}`).set('Authorization', `Bearer ${userToken}`).send({}).expect(403);
  });
});

describe('PUT /menu-options/order', () => {
  it('mueve y reordena en bloque y audita cada opción', async () => {
    const group = await createGroup();
    const link = (await createOption({ kind: 'LINK', path: '/administracion/equipos' }).expect(201)).body.id as string;

    const response = await api()
      .put('/api/v1/menu-options/order')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ id: link, parentId: group, sortOrder: 7 }] })
      .expect(200);

    expect(response.body).toContainEqual(expect.objectContaining({ id: link, parentId: group, sortOrder: 7 }));
    expect((await auditRow('menu_option.reordered', link))?.changes).toEqual({
      parentId: { before: null, after: group },
      sortOrder: { before: 0, after: 7 },
    });
  });

  it('422 MENU_CYCLE', async () => {
    const a = await createGroup();
    const b = await createGroup(a);

    const response = await api()
      .put('/api/v1/menu-options/order')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ id: a, parentId: b, sortOrder: 1 }] })
      .expect(422);
    expect(response.body.code).toBe('MENU_CYCLE');
  });

  it('400 con una lista vacía', async () => {
    await api().put('/api/v1/menu-options/order').set('Authorization', `Bearer ${adminToken}`).send({ items: [] }).expect(400);
  });

  it('403 sin opciones.editar', async () => {
    await api().put('/api/v1/menu-options/order').set('Authorization', `Bearer ${userToken}`).send({ items: [] }).expect(403);
  });
});

describe('DELETE /menu-options/:id (D7)', () => {
  it('borra lógicamente y audita', async () => {
    const id = await createGroup();

    await api().delete(`/api/v1/menu-options/${id}`).set('Authorization', `Bearer ${adminToken}`).expect(204);
    expect((await ctx.prisma.menuOption.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    expect(await auditRow('menu_option.deleted', id)).not.toBeNull();
  });

  it('409 HAS_CHILDREN', async () => {
    const parent = await createGroup();
    await createGroup(parent);

    const response = await api().delete(`/api/v1/menu-options/${parent}`).set('Authorization', `Bearer ${adminToken}`).expect(409);
    expect(response.body.code).toBe('HAS_CHILDREN');
  });

  it('409 SYSTEM_RESOURCE_READ_ONLY con una opción de sistema', async () => {
    const system = await ctx.prisma.menuOption.findUniqueOrThrow({ where: { key: 'admin-auditoria' } });
    const response = await api().delete(`/api/v1/menu-options/${system.id}`).set('Authorization', `Bearer ${adminToken}`).expect(409);
    expect(response.body.code).toBe('SYSTEM_RESOURCE_READ_ONLY');
  });

  it('403 sin opciones.eliminar', async () => {
    const id = await createGroup();
    await api().delete(`/api/v1/menu-options/${id}`).set('Authorization', `Bearer ${userToken}`).expect(403);
  });
});
