import { randomUUID } from 'node:crypto';

import request from 'supertest';

import {
  closeTestContext,
  createTestContext,
  createTestUser,
  type TestContext,
  tokenWithRoles,
  uniqueCode,
} from './support/test-app';

/**
 * Equipos (PLAN-ADMIN, D8) contra PostgreSQL real. Cada prueba crea sus
 * equipos con código único: los archivos corren en paralelo sobre el mismo
 * esquema y no se comprueban totales globales.
 */

let ctx: TestContext;
let adminToken: string;
let userToken: string;

function api() {
  return request(ctx.app.getHttpServer());
}

async function createTeam(body: Record<string, unknown> = {}): Promise<{ id: string; code: string }> {
  const code = uniqueCode('team');
  const response = await api()
    .post('/api/v1/teams')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ code, name: `Equipo ${code}`, ...body })
    .expect(201);
  return { id: response.body.id as string, code };
}

async function auditRows(event: string, resourceId: string) {
  return ctx.prisma.auditLog.findMany({ where: { event, resourceType: 'team', resourceId } });
}

beforeAll(async () => {
  ctx = await createTestContext();
  adminToken = (await tokenWithRoles(ctx, ['administrador'])).token;
  userToken = (await tokenWithRoles(ctx, ['usuario'])).token;
});

afterAll(async () => {
  await closeTestContext(ctx);
});

describe('GET /teams', () => {
  it('lista paginada con búsqueda (200)', async () => {
    const team = await createTeam();

    const response = await api()
      .get('/api/v1/teams')
      .query({ search: team.code, pageSize: 5 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.pagination).toMatchObject({ page: 1, pageSize: 5, totalItems: 1 });
    expect(response.body.data[0]).toMatchObject({ id: team.id, code: team.code, memberCount: 0, childCount: 0 });
  });

  it('filtra por padre', async () => {
    const parent = await createTeam();
    const child = await createTeam({ parentId: parent.id });

    const response = await api()
      .get('/api/v1/teams')
      .query({ parentId: parent.id })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data.map((team: { id: string }) => team.id)).toEqual([child.id]);
    expect(response.body.data[0].parentName).toBe(`Equipo ${parent.code}`);
  });

  it('rechaza un orden fuera de la lista blanca (400)', async () => {
    await api().get('/api/v1/teams').query({ sortBy: 'deletedAt' }).set('Authorization', `Bearer ${adminToken}`).expect(400);
  });

  it('exige sesión (401) y permiso (403)', async () => {
    await api().get('/api/v1/teams').expect(401);
    await api().get('/api/v1/teams').set('Authorization', `Bearer ${userToken}`).expect(403);
  });
});

