import { randomUUID } from 'node:crypto';

import { api, type CrmUser, crmUser, insertCustomer, insertProject, testCountry } from './support/crm-fixtures';
import { closeTestContext, createTestContext, createTestUser, accessTokenFor, type TestContext, tokenWithRoles } from './support/test-app';

/**
 * Módulo 7 · Tipos de cambio y monedas (07 F.7, RN-07.44; ADR-024) contra PostgreSQL:
 * `GET/POST /exchange-rates`, `PATCH /exchange-rates/{id}`, `GET /currencies`
 * (AC-07.40, PF-07.47, PF-07.48, PF-07.39) y la foto de las oportunidades (PF-07.51).
 *
 * Aislamiento: monedas propias `XEA` (activa), `XEB` (inactiva) y `XEC` (para la foto),
 * país `E7` con `XEC` como moneda local. No se toca ninguna tasa de las monedas reales.
 */

let context: TestContext;
let adminToken: string;
let viewerToken: string;
let plainToken: string;

const ACTIVE = 'XEA';
const INACTIVE = 'XEB';
const SNAPSHOT = 'XEC';
let snapshotCountryId: string;

/** Usuario con un rol propio que solo concede `permissionCodes`. */
async function tokenWithPermissions(permissionCodes: string[]): Promise<string> {
  const permissions = await context.prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
  expect(permissions).toHaveLength(permissionCodes.length);
  const code = `test-xr-${randomUUID().slice(0, 8)}`;
  await context.prisma.role.create({
    data: { code, name: `Rol de prueba ${code}`, permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) } },
  });
  return accessTokenFor(context.app, await createTestUser(context.prisma, { roleCodes: [code] }));
}

async function auditEvents(event: string, resourceId: string) {
  return context.prisma.auditLog.findMany({ where: { event, resourceId }, orderBy: { occurredAt: 'asc' } });
}

beforeAll(async () => {
  context = await createTestContext();
  const { prisma } = context;
  for (const [code, isActive] of [
    [ACTIVE, true],
    [INACTIVE, false],
    [SNAPSHOT, true],
  ] as const) {
    await prisma.currency.upsert({ where: { code }, update: { isActive }, create: { code, name: `Moneda de prueba ${code}`, symbol: `${code[2]}$`, isActive } });
  }
  // Re-ejecución sobre el mismo esquema: las tasas de las monedas propias se recrean.
  await prisma.exchangeRate.deleteMany({ where: { currencyCode: { in: [ACTIVE, INACTIVE, SNAPSHOT] } } });
  snapshotCountryId = await testCountry(prisma, 'E7', { name: 'Tipos de cambio Siete', currencyCode: SNAPSHOT });

  adminToken = (await tokenWithRoles(context, ['administrador'])).token;
  viewerToken = await tokenWithPermissions(['parametros.ver']);
  plainToken = (await tokenWithRoles(context, ['usuario'])).token;
});

afterAll(async () => {
  await closeTestContext(context);
});

describe('Autenticación y permisos (PF-07.39, AC-07.40)', () => {
  const id = randomUUID();
  const routes: [method: 'get' | 'post' | 'patch', path: string][] = [
    ['get', '/exchange-rates'],
    ['post', '/exchange-rates'],
    ['patch', `/exchange-rates/${id}`],
    ['get', '/currencies'],
  ];

  it.each(routes)('401 sin token: %s %s', async (method, path) => {
    const response = await api(context)[method](path).send({});
    expect(response.status).toBe(401);
  });

  it.each(routes)('403 sin parametros.ver (rol usuario): %s %s', async (method, path) => {
    const response = await api(context, plainToken)[method](path).send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
  });

  it('solo parametros.ver: consulta tipos de cambio y monedas, pero registrar o corregir → 403', async () => {
    const client = api(context, viewerToken);
    await client.get('/exchange-rates').expect(200);
    await client.get('/currencies').expect(200);
    const create = await client.post('/exchange-rates').send({ currencyCode: ACTIVE, effectiveDate: '2026-01-01', ratePerUsd: '1', source: 'x' }).expect(403);
    expect(create.body.code).toBe('PERMISSION_DENIED');
    await client.patch(`/exchange-rates/${id}`).send({ source: 'x' }).expect(403);
  });
});

