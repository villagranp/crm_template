import { CatalogLookupService } from '@/modules/catalogs/catalog-lookup.service';
import { CATALOGS_REPOSITORY, type CatalogDetailRecord, type CatalogsRepository } from '@/modules/catalogs/ports/catalogs.repository.port';

import {
  api,
  businessMonthOffset,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertActivity,
  insertConversionRule,
  insertCustomer,
  insertForecastLine,
  insertOpportunity,
  insertProduct,
  insertProductFamily,
  insertProject,
  insertVisit,
  testCountry,
  unitId,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 5 · Dashboard comercial (F-40, E.7) y embudo (F-41, E.8): AC-05.30, AC-05.31,
 * AC-05.34–AC-05.39, RN-05.51–RN-05.57, PF-05.32 y la validación de período. Países propios
 * `X3` y `X4`; cada prueba usa un asesor nuevo (OWN) para que las cifras sean exactas aunque
 * otras suites escriban a la vez.
 */

let context: TestContext;
let x3: string;
let x4: string;

const HOUR = 3_600_000;

beforeAll(async () => {
  context = await createTestContext();
  x3 = await testCountry(context.prisma, 'X3', { name: 'Prueba Dashboard' });
  x4 = await testCountry(context.prisma, 'X4', { name: 'Prueba Embudo' });
});

afterAll(async () => {
  await closeTestContext(context);
});

/** Primer día del mes de negocio actual + `offset` meses (`YYYY-MM-DD`). */
function monthStart(offset = 0): string {
  const { year, month } = businessMonthOffset(offset);
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

async function stageHistory(opportunityId: string, ownerId: string, stages: string[]): Promise<void> {
  let from: string | null = null;
  for (const [index, code] of stages.entries()) {
    const to = await catalogItemId(context.prisma, 'crm.etapa_oportunidad', code);
    await context.prisma.opportunityStageHistory.create({
      data: { opportunityId, fromStageId: from, toStageId: to, changedById: ownerId, changedAt: new Date(Date.now() - (stages.length - index) * HOUR) },
    });
    from = to;
  }
}

describe('GET /reports/dashboard (F-40, AC-05.30, AC-05.31, AC-05.34)', () => {
  it('paneles con las definiciones compartidas, alcance OWN y filtro de asesor', async () => {
    const { prisma } = context;
    const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: x3 });
    const customer = await insertCustomer(prisma, { salesOwnerId: owner.id, countryId: x3 });
    const projectId = await insertProject(prisma, { customerId: customer.id, ownerId: owner.id, countryId: x3 });
    await insertProject(prisma, { customerId: customer.id, ownerId: owner.id, countryId: x3 });
    await insertProject(prisma, { customerId: customer.id, ownerId: owner.id, countryId: x3, phaseCode: 'FINALIZADO', phaseProgress: '100' });
    const today = monthStart();
    await insertOpportunity(prisma, { projectId, ownerId: owner.id, stageCode: 'CONTACTADO', opportunityDate: today });
    await insertOpportunity(prisma, { projectId, ownerId: owner.id, stageCode: 'GANADO', outcome: 'WON', opportunityDate: today, decisionDate: today });
    await insertOpportunity(prisma, { projectId, ownerId: owner.id, stageCode: 'GANADO', outcome: 'PARTIAL', opportunityDate: today, decisionDate: today });
    await insertOpportunity(prisma, { projectId, ownerId: owner.id, stageCode: 'PERDIDO', outcome: 'LOST', opportunityDate: today, decisionDate: today });
    const kg = await unitId(prisma, 'KG');
    const product = await insertProduct(prisma, { familyId: await insertProductFamily(prisma), baseUnitId: kg });
    const rule = await insertConversionRule(prisma, { fromUnitId: kg, factor: '0.001', scope: 'PRODUCT', productId: product.id });
    await insertForecastLine(prisma, { projectId, productId: product.id, unitId: kg, ownerId: owner.id, ...businessMonthOffset(1), quantity: '2000', conversion: { ruleId: rule, factor: '0.001', tonnage: '2' } });
    const now = Date.now();
    await insertActivity(prisma, { customerId: customer.id, ownerId: owner.id, statusCode: 'COMPLETADA', completedAt: new Date(now - HOUR) });
    await insertActivity(prisma, { customerId: customer.id, ownerId: owner.id });
    await insertVisit(prisma, { customerId: customer.id, ownerId: owner.id, statusCode: 'REALIZADA', scheduledStartAt: new Date(now - 2 * HOUR), actualStartAt: new Date(now - 2 * HOUR) });
    const cancelled = await insertVisit(prisma, { customerId: customer.id, ownerId: owner.id, statusCode: 'CANCELADA', scheduledStartAt: new Date(now + HOUR) });
    await prisma.visit.update({ where: { id: cancelled }, data: { cancelledAt: new Date(now - HOUR) } });

    const client = api(context, owner.token);
    const response = await client.get('/reports/dashboard').expect(200);
    const body = response.body;
    expect(body.period).toEqual({ from: monthStart(-12), to: expect.stringMatching(new RegExp(`^${monthStart().slice(0, 7)}-\\d{2}$`)) });

    expect(body.activeProjects.count).toBe(2);
    expect(body.activeProjects.byPhase).toContainEqual({ phase: expect.objectContaining({ code: 'DISENO' }), count: 2 });
    expect(body.activeProjects.byPhase.some((entry: { phase: { code: string } }) => entry.phase.code === 'FINALIZADO')).toBe(false);

    const byStage = Object.fromEntries((body.opportunitiesByStage as { stage: { code: string }; count: number }[]).map((entry) => [entry.stage.code, entry.count]));
    expect(byStage).toMatchObject({ CONTACTADO: 1, COTIZANDO: 0, GANADO: 2, PERDIDO: 1 });

    expect(body.wonLostByMonth).toHaveLength(13);
    expect(body.wonLostByMonth[12]).toEqual({ ...businessMonthOffset(0), won: 2, wonFull: 1, partial: 1, lost: 1 });
    expect(body.wonLostByMonth.slice(0, 12).every((month: { won: number; lost: number }) => month.won === 0 && month.lost === 0)).toBe(true);

    expect(body.forecastRange).toEqual({ from: businessMonthOffset(-12), to: businessMonthOffset(6) });
    expect(body.forecastByMonth).toHaveLength(19);
    expect(body.forecastByMonth.find((month: { year: number; month: number }) => month.year === businessMonthOffset(1).year && month.month === businessMonthOffset(1).month)).toEqual({
      ...businessMonthOffset(1),
      tonnage: '2.0000',
      cumulative: '2.0000',
      lineCount: 1,
      linesWithoutConversion: 0,
    });
    expect(body.forecastByMonth[18].cumulative).toBe('2.0000');
    expect(body.tonnageUnit).toBe('TON');

    expect(body.byOwner).toEqual([{ owner: { id: owner.id, displayName: 'Persona De prueba' }, openOpportunities: 1, won: 2, forecastTonnage: '2.0000' }]);
    expect(body.activityVisitByMonth[12]).toEqual({ ...businessMonthOffset(0), activitiesCompleted: 1, visitsCompleted: 1, visitsCancelled: 1 });

    // RN-05.51: analítico; ni alertas ni pendientes del Inicio.
    expect(Object.keys(body).sort()).toEqual(
      ['activeProjects', 'activityVisitByMonth', 'byOwner', 'forecastByMonth', 'forecastRange', 'opportunitiesByStage', 'period', 'tonnageUnit', 'wonLostByMonth'].sort(),
    );

    // AC-05.42: mismas cifras que el reporte de oportunidades con los mismos filtros.
    const decided = await client.get(`/reports/opportunities/summary?dateBasis=DECIDED&from=${body.period.from}&to=${body.period.to}`).expect(200);
    expect([decided.body.won, decided.body.partial, decided.body.lost]).toEqual([2, 1, 1]);

    // AC-05.31: un asesor fuera del alcance no amplía nada (RN-05.4).
    const other = await crmUser(context, { roleCodes: ['asesor'], countryId: x3 });
    const filtered = await client.get(`/reports/dashboard?ownerId=${other.id}`).expect(200);
    expect(filtered.body.activeProjects.count).toBe(0);
    expect(filtered.body.byOwner).toEqual([]);
    expect(filtered.body.wonLostByMonth[12]).toMatchObject({ won: 0, lost: 0 });

    // Tendencias (RN-05.52): todos los meses, cada indicador en su columna.
    const trends = await client.get('/reports/dashboard/trends').expect(200);
    expect(trends.body.period).toEqual(body.period);
    const last = Object.fromEntries(
      (trends.body.series as { metric: string; points: { value: number }[] }[]).map((series) => [series.metric, [series.points.length, series.points[12]?.value]]),
    );
    expect(last).toEqual({
      OPPORTUNITIES_IDENTIFIED: [13, 4],
      WON: [13, 2],
      LOST: [13, 1],
      ACTIVITIES_COMPLETED: [13, 1],
      VISITS_COMPLETED: [13, 1],
    });
  });

  it('validación del período: juntos, ordenados y como mucho 24 meses', async () => {
    const owner = await crmUser(context, { roleCodes: ['asesor'] });
    const client = api(context, owner.token);
    for (const path of ['/reports/dashboard', '/reports/dashboard/trends']) {
      expect((await client.get(`${path}?from=2026-01-01`)).body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect((await client.get(`${path}?from=2026-02-01&to=2026-01-31`)).body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect((await client.get(`${path}?countryId=no-uuid`)).status).toBe(400);
      const tooLong = await client.get(`${path}?from=2024-01-01&to=2026-01-31`);
      expect(tooLong.body).toMatchObject({ statusCode: 422, code: 'PERIOD_TOO_LONG', details: [expect.objectContaining({ field: 'to', maxMonths: 24 })] });
      await client.get(`${path}?from=2024-02-01&to=2026-01-31`).expect(200);
    }
  });
});

describe('GET /reports/funnel (F-41, AC-05.35–AC-05.39)', () => {
  async function funnelOwner(): Promise<{ owner: CrmUser; customerId: string; projectId: string }> {
    const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: x4 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: x4 });
    const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: owner.id, countryId: x4 });
    return { owner, customerId: customer.id, projectId };
  }

  async function opportunity(owner: CrmUser, projectId: string, stage: string, history: string[] | null): Promise<string> {
    const id = await insertOpportunity(context.prisma, { projectId, ownerId: owner.id, stageCode: stage, ...(stage === 'GANADO' ? { outcome: 'WON' as const } : stage === 'PERDIDO' ? { outcome: 'LOST' as const } : {}) });
    if (history) await stageHistory(id, owner.id, history);
    return id;
  }

  function known(stages: { stage: { code: string } }[]): Record<string, unknown> {
    return Object.fromEntries(stages.filter((entry) => ['CONTACTADO', 'COTIZANDO', 'GANADO'].includes(entry.stage.code)).map((entry) => [entry.stage.code, entry]));
  }

  it('etapas inFunnel en orden, participación y conversión acumulada por historial; filtro de etapa y de tipo de cliente', async () => {
    const { owner, customerId, projectId } = await funnelOwner();
    await opportunity(owner, projectId, 'CONTACTADO', ['CONTACTADO']);
    await opportunity(owner, projectId, 'COTIZANDO', ['CONTACTADO', 'COTIZANDO']);
    await opportunity(owner, projectId, 'COTIZANDO', ['CONTACTADO', 'COTIZANDO']);
    await opportunity(owner, projectId, 'GANADO', ['CONTACTADO', 'COTIZANDO', 'GANADO']);
    await opportunity(owner, projectId, 'PERDIDO', ['CONTACTADO', 'COTIZANDO', 'PERDIDO']);
    await opportunity(owner, projectId, 'PERDIDO', ['CONTACTADO', 'PERDIDO']);
    const typeId = await catalogItemId(context.prisma, 'crm.tipo_empresa', (await context.prisma.catalogItem.findFirstOrThrow({ where: { catalog: { key: 'crm.tipo_empresa' } }, orderBy: { sortOrder: 'asc' } })).code);
    await context.prisma.customer.update({ where: { id: customerId }, data: { companyTypeId: typeId } });

    const client = api(context, owner.token);
    const response = await client.get('/reports/funnel').expect(200);
    expect(response.body).toMatchObject({ totalInFunnel: 4, sampleMinimum: 5 });
    const codes = (response.body.stages as { stage: { code: string; order: number } }[]).map((entry) => entry.stage.code);
    expect(codes.indexOf('CONTACTADO')).toBeLessThan(codes.indexOf('COTIZANDO'));
    expect(codes.indexOf('COTIZANDO')).toBeLessThan(codes.indexOf('GANADO'));
    expect(codes).not.toContain('PERDIDO');
    expect(known(response.body.stages)).toEqual({
      CONTACTADO: { stage: expect.objectContaining({ code: 'CONTACTADO', order: 1 }), count: 1, shareOfTotal: '25.00', cumulativeConversion: '100.00', unavailableReason: null },
      COTIZANDO: { stage: expect.objectContaining({ code: 'COTIZANDO', order: 2 }), count: 2, shareOfTotal: '50.00', cumulativeConversion: '66.67', unavailableReason: null },
      GANADO: { stage: expect.objectContaining({ code: 'GANADO', order: 3 }), count: 1, shareOfTotal: '25.00', cumulativeConversion: '16.67', unavailableReason: null },
    });

    // AC-05.38: solo la barra pedida, con los porcentajes del embudo completo.
    const quoting = await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'COTIZANDO');
    const filtered = await client.get(`/reports/funnel?stageId=${quoting}`).expect(200);
    expect(filtered.body.stages).toEqual([known(response.body.stages)['COTIZANDO']]);
    expect(filtered.body.totalInFunnel).toBe(4);

    // AC-05.39: tipo de cliente = `crm.tipo_empresa` del cliente del proyecto.
    const sameType = await client.get(`/reports/funnel?companyTypeId=${typeId}`).expect(200);
    expect(sameType.body.totalInFunnel).toBe(4);
    const otherType = (await context.prisma.catalogItem.findFirstOrThrow({ where: { catalog: { key: 'crm.tipo_empresa' }, id: { not: typeId } } })).id;
    const none = await client.get(`/reports/funnel?companyTypeId=${otherType}`).expect(200);
    expect(none.body.totalInFunnel).toBe(0);

    // Período por fecha de identificación (todas el 2026-10-01 por defecto en la fixture).
    const outside = await client.get('/reports/funnel?from=2025-01-01&to=2025-12-31').expect(200);
    expect(outside.body.totalInFunnel).toBe(0);
  });

  it('conjunto vacío: porcentajes null con NO_DATA, nunca 0 % (AC-05.36)', async () => {
    const { owner } = await funnelOwner();
    const response = await api(context, owner.token).get('/reports/funnel').expect(200);
    expect(response.body.totalInFunnel).toBe(0);
    for (const entry of response.body.stages as { count: number; shareOfTotal: unknown; cumulativeConversion: unknown; unavailableReason: string }[]) {
      expect(entry).toMatchObject({ count: 0, shareOfTotal: null, cumulativeConversion: null, unavailableReason: 'NO_DATA' });
    }
  });

  it('una oportunidad sin historial: conversión null con INSUFFICIENT_HISTORY y la participación sí (AC-05.37); muestra pequeña → INSUFFICIENT_SAMPLE', async () => {
    const withGap = await funnelOwner();
    for (let index = 0; index < 5; index += 1) await opportunity(withGap.owner, withGap.projectId, 'CONTACTADO', ['CONTACTADO']);
    await opportunity(withGap.owner, withGap.projectId, 'COTIZANDO', null);
    const gap = await api(context, withGap.owner.token).get('/reports/funnel').expect(200);
    expect(known(gap.body.stages)).toMatchObject({
      CONTACTADO: { count: 5, shareOfTotal: '83.33', cumulativeConversion: null, unavailableReason: 'INSUFFICIENT_HISTORY' },
      COTIZANDO: { count: 1, shareOfTotal: '16.67', cumulativeConversion: null, unavailableReason: 'INSUFFICIENT_HISTORY' },
    });

    const small = await funnelOwner();
    await opportunity(small.owner, small.projectId, 'COTIZANDO', ['CONTACTADO', 'COTIZANDO']);
    const sample = await api(context, small.owner.token).get('/reports/funnel').expect(200);
    expect(known(sample.body.stages)).toMatchObject({ COTIZANDO: { count: 1, shareOfTotal: '100.00', cumulativeConversion: null, unavailableReason: 'INSUFFICIENT_SAMPLE' } });
  });

  it('validación: período suelto o invertido → 400; más de 5 años → 422 PERIOD_TOO_LONG', async () => {
    const { owner } = await funnelOwner();
    const client = api(context, owner.token);
    expect((await client.get('/reports/funnel?from=2026-01-01')).status).toBe(400);
    expect((await client.get('/reports/funnel?from=2026-02-01&to=2026-01-01')).status).toBe(400);
    expect((await client.get('/reports/funnel?stageId=no-uuid')).status).toBe(400);
    expect((await client.get('/reports/funnel?from=2020-01-01&to=2026-01-01')).body).toMatchObject({ statusCode: 422, code: 'PERIOD_TOO_LONG' });
  });
});

