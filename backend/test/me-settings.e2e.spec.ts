import { randomUUID } from 'node:crypto';

import { DASHBOARD_BLOCK_KEYS, DASHBOARD_KPI_KEYS, DEFAULT_DASHBOARD_CARDS } from '@/modules/parameters/dashboard-cards';

import { api, EXCLUSIVE_TIMEOUT_MS, exclusiveParameters, withParameter } from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext, tokenWithRoles } from './support/test-app';

/**
 * Ajustes 1 · Configuración de interfaz y preferencias del propio usuario (AJ1-1, AJ1-6, AJ1-7)
 * contra PostgreSQL: `GET /me/ui-settings`, `GET /me/preferences`, `PUT /me/preferences/theme`,
 * `PUT`/`DELETE /me/preferences/dashboard-cards` (PF-AJ1.2, PF-AJ1.4b, PF-AJ1.12, PF-AJ1.18–20).
 * `GET /me/safety-minute` se prueba en `safety-minutes.e2e.spec.ts`.
 *
 * Los parámetros `ui.*` son globales y las suites corren en paralelo sobre el mismo esquema:
 * esta suite toma el candado exclusivo `ui-settings` (lo toma también `parameters.e2e`) y cada
 * cambio temporal de un parámetro se repone con `withParameter`.
 */

let context: TestContext;
let releaseUi: () => Promise<void>;
let adminToken: string;

const visible = (keys: readonly string[]) => keys.map((key) => ({ key, visible: true }));
const DEFAULT_BODY = { blocks: visible(DASHBOARD_BLOCK_KEYS), kpis: visible(DASHBOARD_KPI_KEYS) };

/** Composición propia reconocible: bloques al revés, «forecast» oculto y «hero» oculto. */
function customBody() {
  return {
    blocks: [...visible(DASHBOARD_BLOCK_KEYS)].reverse().map((entry) => (entry.key === 'hero' ? { ...entry, visible: false } : entry)),
    kpis: visible(DASHBOARD_KPI_KEYS).map((entry) => (entry.key === 'forecast' ? { ...entry, visible: false } : entry)),
  };
}

async function newUser() {
  return tokenWithRoles(context, ['usuario']);
}

async function storedRows(userId: string, key: string) {
  return context.prisma.userPreference.findMany({ where: { userId, key } });
}

beforeAll(async () => {
  releaseUi = await exclusiveParameters('ui-settings');
  context = await createTestContext();
  adminToken = (await tokenWithRoles(context, ['administrador'])).token;
}, EXCLUSIVE_TIMEOUT_MS);

afterAll(async () => {
  try {
    await closeTestContext(context);
  } finally {
    await releaseUi?.();
  }
});

describe('Autenticación (PF-AJ1.18, AC-AJ1.29)', () => {
  const routes: [method: 'get' | 'put' | 'delete', path: string][] = [
    ['get', '/me/ui-settings'],
    ['get', '/me/preferences'],
    ['put', '/me/preferences/theme'],
    ['put', '/me/preferences/dashboard-cards'],
    ['delete', '/me/preferences/dashboard-cards'],
  ];

  it.each(routes)('401 sin token: %s %s', async (method, path) => {
    const response = await api(context)[method](path).send({});
    expect(response.status).toBe(401);
  });

  it.each(routes)('con un token de cualquier rol (sin permisos) responde sin 403: %s %s', async (method, path) => {
    const { token } = await newUser();
    const response = await api(context, token)[method](path).send(path.endsWith('theme') ? { value: 'dark' } : DEFAULT_BODY);
    expect(response.status).not.toBe(403);
    expect(response.status).toBeLessThan(300);
  });

  it('no hay {userId} en la ruta: leer o escribir preferencias de otro no existe (404)', async () => {
    const { user, token } = await newUser();
    await api(context, token).get(`/me/preferences/${user.id}`).expect(404);
    await api(context, token).put(`/users/${user.id}/preferences/theme`).send({ value: 'dark' }).expect(404);
  });
});