describe('GET /currencies (solo lectura)', () => {
  it('todas las monedas por código, con las sembradas y las inactivas', async () => {
    const response = await api(context, viewerToken).get('/currencies').expect(200);
    const data = response.body.data as { code: string }[];
    expect(data).toEqual(expect.arrayContaining([
      { code: 'USD', name: expect.any(String), symbol: '$', decimals: 2, isActive: true },
      expect.objectContaining({ code: 'GTQ' }),
      { code: INACTIVE, name: `Moneda de prueba ${INACTIVE}`, symbol: 'B$', decimals: 2, isActive: false },
    ]));
    const codes = data.map((currency) => currency.code);
    expect(codes).toEqual([...codes].sort());
    expect(response.body).not.toHaveProperty('pagination');
  });

  it('no hay escritura de monedas', async () => {
    expect((await api(context, adminToken).post('/currencies').send({ code: 'ZZZ' })).status).toBe(404);
  });
});

describe('Alta, consulta y corrección (AC-07.40, PF-07.47)', () => {
  it('registra, filtra por moneda y rango, corrige con auditoría y no admite cambiar moneda ni fecha', async () => {
    const admin = api(context, adminToken);
    const created = await admin
      .post('/exchange-rates')
      .send({ currencyCode: ACTIVE.toLowerCase(), effectiveDate: '2026-10-01', ratePerUsd: '7.75', source: '  Banco central ', notes: '' })
      .expect(201);
    expect(created.headers['location']).toBe(`/api/v1/exchange-rates/${created.body.id}`);
    expect(created.body).toEqual({
      id: expect.any(String),
      currencyCode: ACTIVE,
      effectiveDate: '2026-10-01',
      ratePerUsd: '7.75000000',
      source: 'Banco central',
      notes: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      updatedBy: { id: expect.any(String), displayName: 'Persona De prueba' },
    });
    const id = created.body.id as string;
    const [createdEvent] = await auditEvents('crm.exchange_rate.created', id);
    expect(createdEvent).toMatchObject({ resourceType: 'crm.exchange_rate' });
    expect(createdEvent?.changes).toMatchObject({ ratePerUsd: { before: null, after: '7.75000000' }, currencyCode: { after: ACTIVE } });

    await admin.post('/exchange-rates').send({ currencyCode: ACTIVE, effectiveDate: '2026-09-01', ratePerUsd: '7.7', source: 'Banco central' }).expect(201);
    await admin.post('/exchange-rates').send({ currencyCode: ACTIVE, effectiveDate: '2026-11-01', ratePerUsd: '7.8', source: 'Banco central' }).expect(201);

    const october = await api(context, viewerToken).get(`/exchange-rates?currencyCode=${ACTIVE}&from=2026-10-01&to=2026-10-31`).expect(200);
    expect(october.body.data.map((row: { id: string }) => row.id)).toEqual([id]);
    expect(october.body.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });

    const all = await api(context, viewerToken).get(`/exchange-rates?currencyCode=${ACTIVE}`).expect(200);
    expect(all.body.data.map((row: { effectiveDate: string }) => row.effectiveDate)).toEqual(['2026-11-01', '2026-10-01', '2026-09-01']);
    const ascending = await api(context, viewerToken).get(`/exchange-rates?currencyCode=${ACTIVE}&sortBy=effectiveDate&sortOrder=asc&pageSize=2`).expect(200);
    expect(ascending.body.data.map((row: { effectiveDate: string }) => row.effectiveDate)).toEqual(['2026-09-01', '2026-10-01']);
    expect(ascending.body.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });

    const corrected = await admin.patch(`/exchange-rates/${id}`).send({ ratePerUsd: '7.7612', source: 'Tesorería', notes: 'Corrección del cierre' }).expect(200);
    expect(corrected.body).toMatchObject({ id, currencyCode: ACTIVE, effectiveDate: '2026-10-01', ratePerUsd: '7.76120000', source: 'Tesorería', notes: 'Corrección del cierre' });
    const [updatedEvent] = await auditEvents('crm.exchange_rate.updated', id);
    expect(updatedEvent?.changes).toEqual({
      ratePerUsd: { before: '7.75000000', after: '7.76120000' },
      source: { before: 'Banco central', after: 'Tesorería' },
      notes: { before: null, after: 'Corrección del cierre' },
    });

    // Sin cambios: 200 y ningún evento nuevo.
    await admin.patch(`/exchange-rates/${id}`).send({ ratePerUsd: '7.76120000' }).expect(200);
    expect(await auditEvents('crm.exchange_rate.updated', id)).toHaveLength(1);

    for (const body of [{ effectiveDate: '2026-10-02' }, { currencyCode: 'GTQ' }, { ratePerUsd: 7.9 }, { source: '' }, { source: null }]) {
      const response = await admin.patch(`/exchange-rates/${id}`).send(body).expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    }
    const row = await context.prisma.exchangeRate.findUniqueOrThrow({ where: { id } });
    expect(row.effectiveDate.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(row.currencyCode).toBe(ACTIVE);

    // No existe borrado.
    expect((await admin.delete(`/exchange-rates/${id}`)).status).toBe(404);
    expect(await context.prisma.exchangeRate.count({ where: { id } })).toBe(1);
  });
});

