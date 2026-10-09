import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { ACCESS_REPOSITORY, type AccessRepository } from '@/modules/access/ports/access.repository.port';

import {
  type TestContext,
  type TestUser,
  TEST_PASSWORD,
  accessTokenFor,
  closeTestContext,
  createTestContext,
  createTestUser,
  tokenWithRoles,
  uniqueCode,
  uniqueIp,
} from './support/test-app';
import { INTEGRATION_ENV } from './support/integration-env';

/**
 * Integración de las salvaguardas de acceso tras la revisión de PLAN-ADMIN:
 * - D3 con DENY directo (autobloqueo) y su sección crítica (bloqueo consultivo).
 * - Validación de `ReplaceAssignmentsDto` y de `teamIds` en el alta.
 * - Reactivar a un bloqueado limpia el bloqueo de su credencial.
 * - ADR-020: la asignación de accesos es exclusiva del administrador.
 *
 * Los archivos corren en paralelo sobre la misma base: ninguna prueba depende
 * de cuántos administradores existan en total.
 */

let ctx: TestContext;
let admin: { user: TestUser; token: string };
let gestor: { user: TestUser; token: string };

const REASON = 'Cobertura temporal de una baja del equipo';

function api() {
  return request(ctx.app.getHttpServer());
}

async function roleId(code: string): Promise<string> {
  return (await ctx.prisma.role.findUniqueOrThrow({ where: { code } })).id;
}

async function permissionId(code: string): Promise<string> {
  return (await ctx.prisma.permission.findUniqueOrThrow({ where: { code } })).id;
}

function login(email: string, password: string) {
  return api().post('/api/v1/auth/login').set('X-Forwarded-For', uniqueIp()).send({ email, password });
}

beforeAll(async () => {
  ctx = await createTestContext();
  admin = await tokenWithRoles(ctx, ['administrador']);
  gestor = await tokenWithRoles(ctx, ['gestor-accesos']);
});

afterAll(async () => {
  await closeTestContext(ctx);
});

describe('D3 · DENY directo', () => {
  it('409 SELF_LOCKOUT al denegarse a sí mismo usuarios.editar, y no queda escrito', async () => {
    const response = await api()
      .put(`/api/v1/users/${admin.user.id}/permissions`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ assignments: [{ targetId: await permissionId('usuarios.editar'), effect: 'DENY', reason: REASON }] })
      .expect(409);

    expect(response.body.code).toBe('SELF_LOCKOUT');
    expect(await ctx.prisma.userPermission.count({ where: { userId: admin.user.id } })).toBe(0);
  });
});

describe('PUT /users/:id/permissions · validación', () => {
  it('400 con un targetId repetido', async () => {
    const target = await createTestUser(ctx.prisma);
    const id = await permissionId('usuarios.exportar');

    await api()
      .put(`/api/v1/users/${target.id}/permissions`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        assignments: [
          { targetId: id, effect: 'GRANT', reason: REASON },
          { targetId: id, effect: 'DENY', reason: REASON },
        ],
      })
      .expect(400);
  });
});

describe('POST /users · teamIds', () => {
  const body = async (teamIds: string[]) => ({
    email: `alta-${randomUUID()}@integration.test`,
    firstName: 'Alta',
    lastName: 'Equipo',
    roleIds: [await roleId('usuario')],
    teamIds,
  });

  it('422 UNKNOWN_REFERENCE con un equipo inexistente', async () => {
    const response = await api()
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(await body([randomUUID()]))
      .expect(422);
    expect(response.body.code).toBe('UNKNOWN_REFERENCE');
  });

  it('422 con un equipo eliminado (borrado lógico)', async () => {
    const team = await ctx.prisma.team.create({
      data: { code: uniqueCode('borrado'), name: 'Borrado', deletedAt: new Date(), isActive: false },
    });
    await api()
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(await body([team.id]))
      .expect(422);
  });

  it('403 PERMISSION_DENIED con requiredPermission si el actor no tiene equipos.editar', async () => {
    // usuarios.crear por excepción directa y sin equipos.editar.
    const actor = await createTestUser(ctx.prisma, { roleCodes: ['usuario'] });
    await ctx.prisma.userPermission.create({
      data: { userId: actor.id, permissionId: await permissionId('usuarios.crear'), effect: 'GRANT', reason: REASON },
    });
    const team = await ctx.prisma.team.create({ data: { code: uniqueCode('equipo'), name: 'Equipo' } });
    const token = await accessTokenFor(ctx.app, actor);
    const payload = await body([team.id]);

    const response = await api()
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(403);

    expect(response.body.code).toBe('PERMISSION_DENIED');
    expect(response.body.details).toContainEqual(expect.objectContaining({ requiredPermission: 'equipos.editar' }));
  });

  it('201 con un equipo válido; audita teamIds en user.created', async () => {
    const team = await ctx.prisma.team.create({ data: { code: uniqueCode('equipo'), name: 'Equipo' } });

    const response = await api()
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(await body([team.id]))
      .expect(201);

    const row = await ctx.prisma.auditLog.findFirst({ where: { event: 'user.created', resourceId: response.body.id } });
    expect(row?.changes).toMatchObject({ teamIds: { before: null, after: [team.id] } });
  });
});

