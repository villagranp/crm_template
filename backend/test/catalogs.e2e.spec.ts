import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { closeTestContext, createTestContext, type TestContext, tokenWithRoles, uniqueCode } from './support/test-app';

/**
 * Catálogos (PLAN-ADMIN, D9) contra PostgreSQL real. Cada prueba crea sus
 * catálogos con clave única y nunca comprueba totales globales.
 */

let ctx: TestContext;
let adminToken: string;
let userToken: string;

function api() {
  return request(ctx.app.getHttpServer());
}

function admin() {
  return { Authorization: `Bearer ${adminToken}` };
}

async function createCatalog(body: Record<string, unknown> = {}): Promise<{ id: string; key: string }> {
  const key = uniqueCode('cat');
  const response = await api()
    .post('/api/v1/catalogs')
    .set(admin())
    .send({ key, name: `Catálogo ${key}`, ...body })
    .expect(201);
  return { id: response.body.id as string, key };
}

async function createItem(catalogId: string, body: Record<string, unknown> = {}): Promise<{ id: string; code: string }> {
  const code = uniqueCode('ITEM');
  const response = await api()
    .post(`/api/v1/catalogs/${catalogId}/items`)
    .set(admin())
    .send({ code, label: `Elemento ${code}`, ...body })
    .expect(201);
  return { id: response.body.id as string, code };
}

async function auditCount(event: string, resourceType: string, resourceId: string): Promise<number> {
  return ctx.prisma.auditLog.count({ where: { event, resourceType, resourceId } });
}

beforeAll(async () => {
  ctx = await createTestContext();
  adminToken = (await tokenWithRoles(ctx, ['administrador'])).token;
  userToken = (await tokenWithRoles(ctx, ['usuario'])).token;
});

afterAll(async () => {
  await closeTestContext(ctx);
});

describe('GET /catalogs', () => {
  it('lista paginada con búsqueda y conteos (200)', async () => {
    const catalog = await createCatalog();
    await createItem(catalog.id);
    const inactive = await createItem(catalog.id);
    await api().patch(`/api/v1/catalogs/${catalog.id}/items/${inactive.id}`).set(admin()).send({ isActive: false }).expect(200);

    const response = await api().get('/api/v1/catalogs').query({ search: catalog.key }).set(admin()).expect(200);

    expect(response.body.pagination.totalItems).toBe(1);
    expect(response.body.data[0]).toMatchObject({ id: catalog.id, itemCount: 2, activeItemCount: 1, isSystem: false });
  });

  it('400 con un orden fuera de la lista blanca; 401; 403', async () => {
    await api().get('/api/v1/catalogs').query({ sortBy: 'isSystem' }).set(admin()).expect(400);
    await api().get('/api/v1/catalogs').expect(401);
    await api().get('/api/v1/catalogs').set('Authorization', `Bearer ${userToken}`).expect(403);
  });
});

describe('GET /catalogs/:id', () => {
  it('detalle con elementos ordenados (200)', async () => {
    const catalog = await createCatalog();
    const second = await createItem(catalog.id, { sortOrder: 20 });
    const first = await createItem(catalog.id, { sortOrder: 5 });

    const response = await api().get(`/api/v1/catalogs/${catalog.id}`).set(admin()).expect(200);

    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([first.id, second.id]);
  });

  it('404 y 403', async () => {
    await api().get(`/api/v1/catalogs/${randomUUID()}`).set(admin()).expect(404);
    await api().get(`/api/v1/catalogs/${randomUUID()}`).set('Authorization', `Bearer ${userToken}`).expect(403);
  });
});