describe('Errores (PF-07.48)', () => {
  it('misma moneda y fecha → 409 EXCHANGE_RATE_DUPLICATE', async () => {
    const admin = api(context, adminToken);
    await admin.post('/exchange-rates').send({ currencyCode: ACTIVE, effectiveDate: '2026-05-01', ratePerUsd: '7.5', source: 'x' }).expect(201);
    const duplicate = await admin.post('/exchange-rates').send({ currencyCode: ACTIVE, effectiveDate: '2026-05-01', ratePerUsd: '7.6', source: 'y' }).expect(409);
    expect(duplicate.body).toMatchObject({
      code: 'EXCHANGE_RATE_DUPLICATE',
      details: [{ field: 'effectiveDate', currencyCode: ACTIVE, effectiveDate: '2026-05-01' }],
    });
  });

  it.each([
    ['USD', '7.75', 'base_currency', 'currencyCode'],
    [INACTIVE, '7.75', 'inactive_currency', 'currencyCode'],
    ['XQZ', '7.75', 'unknown_currency', 'currencyCode'],
    [ACTIVE, '0', 'non_positive_rate', 'ratePerUsd'],
    [ACTIVE, '-2.5', 'non_positive_rate', 'ratePerUsd'],
  ])('%s con tasa %s → 422 INVALID_EXCHANGE_RATE (%s)', async (currencyCode, ratePerUsd, issue, field) => {
    const response = await api(context, adminToken)
      .post('/exchange-rates')
      .send({ currencyCode, effectiveDate: '2026-06-15', ratePerUsd, source: 'x' })
      .expect(422);
    expect(response.body).toMatchObject({ code: 'INVALID_EXCHANGE_RATE', details: [expect.objectContaining({ field, issue })] });
  });

  it('corrección con tasa ≤ 0 → 422; id inexistente → 404; id no UUID → 400', async () => {
    const admin = api(context, adminToken);
    const created = await admin.post('/exchange-rates').send({ currencyCode: ACTIVE, effectiveDate: '2026-04-01', ratePerUsd: '7.4', source: 'x' }).expect(201);
    const invalid = await admin.patch(`/exchange-rates/${created.body.id}`).send({ ratePerUsd: '0' }).expect(422);
    expect(invalid.body).toMatchObject({ code: 'INVALID_EXCHANGE_RATE', details: [{ field: 'ratePerUsd', issue: 'non_positive_rate' }] });
    await admin.patch(`/exchange-rates/${randomUUID()}`).send({ source: 'x' }).expect(404);
    await admin.patch('/exchange-rates/no-es-uuid').send({ source: 'x' }).expect(400);
  });

  it('400 VALIDATION_FAILED: formato del alta y filtros', async () => {
    const admin = api(context, adminToken);
    for (const body of [
      { currencyCode: ACTIVE, effectiveDate: '2026-02-30', ratePerUsd: '7', source: 'x' },
      { currencyCode: ACTIVE, effectiveDate: '2026-02-01', ratePerUsd: 7, source: 'x' },
      { currencyCode: ACTIVE, effectiveDate: '2026-02-01', ratePerUsd: '7.123456789', source: 'x' },
      { currencyCode: 'GT', effectiveDate: '2026-02-01', ratePerUsd: '7', source: 'x' },
      { currencyCode: ACTIVE, effectiveDate: '2026-02-01', ratePerUsd: '7', source: '   ' },
      { currencyCode: ACTIVE, effectiveDate: '2026-02-01', ratePerUsd: '7', source: 'x'.repeat(121) },
      { currencyCode: ACTIVE, effectiveDate: '2026-02-01', ratePerUsd: '7', source: 'x', notes: 'n'.repeat(501) },
      { currencyCode: ACTIVE, effectiveDate: '2026-02-01', ratePerUsd: '7', source: 'x', extra: true },
    ]) {
      const response = await admin.post('/exchange-rates').send(body);
      expect({ body, status: response.status, code: response.body.code }).toEqual({ body, status: 400, code: 'VALIDATION_FAILED' });
    }
    for (const query of ['from=2026-10-31&to=2026-10-01', 'from=2026-13-01', 'currencyCode=GTQQ', 'sortBy=ratePerUsd', 'pageSize=101', 'search=x']) {
      const response = await api(context, viewerToken).get(`/exchange-rates?${query}`);
      expect({ query, status: response.status }).toEqual({ query, status: 400 });
    }
  });
});