describe('POST /users/:id/reactivate · bloqueo de credencial', () => {
  it('tras el bloqueo por intentos fallidos, reactivar a un LOCKED le permite volver a entrar', async () => {
    const target = await createTestUser(ctx.prisma, { roleCodes: ['usuario'] });
    const parameter = await ctx.prisma.systemParameter.findUnique({ where: { key: 'seguridad.intentos_fallidos_maximos' } });
    const maxAttempts = Number.parseInt(parameter?.value ?? '5', 10);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await login(target.email, 'contrasena-equivocada-larga').expect(401);
    }
    const credential = await ctx.prisma.userCredential.findUniqueOrThrow({ where: { userId: target.id } });
    expect(credential.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    await login(target.email, TEST_PASSWORD).expect(401);

    // El bloqueo por intentos marca la credencial; el estado LOCKED lo pone
    // un proceso o un administrador. Se simula aquí.
    await ctx.prisma.user.update({ where: { id: target.id }, data: { status: 'LOCKED' } });

    await api()
      .post(`/api/v1/users/${target.id}/reactivate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reason: 'Bloqueo revisado con la persona' })
      .expect(200);

    const cleared = await ctx.prisma.userCredential.findUniqueOrThrow({ where: { userId: target.id } });
    expect(cleared).toMatchObject({ failedAttempts: 0, lockedUntil: null });
    await login(target.email, TEST_PASSWORD).expect(200);
  });
});

describe('D3 · sección crítica (pg_advisory_xact_lock)', () => {
  /**
   * Determinista: B no puede empezar mientras A retiene el bloqueo, haya o no
   * otros administradores. No depende de tiempos para pasar, solo para dar
   * ocasión a B de colarse si el bloqueo no funcionara.
   */
  it('serializa dos secciones críticas concurrentes', async () => {
    const repository = ctx.app.get<AccessRepository>(ACCESS_REPOSITORY, { strict: false });
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markAStarted!: () => void;
    const aStarted = new Promise<void>((resolve) => {
      markAStarted = resolve;
    });

    const first = repository.withAdminInvariantLock(async (scoped) => {
      events.push('A:start');
      markAStarted();
      await gate;
      await scoped.findUserDetail(admin.user.id);
      events.push('A:end');
    });
    await aStarted;

    const second = repository.withAdminInvariantLock(async () => {
      events.push('B:start');
    });

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(events).toEqual(['A:start']);

    release();
    await Promise.all([first, second]);
    expect(events).toEqual(['A:start', 'A:end', 'B:start']);
  });

  it('si el trabajo lanza, la escritura dentro de la sección se deshace', async () => {
    const repository = ctx.app.get<AccessRepository>(ACCESS_REPOSITORY, { strict: false });
    const target = await createTestUser(ctx.prisma);

    await expect(
      repository.withAdminInvariantLock(async (scoped) => {
        await scoped.setUserStatus(target.id, 'SUSPENDED', null);
        throw new Error('postcondición violada');
      }),
    ).rejects.toThrow('postcondición violada');

    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('ACTIVE');
  });
});

describe('ADR-020 · la asignación de accesos es exclusiva del administrador', () => {
  async function expectAdminOnly(response: request.Response): Promise<void> {
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ADMIN_ONLY');
  }

  describe('los caminos de escalada de un gestor-accesos', () => {
    it('1. asignarse el rol administrador → 403 ADMIN_ONLY', async () => {
      await expectAdminOnly(
        await api()
          .put(`/api/v1/users/${gestor.user.id}/roles`)
          .set('Authorization', `Bearer ${gestor.token}`)
          .send({ ids: [await roleId('administrador')] }),
      );
      const roles = await ctx.prisma.userRole.findMany({ where: { userId: gestor.user.id }, include: { role: true } });
      expect(roles.map((assignment) => assignment.role.code)).toEqual(['gestor-accesos']);
    });

    it('2. concederse un permiso directo que no tiene → 403 ADMIN_ONLY', async () => {
      await expectAdminOnly(
        await api()
          .put(`/api/v1/users/${gestor.user.id}/permissions`)
          .set('Authorization', `Bearer ${gestor.token}`)
          .send({
            assignments: [{ targetId: await permissionId('parametros.configurar'), effect: 'GRANT', reason: REASON }],
          }),
      );
      expect(await ctx.prisma.userPermission.count({ where: { userId: gestor.user.id } })).toBe(0);
    });

    it('3. crear un usuario con rol administrador → 403 ADMIN_ONLY', async () => {
      const email = `escalada-${randomUUID()}@integration.test`;
      await expectAdminOnly(
        await api()
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${gestor.token}`)
          .send({
            email,
            firstName: 'Escalada',
            lastName: 'Prueba',
            roleIds: [await roleId('administrador')],
          }),
      );
      expect(await ctx.prisma.user.count({ where: { emailNormalized: email } })).toBe(0);
    });

    it('4. añadir permisos a un rol propio, o cambiar su alcance → 403 ADMIN_ONLY; renombrarlo sí', async () => {
      const created = await api()
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ code: uniqueCode('propio'), name: 'Rol propio', dataScope: 'OWN' })
        .expect(201);
      const ownRoleId = created.body.id as string;

      await expectAdminOnly(
        await api()
          .put(`/api/v1/roles/${ownRoleId}/permissions`)
          .set('Authorization', `Bearer ${gestor.token}`)
          .send({ ids: [await permissionId('parametros.configurar')] }),
      );
      await expectAdminOnly(
        await api()
          .put(`/api/v1/roles/${ownRoleId}/menu-options`)
          .set('Authorization', `Bearer ${gestor.token}`)
          .send({ ids: [] }),
      );
      await expectAdminOnly(
        await api()
          .patch(`/api/v1/roles/${ownRoleId}`)
          .set('Authorization', `Bearer ${gestor.token}`)
          .send({ dataScope: 'ORGANIZATION' }),
      );
      await api()
        .patch(`/api/v1/roles/${ownRoleId}`)
        .set('Authorization', `Bearer ${gestor.token}`)
        .send({ name: 'Rol propio renombrado' })
        .expect(200);

      const stored = await ctx.prisma.role.findUniqueOrThrow({
        where: { id: ownRoleId },
        include: { _count: { select: { permissions: true } } },
      });
      expect(stored).toMatchObject({ name: 'Rol propio renombrado', dataScope: 'OWN' });
      expect(stored._count.permissions).toBe(0);
    });

    it('activar o desactivar un rol (cambia lo que concede) → 403 ADMIN_ONLY; el administrador sí', async () => {
      const created = await api()
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ code: uniqueCode('activable'), name: 'Rol activable', dataScope: 'OWN' })
        .expect(201);
      const ownRoleId = created.body.id as string;

      await expectAdminOnly(
        await api()
          .patch(`/api/v1/roles/${ownRoleId}`)
          .set('Authorization', `Bearer ${gestor.token}`)
          .send({ isActive: false }),
      );
      expect((await ctx.prisma.role.findUniqueOrThrow({ where: { id: ownRoleId } })).isActive).toBe(true);

      await api()
        .patch(`/api/v1/roles/${ownRoleId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false })
        .expect(200);
      await expectAdminOnly(
        await api()
          .patch(`/api/v1/roles/${ownRoleId}`)
          .set('Authorization', `Bearer ${gestor.token}`)
          .send({ isActive: true }),
      );
    });

    it('indirecto: restablecer la contraseña de un administrador → 403 ADMIN_ONLY', async () => {
      const target = await createTestUser(ctx.prisma, { roleCodes: ['administrador'] });

      await expectAdminOnly(
        await api().post(`/api/v1/users/${target.id}/password/reset`).set('Authorization', `Bearer ${gestor.token}`),
      );
      await login(target.email, TEST_PASSWORD).expect(200);
    });

    it('editar, suspender o reactivar a un administrador → 403 ADMIN_ONLY', async () => {
      const target = await createTestUser(ctx.prisma, { roleCodes: ['administrador'] });
      const auth = { Authorization: `Bearer ${gestor.token}` };

      await expectAdminOnly(await api().patch(`/api/v1/users/${target.id}`).set(auth).send({ jobTitle: 'X' }));
      await expectAdminOnly(await api().post(`/api/v1/users/${target.id}/suspend`).set(auth));
      await ctx.prisma.user.update({ where: { id: target.id }, data: { status: 'SUSPENDED' } });
      await expectAdminOnly(await api().post(`/api/v1/users/${target.id}/reactivate`).set(auth));
    });

    it('5. restablecer la contraseña de cualquier usuario (toma de su cuenta) → 403 ADMIN_ONLY', async () => {
      const target = await createTestUser(ctx.prisma);

      await expectAdminOnly(
        await api().post(`/api/v1/users/${target.id}/password/reset`).set('Authorization', `Bearer ${gestor.token}`),
      );
      // La credencial sigue intacta: su contraseña de siempre sigue entrando.
      await login(target.email, TEST_PASSWORD).expect(200);
    });

    it('opciones de menú directas → 403 ADMIN_ONLY', async () => {
      const target = await createTestUser(ctx.prisma);
      await expectAdminOnly(
        await api()
          .put(`/api/v1/users/${target.id}/menu-options`)
          .set('Authorization', `Bearer ${gestor.token}`)
          .send({ assignments: [] }),
      );
    });
  });

  describe('lo que el gestor sí puede hacer', () => {
    it('crear un usuario con el rol usuario (sin permisos) → 201', async () => {
      await api()
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${gestor.token}`)
        .send({
          email: `gestor-alta-${randomUUID()}@integration.test`,
          firstName: 'Alta',
          lastName: 'Gestor',
          roleIds: [await roleId('usuario')],
        })
        .expect(201);
    });

    it('editar y suspender a quien no es administrador → 200', async () => {
      const target = await createTestUser(ctx.prisma);
      await api()
        .patch(`/api/v1/users/${target.id}`)
        .set('Authorization', `Bearer ${gestor.token}`)
        .send({ jobTitle: 'Analista' })
        .expect(200);
      await api().post(`/api/v1/users/${target.id}/suspend`).set('Authorization', `Bearer ${gestor.token}`).expect(200);
    });
  });

  describe('el administrador puede hacerlo todo', () => {
    it('asigna roles, permisos y opciones directas; crea administradores; cambia lo que concede un rol', async () => {
      const auth = { Authorization: `Bearer ${admin.token}` };
      const target = await createTestUser(ctx.prisma);

      await api()
        .put(`/api/v1/users/${target.id}/roles`)
        .set(auth)
        .send({ ids: [await roleId('administrador')] })
        .expect(204);
      await api()
        .put(`/api/v1/users/${target.id}/permissions`)
        .set(auth)
        .send({
          assignments: [{ targetId: await permissionId('parametros.configurar'), effect: 'GRANT', reason: REASON }],
        })
        .expect(204);
      await api().put(`/api/v1/users/${target.id}/menu-options`).set(auth).send({ assignments: [] }).expect(204);

      await api()
        .post('/api/v1/users')
        .set(auth)
        .send({
          email: `admin-alta-${randomUUID()}@integration.test`,
          firstName: 'Alta',
          lastName: 'Admin',
          roleIds: [await roleId('administrador')],
        })
        .expect(201);

      const created = await api()
        .post('/api/v1/roles')
        .set(auth)
        .send({ code: uniqueCode('propio'), name: 'Rol del admin', dataScope: 'OWN' })
        .expect(201);
      await api()
        .post(`/api/v1/roles/${created.body.id}/duplicate`)
        .set(auth)
        .send({ code: uniqueCode('copia'), name: 'Copia' })
        .expect(201);
      await api()
        .put(`/api/v1/roles/${created.body.id}/permissions`)
        .set(auth)
        .send({ ids: [await permissionId('parametros.configurar')] })
        .expect(200);
      await api()
        .patch(`/api/v1/roles/${created.body.id}`)
        .set(auth)
        .send({ dataScope: 'ORGANIZATION' })
        .expect(200);
    });

    it('actúa sobre otro administrador: suspende, reactiva y restablece su contraseña', async () => {
      const auth = { Authorization: `Bearer ${admin.token}` };
      const target = await createTestUser(ctx.prisma, { roleCodes: ['administrador'] });

      await api().post(`/api/v1/users/${target.id}/suspend`).set(auth).expect(200);
      await api().post(`/api/v1/users/${target.id}/reactivate`).set(auth).expect(200);
      await api().post(`/api/v1/users/${target.id}/password/reset`).set(auth).expect(204);
      await login(target.email, INTEGRATION_ENV.AUTH_DEFAULT_PASSWORD).expect(200);
    });
  });
});