describe('GET /me/ui-settings (PF-AJ1.2, AC-AJ1.2, AC-AJ1.23)', () => {
  it('sin preferencia: la composición por defecto sembrada, isCustomized false y la barra superior sembrada', async () => {
    const { token } = await newUser();
    const response = await api(context, token).get('/me/ui-settings').expect(200);
    expect(response.body).toEqual({
      dashboard: { isCustomized: false, ...DEFAULT_BODY },
      topbar: { search: false, fullscreen: true, notifications: false },
    });
    // Respuesta mínima: no expone ningún otro parámetro ni identificadores.
    expect(Object.keys(response.body).sort()).toEqual(['dashboard', 'topbar']);
    expect(response.body.dashboard.blocks).toEqual(DEFAULT_DASHBOARD_CARDS.blocks);
  });

  it('RN-AJ1.6: el parámetro sembrado es la composición actual, todo visible y en orden', async () => {
    const stored = await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: 'ui.inicio.tarjetas' } });
    expect(stored).toMatchObject({ type: 'JSON', group: 'interfaz', isSystem: true });
    expect(JSON.parse(stored.value)).toEqual(DEFAULT_BODY);
  });

  it('AC-AJ1.7b: editar la composición por defecto la ve quien no personalizó, no quien sí', async () => {
    const reordered = { blocks: [...visible(DASHBOARD_BLOCK_KEYS)].reverse(), kpis: DEFAULT_BODY.kpis };
    const plain = await newUser();
    const customized = await newUser();
    await api(context, customized.token).put('/me/preferences/dashboard-cards').send(customBody()).expect(200);

    await withParameter(context.prisma, 'ui.inicio.tarjetas', JSON.stringify(DEFAULT_BODY), async () => {
      // Se edita por la API de parámetros, como lo haría el administrador.
      const patched = await api(context, adminToken).patch('/parameters/ui.inicio.tarjetas').send({ value: JSON.stringify(reordered) }).expect(200);
      expect(JSON.parse(patched.body.value as string)).toEqual(reordered);

      const seenByPlain = await api(context, plain.token).get('/me/ui-settings').expect(200);
      expect(seenByPlain.body.dashboard).toEqual({ isCustomized: false, ...reordered });
      const seenByCustomized = await api(context, customized.token).get('/me/ui-settings').expect(200);
      expect(seenByCustomized.body.dashboard).toEqual({ isCustomized: true, ...customBody() });
    });
  });

  it('con preferencia propia prevalece, isCustomized true, y no cambia el panel de otro usuario (aislamiento)', async () => {
    const owner = await newUser();
    const other = await newUser();
    await api(context, owner.token).put('/me/preferences/dashboard-cards').send(customBody()).expect(200);

    const own = await api(context, owner.token).get('/me/ui-settings').expect(200);
    expect(own.body.dashboard).toEqual({ isCustomized: true, ...customBody() });
    const others = await api(context, other.token).get('/me/ui-settings').expect(200);
    expect(others.body.dashboard).toEqual({ isCustomized: false, ...DEFAULT_BODY });
  });

  it('RN-AJ1.4: una preferencia ilegible cae a la composición por defecto, sin fallar', async () => {
    const { user, token } = await newUser();
    for (const junk of [{ secreto: 'x' }, 'texto', 42, [], { blocks: 'x', kpis: [] }, null]) {
      await context.prisma.userPreference.deleteMany({ where: { userId: user.id } });
      await context.prisma.userPreference.create({ data: { userId: user.id, key: 'ui.inicio.tarjetas', value: junk as never } });
      const settings = await api(context, token).get('/me/ui-settings').expect(200);
      expect(settings.body.dashboard).toEqual({ isCustomized: false, ...DEFAULT_BODY });
      const preferences = await api(context, token).get('/me/preferences').expect(200);
      expect(preferences.body.dashboardCards).toBeNull();
    }
  });

  it('RN-AJ1.4: una preferencia a la que le faltan claves se normaliza (faltantes al final, visibles; desconocidas fuera)', async () => {
    const { user, token } = await newUser();
    const stale = {
      blocks: [{ key: 'activity', visible: false }, { key: 'obsoleto', visible: true }, ...visible(DASHBOARD_BLOCK_KEYS).filter((entry) => entry.key !== 'activity' && entry.key !== 'access')],
      kpis: visible(DASHBOARD_KPI_KEYS).slice(0, 8),
    };
    await context.prisma.userPreference.create({ data: { userId: user.id, key: 'ui.inicio.tarjetas', value: stale } });
    const settings = await api(context, token).get('/me/ui-settings').expect(200);
    expect(settings.body.dashboard.isCustomized).toBe(true);
    expect(settings.body.dashboard.blocks.map((entry: { key: string }) => entry.key)).toEqual([
      'activity',
      'safety-minute',
      'hero',
      'mine',
      'kpis',
      'alerts',
      'access',
    ]);
    expect(settings.body.dashboard.blocks[0]).toEqual({ key: 'activity', visible: false });
    expect(settings.body.dashboard.kpis).toHaveLength(9);
    expect(settings.body.dashboard.kpis[8]).toEqual({ key: 'targets', visible: true });
  });

  it('RN-AJ1.3: aunque lo guardado diga lo contrario, safety-minute sale siempre visible', async () => {
    const { user, token } = await newUser();
    const hidden = { blocks: DEFAULT_BODY.blocks.map((entry) => (entry.key === 'safety-minute' ? { ...entry, visible: false } : entry)), kpis: DEFAULT_BODY.kpis };
    await context.prisma.userPreference.create({ data: { userId: user.id, key: 'ui.inicio.tarjetas', value: hidden } });
    const settings = await api(context, token).get('/me/ui-settings').expect(200);
    expect(settings.body.dashboard.blocks[0]).toEqual({ key: 'safety-minute', visible: true });
  });

  it('un parámetro por defecto ilegible o incompleto no rompe la respuesta (RN-AJ1.4)', async () => {
    const { token } = await newUser();
    await withParameter(context.prisma, 'ui.inicio.tarjetas', '{no es json', async () => {
      const settings = await api(context, token).get('/me/ui-settings').expect(200);
      expect(settings.body.dashboard).toEqual({ isCustomized: false, ...DEFAULT_BODY });
    });
    await withParameter(context.prisma, 'ui.inicio.tarjetas', JSON.stringify({ blocks: [{ key: 'mine', visible: false }], kpis: [] }), async () => {
      const settings = await api(context, token).get('/me/ui-settings').expect(200);
      expect(settings.body.dashboard.blocks[0]).toEqual({ key: 'mine', visible: false });
      expect(settings.body.dashboard.blocks).toHaveLength(7);
      expect(settings.body.dashboard.kpis).toEqual(DEFAULT_BODY.kpis);
    });
  });

  it('AC-AJ1.22: los tres botones de la barra superior salen de sus parámetros', async () => {
    const { token } = await newUser();
    await withParameter(context.prisma, 'ui.barra_superior.pantalla_completa', 'false', async () => {
      const settings = await api(context, token).get('/me/ui-settings').expect(200);
      expect(settings.body.topbar).toEqual({ search: false, fullscreen: false, notifications: false });
    });
    await withParameter(context.prisma, 'ui.barra_superior.buscar', 'true', async () => {
      await withParameter(context.prisma, 'ui.barra_superior.notificaciones', 'true', async () => {
        const settings = await api(context, token).get('/me/ui-settings').expect(200);
        expect(settings.body.topbar).toEqual({ search: true, fullscreen: true, notifications: true });
      });
    });
  });
});