describe('Corregir una tasa no altera la foto de las oportunidades (PF-07.51, AC-07.40)', () => {
  let advisor: CrmUser;

  beforeAll(async () => {
    advisor = await crmUser(context, { roleCodes: ['asesor'], countryId: snapshotCountryId });
  });

  async function opportunity(projectId: string, opportunityDate: string) {
    return api(context, advisor.token)
      .post(`/projects/${projectId}/opportunities`)
      .send({ opportunityDate, estimatedAmount: '800', currencyCode: SNAPSHOT })
      .expect(201);
  }

  it('la oportunidad guardada conserva tasa, fecha y USD; una nueva posterior usa la tasa corregida', async () => {
    const admin = api(context, adminToken);
    const rate = await admin.post('/exchange-rates').send({ currencyCode: SNAPSHOT, effectiveDate: '2026-09-01', ratePerUsd: '8', source: 'x' }).expect(201);

    const customer = await insertCustomer(context.prisma, { salesOwnerId: advisor.id, countryId: snapshotCountryId });
    const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: advisor.id, countryId: snapshotCountryId });
    const before = await opportunity(projectId, '2026-09-15');
    expect(before.body).toMatchObject({ exchangeRate: '8.00000000', exchangeRateDate: '2026-09-01', estimatedAmountUsd: '100.0000' });

    await admin.patch(`/exchange-rates/${rate.body.id}`).send({ ratePerUsd: '10' }).expect(200);

    const stored = await context.prisma.opportunity.findUniqueOrThrow({ where: { id: before.body.id } });
    expect(stored.exchangeRate?.toFixed(8)).toBe('8.00000000');
    expect(stored.exchangeRateDate?.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(stored.estimatedAmountUsd?.toFixed(4)).toBe('100.0000');
    const reread = await api(context, advisor.token).get(`/opportunities/${before.body.id}`).expect(200);
    expect(reread.body).toMatchObject({ exchangeRate: '8.00000000', exchangeRateDate: '2026-09-01', estimatedAmountUsd: '100.0000' });

    const after = await opportunity(projectId, '2026-09-20');
    expect(after.body).toMatchObject({ exchangeRate: '10.00000000', exchangeRateDate: '2026-09-01', estimatedAmountUsd: '80.0000' });
  });
});
