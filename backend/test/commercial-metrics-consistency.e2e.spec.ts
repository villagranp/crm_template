import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';
import { runReportRead } from '@/infrastructure/database/prisma/report-read';
import { VisibilityScopeResolver } from '@/modules/access/visibility-scope.resolver';
import { CommercialMetricsService } from '@/modules/commercial-metrics/commercial-metrics.service';
import type { MetricContext } from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';

import {
  api,
  businessMonthOffset,
  type CrmUser,
  crmUser,
  insertActivity,
  insertCustomer,
  insertForecastLine,
  insertOpportunity,
  insertProduct,
  insertProductFamily,
  insertProject,
  insertTeam,
  insertVisit,
  testCountry,
  unitId,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Indicadores compartidos Inicio ↔ Reportes (05 G.3, 01 F.2, RN-01.10): PF-05.30 y PF-05.31
 * (AC-05.42). Se comparan con el reporte equivalente por HTTP, con el mismo alcance y el mismo
 * período (D-05.7), tanto los métodos del servicio con la firma de 01 F.2 como las tarjetas de
 * Inicio por HTTP (`/dashboard/indicators/*`, Módulo 1). Además, el contrato de la lectura de
 * reportes: solo lectura y `503 REPORT_TIMEOUT`. País propio `T3`.
 *
 * El administrador no se compara: su alcance incluye los datos que otras suites escriben a la vez.
 */

let context: TestContext;
let j3: string;
let metrics: CommercialMetricsService;
let scopes: VisibilityScopeResolver;
const users = {} as Record<'a' | 'b' | 'manager' | 'country', CrmUser>;
const TIME_ZONE = 'America/Guatemala';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function contextFor(user: CrmUser): Promise<MetricContext> {
  return { scope: await scopes.resolve(user.id, 'reportes.ver'), now: new Date(), businessTimeZone: TIME_ZONE };
}

beforeAll(async () => {
  context = await createTestContext();
  metrics = context.app.get(CommercialMetricsService);
  scopes = context.app.get(VisibilityScopeResolver);
  const { prisma } = context;
  j3 = await testCountry(prisma, 'T3', { name: 'Prueba Consistencia' });
  users.a = await crmUser(context, { roleCodes: ['asesor'], countryId: j3 });
  users.b = await crmUser(context, { roleCodes: ['asesor'], countryId: j3 });
  users.manager = await crmUser(context, { roleCodes: ['manager'], countryId: j3 });
  users.country = await crmUser(context, { roleCodes: ['responsable-pais'], countryId: j3 });
  await insertTeam(prisma, { managerId: users.manager.id, memberIds: [users.a.id, users.b.id] });

  const tonRule = await prisma.unitConversionRule.findFirstOrThrow({ where: { scope: 'GLOBAL', isActive: true, fromUnit: { code: 'TON' }, toUnit: { code: 'TON' } } });
  const ton = await unitId(prisma, 'TON');
  const product = await insertProduct(prisma, { familyId: await insertProductFamily(prisma), baseUnitId: ton });
  const decided = today();
  for (const [index, owner] of [users.a, users.b].entries()) {
    const customer = await insertCustomer(prisma, { salesOwnerId: owner.id, countryId: j3 });
    const active = await insertProject(prisma, { customerId: customer.id, ownerId: owner.id, countryId: j3, phaseCode: 'DISENO' });
    await insertProject(prisma, { customerId: customer.id, ownerId: owner.id, countryId: j3, phaseCode: 'FINALIZADO', phaseProgress: '100' });
    await insertOpportunity(prisma, { projectId: active, ownerId: owner.id, stageCode: 'CONTACTADO' });
    await insertOpportunity(prisma, { projectId: active, ownerId: owner.id, stageCode: 'COTIZANDO' });
    await insertOpportunity(prisma, { projectId: active, ownerId: owner.id, stageCode: 'GANADO', outcome: 'WON', decisionDate: decided });
    await insertOpportunity(prisma, { projectId: active, ownerId: owner.id, stageCode: 'GANADO', outcome: 'PARTIAL', decisionDate: decided });
    await insertOpportunity(prisma, { projectId: active, ownerId: owner.id, stageCode: 'PERDIDO', outcome: 'LOST', decisionDate: decided });
    await insertOpportunity(prisma, { projectId: active, ownerId: owner.id, stageCode: 'PERDIDO', outcome: 'LOST', decisionDate: '2020-01-15' });
    await insertForecastLine(prisma, {
      projectId: active,
      productId: product.id,
      unitId: ton,
      ownerId: owner.id,
      ...businessMonthOffset(1 + index),
      quantity: '4.5',
      conversion: { ruleId: tonRule.id, factor: '1', tonnage: '4.5' },
    });
    await insertVisit(prisma, { customerId: customer.id, ownerId: owner.id, scheduledStartAt: new Date(Date.now() + 2 * DAY) });
    await insertVisit(prisma, { customerId: customer.id, ownerId: owner.id, scheduledStartAt: new Date(Date.now() + 20 * DAY) });
    await insertVisit(prisma, { customerId: customer.id, ownerId: owner.id, scheduledStartAt: new Date(Date.now() - DAY) });
    await insertActivity(prisma, { customerId: customer.id, ownerId: owner.id, dueAt: new Date(Date.now() - HOUR) });
    await insertActivity(prisma, { customerId: customer.id, ownerId: owner.id, dueAt: new Date(Date.now() + 10 * HOUR) });
    await insertActivity(prisma, { customerId: customer.id, ownerId: owner.id, dueAt: new Date(Date.now() + 10 * DAY) });
  }
});

afterAll(async () => {
  await closeTestContext(context);
});

describe('Consistencia Inicio ↔ Reportes (PF-05.30, AC-05.42)', () => {
  it.each(['a', 'manager', 'country'] as const)('las tarjetas de Inicio coinciden con el reporte equivalente (%s)', async (key) => {
    const user = users[key];
    const ctx = await contextFor(user);
    const client = api(context, user.token);
    const month = metrics.resolvePeriod('MONTH', ctx);

    // KPI-01 = proyectos activos del reporte de proyectos.
    const activeProjects = await metrics.countActiveProjects(ctx);
    const projects = await client.get('/reports/projects?situation=ACTIVE').expect(200);
    expect(activeProjects).toBe(projects.body.pagination.totalItems);
    expect(activeProjects).toBeGreaterThan(0);

    // KPI-02 = abiertas sin período; el desglose coincide con la distribución del reporte.
    const open = await metrics.countOpenOpportunities(ctx);
    const summary = await client.get('/reports/opportunities/summary').expect(200);
    expect(open.total).toBe(summary.body.open);
    // Etapas con oportunidades (otras suites pueden añadir a la vez etapas vacías al catálogo compartido).
    const reportOpenStages = (summary.body.byStage as { stage: { id: string; isClosed: boolean }; count: number }[])
      .filter((entry) => !entry.stage.isClosed && entry.count > 0)
      .map((entry) => [entry.stage.id, entry.count]);
    expect(open.byStage.filter((stage) => stage.count > 0).map((stage) => [stage.stageId, stage.count])).toEqual(reportOpenStages);

    // KPI-03/04 = el reporte con el período de D-05.7 y `dateBasis = DECIDED`.
    const won = await metrics.countWonOpportunities(ctx, month);
    const lost = await metrics.countLostOpportunities(ctx, month);
    const decided = await client.get(`/reports/opportunities/summary?from=${month.from}&to=${month.to}&dateBasis=DECIDED`).expect(200);
    expect({ total: won.total, won: won.won, partial: won.partial, lost }).toEqual({
      total: decided.body.won,
      won: decided.body.wonFull,
      partial: decided.body.partial,
      lost: decided.body.lost,
    });
    expect(won.total).toBeGreaterThan(0);

    // KPI-05 = resumen de forecast sin filtros (M+1…M+6).
    const window = await metrics.forecastWindow(ctx, 6);
    const forecast = await client.get('/reports/forecast/summary').expect(200);
    expect(window.totalTonnage).toBe(forecast.body.lineCount === 0 ? null : forecast.body.totals.tonnage);
    expect(window.months.map((month) => month.tonnage)).toEqual(forecast.body.months.map((month: { tonnage: string }) => month.tonnage));
    expect(window.unconvertedLines).toBe(forecast.body.totals.linesWithoutConversion);

    // KPI-06/07 = programadas y atrasadas del reporte de visitas sin período.
    const visits = await metrics.countVisits(ctx, 7);
    const visitSummary = await client.get('/reports/visits/summary').expect(200);
    expect({ pending: visits.pending, overdue: visits.overdue }).toEqual({ pending: visitSummary.body.scheduled, overdue: visitSummary.body.overduePending });
    expect(visits.upcoming).toBe(key === 'a' ? 1 : 2);

    // KPI-08/09 = pendientes, por vencer y vencidas del reporte de actividades.
    const activitySummary = await client.get('/reports/activities/summary').expect(200);
    const activities = await metrics.countActivities(ctx, activitySummary.body.dueSoonHours);
    expect({ pending: activities.pending, dueSoon: activities.dueSoon, overdue: activities.overdue }).toEqual({
      pending: activitySummary.body.pending,
      dueSoon: activitySummary.body.dueSoon,
      overdue: activitySummary.body.overdue,
    });

    // Las tarjetas de Inicio por HTTP (01 F.1, con el alcance del permiso de cada fuente, que en
    // estos roles es el mismo que el de `reportes.ver`) dan las mismas cifras que el reporte.
    const inicioProjects = await client.get('/dashboard/indicators/projects').expect(200);
    expect(inicioProjects.body.activeProjects).toBe(projects.body.pagination.totalItems);
    const inicioOpportunities = await client.get('/dashboard/indicators/opportunities?period=MONTH').expect(200);
    expect(inicioOpportunities.body.period).toMatchObject({ from: month.from, to: month.to });
    expect({
      open: inicioOpportunities.body.open.count,
      won: inicioOpportunities.body.won.count,
      wonFull: inicioOpportunities.body.won.wonCount,
      partial: inicioOpportunities.body.won.partialCount,
      lost: inicioOpportunities.body.lost.count,
    }).toEqual({ open: summary.body.open, won: decided.body.won, wonFull: decided.body.wonFull, partial: decided.body.partial, lost: decided.body.lost });
    const inicioForecast = await client.get('/dashboard/indicators/forecast').expect(200);
    expect(inicioForecast.body.totalTonnage).toBe(forecast.body.lineCount === 0 ? null : forecast.body.totals.tonnage);
    expect(inicioForecast.body.months.map((entry: { tonnage: string }) => entry.tonnage)).toEqual(
      forecast.body.months.map((entry: { tonnage: string }) => entry.tonnage),
    );
    expect(inicioForecast.body.unconvertedLines).toBe(forecast.body.totals.linesWithoutConversion);
    const inicioVisits = await client.get('/dashboard/indicators/visits').expect(200);
    expect({ pending: inicioVisits.body.pending.count, overdue: inicioVisits.body.pending.overdueCount }).toEqual({
      pending: visitSummary.body.scheduled,
      overdue: visitSummary.body.overduePending,
    });
    const inicioActivities = await client.get('/dashboard/indicators/activities').expect(200);
    expect(inicioActivities.body.pending.dueSoonHours).toBe(activitySummary.body.dueSoonHours);
    expect({
      pending: inicioActivities.body.pending.count,
      dueSoon: inicioActivities.body.pending.dueSoonCount,
      overdue: inicioActivities.body.overdue.count,
    }).toEqual({ pending: activitySummary.body.pending, dueSoon: activitySummary.body.dueSoon, overdue: activitySummary.body.overdue });
  });

  it('la suma de los asesores del equipo coincide con el manager (sin herencias cruzadas)', async () => {
    const [a, b, manager] = await Promise.all([contextFor(users.a), contextFor(users.b), contextFor(users.manager)]);
    const sum = (await metrics.countActiveProjects(a)) + (await metrics.countActiveProjects(b));
    expect(await metrics.countActiveProjects(manager)).toBe(sum);
    expect((await metrics.countOpenOpportunities(manager)).total).toBe((await metrics.countOpenOpportunities(a)).total + (await metrics.countOpenOpportunities(b)).total);
  });
});

describe('Un cambio de catálogo cambia Inicio y Reportes a la vez (PF-05.31)', () => {
  it('una etapa nueva y luego su semántica (abierta → cerrada) se reflejan sin desplegar en el servicio y en el reporte', async () => {
    const user = await crmUser(context, { roleCodes: ['asesor'], countryId: j3 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: j3 });
    const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: user.id, countryId: j3 });
    const catalog = await context.prisma.catalog.findUniqueOrThrow({ where: { key: 'crm.etapa_oportunidad' } });
    // Inactiva: no aparece en formularios ni altera las pruebas que corren a la vez; con
    // oportunidades vigentes sigue contando (RN-05.30).
    const stage = await context.prisma.catalogItem.create({
      data: {
        catalogId: catalog.id,
        code: `TEST-REP-NEG-${Date.now()}`,
        label: 'Negociando (reportes)',
        metadata: { order: 2, isClosed: false, outcome: null, inFunnel: true },
        sortOrder: 995,
        isActive: false,
      },
    });
    const opportunityId = await insertOpportunity(context.prisma, { projectId, ownerId: user.id, stageCode: stage.code });
    try {
      const ctx = await contextFor(user);
      const client = api(context, user.token);
      const before = await metrics.countOpenOpportunities(ctx);
      const report = await client.get('/reports/opportunities/summary').expect(200);
      expect(before.total).toBe(1);
      expect(report.body).toMatchObject({ total: 1, open: 1 });
      expect(before.byStage.find((entry) => entry.stageId === stage.id)).toMatchObject({ count: 1 });
      expect(report.body.byStage).toContainEqual({ stage: expect.objectContaining({ id: stage.id, isActive: false, isClosed: false }), count: 1 });
      const inicioBefore = await client.get('/dashboard/indicators/opportunities').expect(200);
      expect(inicioBefore.body.open).toMatchObject({ count: 1, byStage: [expect.objectContaining({ stageId: stage.id, count: 1 })] });

      await context.prisma.catalogItem.update({ where: { id: stage.id }, data: { metadata: { order: 2, isClosed: true, outcome: null, inFunnel: true } } });
      const after = await metrics.countOpenOpportunities(ctx);
      const reportAfter = await client.get('/reports/opportunities/summary').expect(200);
      expect(after.total).toBe(0);
      expect(reportAfter.body).toMatchObject({ total: 1, open: 0, closedWithoutResult: 1 });
      const inicioAfter = await client.get('/dashboard/indicators/opportunities').expect(200);
      expect(inicioAfter.body.open).toEqual({ count: 0, byStage: [] });
      expect(reportAfter.body.byStage).toContainEqual({ stage: expect.objectContaining({ id: stage.id, isClosed: true }), count: 1 });
    } finally {
      await context.prisma.opportunity.delete({ where: { id: opportunityId } });
      await context.prisma.catalogItem.delete({ where: { id: stage.id } });
    }
  });
});

describe('Lectura de reportes (05 D.3)', () => {
  it('transacción de solo lectura: una escritura falla', async () => {
    const prisma = context.app.get(PrismaService);
    await expect(runReportRead(prisma, (db) => db.$executeRaw`UPDATE countries SET name = name WHERE id = ${j3}::uuid`)).rejects.toThrow(/read-only/i);
  });

  it('una sentencia que supera el statement_timeout responde 503 REPORT_TIMEOUT', async () => {
    const prisma = context.app.get(PrismaService);
    await expect(runReportRead(prisma, (db) => db.$queryRaw`SELECT pg_sleep(1)`, 50)).rejects.toMatchObject({ code: 'REPORT_TIMEOUT', name: 'ServiceUnavailableError' });
    // El valor es local a la transacción: la conexión vuelve al pool sin él.
    await expect(runReportRead(prisma, (db) => db.$queryRaw<{ ok: number }[]>`SELECT 1::int AS ok`)).resolves.toEqual([{ ok: 1 }]);
  });
});