describe('POST /catalogs', () => {
  it('crea (nunca de sistema) y audita catalog.created (201)', async () => {
    const catalog = await createCatalog({ description: 'Prueba' });
    const stored = await ctx.prisma.catalog.findUniqueOrThrow({ where: { id: catalog.id } });
    expect(stored.isSystem).toBe(false);
    expect(await auditCount('catalog.created', 'catalog', catalog.id)).toBe(1);
  });

  it('400 con clave inválida o isSystem; 409 con clave repetida', async () => {
    await api().post('/api/v1/catalogs').set(admin()).send({ key: 'Con Mayúsculas', name: 'X' }).expect(400);
    await api().post('/api/v1/catalogs').set(admin()).send({ key: uniqueCode('cat'), name: 'X', isSystem: true }).expect(400);
    const catalog = await createCatalog();
    await api().post('/api/v1/catalogs').set(admin()).send({ key: catalog.key, name: 'X' }).expect(409);
  });

  it('401 y 403', async () => {
    await api().post('/api/v1/catalogs').send({ key: uniqueCode('cat'), name: 'X' }).expect(401);
    await api()
      .post('/api/v1/catalogs')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ key: uniqueCode('cat'), name: 'X' })
      .expect(403);
  });
});

describe('PATCH /catalogs/:id', () => {
  it('actualiza y audita (200)', async () => {
    const catalog = await createCatalog();
    const response = await api().patch(`/api/v1/catalogs/${catalog.id}`).set(admin()).send({ name: 'Nuevo' }).expect(200);
    expect(response.body.name).toBe('Nuevo');
    expect(await auditCount('catalog.updated', 'catalog', catalog.id)).toBe(1);
  });

  it('409 SYSTEM_RESOURCE_READ_ONLY al cambiar la clave de un catálogo de sistema', async () => {
    const system = await ctx.prisma.catalog.create({ data: { key: uniqueCode('sys'), name: 'Sistema', isSystem: true } });

    const response = await api().patch(`/api/v1/catalogs/${system.id}`).set(admin()).send({ key: uniqueCode('otra') }).expect(409);
    expect(response.body.code).toBe('SYSTEM_RESOURCE_READ_ONLY');
    // El nombre sí se puede editar.
    await api().patch(`/api/v1/catalogs/${system.id}`).set(admin()).send({ name: 'Renombrado' }).expect(200);
  });

  it('409 con una clave ya usada; 400 con nombre nulo; 404; 403', async () => {
    const first = await createCatalog();
    const second = await createCatalog();
    await api().patch(`/api/v1/catalogs/${second.id}`).set(admin()).send({ key: first.key }).expect(409);
    await api().patch(`/api/v1/catalogs/${second.id}`).set(admin()).send({ name: null }).expect(400);
    await api().patch(`/api/v1/catalogs/${randomUUID()}`).set(admin()).send({ name: 'X' }).expect(404);
    await api().patch(`/api/v1/catalogs/${second.id}`).set('Authorization', `Bearer ${userToken}`).send({ name: 'X' }).expect(403);
  });
});

describe('DELETE /catalogs/:id', () => {
  it('elimina un catálogo vacío y audita (204)', async () => {
    const catalog = await createCatalog();
    await api().delete(`/api/v1/catalogs/${catalog.id}`).set(admin()).expect(204);
    expect(await ctx.prisma.catalog.findUnique({ where: { id: catalog.id } })).toBeNull();
    expect(await auditCount('catalog.deleted', 'catalog', catalog.id)).toBe(1);
  });

  it('409 CATALOG_NOT_EMPTY aunque los elementos estén inactivos', async () => {
    const catalog = await createCatalog();
    await createItem(catalog.id, { isActive: false });
    const response = await api().delete(`/api/v1/catalogs/${catalog.id}`).set(admin()).expect(409);
    expect(response.body.code).toBe('CATALOG_NOT_EMPTY');
  });

  it('409 SYSTEM_RESOURCE_READ_ONLY con un catálogo de sistema', async () => {
    const system = await ctx.prisma.catalog.create({ data: { key: uniqueCode('sys'), name: 'Sistema', isSystem: true } });
    const response = await api().delete(`/api/v1/catalogs/${system.id}`).set(admin()).expect(409);
    expect(response.body.code).toBe('SYSTEM_RESOURCE_READ_ONLY');
  });

  it('404, 401 y 403', async () => {
    await api().delete(`/api/v1/catalogs/${randomUUID()}`).set(admin()).expect(404);
    const catalog = await createCatalog();
    await api().delete(`/api/v1/catalogs/${catalog.id}`).expect(401);
    await api().delete(`/api/v1/catalogs/${catalog.id}`).set('Authorization', `Bearer ${userToken}`).expect(403);
  });
});

