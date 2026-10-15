import {
  api,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertCustomer,
  insertOpportunity,
  insertProduct,
  insertProductFamily,
  insertProject,
  insertProjectProduct,
  testCountry,
  unitId,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 5 · Reporte de oportunidades (05 F-35): PF-05.8 a PF-05.12, PF-05.42, PF-05.43,
 * AC-05.5–AC-05.11, AC-05.44, AC-05.45 y la validación de PF-05.27. Países propios
 * `K1`…`K3`, `T4` y moneda de prueba `XRA` (nunca los reales). Las cifras se comparan con el
 * conjunto de un asesor nuevo o filtrando por un país propio: otras suites escriben a la vez.
 */

let context: TestContext;
let k1: string;
let k2: string;
let k3: string;
let k4: string;
let admin: CrmUser;

const RATE_CURRENCY = 'XRA';

beforeAll(async () => {
  context = await createTestContext();
  const { prisma } = context;
  await prisma.currency.upsert({ where: { code: RATE_CURRENCY }, update: { isActive: true }, create: { code: RATE_CURRENCY, name: 'Moneda de prueba de reportes', symbol: 'R$' } });
  for (const [effectiveDate, ratePerUsd] of [
    ['2026-01-01', '10'],
    ['2026-06-01', '12.5'],
  ] as const) {
    await prisma.exchangeRate.upsert({
      where: { currencyCode_effectiveDate: { currencyCode: RATE_CURRENCY, effectiveDate: new Date(`${effectiveDate}T00:00:00Z`) } },
      update: { ratePerUsd },
      create: { currencyCode: RATE_CURRENCY, effectiveDate: new Date(`${effectiveDate}T00:00:00Z`), ratePerUsd, source: 'prueba de integración' },
    });
  }
  k1 = await testCountry(prisma, 'K1', { name: 'Prueba Reportes Oportunidades' });
  k2 = await testCountry(prisma, 'K2', { name: 'Prueba Reportes Moneda local', currencyCode: RATE_CURRENCY });
  k3 = await testCountry(prisma, 'K3', { name: 'Prueba Reportes Moneda local bis', currencyCode: RATE_CURRENCY });
  k4 = await testCountry(prisma, 'T4', { name: 'Prueba Reportes USD', currencyCode: 'USD' });
  admin = await crmUser(context, { roleCodes: ['administrador'] });
});

afterAll(async () => {
  await closeTestContext(context);
});

/** Asesor nuevo (alcance OWN de `reportes.ver`) con un cliente y un proyecto propios. */
async function advisorWithProject(
  countryId = k1,
  project: { estimatedDecisionDate?: string | null; name?: string } = {},
): Promise<{ user: CrmUser; customerId: string; projectId: string }> {
  const user = await crmUser(context, { roleCodes: ['asesor'], countryId });
  const customer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId });
  const projectId = await insertProject(context.prisma, {
    customerId: customer.id,
    ownerId: user.id,
    countryId,
    estimatedDecisionDate: project.estimatedDecisionDate ?? null,
    name: project.name,
  });
  return { user, customerId: customer.id, projectId };
}

function idsOf(rows: { id: string }[]): string[] {
  return rows.map((row) => row.id).sort();
}

