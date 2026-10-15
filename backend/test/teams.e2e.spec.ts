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

/**
 * Módulo 7 · equipos del usuario y regla de administrador (07 F.2, RN-07.10,
 * RN-07.45; PF-07.4, PF-07.21, PF-07.39, PF-07.49; addendum de ADR-020).
 */
describe('PUT /users/:id/teams (D-07.4)', () => {
  let gestorToken: string;

  beforeAll(async () => {
    gestorToken = (await tokenWithRoles(ctx, ['gestor-accesos'])).token;
  });

  async function userAuditRow(event: string, userId: string) {
    return ctx.prisma.auditLog.findFirst({ where: { event, resourceType: 'user', resourceId: userId } });
  }

  it('PF-07.4: el administrador asigna dos equipos con uno principal; coincide con GET /users/:id y GET /teams/:id; audita', async () => {
    const first = await createTeam();
    const second = await createTeam();
    const previous = await createTeam();
    const user = await createTestUser(ctx.prisma);
    await ctx.prisma.teamMember.create({ data: { teamId: previous.id, userId: user.id, isPrimary: true } });
    const auth = { Authorization: `Bearer ${adminToken}` };

    const response = await api()
      .put(`/api/v1/users/${user.id}/teams`)
      .set(auth)
      .send({ teams: [{ teamId: first.id, isPrimary: true }, { teamId: second.id, isPrimary: false }] })
      .expect(200);

    const expected = [
      { id: first.id, name: `Equipo ${first.code}`, isPrimary: true },
      { id: second.id, name: `Equipo ${second.code}`, isPrimary: false },
    ];
    expect([...response.body.teams].sort(byId)).toEqual([...expected].sort(byId));

    const detail = await api().get(`/api/v1/users/${user.id}`).set(auth).expect(200);
    expect([...detail.body.teams].sort(byId)).toEqual([...expected].sort(byId));
    const firstTeam = await api().get(`/api/v1/teams/${first.id}`).set(auth).expect(200);
    expect(firstTeam.body.members).toEqual([expect.objectContaining({ userId: user.id, isPrimary: true })]);
    const previousTeam = await api().get(`/api/v1/teams/${previous.id}`).set(auth).expect(200);
    expect(previousTeam.body.members).toEqual([]);

    // Un evento por equipo afectado (los dos nuevos y el que pierde al miembro) y otro sobre el usuario.
    for (const team of [first, second, previous]) {
      expect(await auditRows('team.members_replaced', team.id)).toHaveLength(1);
    }
    const userRow = await userAuditRow('user.teams_replaced', user.id);
    expect(userRow?.changes).toMatchObject({
      teams: { before: [`${previous.id}:primary`], after: expect.arrayContaining([`${first.id}:primary`, second.id]) },
    });
  });

  it('lista vacía: deja al usuario sin equipos', async () => {
    const team = await createTeam();
    const user = await createTestUser(ctx.prisma);
    await ctx.prisma.teamMember.create({ data: { teamId: team.id, userId: user.id, isPrimary: true } });

    const response = await api()
      .put(`/api/v1/users/${user.id}/teams`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teams: [] })
      .expect(200);

    expect(response.body).toEqual({ teams: [] });
    expect(await ctx.prisma.teamMember.count({ where: { userId: user.id } })).toBe(0);
  });

  it('sin cambios (mismo conjunto y principal): 200 sin escribir ni auditar', async () => {
    const team = await createTeam();
    const user = await createTestUser(ctx.prisma);
    const membership = await ctx.prisma.teamMember.create({ data: { teamId: team.id, userId: user.id, isPrimary: true } });

    const response = await api()
      .put(`/api/v1/users/${user.id}/teams`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teams: [{ teamId: team.id, isPrimary: true }] })
      .expect(200);

    expect(response.body.teams).toEqual([{ id: team.id, name: `Equipo ${team.code}`, isPrimary: true }]);
    expect(await ctx.prisma.teamMember.findUniqueOrThrow({ where: { id: membership.id } })).toEqual(membership);
    expect(await auditRows('team.members_replaced', team.id)).toHaveLength(0);
    expect(await userAuditRow('user.teams_replaced', user.id)).toBeNull();
  });

  it('no borra en silencio la pertenencia a un equipo eliminado (fuera de `before` y de la auditoría); sí le quita la marca de principal', async () => {
    const target = await createTeam();
    const user = await createTestUser(ctx.prisma);
    const deleted = await ctx.prisma.team.create({
      data: { code: uniqueCode('borrado'), name: 'Borrado', deletedAt: new Date(), isActive: false },
    });
    await ctx.prisma.teamMember.create({ data: { teamId: deleted.id, userId: user.id, isPrimary: true } });

    await api()
      .put(`/api/v1/users/${user.id}/teams`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teams: [{ teamId: target.id, isPrimary: true }] })
      .expect(200);

    const kept = await ctx.prisma.teamMember.findUniqueOrThrow({ where: { teamId_userId: { teamId: deleted.id, userId: user.id } } });
    expect(kept.isPrimary).toBe(false);
    expect(await auditRows('team.members_replaced', deleted.id)).toHaveLength(0);
    const userRow = await userAuditRow('user.teams_replaced', user.id);
    expect(userRow?.changes).toMatchObject({ teams: { before: [], after: [`${target.id}:primary`] } });
  });

  it('409 con dos equipos principales, sin tocar nada', async () => {
    const first = await createTeam();
    const second = await createTeam();
    const user = await createTestUser(ctx.prisma);

    const response = await api()
      .put(`/api/v1/users/${user.id}/teams`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teams: [{ teamId: first.id, isPrimary: true }, { teamId: second.id, isPrimary: true }] })
      .expect(409);

    expect(response.body.code).toBe('RESOURCE_CONFLICT');
    expect(await ctx.prisma.teamMember.count({ where: { userId: user.id } })).toBe(0);
  });

  it('422 UNKNOWN_REFERENCE con un equipo inexistente o eliminado; 404 con un usuario inexistente', async () => {
    const user = await createTestUser(ctx.prisma);
    const deleted = await ctx.prisma.team.create({
      data: { code: uniqueCode('borrado'), name: 'Borrado', deletedAt: new Date(), isActive: false },
    });
    const auth = { Authorization: `Bearer ${adminToken}` };

    for (const teamId of [randomUUID(), deleted.id]) {
      const response = await api()
        .put(`/api/v1/users/${user.id}/teams`)
        .set(auth)
        .send({ teams: [{ teamId, isPrimary: false }] })
        .expect(422);
      expect(response.body.code).toBe('UNKNOWN_REFERENCE');
    }
    await api().put(`/api/v1/users/${randomUUID()}/teams`).set(auth).send({ teams: [] }).expect(404);
  });

  it('400 con equipos repetidos, más de 50, cuerpo inválido o id no UUID', async () => {
    const team = await createTeam();
    const user = await createTestUser(ctx.prisma);
    const auth = { Authorization: `Bearer ${adminToken}` };
    const url = `/api/v1/users/${user.id}/teams`;

    await api()
      .put(url)
      .set(auth)
      .send({ teams: [{ teamId: team.id, isPrimary: true }, { teamId: team.id, isPrimary: false }] })
      .expect(400);
    const tooMany = Array.from({ length: 51 }, () => ({ teamId: randomUUID(), isPrimary: false }));
    await api().put(url).set(auth).send({ teams: tooMany }).expect(400);
    await api().put(url).set(auth).send({ teams: [{ teamId: 'x' }] }).expect(400);
    await api().put(url).set(auth).send({}).expect(400);
    await api().put('/api/v1/users/no-uuid/teams').set(auth).send({ teams: [] }).expect(400);
  });

  it('PF-07.21 / PF-07.39: 401 sin sesión, 403 PERMISSION_DENIED sin equipos.editar, 403 ADMIN_ONLY a un no administrador', async () => {
    const team = await createTeam();
    const user = await createTestUser(ctx.prisma);
    const url = `/api/v1/users/${user.id}/teams`;
    const body = { teams: [{ teamId: team.id, isPrimary: true }] };

    await api().put(url).send(body).expect(401);
    const denied = await api().put(url).set('Authorization', `Bearer ${userToken}`).send(body).expect(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');
    const adminOnly = await api().put(url).set('Authorization', `Bearer ${gestorToken}`).send(body).expect(403);
    expect(adminOnly.body.code).toBe('ADMIN_ONLY');
    expect(await ctx.prisma.teamMember.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe('RN-07.45 · la composición de un equipo es exclusiva del administrador (PF-07.49)', () => {
  let gestorToken: string;

  beforeAll(async () => {
    gestorToken = (await tokenWithRoles(ctx, ['gestor-accesos'])).token;
  });

  const gestor = () => ({ Authorization: `Bearer ${gestorToken}` });

  async function expectAdminOnly(response: request.Response): Promise<void> {
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ADMIN_ONLY');
  }

  it('reemplazar miembros → 403 ADMIN_ONLY y nada cambia', async () => {
    const team = await createTeam();
    const user = await createTestUser(ctx.prisma);

    await expectAdminOnly(
      await api().put(`/api/v1/teams/${team.id}/members`).set(gestor()).send({ members: [{ userId: user.id, isPrimary: true }] }),
    );
    expect(await ctx.prisma.teamMember.count({ where: { teamId: team.id } })).toBe(0);
  });

  it('crear con responsable o con padre → 403 ADMIN_ONLY; sin ellos → 201', async () => {
    const parent = await createTeam();
    const manager = await createTestUser(ctx.prisma);

    const withManager = uniqueCode('t');
    await expectAdminOnly(await api().post('/api/v1/teams').set(gestor()).send({ code: withManager, name: 'X', managerId: manager.id }));
    const withParent = uniqueCode('t');
    await expectAdminOnly(await api().post('/api/v1/teams').set(gestor()).send({ code: withParent, name: 'X', parentId: parent.id }));
    expect(await ctx.prisma.team.count({ where: { code: { in: [withManager, withParent] } } })).toBe(0);

    await api().post('/api/v1/teams').set(gestor()).send({ code: uniqueCode('t'), name: 'Sin responsable', parentId: null }).expect(201);
  });

  it('cambiar responsable o padre → 403 ADMIN_ONLY; nombre y descripción → 200', async () => {
    const parent = await createTeam();
    const team = await createTeam();
    const manager = await createTestUser(ctx.prisma);

    await expectAdminOnly(await api().patch(`/api/v1/teams/${team.id}`).set(gestor()).send({ managerId: manager.id }));
    await expectAdminOnly(await api().patch(`/api/v1/teams/${team.id}`).set(gestor()).send({ parentId: parent.id }));
    const stored = await ctx.prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    expect(stored).toMatchObject({ managerId: null, parentId: null });

    const renamed = await api()
      .patch(`/api/v1/teams/${team.id}`)
      .set(gestor())
      .send({ name: 'Renombrado por el gestor', description: 'Nueva descripción', parentId: null })
      .expect(200);
    expect(renamed.body).toMatchObject({ name: 'Renombrado por el gestor', description: 'Nueva descripción' });
  });

  it('eliminar con miembros o subequipos → 403 ADMIN_ONLY (el administrador recibe 409 HAS_CHILDREN); vacío → 204', async () => {
    const parent = await createTeam();
    await createTeam({ parentId: parent.id });
    const withMembers = await createTeam();
    const user = await createTestUser(ctx.prisma);
    await ctx.prisma.teamMember.create({ data: { teamId: withMembers.id, userId: user.id } });

    await expectAdminOnly(await api().delete(`/api/v1/teams/${parent.id}`).set(gestor()));
    await expectAdminOnly(await api().delete(`/api/v1/teams/${withMembers.id}`).set(gestor()));
    expect(await ctx.prisma.team.count({ where: { id: { in: [parent.id, withMembers.id] }, deletedAt: null } })).toBe(2);

    const admin = await api().delete(`/api/v1/teams/${withMembers.id}`).set('Authorization', `Bearer ${adminToken}`).expect(409);
    expect(admin.body.code).toBe('HAS_CHILDREN');

    const empty = await createTeam();
    await api().delete(`/api/v1/teams/${empty.id}`).set(gestor()).expect(204);
  });

  it('decisión 2026-10-14: activar o desactivar un equipo con miembros o subequipos → 403 ADMIN_ONLY y nada cambia; vacío o mismo valor → 200; el administrador → 200 auditado', async () => {
    const withMembers = await createTeam();
    const user = await createTestUser(ctx.prisma);
    await ctx.prisma.teamMember.create({ data: { teamId: withMembers.id, userId: user.id } });
    const parent = await createTeam({ isActive: false });
    await createTeam({ parentId: parent.id });

    await expectAdminOnly(await api().patch(`/api/v1/teams/${withMembers.id}`).set(gestor()).send({ isActive: false }));
    await expectAdminOnly(await api().patch(`/api/v1/teams/${parent.id}`).set(gestor()).send({ isActive: true }));
    expect(await ctx.prisma.team.findUniqueOrThrow({ where: { id: withMembers.id } })).toMatchObject({ isActive: true });
    expect(await ctx.prisma.team.findUniqueOrThrow({ where: { id: parent.id } })).toMatchObject({ isActive: false });
    expect(await auditRows('team.updated', withMembers.id)).toHaveLength(0);
    expect(await auditRows('team.updated', parent.id)).toHaveLength(0);

    // Reenviar el estado actual no es un cambio.
    await api().patch(`/api/v1/teams/${withMembers.id}`).set(gestor()).send({ isActive: true, name: 'Mismo estado' }).expect(200);

    const empty = await createTeam();
    const deactivated = await api().patch(`/api/v1/teams/${empty.id}`).set(gestor()).send({ isActive: false }).expect(200);
    expect(deactivated.body.isActive).toBe(false);

    const auth = { Authorization: `Bearer ${adminToken}` };
    await api().patch(`/api/v1/teams/${withMembers.id}`).set(auth).send({ isActive: false }).expect(200);
    await api().patch(`/api/v1/teams/${parent.id}`).set(auth).send({ isActive: true }).expect(200);
    const rows = await auditRows('team.updated', withMembers.id);
    expect(rows.map((row) => row.changes)).toContainEqual(expect.objectContaining({ isActive: { before: true, after: false } }));
    const [reactivated] = await auditRows('team.updated', parent.id);
    expect(reactivated?.changes).toMatchObject({ isActive: { before: false, after: true } });
  });

  it('el administrador hace todo con su auditoría', async () => {
    const parent = await createTeam();
    const manager = await createTestUser(ctx.prisma);
    const team = await createTeam({ managerId: manager.id, parentId: parent.id });
    const auth = { Authorization: `Bearer ${adminToken}` };

    await api().patch(`/api/v1/teams/${team.id}`).set(auth).send({ managerId: null, parentId: null }).expect(200);
    await api()
      .put(`/api/v1/teams/${team.id}/members`)
      .set(auth)
      .send({ members: [{ userId: manager.id, isPrimary: false }] })
      .expect(200);

    const [updated] = await auditRows('team.updated', team.id);
    expect(updated?.changes).toMatchObject({ managerId: { before: manager.id, after: null }, parentId: { before: parent.id, after: null } });
    expect(await auditRows('team.members_replaced', team.id)).toHaveLength(1);
  });
});

function byId(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}