describe('POST /catalogs/:id/items', () => {
  it('crea con metadata, al final del orden, y audita (201)', async () => {
    const catalog = await createCatalog();
    await createItem(catalog.id, { sortOrder: 40 });

    const response = await api()
      .post(`/api/v1/catalogs/${catalog.id}/items`)
      .set(admin())
      .send({ code: 'MAYORISTA', label: 'Mayorista', metadata: { color: 'azul' } })
      .expect(201);

    expect(response.body).toMatchObject({ code: 'MAYORISTA', metadata: { color: 'azul' }, sortOrder: 50, isActive: true });
    expect(await auditCount('catalog_item.created', 'catalog_item', response.body.id as string)).toBe(1);
  });

  it('400 con metadata que no es un objeto o es demasiado grande', async () => {
    const catalog = await createCatalog();
    const url = `/api/v1/catalogs/${catalog.id}/items`;
    await api().post(url).set(admin()).send({ code: 'A', label: 'A', metadata: [1, 2] }).expect(400);
    await api().post(url).set(admin()).send({ code: 'A', label: 'A', metadata: 'texto' }).expect(400);
    await api().post(url).set(admin()).send({ code: 'A', label: 'A', metadata: { x: 'y'.repeat(5000) } }).expect(400);
  });

  it('409 con un código repetido en el mismo catálogo; el mismo código vale en otro', async () => {
    const catalog = await createCatalog();
    const other = await createCatalog();
    const item = await createItem(catalog.id);
    await api().post(`/api/v1/catalogs/${catalog.id}/items`).set(admin()).send({ code: item.code, label: 'X' }).expect(409);
    await api().post(`/api/v1/catalogs/${other.id}/items`).set(admin()).send({ code: item.code, label: 'X' }).expect(201);
  });

  it('404, 401 y 403', async () => {
    await api().post(`/api/v1/catalogs/${randomUUID()}/items`).set(admin()).send({ code: 'A', label: 'A' }).expect(404);
    const catalog = await createCatalog();
    await api().post(`/api/v1/catalogs/${catalog.id}/items`).send({ code: 'A', label: 'A' }).expect(401);
    await api()
      .post(`/api/v1/catalogs/${catalog.id}/items`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ code: 'A', label: 'A' })
      .expect(403);
  });
});

describe('PATCH /catalogs/:id/items/:itemId', () => {
  it('edita, reordena y desactiva, con auditoría (200)', async () => {
    const catalog = await createCatalog();
    const item = await createItem(catalog.id);

    const response = await api()
      .patch(`/api/v1/catalogs/${catalog.id}/items/${item.id}`)
      .set(admin())
      .send({ label: 'Nuevo', sortOrder: 3, isActive: false, metadata: null })
      .expect(200);

    expect(response.body).toMatchObject({ label: 'Nuevo', sortOrder: 3, isActive: false, metadata: null });
    expect(await auditCount('catalog_item.updated', 'catalog_item', item.id)).toBe(1);
  });

  it('el código es inmutable (400)', async () => {
    const catalog = await createCatalog();
    const item = await createItem(catalog.id);
    await api().patch(`/api/v1/catalogs/${catalog.id}/items/${item.id}`).set(admin()).send({ code: 'OTRO' }).expect(400);
  });

  it('404 si el elemento es de otro catálogo; 401; 403', async () => {
    const catalog = await createCatalog();
    const other = await createCatalog();
    const item = await createItem(catalog.id);
    await api().patch(`/api/v1/catalogs/${other.id}/items/${item.id}`).set(admin()).send({ label: 'X' }).expect(404);
    await api().patch(`/api/v1/catalogs/${catalog.id}/items/${item.id}`).send({ label: 'X' }).expect(401);
    await api()
      .patch(`/api/v1/catalogs/${catalog.id}/items/${item.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ label: 'X' })
      .expect(403);
  });
});