describe('GET /reports/opportunities/summary — conteos y distribuciones (PF-05.9, PF-05.11, AC-05.5, AC-05.6, AC-05.10)', () => {
  it('conteos disjuntos con abiertas, WON, PARTIAL, LOST y cerrada sin resultado; el parcial cuenta como ganada', async () => {
    const { user, projectId } = await advisorWithProject(k1, { estimatedDecisionDate: '2026-12-15' });
    const ownerId = user.id;
    const ids = {
      contacted: await insertOpportunity(context.prisma, { projectId, ownerId, stageCode: 'CONTACTADO' }),
      quoting: await insertOpportunity(context.prisma, { projectId, ownerId, stageCode: 'COTIZANDO' }),
      won: await insertOpportunity(context.prisma, { projectId, ownerId, stageCode: 'GANADO', outcome: 'WON' }),
      partial: await insertOpportunity(context.prisma, { projectId, ownerId, stageCode: 'GANADO', outcome: 'PARTIAL', awardedPercent: '60' }),
      lost: await insertOpportunity(context.prisma, { projectId, ownerId, stageCode: 'PERDIDO', outcome: 'LOST' }),
      closedNoResult: await insertOpportunity(context.prisma, { projectId, ownerId, stageCode: 'GANADO' }),
    };
    // Eliminada lógicamente: no cuenta (RN-05.5).
    await insertOpportunity(context.prisma, { projectId, ownerId, stageCode: 'CONTACTADO', deletedAt: new Date() });

    const summary = await api(context, user.token).get('/reports/opportunities/summary').expect(200);
    expect(summary.body).toMatchObject({ total: 6, open: 2, won: 2, wonFull: 1, partial: 1, lost: 1, closedWithoutResult: 1 });
    const { open, won, lost, closedWithoutResult, total, partial } = summary.body as { open: number; won: number; lost: number; closedWithoutResult: number; total: number; partial: number };
    expect(open + won + lost + closedWithoutResult).toBe(total);
    expect(partial).toBeLessThanOrEqual(won);

    // Distribución por etapa: todas las activas en orden (también con 0) y suma = total.
    const byStage = summary.body.byStage as { stage: { code: string; order: number; isClosed: boolean }; count: number }[];
    const seeded = byStage.filter((entry) => ['CONTACTADO', 'COTIZANDO', 'GANADO', 'PERDIDO'].includes(entry.stage.code));
    expect(seeded.map((entry) => [entry.stage.code, entry.count])).toEqual([
      ['CONTACTADO', 1],
      ['COTIZANDO', 1],
      ['GANADO', 3],
      ['PERDIDO', 1],
    ]);
    expect(byStage.map((entry) => entry.stage.order)).toEqual([...byStage.map((entry) => entry.stage.order)].sort((a, b) => a - b));
    expect(byStage.reduce((sum, entry) => sum + entry.count, 0)).toBe(6);
    expect(summary.body.byOwner).toEqual([{ owner: { id: user.id, displayName: 'Persona De prueba' }, total: 6, open: 2, won: 2, partial: 1, lost: 1 }]);

    // Filtro de estado (RN-05.32) sobre la lista: mismo conjunto que el resumen.
    const client = api(context, user.token);
    const wonRows = await client.get('/reports/opportunities?status=WON').expect(200);
    expect(idsOf(wonRows.body.data)).toEqual([ids.won, ids.partial].sort());
    const partialRow = (wonRows.body.data as { id: string }[]).find((row) => row.id === ids.partial);
    expect(partialRow).toMatchObject({ result: { outcome: 'PARTIAL', awardedPercent: '60.00', reason: null }, decisionDate: '2026-10-05', decisionDateKind: 'ACTUAL' });
    const closedNoResult = await client.get('/reports/opportunities?status=CLOSED_NO_RESULT').expect(200);
    expect(idsOf(closedNoResult.body.data)).toEqual([ids.closedNoResult]);
    const openOrLost = await client.get('/reports/opportunities?status=OPEN&status=LOST').expect(200);
    expect(idsOf(openOrLost.body.data)).toEqual([ids.contacted, ids.quoting, ids.lost].sort());
    const lostSummary = await client.get('/reports/opportunities/summary?status=LOST').expect(200);
    expect(lostSummary.body).toMatchObject({ total: 1, lost: 1, open: 0, won: 0 });

    // AC-05.9: sin resultado, la fecha de decisión es la estimada del proyecto, marcada como estimada.
    const openRow = (openOrLost.body.data as { id: string }[]).find((row) => row.id === ids.contacted);
    expect(openRow).toMatchObject({ result: null, decisionDate: '2026-12-15', decisionDateKind: 'ESTIMATED', stage: { label: 'Contactado', isClosed: false } });
    const lostRow = (openOrLost.body.data as { id: string }[]).find((row) => row.id === ids.lost);
    expect(lostRow).toMatchObject({ result: { outcome: 'LOST', awardedPercent: null, reason: { id: expect.any(String), label: expect.any(String) } }, stage: { isClosed: true } });
  });
});

