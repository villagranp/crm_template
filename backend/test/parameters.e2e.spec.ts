import request from 'supertest';

import {
  accessTokenFor,
  closeTestContext,
  createTestContext,
  createTestUser,
  type TestContext,
  tokenWithRoles,
  uniqueCode,
} from './support/test-app';

/**
 * Parámetros del sistema (PLAN-ADMIN, D10) contra PostgreSQL real.
 *
 * Otros archivos del mismo esquema leen los parámetros de bloqueo: todo valor
 * que se cambia aquí se repone en `finally`, y sólo se tocan valores inocuos.
 */

const SECURITY_KEY = 'seguridad.minutos_bloqueo';
const GENERAL_KEY = 'app.nombre';

let ctx: TestContext;
let adminToken: string;

function api() {
  return request(ctx.app.getHttpServer());
}

async function currentValue(key: string): Promise<string> {
  return (await ctx.prisma.systemParameter.findUniqueOrThrow({ where: { key } })).value;
}

async function restore(key: string, value: string): Promise<void> {
  await ctx.prisma.systemParameter.update({ where: { key }, data: { value } });
}

/** Rol propio con `parametros.ver` + `parametros.editar`, sin `configurar`. */
async function tokenWithEditWithoutConfigure(): Promise<{ token: string; email: string }> {
  const permissions = await ctx.prisma.permission.findMany({
    where: { code: { in: ['parametros.ver', 'parametros.editar'] } },
  });
  const role = await ctx.prisma.role.create({
    data: {
      code: uniqueCode('param-editor'),
      name: 'Editor de parámetros (prueba)',
      permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
    },
  });
  const user = await createTestUser(ctx.prisma, { roleCodes: [role.code] });
  return { token: await accessTokenFor(ctx.app, user), email: user.email };
}

beforeAll(async () => {
  ctx = await createTestContext();
  adminToken = (await tokenWithRoles(ctx, ['administrador'])).token;
});

afterAll(async () => {
  await closeTestContext(ctx);
});

describe('GET /api/v1/parameters', () => {
  it('200: devuelve los parámetros agrupados, incluidos los no públicos', async () => {
    const response = await api().get('/api/v1/parameters').set('Authorization', `Bearer ${adminToken}`).expect(200);

    const security = (response.body.data as { group: string; parameters: { key: string; isPublic: boolean }[] }[]).find(
      (group) => group.group === 'seguridad',
    );
    expect(security?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: SECURITY_KEY, type: 'NUMBER', isPublic: false, requiresConfigurePermission: true }),
      ]),
    );
    expect(security?.parameters[0]).not.toHaveProperty('id');
    expect(security?.parameters[0]).not.toHaveProperty('updatedById');
  });

  it('401 sin token', async () => {
    await api().get('/api/v1/parameters').expect(401);
  });

  it('403 sin parametros.ver', async () => {
    const { token } = await tokenWithRoles(ctx, ['usuario']);
    await api().get('/api/v1/parameters').set('Authorization', `Bearer ${token}`).expect(403);
  });
});

describe('PATCH /api/v1/parameters/{key}', () => {
  it('200: cambia el valor, guarda quién y deja parameter.updated en auditoría', async () => {
    const { user, token } = await tokenWithRoles(ctx, ['administrador']);
    const original = await currentValue(SECURITY_KEY);
    const next = original === '16' ? '17' : '16';

    try {
      const response = await api()
        .patch(`/api/v1/parameters/${SECURITY_KEY}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ value: ` ${next} ` })
        .expect(200);

      expect(response.body).toMatchObject({ key: SECURITY_KEY, value: next, group: 'seguridad' });
      const stored = await ctx.prisma.systemParameter.findUniqueOrThrow({ where: { key: SECURITY_KEY } });
      expect(stored).toMatchObject({ value: next, updatedById: user.id });

      const audit = await ctx.prisma.auditLog.findFirst({
        where: { event: 'parameter.updated', resourceId: SECURITY_KEY, subjectEmail: user.email },
      });
      expect(audit?.changes).toEqual({ value: { before: original, after: next } });
    } finally {
      await restore(SECURITY_KEY, original);
    }
  });

  it('fuera de seguridad basta parametros.editar', async () => {
    const { token } = await tokenWithEditWithoutConfigure();
    const original = await currentValue(GENERAL_KEY);

    try {
      await api()
        .patch(`/api/v1/parameters/${GENERAL_KEY}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ value: `Aplicación ${uniqueCode('t')}` })
        .expect(200);
    } finally {
      await restore(GENERAL_KEY, original);
    }
  });

  it('403 en un parámetro de seguridad con parametros.editar pero sin parametros.configurar', async () => {
    const { token } = await tokenWithEditWithoutConfigure();
    const original = await currentValue(SECURITY_KEY);

    const response = await api()
      .patch(`/api/v1/parameters/${SECURITY_KEY}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: '30' })
      .expect(403);

    expect(response.body.details).toEqual([{ requiredPermission: 'parametros.configurar' }]);
    expect(await currentValue(SECURITY_KEY)).toBe(original);
  });

  it('401 sin token', async () => {
    await api().patch(`/api/v1/parameters/${GENERAL_KEY}`).send({ value: 'x' }).expect(401);
  });

  it('403 sin parametros.editar (auditor)', async () => {
    const { token } = await tokenWithRoles(ctx, ['auditor']);
    await api().patch(`/api/v1/parameters/${GENERAL_KEY}`).set('Authorization', `Bearer ${token}`).send({ value: 'x' }).expect(403);
  });

  it('400 sin value o con campos no permitidos', async () => {
    await api().patch(`/api/v1/parameters/${GENERAL_KEY}`).set('Authorization', `Bearer ${adminToken}`).send({}).expect(400);
    await api()
      .patch(`/api/v1/parameters/${GENERAL_KEY}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'x', type: 'JSON' })
      .expect(400);
  });

  it.each([
    [SECURITY_KEY, 'abc'],
    [SECURITY_KEY, '0'],
    ['seguridad.intentos_fallidos_maximos', '21'],
    ['auditoria.dias_retencion', '29'],
    [GENERAL_KEY, '   '],
  ])('422 INVALID_PARAMETER_VALUE: %s = "%s"', async (key, value) => {
    const original = await currentValue(key);

    const response = await api()
      .patch(`/api/v1/parameters/${key}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value })
      .expect(422);

    expect(response.body.code).toBe('INVALID_PARAMETER_VALUE');
    expect(await currentValue(key)).toBe(original);
  });

  it('404 con una clave inexistente', async () => {
    await api()
      .patch(`/api/v1/parameters/${uniqueCode('no.existe')}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: '1' })
      .expect(404);
  });
});