describe('Catálogo de etapas inválido (PF-05.32, G.4)', () => {
  /**
   * Romper el catálogo compartido afectaría a las suites paralelas (P-05.6): esta app
   * propia sustituye la lectura de catálogos por una que quita `order` a una etapa `inFunnel`.
   */
  it('una etapa inFunnel sin order → 422 INVALID_CATALOG_SEMANTICS con el catálogo y la etapa', async () => {
    const broken = await createTestContext({
      configure: (builder) =>
        builder.overrideProvider(CatalogLookupService).useFactory({
          factory: (repository: CatalogsRepository) =>
            new (class extends CatalogLookupService {
              override async findByKey(key: string): Promise<CatalogDetailRecord | null> {
                const catalog = await repository.findByKey(key);
                if (!catalog || key !== 'crm.etapa_oportunidad') return catalog;
                return {
                  ...catalog,
                  items: catalog.items.map((item) =>
                    item.code === 'COTIZANDO' ? { ...item, metadata: { isClosed: false, outcome: null, inFunnel: true } } : item,
                  ),
                };
              }
            })(repository),
          inject: [CATALOGS_REPOSITORY],
        }),
    });
    try {
      const owner = await crmUser(broken, { roleCodes: ['asesor'] });
      const response = await api(broken, owner.token).get('/reports/funnel');
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        code: 'INVALID_CATALOG_SEMANTICS',
        details: expect.arrayContaining([expect.objectContaining({ field: 'crm.etapa_oportunidad', itemCode: 'COTIZANDO', code: 'INVALID_CATALOG_SEMANTICS' })]),
      });
    } finally {
      await closeTestContext(broken);
    }
  });
});