describe('Sin duplicar al unir productos (PF-05.8, AC-05.7, D-05.10)', () => {
  it('una oportunidad con 3 productos, dos de la misma familia, aparece y cuenta una vez al filtrar por familia o producto', async () => {
    const { user, projectId } = await advisorWithProject();
    const unit = await unitId(context.prisma, 'KG');
    const family = await insertProductFamily(context.prisma);
    const otherFamily = await insertProductFamily(context.prisma);
    const [p1, p2, p3] = [
      await insertProduct(context.prisma, { familyId: family, baseUnitId: unit }),
      await insertProduct(context.prisma, { familyId: family, baseUnitId: unit }),
      await insertProduct(context.prisma, { familyId: otherFamily, baseUnitId: unit }),
    ];
    const opportunityId = await insertOpportunity(context.prisma, { projectId, ownerId: user.id });
    const another = await insertOpportunity(context.prisma, { projectId, ownerId: user.id });
    for (const product of [p1, p2, p3]) {
      await insertProjectProduct(context.prisma, { projectId, productId: product.id, unitId: unit, opportunityId });
    }
    // Asociación eliminada: no cuenta para el filtro.
    await insertProjectProduct(context.prisma, { projectId, productId: p1.id, unitId: unit, opportunityId: another, deletedAt: new Date() });

    const client = api(context, user.token);
    const byFamily = await client.get(`/reports/opportunities?productFamilyId=${family}`).expect(200);
    expect(idsOf(byFamily.body.data)).toEqual([opportunityId]);
    expect(byFamily.body.pagination.totalItems).toBe(1);
    const summary = await client.get(`/reports/opportunities/summary?productFamilyId=${family}`).expect(200);
    expect(summary.body).toMatchObject({ total: 1, open: 1 });
    const byProducts = await client.get(`/reports/opportunities?productId=${p1.id}&productId=${p2.id}&productId=${p3.id}`).expect(200);
    expect(idsOf(byProducts.body.data)).toEqual([opportunityId]);
    const all = await client.get('/reports/opportunities').expect(200);
    expect(idsOf(all.body.data)).toEqual([opportunityId, another].sort());
  });
});

describe('Bases de fecha en el borde del período (PF-05.10, AC-05.8)', () => {
  it('IDENTIFIED y DECIDED comparan fechas inclusivas; UPDATED usa [from 00:00, to+1 00:00) en America/Guatemala', async () => {
    const { user, projectId } = await advisorWithProject();
    const ownerId = user.id;
    const before = await insertOpportunity(context.prisma, { projectId, ownerId, opportunityDate: '2026-02-28' });
    const first = await insertOpportunity(context.prisma, { projectId, ownerId, opportunityDate: '2026-03-01' });
    const last = await insertOpportunity(context.prisma, { projectId, ownerId, opportunityDate: '2026-03-31' });
    const after = await insertOpportunity(context.prisma, { projectId, ownerId, opportunityDate: '2026-04-01' });
    const client = api(context, user.token);
    const period = 'from=2026-03-01&to=2026-03-31';

    const identified = await client.get(`/reports/opportunities?${period}`).expect(200);
    expect(idsOf(identified.body.data)).toEqual([first, last].sort());
    const identifiedExplicit = await client.get(`/reports/opportunities?${period}&dateBasis=IDENTIFIED`).expect(200);
    expect(idsOf(identifiedExplicit.body.data)).toEqual([first, last].sort());

    // DECIDED: solo con resultado y por su fecha de decisión.
    const decidedIn = await insertOpportunity(context.prisma, { projectId, ownerId, stageCode: 'GANADO', outcome: 'WON', opportunityDate: '2025-01-10', decisionDate: '2026-03-31' });
    await insertOpportunity(context.prisma, { projectId, ownerId, stageCode: 'PERDIDO', outcome: 'LOST', opportunityDate: '2026-03-10', decisionDate: '2026-04-01' });
    const decided = await client.get(`/reports/opportunities?${period}&dateBasis=DECIDED`).expect(200);
    expect(idsOf(decided.body.data)).toEqual([decidedIn]);
    const decidedSummary = await client.get(`/reports/opportunities/summary?${period}&dateBasis=DECIDED`).expect(200);
    expect(decidedSummary.body).toMatchObject({ total: 1, won: 1, lost: 0 });

    // UPDATED: instantes; Guatemala es UTC-6 todo el año.
    const updates: [string, string][] = [
      [before, '2026-03-01T05:59:59.999Z'],
      [first, '2026-03-01T06:00:00.000Z'],
      [last, '2026-04-01T05:59:59.999Z'],
      [after, '2026-04-01T06:00:00.000Z'],
    ];
    for (const [id, at] of updates) {
      await context.prisma.$executeRaw`UPDATE opportunities SET updated_at = ${new Date(at)} WHERE id = ${id}::uuid`;
    }
    const updated = await client.get(`/reports/opportunities?${period}&dateBasis=UPDATED`).expect(200);
    expect(idsOf(updated.body.data)).toEqual([first, last].sort());
  });
});

