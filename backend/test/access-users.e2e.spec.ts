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

/**
 * Módulo 7 · Usuarios (07 B.1, F.1; RN-07.1–RN-07.11; PF-07.1, PF-07.2, PF-07.5,
 * PF-07.19–PF-07.23, PF-07.39). Códigos de colaborador únicos por prueba: los
 * archivos corren en paralelo sobre el mismo esquema.
 */
describe('Módulo 7 · código de colaborador, país y perfil comercial', () => {
  let gestorToken: string;
  let guatemala: { id: string; isoCode: string; name: string };
  let elSalvador: { id: string };
  let inactiveCountryId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const employeeCode = () => `E-${randomUUID().slice(0, 8).toUpperCase()}`;
  const email = () => `m7-${randomUUID()}@integration.test`;

  beforeAll(async () => {
    gestorToken = (await tokenWithRoles(ctx, ['gestor-accesos'])).token;
    guatemala = await ctx.prisma.country.findUniqueOrThrow({
      where: { isoCode: 'GT' },
      select: { id: true, isoCode: true, name: true },
    });
    elSalvador = await ctx.prisma.country.findUniqueOrThrow({ where: { isoCode: 'SV' }, select: { id: true } });
    // Código ISO del rango de uso privado (QM–QZ): nunca choca con un país sembrado.
    inactiveCountryId = (
      await ctx.prisma.country.upsert({
        where: { isoCode: 'QZ' },
        create: { isoCode: 'QZ', name: 'País inactivo de prueba', currencyCode: 'USD', isActive: false },
        update: { isActive: false },
      })
    ).id;
  });

  async function userWith(data: { employeeCode?: string | null; countryId?: string | null; roleCodes?: string[] }) {
    const user = await createTestUser(ctx.prisma, { roleCodes: data.roleCodes ?? ['usuario'] });
    await ctx.prisma.user.update({
      where: { id: user.id },
      data: { employeeCode: data.employeeCode ?? null, countryId: data.countryId ?? null },
    });
    return user;
  }

  it('PF-07.1: el administrador da de alta un usuario comercial completo; detalle y user.created con código y país', async () => {
    const code = employeeCode();
    const team = await ctx.prisma.team.create({ data: { code: `m7-${randomUUID().slice(0, 8)}`, name: 'Ventas M7' } });

    const created = await api()
      .post('/api/v1/users')
      .set(auth(adminToken))
      .send({
        email: email(),
        firstName: 'Ana',
        lastName: 'Comercial',
        phone: '+502 5555 1234',
        employeeCode: `  ${code.toLowerCase()} `,
        countryId: guatemala.id,
        roleIds: [await roleId('asesor')],
        teamIds: [team.id],
      })
      .expect(201);
    expect(created.body).toMatchObject({ status: 'INVITED', roles: ['asesor'] });
    // El 201 trae el perfil completo (misma forma que un elemento de GET /users).
    expect(created.body).toMatchObject({
      employeeCode: code,
      country: { id: guatemala.id, isoCode: guatemala.isoCode, name: guatemala.name },
      lastLoginAt: null,
      teams: [expect.objectContaining({ id: team.id })],
    });
    expect(typeof created.body.createdAt).toBe('string');

    const detailResponse = await api().get(`/api/v1/users/${created.body.id}`).set(auth(adminToken)).expect(200);
    expect(detailResponse.body).toMatchObject({
      employeeCode: code,
      country: guatemala,
      phone: '+502 5555 1234',
      teams: [{ id: team.id, name: 'Ventas M7', isPrimary: true }],
    });

    const row = await auditRow('user.created', created.body.id);
    expect(row?.changes).toMatchObject({
      employeeCode: { before: null, after: code },
      countryId: { before: null, after: guatemala.id },
      countryIsoCode: { before: null, after: 'GT' },
    });
    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored).toMatchObject({ locale: 'es-GT', timeZone: 'America/Guatemala' });
  });

  it('PF-07.19: código repetido con otro caso y espacios → 409 RESOURCE_CONFLICT field employeeCode (alta y edición)', async () => {
    const code = employeeCode();
    await userWith({ employeeCode: code });

    const onCreate = await api()
      .post('/api/v1/users')
      .set(auth(adminToken))
      .send({
        email: email(),
        firstName: 'A',
        lastName: 'B',
        employeeCode: ` ${code.toLowerCase()}  `,
        roleIds: [await roleId('usuario')],
      })
      .expect(409);
    expect(onCreate.body.code).toBe('RESOURCE_CONFLICT');
    expect(onCreate.body.details).toContainEqual(expect.objectContaining({ field: 'employeeCode' }));

    const other = await userWith({});
    const onUpdate = await api()
      .patch(`/api/v1/users/${other.id}`)
      .set(auth(adminToken))
      .send({ employeeCode: code.toLowerCase() })
      .expect(409);
    expect(onUpdate.body.details).toContainEqual(expect.objectContaining({ field: 'employeeCode' }));
  });

  it('400 con un código fuera de patrón o de longitud, o un countryId que no es UUID', async () => {
    const base = { email: email(), firstName: 'A', lastName: 'B', roleIds: [await roleId('usuario')] };
    await api().post('/api/v1/users').set(auth(adminToken)).send({ ...base, employeeCode: 'E 01' }).expect(400);
    await api().post('/api/v1/users').set(auth(adminToken)).send({ ...base, employeeCode: 'Ñ-01' }).expect(400);
    await api().post('/api/v1/users').set(auth(adminToken)).send({ ...base, employeeCode: 'X'.repeat(41) }).expect(400);
    await api().post('/api/v1/users').set(auth(adminToken)).send({ ...base, countryId: 'gt' }).expect(400);
  });

  it('PF-07.2: el gestor de accesos edita el código y el teléfono', async () => {
    const target = await userWith({});
    const code = employeeCode();

    const response = await api()
      .patch(`/api/v1/users/${target.id}`)
      .set(auth(gestorToken))
      .send({ employeeCode: code, phone: '+503 7777 0000' })
      .expect(200);

    expect(response.body).toMatchObject({ employeeCode: code, phone: '+503 7777 0000' });
    expect((await auditRow('user.updated', target.id))?.changes).toMatchObject({ employeeCode: { before: null, after: code } });
  });

  describe('PF-07.21: el país y los equipos son asignación de acceso (403 ADMIN_ONLY a un no administrador)', () => {
    it('alta con countryId', async () => {
      const address = email();
      const response = await api()
        .post('/api/v1/users')
        .set(auth(gestorToken))
        .send({ email: address, firstName: 'A', lastName: 'B', countryId: guatemala.id, roleIds: [await roleId('usuario')] })
        .expect(403);
      expect(response.body.code).toBe('ADMIN_ONLY');
      expect(await ctx.prisma.user.count({ where: { emailNormalized: address } })).toBe(0);
    });

    it('alta con teamIds no vacío', async () => {
      const team = await ctx.prisma.team.create({ data: { code: `m7-${randomUUID().slice(0, 8)}`, name: 'Equipo' } });
      const address = email();
      const response = await api()
        .post('/api/v1/users')
        .set(auth(gestorToken))
        .send({ email: address, firstName: 'A', lastName: 'B', teamIds: [team.id], roleIds: [await roleId('usuario')] })
        .expect(403);
      expect(response.body.code).toBe('ADMIN_ONLY');
      expect(await ctx.prisma.user.count({ where: { emailNormalized: address } })).toBe(0);
    });

    it('edición que cambia o quita el país; reenviar el país actual sí se acepta', async () => {
      const target = await userWith({ countryId: guatemala.id });

      for (const countryId of [elSalvador.id, null]) {
        const response = await api().patch(`/api/v1/users/${target.id}`).set(auth(gestorToken)).send({ countryId }).expect(403);
        expect(response.body.code).toBe('ADMIN_ONLY');
      }
      const unchanged = await ctx.prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(unchanged.countryId).toBe(guatemala.id);

      await api()
        .patch(`/api/v1/users/${target.id}`)
        .set(auth(gestorToken))
        .send({ countryId: guatemala.id, jobTitle: 'Analista' })
        .expect(200);
    });

    it('edición que fija el país a quien no tenía', async () => {
      const target = await userWith({});
      const response = await api()
        .patch(`/api/v1/users/${target.id}`)
        .set(auth(gestorToken))
        .send({ countryId: guatemala.id })
        .expect(403);
      expect(response.body.code).toBe('ADMIN_ONLY');
    });

    it('el administrador sí cambia el país, y queda auditado con el código ISO', async () => {
      const target = await userWith({ countryId: guatemala.id });

      const response = await api()
        .patch(`/api/v1/users/${target.id}`)
        .set(auth(adminToken))
        .send({ countryId: elSalvador.id })
        .expect(200);

      expect(response.body.country).toMatchObject({ id: elSalvador.id, isoCode: 'SV' });
      expect((await auditRow('user.updated', target.id))?.changes).toMatchObject({
        countryIsoCode: { before: 'GT', after: 'SV' },
      });
    });
  });

  it('PF-07.22: país inexistente o inactivo → 422 UNKNOWN_REFERENCE', async () => {
    const base = { firstName: 'A', lastName: 'B', roleIds: [await roleId('usuario')] };

    const missing = await api()
      .post('/api/v1/users')
      .set(auth(adminToken))
      .send({ ...base, email: email(), countryId: randomUUID() })
      .expect(422);
    expect(missing.body.code).toBe('UNKNOWN_REFERENCE');
    expect(missing.body.details).toContainEqual(expect.objectContaining({ field: 'countryId', issue: 'not_found' }));

    const inactive = await api()
      .post('/api/v1/users')
      .set(auth(adminToken))
      .send({ ...base, email: email(), countryId: inactiveCountryId })
      .expect(422);
    expect(inactive.body.details).toContainEqual(expect.objectContaining({ field: 'countryId', issue: 'inactive' }));

    const target = await userWith({});
    await api().patch(`/api/v1/users/${target.id}`).set(auth(adminToken)).send({ countryId: inactiveCountryId }).expect(422);
  });

  describe('PF-07.23: perfil comercial (D-07.3) → 422 CRM_PROFILE_INCOMPLETE', () => {
    it('asignar asesor sin código o sin país; con ambos se asigna', async () => {
      const withoutCode = await userWith({ countryId: guatemala.id });
      const noCode = await api()
        .put(`/api/v1/users/${withoutCode.id}/roles`)
        .set(auth(adminToken))
        .send({ ids: [await roleId('asesor')] })
        .expect(422);
      expect(noCode.body.code).toBe('CRM_PROFILE_INCOMPLETE');
      expect(noCode.body.details).toEqual([expect.objectContaining({ field: 'employeeCode', issue: 'required' })]);

      const withoutCountry = await userWith({ employeeCode: employeeCode() });
      const noCountry = await api()
        .put(`/api/v1/users/${withoutCountry.id}/roles`)
        .set(auth(adminToken))
        .send({ ids: [await roleId('asesor')] })
        .expect(422);
      expect(noCountry.body.details).toEqual([expect.objectContaining({ field: 'countryId', issue: 'required' })]);
      const roles = await ctx.prisma.userRole.findMany({ where: { userId: withoutCountry.id }, include: { role: true } });
      expect(roles.map((assignment) => assignment.role.code)).toEqual(['usuario']);

      const complete = await userWith({ employeeCode: employeeCode(), countryId: guatemala.id });
      await api()
        .put(`/api/v1/users/${complete.id}/roles`)
        .set(auth(adminToken))
        .send({ ids: [await roleId('asesor')] })
        .expect(204);
    });

    it('alta con rol comercial sin código ni país', async () => {
      const response = await api()
        .post('/api/v1/users')
        .set(auth(adminToken))
        .send({ email: email(), firstName: 'A', lastName: 'B', roleIds: [await roleId('manager')] })
        .expect(422);
      expect(response.body.code).toBe('CRM_PROFILE_INCOMPLETE');
      expect(response.body.details).toHaveLength(2);
    });

    it('vaciar el país o el código de un asesor; a un usuario no comercial sí se le vacían', async () => {
      const advisor = await userWith({ employeeCode: employeeCode(), countryId: guatemala.id, roleCodes: ['asesor'] });
      for (const body of [{ countryId: null }, { employeeCode: null }, { employeeCode: '   ' }]) {
        const response = await api().patch(`/api/v1/users/${advisor.id}`).set(auth(adminToken)).send(body).expect(422);
        expect(response.body.code).toBe('CRM_PROFILE_INCOMPLETE');
      }

      const plain = await userWith({ employeeCode: employeeCode(), countryId: guatemala.id });
      const response = await api()
        .patch(`/api/v1/users/${plain.id}`)
        .set(auth(adminToken))
        .send({ employeeCode: null, countryId: null })
        .expect(200);
      expect(response.body).toMatchObject({ employeeCode: null, country: null });
    });
  });

  it('PF-07.5: filtro por país, búsqueda por código y CSV con las columnas nuevas', async () => {
    const code = employeeCode();
    const target = await userWith({ employeeCode: code, countryId: elSalvador.id });
    await userWith({ employeeCode: employeeCode(), countryId: guatemala.id });

    const bySearch = await api().get('/api/v1/users').query({ search: code.toLowerCase() }).set(auth(adminToken)).expect(200);
    expect(bySearch.body.data).toEqual([
      expect.objectContaining({ id: target.id, employeeCode: code, country: expect.objectContaining({ isoCode: 'SV' }) }),
    ]);

    const byCountry = await api()
      .get('/api/v1/users')
      .query({ countryId: elSalvador.id, search: code })
      .set(auth(adminToken))
      .expect(200);
    expect(byCountry.body.data.map((user: { id: string }) => user.id)).toEqual([target.id]);
    const otherCountry = await api()
      .get('/api/v1/users')
      .query({ countryId: guatemala.id, search: code })
      .set(auth(adminToken))
      .expect(200);
    expect(otherCountry.body.data).toEqual([]);

    const csv = await api()
      .get('/api/v1/users/export')
      .query({ countryId: elSalvador.id, search: code })
      .set(auth(adminToken))
      .expect(200);
    const [header, row] = csv.text.replace(/^﻿/, '').split('\r\n');
    expect(header).toContain('Código de colaborador');
    expect(header).toContain('País');
    expect(row).toContain(code);
    expect(row).toContain('El Salvador');
  });

  it('PF-07.39: la lista con filtros exige sesión (401) y usuarios.ver (403); 400 con un countryId no UUID', async () => {
    await api().get('/api/v1/users').query({ countryId: guatemala.id }).expect(401);
    await api().get('/api/v1/users').query({ countryId: guatemala.id }).set(auth(userToken)).expect(403);
    await api().get('/api/v1/users').query({ countryId: 'gt' }).set(auth(adminToken)).expect(400);
  });
});