describe('Tema (PF-AJ1.12, PF-AJ1.20, AC-AJ1.25, AC-AJ1.29)', () => {
  it('sin preferencia: theme null; PUT crea la fila, PUT reemplaza la misma; GET la devuelve', async () => {
    const { user, token } = await newUser();
    const client = api(context, token);
    expect((await client.get('/me/preferences').expect(200)).body).toEqual({ theme: null, dashboardCards: null });

    expect((await client.put('/me/preferences/theme').send({ value: 'dark' }).expect(200)).body).toEqual({ theme: 'dark' });
    expect((await client.get('/me/preferences').expect(200)).body).toEqual({ theme: 'dark', dashboardCards: null });
    const [row] = await storedRows(user.id, 'ui.tema');
    expect(row?.value).toBe('dark');

    expect((await client.put('/me/preferences/theme').send({ value: 'light' }).expect(200)).body).toEqual({ theme: 'light' });
    const rows = await storedRows(user.id, 'ui.tema');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('light');
    expect(rows[0]?.id).toBe(row?.id);
  });

  it('PUT simultáneos del mismo usuario (sin fila previa): ninguno es 500 y queda una sola fila', async () => {
    const { user, token } = await newUser();
    const values = ['dark', 'light', 'dark', 'light', 'dark', 'light', 'dark', 'light'];
    const responses = await Promise.all(values.map((value) => api(context, token).put('/me/preferences/theme').send({ value })));
    expect(responses.map((response) => response.status)).toEqual(values.map(() => 200));
    const rows = await storedRows(user.id, 'ui.tema');
    expect(rows).toHaveLength(1);
    expect(values).toContain(rows[0]?.value);

    // Gana el último: un PUT posterior reemplaza la misma fila.
    await api(context, token).put('/me/preferences/theme').send({ value: 'light' }).expect(200);
    const after = await storedRows(user.id, 'ui.tema');
    expect(after).toHaveLength(1);
    expect(after[0]?.value).toBe('light');
  });

  it.each([
    ['un valor no admitido', { value: 'blue' }],
    ['«system» (D-AJ1.7)', { value: 'system' }],
    ['mayúsculas', { value: 'DARK' }],
    ['sin valor', {}],
    ['valor que no es texto', { value: 1 }],
    ['valor null', { value: null }],
    ['campos extra', { value: 'dark', userId: randomUUID() }],
  ])('PUT /me/preferences/theme con %s → 400 VALIDATION_FAILED y no guarda nada', async (_name, body) => {
    const { user, token } = await newUser();
    const response = await api(context, token).put('/me/preferences/theme').send(body).expect(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(await storedRows(user.id, 'ui.tema')).toHaveLength(0);
  });

  it('el tema de un usuario no cambia el de otro (aislamiento)', async () => {
    const first = await newUser();
    const second = await newUser();
    await api(context, first.token).put('/me/preferences/theme').send({ value: 'dark' }).expect(200);
    expect((await api(context, second.token).get('/me/preferences').expect(200)).body.theme).toBeNull();
    await api(context, second.token).put('/me/preferences/theme').send({ value: 'light' }).expect(200);
    expect((await api(context, first.token).get('/me/preferences').expect(200)).body.theme).toBe('dark');
  });

  it('un tema ilegible guardado se lee como sin preferencia', async () => {
    const { user, token } = await newUser();
    await context.prisma.userPreference.create({ data: { userId: user.id, key: 'ui.tema', value: 'azul' } });
    expect((await api(context, token).get('/me/preferences').expect(200)).body.theme).toBeNull();
  });
});

describe('Panel de Inicio del usuario (PF-AJ1.4b, PF-AJ1.19, AC-AJ1.2, AC-AJ1.4, AC-AJ1.7)', () => {
  it('guarda, devuelve la composición guardada, reemplaza y restablece (idempotente)', async () => {
    const { user, token } = await newUser();
    const client = api(context, token);

    const saved = await client.put('/me/preferences/dashboard-cards').send(customBody()).expect(200);
    expect(saved.body).toEqual(customBody());
    expect((await client.get('/me/preferences').expect(200)).body.dashboardCards).toEqual(customBody());
    expect((await client.get('/me/ui-settings').expect(200)).body.dashboard).toEqual({ isCustomized: true, ...customBody() });

    // Reemplaza la misma fila.
    const [first] = await storedRows(user.id, 'ui.inicio.tarjetas');
    const second = { blocks: DEFAULT_BODY.blocks, kpis: [...DEFAULT_BODY.kpis].reverse() };
    expect((await client.put('/me/preferences/dashboard-cards').send(second).expect(200)).body).toEqual(second);
    const rows = await storedRows(user.id, 'ui.inicio.tarjetas');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(first?.id);

    await client.delete('/me/preferences/dashboard-cards').expect(204);
    expect(await storedRows(user.id, 'ui.inicio.tarjetas')).toHaveLength(0);
    expect((await client.get('/me/ui-settings').expect(200)).body.dashboard).toEqual({ isCustomized: false, ...DEFAULT_BODY });
    expect((await client.get('/me/preferences').expect(200)).body.dashboardCards).toBeNull();
    // Sin preferencia previa también 204.
    await client.delete('/me/preferences/dashboard-cards').expect(204);
  });

  it('restablecer borra solo el panel: el tema se conserva, y el panel de otro usuario también', async () => {
    const owner = await newUser();
    const other = await newUser();
    await api(context, owner.token).put('/me/preferences/theme').send({ value: 'dark' }).expect(200);
    await api(context, owner.token).put('/me/preferences/dashboard-cards').send(customBody()).expect(200);
    await api(context, other.token).put('/me/preferences/dashboard-cards').send(customBody()).expect(200);

    await api(context, owner.token).delete('/me/preferences/dashboard-cards').expect(204);
    expect((await api(context, owner.token).get('/me/preferences').expect(200)).body).toEqual({ theme: 'dark', dashboardCards: null });
    expect((await api(context, other.token).get('/me/ui-settings').expect(200)).body.dashboard.isCustomized).toBe(true);
  });

  it('RN-AJ1.3 (D-AJ1.10): safety-minute en visible=false se guarda y se devuelve visible', async () => {
    const { token } = await newUser();
    const body = { blocks: DEFAULT_BODY.blocks.map((entry) => (entry.key === 'safety-minute' ? { ...entry, visible: false } : entry)), kpis: DEFAULT_BODY.kpis };
    const saved = await api(context, token).put('/me/preferences/dashboard-cards').send(body).expect(200);
    expect(saved.body.blocks[0]).toEqual({ key: 'safety-minute', visible: true });
    expect((await api(context, token).get('/me/ui-settings').expect(200)).body.dashboard.blocks[0]).toEqual({ key: 'safety-minute', visible: true });
  });

  it.each([
    ['clave de bloque desconocida', { blocks: [...DEFAULT_BODY.blocks, { key: 'nuevo', visible: true }], kpis: DEFAULT_BODY.kpis }, 'unknown_key', 'blocks.7.key'],
    ['clave de indicador desconocida', { blocks: DEFAULT_BODY.blocks, kpis: [...DEFAULT_BODY.kpis, { key: 'k10', visible: true }] }, 'unknown_key', 'kpis.9.key'],
    ['un indicador en la lista de bloques', { blocks: [...DEFAULT_BODY.blocks, { key: 'forecast', visible: true }], kpis: DEFAULT_BODY.kpis }, 'unknown_key', 'blocks.7.key'],
    ['clave de bloque repetida', { blocks: [...DEFAULT_BODY.blocks, { key: 'hero', visible: false }], kpis: DEFAULT_BODY.kpis }, 'duplicated_key', 'blocks.7.key'],
    ['clave de indicador repetida', { blocks: DEFAULT_BODY.blocks, kpis: [...DEFAULT_BODY.kpis, { key: 'targets', visible: true }] }, 'duplicated_key', 'kpis.9.key'],
    ['bloque faltante', { blocks: DEFAULT_BODY.blocks.filter((entry) => entry.key !== 'access'), kpis: DEFAULT_BODY.kpis }, 'missing_key', 'blocks'],
    ['indicador faltante', { blocks: DEFAULT_BODY.blocks, kpis: DEFAULT_BODY.kpis.slice(1) }, 'missing_key', 'kpis'],
    ['listas vacías', { blocks: [], kpis: [] }, 'missing_key', 'blocks'],
  ])('PUT con %s → 422 INVALID_DASHBOARD_CARDS (%s) y no guarda nada', async (_name, body, issue, field) => {
    const { user, token } = await newUser();
    const response = await api(context, token).put('/me/preferences/dashboard-cards').send(body).expect(422);
    expect(response.body.code).toBe('INVALID_DASHBOARD_CARDS');
    expect(response.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ issue, field })]));
    expect(await storedRows(user.id, 'ui.inicio.tarjetas')).toHaveLength(0);
  });

  it('el 422 no pisa una preferencia ya guardada', async () => {
    const { token } = await newUser();
    await api(context, token).put('/me/preferences/dashboard-cards').send(customBody()).expect(200);
    await api(context, token).put('/me/preferences/dashboard-cards').send({ blocks: [], kpis: [] }).expect(422);
    expect((await api(context, token).get('/me/preferences').expect(200)).body.dashboardCards).toEqual(customBody());
  });

  it.each([
    ['sin cuerpo', undefined],
    ['sin kpis', { blocks: DEFAULT_BODY.blocks }],
    ['blocks que no es una lista', { blocks: 'hero', kpis: DEFAULT_BODY.kpis }],
    ['visible que no es booleano', { blocks: [{ key: 'hero', visible: 'sí' }], kpis: DEFAULT_BODY.kpis }],
    ['entrada sin clave', { blocks: [{ visible: true }], kpis: DEFAULT_BODY.kpis }],
    ['clave que no es texto', { blocks: [{ key: 5, visible: true }], kpis: DEFAULT_BODY.kpis }],
    ['campo extra en una entrada', { blocks: [{ key: 'hero', visible: true, extra: 1 }], kpis: DEFAULT_BODY.kpis }],
    ['campo extra en el cuerpo', { ...DEFAULT_BODY, userId: randomUUID() }],
    ['clave de más de 50 caracteres', { blocks: [{ key: 'k'.repeat(51), visible: true }], kpis: DEFAULT_BODY.kpis }],
    ['más de 30 entradas', { blocks: Array.from({ length: 31 }, () => ({ key: 'hero', visible: true })), kpis: DEFAULT_BODY.kpis }],
  ])('PUT con %s → 400 VALIDATION_FAILED', async (_name, body) => {
    const { user, token } = await newUser();
    const response = await api(context, token).put('/me/preferences/dashboard-cards').send(body as object).expect(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(await storedRows(user.id, 'ui.inicio.tarjetas')).toHaveLength(0);
  });

  it('PF-AJ1.19: PATCH /parameters/ui.inicio.tarjetas con clave desconocida, repetida o faltante → 422 INVALID_PARAMETER_VALUE', async () => {
    const current = (await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: 'ui.inicio.tarjetas' } })).value;
    for (const body of [
      { blocks: [...DEFAULT_BODY.blocks, { key: 'nuevo', visible: true }], kpis: DEFAULT_BODY.kpis },
      { blocks: DEFAULT_BODY.blocks, kpis: [...DEFAULT_BODY.kpis, { key: 'targets', visible: true }] },
      { blocks: DEFAULT_BODY.blocks, kpis: DEFAULT_BODY.kpis.slice(2) },
    ]) {
      const response = await api(context, adminToken).patch('/parameters/ui.inicio.tarjetas').send({ value: JSON.stringify(body) }).expect(422);
      expect(response.body.code).toBe('INVALID_PARAMETER_VALUE');
      expect(response.body.details[0].field).toMatch(/^value\./);
    }
    expect((await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: 'ui.inicio.tarjetas' } })).value).toBe(current);
  });

  it('las preferencias personales no se auditan (RN-AJ1.6b, RN-AJ1.18)', async () => {
    const { user, token } = await newUser();
    const before = await context.prisma.auditLog.count({ where: { subjectEmail: user.email } });
    await api(context, token).put('/me/preferences/theme').send({ value: 'dark' }).expect(200);
    await api(context, token).put('/me/preferences/dashboard-cards').send(customBody()).expect(200);
    await api(context, token).delete('/me/preferences/dashboard-cards').expect(204);
    expect(await context.prisma.auditLog.count({ where: { subjectEmail: user.email } })).toBe(before);
    expect(await context.prisma.auditLog.count({ where: { OR: [{ event: { contains: 'preference' } }, { resourceType: { contains: 'preference' } }] } })).toBe(0);
  });
});