describe('Importes en USD (PF-05.12, PF-05.42, AC-05.11, AC-05.44)', () => {
  it('cada fila trae el monto original con su moneda, la tasa y el USD; el total es uno solo, en USD; el orden usa el USD', async () => {
    const { user, projectId } = await advisorWithProject();
    const gtq = await insertOpportunity(context.prisma, {
      projectId,
      ownerId: user.id,
      estimate: { amount: '7750', currencyCode: 'GTQ', exchangeRate: '7.75', exchangeRateDate: '2026-10-01', amountUsd: '1000' },
      estimatedTonnage: '12.5',
    });
    const usd = await insertOpportunity(context.prisma, {
      projectId,
      ownerId: user.id,
      estimate: { amount: '500', currencyCode: 'USD', exchangeRate: '1', exchangeRateDate: null, amountUsd: '500' },
      estimatedTonnage: '2.25',
    });
    const none = await insertOpportunity(context.prisma, { projectId, ownerId: user.id });
    const client = api(context, user.token);

    const rows = await client.get('/reports/opportunities?sortBy=estimatedAmountUsd&sortOrder=asc').expect(200);
    expect((rows.body.data as { id: string }[]).map((row) => row.id)).toEqual([usd, gtq, none]);
    expect(rows.body.data[1].estimate).toEqual({
      amount: '7750.0000',
      currencyCode: 'GTQ',
      exchangeRate: '7.75000000',
      exchangeRateDate: '2026-10-01',
      amountUsd: '1000.0000',
      tonnage: '12.5000',
    });
    expect(rows.body.data[0].estimate).toEqual({
      amount: '500.0000',
      currencyCode: 'USD',
      exchangeRate: '1.00000000',
      exchangeRateDate: null,
      amountUsd: '500.0000',
      tonnage: '2.2500',
    });
    expect(rows.body.data[2].estimate).toEqual({ amount: null, currencyCode: null, exchangeRate: null, exchangeRateDate: null, amountUsd: null, tonnage: null });
    const desc = await client.get('/reports/opportunities?sortBy=estimatedAmountUsd&sortOrder=desc').expect(200);
    expect((desc.body.data as { id: string }[]).map((row) => row.id)).toEqual([gtq, usd, none]);

    const summary = await client.get('/reports/opportunities/summary').expect(200);
    expect(summary.body.estimateTotals).toEqual({
      amountUsd: '1500.0000',
      currencyCode: 'USD',
      tonnage: '14.7500',
      localReference: null,
      localReferenceUnavailableReason: 'MULTIPLE_COUNTRIES',
    });
  });
});

