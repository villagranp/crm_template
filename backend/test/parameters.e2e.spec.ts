import request from 'supertest';

import { EXCLUSIVE_TIMEOUT_MS, exclusiveParameters } from './support/crm-fixtures';
import { withParameterLock } from './support/parameter-lock';
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

  it('auditoria.dias_retencion es estructural: 403 sin parametros.configurar y nada cambia; con él se guarda (M-2)', async () => {
    const key = 'auditoria.dias_retencion';
    const { token } = await tokenWithEditWithoutConfigure();
    const admin = await tokenWithRoles(ctx, ['administrador']);

    // `audit-immutability` cambia este parámetro en paralelo (con `withParameter`):
    // el mismo candado evita leer o pisar su valor temporal.
    await withParameterLock(key, async () => {
      const original = await currentValue(key);
      const next = original === '400' ? '401' : '400';
      try {
        const denied = await api()
          .patch(`/api/v1/parameters/${key}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ value: '30' })
          .expect(403);
        expect(denied.body.details).toEqual([{ requiredPermission: 'parametros.configurar' }]);
        expect(await currentValue(key)).toBe(original);

        const saved = await api()
          .patch(`/api/v1/parameters/${key}`)
          .set('Authorization', `Bearer ${admin.token}`)
          .send({ value: next })
          .expect(200);
        expect(saved.body).toMatchObject({ key, value: next, requiresConfigure: true });
        expect(await ctx.prisma.systemParameter.findUniqueOrThrow({ where: { key } })).toMatchObject({
          value: next,
          updatedById: admin.user.id,
        });
      } finally {
        await restore(key, original);
      }
    });
  });

  it('401 sin token', async () => {
    await api().patch(`/api/v1/parameters/${GENERAL_KEY}`).send({ value: 'x' }).expect(401);
  });

  it('403 sin parametros.editar (auditor)', async () => {
    const { token } = await tokenWithRoles(ctx, ['auditor']);
    await api().patch(`/api/v1/parameters/${GENERAL_KEY}`).set('Authorization', `Bearer ${token}`).send({ value: 'x' }).expect(403);
  });

  it('400 VALIDATION_FAILED sin value o con campos no permitidos (DC-6)', async () => {
    const missing = await api()
      .patch(`/api/v1/parameters/${GENERAL_KEY}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);
    expect(missing.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      details: expect.arrayContaining([expect.objectContaining({ field: 'value' })]),
    });
    expect(typeof missing.body.correlationId).toBe('string');

    const extra = await api()
      .patch(`/api/v1/parameters/${GENERAL_KEY}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'x', type: 'JSON' })
      .expect(400);
    expect(extra.body.code).toBe('VALIDATION_FAILED');
    expect(extra.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'type' })]));
  });

  it.each([
    [SECURITY_KEY, 'abc'],
    [SECURITY_KEY, '0'],
    ['seguridad.intentos_fallidos_maximos', '21'],
    ['auditoria.dias_retencion', '29'],
    [GENERAL_KEY, '   '],
  ])('422 INVALID_PARAMETER_VALUE: %s = "%s"', async (key, value) => {
    // Bajo el candado del parámetro: otra suite puede estar cambiándolo temporalmente.
    await withParameterLock(key, async () => {
      const original = await currentValue(key);

      const response = await api()
        .patch(`/api/v1/parameters/${key}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value })
        .expect(422);

      expect(response.body.code).toBe('INVALID_PARAMETER_VALUE');
      expect(await currentValue(key)).toBe(original);
    });
  });

  it('404 con una clave inexistente', async () => {
    await api()
      .patch(`/api/v1/parameters/${uniqueCode('no.existe')}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: '1' })
      .expect(404);
  });
});

describe('PATCH /api/v1/parameters/{key}: registro de reglas del CRM (D-07.7)', () => {
  function patch(key: string, value: string, token = adminToken) {
    return api().patch(`/api/v1/parameters/${key}`).set('Authorization', `Bearer ${token}`).send({ value });
  }

  it('GET marca readOnly, requiresConfigure, range y allowedValues desde el registro', async () => {
    const response = await api().get('/api/v1/parameters').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const all = (response.body.data as Array<{ parameters: Array<Record<string, unknown>> }>).flatMap((group) => group.parameters);
    const byKey = new Map(all.map((parameter) => [parameter['key'], parameter]));

    expect(byKey.get('crm.moneda_base')).toMatchObject({ readOnly: true, requiresConfigure: true });
    expect(byKey.get('crm.tipos_cambio.dias_aviso_antiguedad')).toMatchObject({ readOnly: false, range: { min: 1, max: 366 } });
    expect(byKey.get('crm.visitas.validar_conflicto_horario')).toMatchObject({ allowedValues: ['NO', 'AVISAR', 'BLOQUEAR'] });
    expect(byKey.get(SECURITY_KEY)).toMatchObject({ requiresConfigure: true, requiresConfigurePermission: true });
    expect(byKey.has('crm.moneda_por_defecto')).toBe(false);
    expect(byKey.has('crm.clientes.unicidad_nit')).toBe(false);
  });

  it('409 SYSTEM_RESOURCE_READ_ONLY al editar crm.moneda_base (AC-07.42)', async () => {
    const response = await patch('crm.moneda_base', 'USD').expect(409);
    expect(response.body.code).toBe('SYSTEM_RESOURCE_READ_ONLY');
  });

  it('dias_aviso_antiguedad: 0 y 367 son 422; 45 se guarda (AC-07.42)', async () => {
    const key = 'crm.tipos_cambio.dias_aviso_antiguedad';
    const original = await currentValue(key);
    try {
      for (const value of ['0', '367']) {
        const response = await patch(key, value).expect(422);
        expect(response.body.code).toBe('INVALID_PARAMETER_VALUE');
      }
      await patch(key, '45').expect(200);
      expect(await currentValue(key)).toBe('45');
    } finally {
      await restore(key, original);
    }
  });

  it('reglas de duplicidad: nit BLOQUEAR es 422; NO se guarda y se audita (AC-07.27)', async () => {
    const key = 'crm.clientes.reglas_duplicidad';
    const original = await currentValue(key);
    try {
      const rejected = await patch(key, '{"razonSocialNormalizada":"AVISAR","nit":"BLOQUEAR"}').expect(422);
      expect(rejected.body).toMatchObject({
        code: 'INVALID_PARAMETER_VALUE',
        details: [expect.objectContaining({ field: 'value.nit' })],
      });

      await patch(key, '{"razonSocialNormalizada":"AVISAR","nit":"NO"}').expect(200);
      expect(await currentValue(key)).toBe('{"razonSocialNormalizada":"AVISAR","nit":"NO"}');
      const audit = await ctx.prisma.auditLog.findFirst({
        where: { event: 'parameter.updated', resourceId: key },
        orderBy: { occurredAt: 'desc' },
      });
      expect(audit).not.toBeNull();
    } finally {
      await restore(key, original);
    }
  });

  it('valores por defecto: un código inexistente es 422 con el campo (AC-07.29)', async () => {
    const key = 'crm.valores_por_defecto';
    const original = await currentValue(key);

    const response = await patch(key, '{"customer.statusId":"NO_EXISTE"}').expect(422);

    expect(response.body.details).toEqual([
      expect.objectContaining({ field: 'value.customer.statusId', catalogKey: 'crm.estado_cliente', code: 'NO_EXISTE' }),
    ]);
    expect(await currentValue(key)).toBe(original);
  });

  it('campos obligatorios: campo desconocido 422; los de base se conservan (AC-07.28)', async () => {
    const key = 'crm.campos_obligatorios';
    const original = await currentValue(key);
    try {
      await patch(key, '{"customer":["noExiste"]}').expect(422);
      await patch(key, '{"customer":["taxId"]}').expect(200);
      const stored = JSON.parse(await currentValue(key)) as Record<string, string[]>;
      expect(stored['customer']).toEqual(expect.arrayContaining(['legalName', 'countryId', 'statusId', 'salesOwnerId', 'taxId']));
      expect(stored['project']).toEqual(['name', 'customerId', 'countryId', 'ownerId']);
    } finally {
      await restore(key, original);
    }
  });

  it('403 en un parámetro estructural sin parametros.configurar (AC-07.30)', async () => {
    const { token } = await tokenWithEditWithoutConfigure();
    await patch('crm.forecast.unidad_tonelaje', 'TON', token).expect(403);
  });
});

describe('GET /api/v1/parameters/authentication (D-07.8, RN-07.34, PF-07.14)', () => {
  it('200: proveedor vigente en solo lectura y las claves de login local, sin secretos', async () => {
    const response = await api().get('/api/v1/parameters/authentication').set('Authorization', `Bearer ${adminToken}`).expect(200);

    expect(response.body).toEqual({
      provider: 'local',
      localLoginEnabled: true,
      securityParameterKeys: ['seguridad.intentos_fallidos_maximos', 'seguridad.minutos_bloqueo', 'seguridad.dias_caducidad_password'],
    });
    const serialized = JSON.stringify(response.body).toLowerCase();
    for (const forbidden of ['secret', 'tenant', 'jwt', 'client']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('basta parametros.ver (sin editar ni configurar)', async () => {
    const permission = await ctx.prisma.permission.findUniqueOrThrow({ where: { code: 'parametros.ver' } });
    const role = await ctx.prisma.role.create({
      data: { code: uniqueCode('param-viewer'), name: 'Lector de parámetros (prueba)', permissions: { create: [{ permissionId: permission.id }] } },
    });
    const user = await createTestUser(ctx.prisma, { roleCodes: [role.code] });
    const token = await accessTokenFor(ctx.app, user);
    await api().get('/api/v1/parameters/authentication').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('401 sin token', async () => {
    await api().get('/api/v1/parameters/authentication').expect(401);
  });

  it('403 sin parametros.ver', async () => {
    const { token } = await tokenWithRoles(ctx, ['usuario']);
    const response = await api().get('/api/v1/parameters/authentication').set('Authorization', `Bearer ${token}`).expect(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
  });

  it('no existe ninguna vía de escritura del proveedor', async () => {
    for (const method of ['patch', 'put', 'post'] as const) {
      const response = await api()[method]('/api/v1/parameters/authentication').set('Authorization', `Bearer ${adminToken}`).send({ value: 'entra' });
      // PATCH cae en `/parameters/{key}` y no hay parámetro `authentication`; PUT y POST no existen.
      expect(response.status).toBe(404);
    }
    expect(await ctx.prisma.systemParameter.count({ where: { key: { contains: 'auth' } } })).toBe(0);
  });
});

/**
 * Ajustes 1 (AJ1-1, AJ1-6): parámetros `ui.*` del grupo `interfaz` (PF-AJ1.2, PF-AJ1.19,
 * PF-AJ1.23, AC-AJ1.7b, AC-AJ1.22). Candado exclusivo `ui-settings`, compartido con
 * `me-settings.e2e`, porque los parámetros son globales y los valores se cambian de forma temporal.
 */
describe('parámetros de interfaz (grupo interfaz)', () => {
  const COMPOSITION_KEY = 'ui.inicio.tarjetas';
  const TOPBAR_KEYS = ['ui.barra_superior.buscar', 'ui.barra_superior.pantalla_completa', 'ui.barra_superior.notificaciones'];
  let releaseUi: () => Promise<void>;

  beforeAll(async () => {
    releaseUi = await exclusiveParameters('ui-settings');
  }, EXCLUSIVE_TIMEOUT_MS);

  afterAll(async () => {
    await releaseUi?.();
  });

  async function interfaceGroup(token = adminToken) {
    const response = await api().get('/api/v1/parameters').set('Authorization', `Bearer ${token}`).expect(200);
    const group = (response.body.data as { group: string; parameters: Record<string, unknown>[] }[]).find((entry) => entry.group === 'interfaz');
    return group?.parameters ?? [];
  }

  it('PF-AJ1.23: la semilla crea los cuatro parámetros ui.* con los valores de D-AJ1.4', async () => {
    const parameters = await interfaceGroup();
    const byKey = new Map(parameters.map((parameter) => [parameter.key as string, parameter]));
    expect(byKey.get('ui.barra_superior.buscar')).toMatchObject({ type: 'BOOLEAN', value: 'false', editor: 'boolean', requiresConfigure: false });
    expect(byKey.get('ui.barra_superior.pantalla_completa')).toMatchObject({ type: 'BOOLEAN', value: 'true', editor: 'boolean', requiresConfigure: false });
    expect(byKey.get('ui.barra_superior.notificaciones')).toMatchObject({ type: 'BOOLEAN', value: 'false', editor: 'boolean', requiresConfigure: false });
    expect(byKey.get(COMPOSITION_KEY)).toMatchObject({ type: 'JSON', editor: 'dashboard-cards', requiresConfigure: false, readOnly: false, isSystem: true });
    expect(byKey.has('ui.paginacion_default')).toBe(true);
    // Descripción de buscar y notificaciones: avisan de que aún no tienen función (RN-AJ1.14).
    expect(byKey.get('ui.barra_superior.buscar')?.description).toMatch(/aún no tiene función/i);
    expect(byKey.get('ui.barra_superior.notificaciones')?.description).toMatch(/aún no tiene función/i);
  });

  it('el editor recibe las listas cerradas de claves del backend (editorOptions) y el valor por defecto sembrado', async () => {
    const composition = (await interfaceGroup()).find((parameter) => parameter.key === COMPOSITION_KEY);
    expect(composition?.editorOptions).toEqual({
      blocks: ['safety-minute', 'hero', 'mine', 'kpis', 'alerts', 'activity', 'access'],
      kpis: [
        'projects-active',
        'opportunities-open',
        'opportunities-won',
        'opportunities-lost',
        'forecast',
        'visits-pending',
        'activities-pending',
        'activities-overdue',
        'targets',
      ],
      lockedVisibleBlocks: ['safety-minute'],
    });
    expect(composition?.allowedValues).toHaveLength(16);
    const value = JSON.parse(composition?.value as string) as { blocks: { visible: boolean }[]; kpis: { visible: boolean }[] };
    expect(value.blocks).toHaveLength(7);
    expect(value.kpis).toHaveLength(9);
    expect([...value.blocks, ...value.kpis].every((entry) => entry.visible)).toBe(true);
    // Los demás parámetros no traen editorOptions.
    const other = (await interfaceGroup()).find((parameter) => parameter.key === 'ui.paginacion_default');
    expect(other?.editorOptions).toBeNull();
  });

  it('AC-AJ1.22: parametros.editar basta para editar un booleano ui.* y deja parameter.updated (sin parametros.configurar)', async () => {
    const { token, email } = await tokenWithEditWithoutConfigure();
    const key = 'ui.barra_superior.pantalla_completa';
    const original = await currentValue(key);
    try {
      const response = await api().patch(`/api/v1/parameters/${key}`).set('Authorization', `Bearer ${token}`).send({ value: 'false' }).expect(200);
      expect(response.body).toMatchObject({ key, value: 'false', group: 'interfaz' });
      const audit = await ctx.prisma.auditLog.findFirst({ where: { event: 'parameter.updated', resourceId: key, subjectEmail: email } });
      expect(audit?.changes).toEqual({ value: { before: 'true', after: 'false' } });
    } finally {
      await restore(key, original);
    }
  });

  it.each(TOPBAR_KEYS)('%s rechaza un valor que no es booleano → 422 INVALID_PARAMETER_VALUE', async (key) => {
    const original = await currentValue(key);
    for (const value of ['yes', '1', 'sí', '']) {
      const response = await api().patch(`/api/v1/parameters/${key}`).set('Authorization', `Bearer ${adminToken}`).send({ value }).expect(422);
      expect(response.body.code).toBe('INVALID_PARAMETER_VALUE');
    }
    expect(await currentValue(key)).toBe(original);
  });

  it('PF-AJ1.19 / AC-AJ1.7b: el PATCH de la composición por defecto sin parametros.editar → 403; sin token → 401', async () => {
    const original = await currentValue(COMPOSITION_KEY);
    const { token } = await tokenWithRoles(ctx, ['usuario']);
    for (const key of [COMPOSITION_KEY, ...TOPBAR_KEYS]) {
      const forbidden = await api().patch(`/api/v1/parameters/${key}`).set('Authorization', `Bearer ${token}`).send({ value: original }).expect(403);
      expect(forbidden.body.code).toBe('PERMISSION_DENIED');
      await api().patch(`/api/v1/parameters/${key}`).send({ value: original }).expect(401);
    }
    expect(await currentValue(COMPOSITION_KEY)).toBe(original);
  });

  it('AC-AJ1.7b: editar la composición por defecto la guarda normalizada (safety-minute visible) y audita', async () => {
    const { token, email } = await tokenWithEditWithoutConfigure();
    const original = await currentValue(COMPOSITION_KEY);
    const parsed = JSON.parse(original) as { blocks: { key: string; visible: boolean }[]; kpis: { key: string; visible: boolean }[] };
    const edited = {
      blocks: [...parsed.blocks].reverse().map((entry) => (entry.key === 'safety-minute' ? { key: entry.key, visible: false } : entry)),
      kpis: parsed.kpis.map((entry) => (entry.key === 'targets' ? { key: entry.key, visible: false } : entry)),
    };
    try {
      const response = await api().patch(`/api/v1/parameters/${COMPOSITION_KEY}`).set('Authorization', `Bearer ${token}`).send({ value: JSON.stringify(edited) }).expect(200);
      const saved = JSON.parse(response.body.value as string) as typeof edited;
      expect(saved.blocks.find((entry) => entry.key === 'safety-minute')?.visible).toBe(true);
      expect(saved.blocks.map((entry) => entry.key)).toEqual(edited.blocks.map((entry) => entry.key));
      expect(saved.kpis.find((entry) => entry.key === 'targets')?.visible).toBe(false);
      const audit = await ctx.prisma.auditLog.findFirst({ where: { event: 'parameter.updated', resourceId: COMPOSITION_KEY, subjectEmail: email } });
      expect(audit?.changes).toMatchObject({ value: { before: original } });
    } finally {
      await restore(COMPOSITION_KEY, original);
    }
  });
});