describe('GET /teams/:id', () => {
  it('devuelve el detalle con miembros (200)', async () => {
    const team = await createTeam();
    const response = await api().get(`/api/v1/teams/${team.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(response.body).toMatchObject({ id: team.id, members: [] });
  });

  it('404 si no existe; 400 si el id no es UUID; 403 sin permiso', async () => {
    await api().get(`/api/v1/teams/${randomUUID()}`).set('Authorization', `Bearer ${adminToken}`).expect(404);
    await api().get('/api/v1/teams/no-uuid').set('Authorization', `Bearer ${adminToken}`).expect(400);
    await api().get(`/api/v1/teams/${randomUUID()}`).set('Authorization', `Bearer ${userToken}`).expect(403);
  });
});

describe('POST /teams', () => {
  it('crea con responsable y audita team.created (201)', async () => {
    const manager = await createTestUser(ctx.prisma);
    const team = await createTeam({ managerId: manager.id, description: 'Zona norte' });

    const stored = await ctx.prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    expect(stored).toMatchObject({ managerId: manager.id, description: 'Zona norte', isActive: true });
    expect(await auditRows('team.created', team.id)).toHaveLength(1);
  });

  it('409 con un código repetido', async () => {
    const team = await createTeam();
    const response = await api()
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: team.code, name: 'Otro' })
      .expect(409);
    expect(response.body.code).toBe('RESOURCE_CONFLICT');
  });

  it('400 con datos inválidos o campos no declarados', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    await api().post('/api/v1/teams').set(auth).send({ name: 'Sin código' }).expect(400);
    await api().post('/api/v1/teams').set(auth).send({ code: 'con espacios', name: 'X' }).expect(400);
    await api().post('/api/v1/teams').set(auth).send({ code: uniqueCode('t'), name: 'X', isSystem: true }).expect(400);
  });

  it('404 con un padre o responsable inexistente', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    await api().post('/api/v1/teams').set(auth).send({ code: uniqueCode('t'), name: 'X', parentId: randomUUID() }).expect(404);
    await api().post('/api/v1/teams').set(auth).send({ code: uniqueCode('t'), name: 'X', managerId: randomUUID() }).expect(404);
  });

  it('401 y 403', async () => {
    await api().post('/api/v1/teams').send({ code: uniqueCode('t'), name: 'X' }).expect(401);
    await api()
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ code: uniqueCode('t'), name: 'X' })
      .expect(403);
  });
});

describe('PATCH /teams/:id', () => {
  it('actualiza y audita la diferencia (200)', async () => {
    const team = await createTeam();

    const response = await api()
      .patch(`/api/v1/teams/${team.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renombrado', isActive: false })
      .expect(200);

    expect(response.body).toMatchObject({ name: 'Renombrado', isActive: false, code: team.code });
    const [row] = await auditRows('team.updated', team.id);
    expect(row?.changes).toMatchObject({ name: { after: 'Renombrado' }, isActive: { before: true, after: false } });
  });

  it('el código es inmutable (400)', async () => {
    const team = await createTeam();
    await api()
      .patch(`/api/v1/teams/${team.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'otro-codigo' })
      .expect(400);
  });

  it('422 TEAM_CYCLE al colgar un equipo de su nieto o de sí mismo', async () => {
    const root = await createTeam();
    const child = await createTeam({ parentId: root.id });
    const grandchild = await createTeam({ parentId: child.id });
    const auth = { Authorization: `Bearer ${adminToken}` };

    const cycle = await api().patch(`/api/v1/teams/${root.id}`).set(auth).send({ parentId: grandchild.id }).expect(422);
    expect(cycle.body.code).toBe('TEAM_CYCLE');
    const self = await api().patch(`/api/v1/teams/${root.id}`).set(auth).send({ parentId: root.id }).expect(422);
    expect(self.body.code).toBe('TEAM_CYCLE');
  });

  it('permite volver a raíz con parentId null', async () => {
    const parent = await createTeam();
    const child = await createTeam({ parentId: parent.id });
    const response = await api()
      .patch(`/api/v1/teams/${child.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ parentId: null })
      .expect(200);
    expect(response.body.parentId).toBeNull();
  });

  it('404 si no existe; 403 sin permiso', async () => {
    await api().patch(`/api/v1/teams/${randomUUID()}`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'X' }).expect(404);
    const team = await createTeam();
    await api().patch(`/api/v1/teams/${team.id}`).set('Authorization', `Bearer ${userToken}`).send({ name: 'X' }).expect(403);
    await api().patch(`/api/v1/teams/${team.id}`).send({ name: 'X' }).expect(401);
  });
});

describe('PUT /teams/:id/members', () => {
  it('reemplaza miembros y deja un único equipo principal por usuario', async () => {
    const first = await createTeam();
    const second = await createTeam();
    const user = await createTestUser(ctx.prisma);
    const other = await createTestUser(ctx.prisma);
    const auth = { Authorization: `Bearer ${adminToken}` };

    await api()
      .put(`/api/v1/teams/${first.id}/members`)
      .set(auth)
      .send({ members: [{ userId: user.id, isPrimary: true }, { userId: other.id, isPrimary: false }] })
      .expect(200);

    const response = await api()
      .put(`/api/v1/teams/${second.id}/members`)
      .set(auth)
      .send({ members: [{ userId: user.id, isPrimary: true }] })
      .expect(200);

    expect(response.body.members).toEqual([expect.objectContaining({ userId: user.id, isPrimary: true })]);
    const primaries = await ctx.prisma.teamMember.findMany({ where: { userId: user.id, isPrimary: true } });
    expect(primaries.map((membership) => membership.teamId)).toEqual([second.id]);
    expect(await auditRows('team.members_replaced', second.id)).toHaveLength(1);

    // Quitar a un miembro.
    const trimmed = await api()
      .put(`/api/v1/teams/${first.id}/members`)
      .set(auth)
      .send({ members: [{ userId: other.id, isPrimary: false }] })
      .expect(200);
    expect(trimmed.body.members.map((member: { userId: string }) => member.userId)).toEqual([other.id]);
  });

  it('400 con usuarios repetidos o cuerpo inválido', async () => {
    const team = await createTeam();
    const user = await createTestUser(ctx.prisma);
    const auth = { Authorization: `Bearer ${adminToken}` };

    await api()
      .put(`/api/v1/teams/${team.id}/members`)
      .set(auth)
      .send({ members: [{ userId: user.id, isPrimary: true }, { userId: user.id, isPrimary: false }] })
      .expect(400);
    await api().put(`/api/v1/teams/${team.id}/members`).set(auth).send({ members: [{ userId: 'x' }] }).expect(400);
  });

  it('404 con un usuario inexistente o un equipo inexistente', async () => {
    const team = await createTeam();
    const auth = { Authorization: `Bearer ${adminToken}` };
    await api()
      .put(`/api/v1/teams/${team.id}/members`)
      .set(auth)
      .send({ members: [{ userId: randomUUID(), isPrimary: false }] })
      .expect(404);
    await api().put(`/api/v1/teams/${randomUUID()}/members`).set(auth).send({ members: [] }).expect(404);
  });

  it('401 y 403', async () => {
    const team = await createTeam();
    await api().put(`/api/v1/teams/${team.id}/members`).send({ members: [] }).expect(401);
    await api().put(`/api/v1/teams/${team.id}/members`).set('Authorization', `Bearer ${userToken}`).send({ members: [] }).expect(403);
  });
});

describe('DELETE /teams/:id', () => {
  it('borrado lógico de un equipo vacío y auditoría (204)', async () => {
    const team = await createTeam();

    await api().delete(`/api/v1/teams/${team.id}`).set('Authorization', `Bearer ${adminToken}`).expect(204);

    const stored = await ctx.prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    expect(stored.deletedAt).not.toBeNull();
    expect(await auditRows('team.deleted', team.id)).toHaveLength(1);
    await api().get(`/api/v1/teams/${team.id}`).set('Authorization', `Bearer ${adminToken}`).expect(404);
    // El código queda reservado.
    await api()
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: team.code, name: 'Reutilizado' })
      .expect(409);
  });

  it('409 HAS_CHILDREN con subequipos o miembros', async () => {
    const parent = await createTeam();
    await createTeam({ parentId: parent.id });
    const withMembers = await createTeam();
    const user = await createTestUser(ctx.prisma);
    await ctx.prisma.teamMember.create({ data: { teamId: withMembers.id, userId: user.id } });
    const auth = { Authorization: `Bearer ${adminToken}` };

    const children = await api().delete(`/api/v1/teams/${parent.id}`).set(auth).expect(409);
    expect(children.body.code).toBe('HAS_CHILDREN');
    const members = await api().delete(`/api/v1/teams/${withMembers.id}`).set(auth).expect(409);
    expect(members.body.code).toBe('HAS_CHILDREN');
  });

  it('404, 401 y 403', async () => {
    await api().delete(`/api/v1/teams/${randomUUID()}`).set('Authorization', `Bearer ${adminToken}`).expect(404);
    const team = await createTeam();
    await api().delete(`/api/v1/teams/${team.id}`).expect(401);
    await api().delete(`/api/v1/teams/${team.id}`).set('Authorization', `Bearer ${userToken}`).expect(403);
  });
});