describe('Moneda local de referencia (PF-05.43, AC-05.45, RN-05.58)', () => {
  let usdTotalK2: string;

  beforeAll(async () => {
    const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: k2 });
    for (const countryId of [k2, k3, k4]) {
      const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId });
      const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: owner.id, countryId });
      await insertOpportunity(context.prisma, {
        projectId,
        ownerId: owner.id,
        estimate: { amount: '100', currencyCode: 'USD', exchangeRate: '1', exchangeRateDate: null, amountUsd: '100' },
      });
    }
    usdTotalK2 = '100.0000';
  });

  it('un país con tasa ≤ fecha de corte: total USD × la tasa de mayor vigencia, rotulado referencial', async () => {
    const response = await api(context, admin.token).get(`/reports/opportunities/summary?countryId=${k2}&from=2026-01-01&to=2026-07-15`).expect(200);
    // Período sobre `opportunity_date` (2026-10-01): fuera; el total es 0, pero la referencia se calcula igual.
    expect(response.body.estimateTotals).toMatchObject({ amountUsd: '0.0000', currencyCode: 'USD', localReferenceUnavailableReason: null });
    expect(response.body.estimateTotals.localReference).toEqual({
      currencyCode: RATE_CURRENCY,
      amount: '0.0000',
      exchangeRate: '12.50000000',
      exchangeRateDate: '2026-06-01',
      cutDate: '2026-07-15',
      label: 'referencial',
    });
    const all = await api(context, admin.token).get(`/reports/opportunities/summary?countryId=${k2}&from=2026-01-01&to=2026-12-31`).expect(200);
    expect(all.body.estimateTotals).toMatchObject({
      amountUsd: usdTotalK2,
      localReference: { currencyCode: RATE_CURRENCY, amount: '1250.0000', exchangeRate: '12.50000000', exchangeRateDate: '2026-06-01', cutDate: '2026-12-31' },
    });
    const early = await api(context, admin.token).get(`/reports/opportunities/summary?countryId=${k2}&from=2026-01-01&to=2026-05-31`).expect(200);
    expect(early.body.estimateTotals.localReference).toMatchObject({ exchangeRate: '10.00000000', exchangeRateDate: '2026-01-01' });
  });

  it('sin tasa ≤ corte, con dos países o con un país en USD no hay referencia y se informa el motivo', async () => {
    const client = api(context, admin.token);
    const noRate = await client.get(`/reports/opportunities/summary?countryId=${k2}&from=2025-01-01&to=2025-12-31`).expect(200);
    expect(noRate.body.estimateTotals).toMatchObject({ localReference: null, localReferenceUnavailableReason: 'EXCHANGE_RATE_NOT_FOUND' });
    const two = await client.get(`/reports/opportunities/summary?countryId=${k2}&countryId=${k3}`).expect(200);
    expect(two.body.estimateTotals).toMatchObject({ amountUsd: '200.0000', localReference: null, localReferenceUnavailableReason: 'MULTIPLE_COUNTRIES' });
    const usd = await client.get(`/reports/opportunities/summary?countryId=${k4}`).expect(200);
    expect(usd.body.estimateTotals).toMatchObject({ amountUsd: '100.0000', localReference: null, localReferenceUnavailableReason: 'BASE_CURRENCY' });
  });

  it('un usuario COUNTRY sin filtro de país: su país es el efectivo y la fecha de corte es hoy', async () => {
    const countryManager = await crmUser(context, { roleCodes: ['responsable-pais'], countryId: k2 });
    const response = await api(context, countryManager.token).get('/reports/opportunities/summary').expect(200);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    expect(response.body.estimateTotals).toMatchObject({ amountUsd: usdTotalK2, localReferenceUnavailableReason: null });
    expect(response.body.estimateTotals.localReference).toMatchObject({ currencyCode: RATE_CURRENCY, amount: '1250.0000', cutDate: today, label: 'referencial' });
  });
});

describe('Validación y orden (PF-05.27, RN-05.14)', () => {
  it('400 VALIDATION_FAILED por forma; 422 PERIOD_TOO_LONG por rango; orden determinista con desempate por id', async () => {
    const client = api(context, admin.token);
    const cases: [string, number, string][] = [
      ['/reports/opportunities?from=2026-03-02&to=2026-03-01', 400, 'VALIDATION_FAILED'],
      ['/reports/opportunities?from=2026-03-01', 400, 'VALIDATION_FAILED'],
      ['/reports/opportunities/summary?to=2026-03-01', 400, 'VALIDATION_FAILED'],
      ['/reports/opportunities?from=2026-02-30&to=2026-03-01', 400, 'VALIDATION_FAILED'],
      ['/reports/opportunities?sortBy=legalName', 400, 'VALIDATION_FAILED'],
      ['/reports/opportunities?pageSize=101', 400, 'VALIDATION_FAILED'],
      ['/reports/opportunities?status=ABIERTA', 400, 'VALIDATION_FAILED'],
      ['/reports/opportunities?dateBasis=CREATED&from=2026-01-01&to=2026-01-31', 400, 'VALIDATION_FAILED'],
      ['/reports/opportunities?ownerId=no-es-uuid', 400, 'VALIDATION_FAILED'],
      ['/reports/opportunities?desconocido=1', 400, 'VALIDATION_FAILED'],
      ['/reports/opportunities?from=2020-01-01&to=2025-01-01', 422, 'PERIOD_TOO_LONG'],
    ];
    for (const [path, status, code] of cases) {
      const response = await client.get(path);
      expect({ path, status: response.status, code: response.body.code }).toEqual({ path, status, code });
    }
    const tooLong = await client.get('/reports/opportunities/summary?from=2020-01-01&to=2025-01-01').expect(422);
    expect(tooLong.body.details).toEqual([{ field: 'to', code: 'PERIOD_TOO_LONG', message: 'The period cannot exceed 5 years', maxYears: 5 }]);
    await client.get('/reports/opportunities?from=2020-01-01&to=2024-12-31').expect(200);

    const tooMany = Array.from({ length: 51 }, () => `ownerId=${admin.id}`).join('&');
    await client.get(`/reports/opportunities?${tooMany}`).expect(400);
  });

  it('un id de filtro inexistente no es error: conjunto vacío (F.5)', async () => {
    const response = await api(context, admin.token).get('/reports/opportunities?customerId=00000000-0000-4000-8000-000000000000').expect(200);
    expect(response.body).toEqual({ data: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });

  it('orden por defecto `updatedAt` desc; empates resueltos por id', async () => {
    const { user, projectId } = await advisorWithProject();
    const at = new Date('2026-05-05T12:00:00.000Z');
    const created = [
      await insertOpportunity(context.prisma, { projectId, ownerId: user.id }),
      await insertOpportunity(context.prisma, { projectId, ownerId: user.id }),
      await insertOpportunity(context.prisma, { projectId, ownerId: user.id }),
    ];
    for (const id of created) await context.prisma.$executeRaw`UPDATE opportunities SET updated_at = ${at} WHERE id = ${id}::uuid`;
    const response = await api(context, user.token).get('/reports/opportunities?pageSize=2').expect(200);
    const second = await api(context, user.token).get('/reports/opportunities?pageSize=2&page=2').expect(200);
    expect([...response.body.data, ...second.body.data].map((row: { id: string }) => row.id)).toEqual([...created].sort());
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
  });
});

describe('Filtros combinados (país, cliente, asesor, etapa)', () => {
  it('el filtro de país usa el país del proyecto; el de etapa la etapa vigente', async () => {
    const { user, customerId, projectId } = await advisorWithProject(k1);
    const quoting = await insertOpportunity(context.prisma, { projectId, ownerId: user.id, stageCode: 'COTIZANDO' });
    await insertOpportunity(context.prisma, { projectId, ownerId: user.id, stageCode: 'CONTACTADO' });
    const stage = await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'COTIZANDO');
    const client = api(context, user.token);
    const response = await client.get(`/reports/opportunities?countryId=${k1}&customerId=${customerId}&ownerId=${user.id}&stageId=${stage}`).expect(200);
    expect(idsOf(response.body.data)).toEqual([quoting]);
    expect(response.body.data[0]).toMatchObject({ project: { id: projectId }, customer: { id: customerId }, owner: { id: user.id }, stage: { id: stage, label: 'Cotizando' } });
    const otherCountry = await client.get(`/reports/opportunities?countryId=${k4}`).expect(200);
    expect(otherCountry.body.data).toEqual([]);
  });
});
