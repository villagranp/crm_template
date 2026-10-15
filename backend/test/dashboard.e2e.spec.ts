import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppLogger } from '@/infrastructure/logging/app-logger.service';

import {
  api,
  businessMonthOffset,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertActivity,
  insertContact,
  insertConversionRule,
  insertCustomer,
  insertForecastLine,
  insertOpportunity,
  insertProduct,
  insertProductFamily,
  insertProject,
  insertSalesTarget,
  insertTeam,
  insertUnit,
  insertVisit,
  testCountry,
  uniqueSuffix,
  unitId,
  withParameter,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 1 · Inicio (01 J, F-01…F-04): los 10 endpoints de `/dashboard` contra
 * PostgreSQL. Cada prueba crea usuarios nuevos (alcance OWN: solo ven lo suyo) y
 * países propios (`H1`, `H2`), así que las cifras exactas no dependen de otras
 * suites. Las comparaciones con alcance ORGANIZATION solo usan desigualdades.
 */

let context: TestContext;
let h1: string;
let h2: string;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const pad = (value: number): string => String(value).padStart(2, '0');

function monthRange(offset: number): { from: string; to: string } {
  const { year, month } = businessMonthOffset(offset);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}

async function seller(countryId = h1): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['asesor'], countryId });
}

async function customerOf(owner: CrmUser, countryId = h1): Promise<string> {
  return (await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId })).id;
}

async function projectOf(owner: CrmUser, options: { phaseCode?: string; deletedAt?: Date | null; lastActivityAt?: Date; countryId?: string } = {}): Promise<string> {
  const countryId = options.countryId ?? h1;
  const customerId = await customerOf(owner, countryId);
  return insertProject(context.prisma, { customerId, ownerId: owner.id, countryId, ...options });
}

beforeAll(async () => {
  context = await createTestContext();
  h1 = await testCountry(context.prisma, 'H1');
  h2 = await testCountry(context.prisma, 'H2');
});

afterAll(async () => {
  await closeTestContext(context);
});

describe('autenticación y autorización (PF-01.5, PF-01.32, PF-01.45, AC-01.4, AC-01.37)', () => {
  const ENDPOINTS: [string, string][] = [
    ['proyectos.ver', '/dashboard/indicators/projects'],
    ['oportunidades.ver', '/dashboard/indicators/opportunities'],
    ['forecast.ver', '/dashboard/indicators/forecast'],
    ['visitas.ver', '/dashboard/indicators/visits'],
    ['actividades.ver', '/dashboard/indicators/activities'],
    ['metas.ver', '/dashboard/indicators/targets'],
    ['visitas.ver', '/dashboard/upcoming-visits'],
    ['any', '/dashboard/recent-activity'],
    ['any', '/dashboard/alerts'],
    ['any', '/dashboard/alerts/summary'],
  ];

  it.each(ENDPOINTS)('%s %s sin token → 401', async (_permission, path) => {
    expect((await api(context).get(path).expect(401)).body.code).toBe('UNAUTHENTICATED');
  });

  it.each(ENDPOINTS)('%s %s sin ningún permiso comercial → 403', async (_permission, path) => {
    const user = await crmUser(context, { roleCodes: ['usuario'] });
    expect((await api(context, user.token).get(path).expect(403)).body.code).toBe('PERMISSION_DENIED');
  });

  it.each(ENDPOINTS.filter(([permission]) => permission !== 'any'))('%s es el permiso exacto de %s', async (permission, path) => {
    const allowed = await crmUser(context, { roleCodes: ['usuario'], grant: [permission] });
    await api(context, allowed.token).get(path).expect(200);
    const denied = await crmUser(context, { roleCodes: ['asesor'], deny: [permission] });
    await api(context, denied.token).get(path).expect(403);
  });

  it('actividad reciente y alertas admiten cualquiera de los cuatro permisos de fuente (D-01.1)', async () => {
    for (const permission of ['actividades.ver', 'visitas.ver', 'oportunidades.ver', 'proyectos.ver']) {
      const user = await crmUser(context, { roleCodes: ['usuario'], grant: [permission] });
      await api(context, user.token).get('/dashboard/recent-activity').expect(200);
      await api(context, user.token).get('/dashboard/alerts').expect(200);
      await api(context, user.token).get('/dashboard/alerts/summary').expect(200);
    }
  });
});

describe('indicadores (PF-01.8–PF-01.18, PF-01.26, PF-01.49, PF-01.50)', () => {
  it('K1: excluye fase final y proyectos eliminados (AC-01.7)', async () => {
    const user = await seller();
    await projectOf(user, { phaseCode: 'DISENO' });
    await projectOf(user, { phaseCode: 'CONSTRUCCION' });
    await projectOf(user, { phaseCode: 'FINALIZADO' });
    await projectOf(user, { phaseCode: 'DISENO', deletedAt: new Date() });
    const response = await api(context, user.token).get('/dashboard/indicators/projects').expect(200);
    expect(response.body).toEqual({ activeProjects: 2, generatedAt: expect.any(String) });
  });

  it('K2: abiertas con desglose por etapa; excluye la de un proyecto eliminado (AC-01.8)', async () => {
    const user = await seller();
    const project = await projectOf(user);
    const deleted = await projectOf(user, { deletedAt: new Date() });
    await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'CONTACTADO' });
    await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'COTIZANDO' });
    await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'COTIZANDO' });
    await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'GANADO', outcome: 'WON' });
    await insertOpportunity(context.prisma, { projectId: deleted, ownerId: user.id, stageCode: 'COTIZANDO' });
    const { body } = await api(context, user.token).get('/dashboard/indicators/opportunities').expect(200);
    expect(body.open.count).toBe(3);
    expect(body.open.byStage.map((stage: { code: string; count: number }) => [stage.code, stage.count])).toEqual([
      ['CONTACTADO', 1],
      ['COTIZANDO', 2],
    ]);
  });

  it('K3/K4: ganadas WON + PARTIAL del período, perdidas una por oportunidad, rango personalizado (AC-01.9, AC-01.10)', async () => {
    const user = await seller();
    const project = await projectOf(user);
    const current = monthRange(0);
    const previous = monthRange(-1);
    await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'GANADO', outcome: 'WON', decisionDate: current.from });
    await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'GANADO', outcome: 'PARTIAL', decisionDate: current.from });
    await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'GANADO', outcome: 'WON', decisionDate: previous.from });
    await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'PERDIDO', outcome: 'LOST', decisionDate: current.from });

    const month = (await api(context, user.token).get('/dashboard/indicators/opportunities?period=MONTH').expect(200)).body;
    expect(month).toMatchObject({ won: { count: 2, wonCount: 1, partialCount: 1 }, lost: { count: 1 }, period: { ...current, kind: 'MONTH' } });
    const custom = (await api(context, user.token).get(`/dashboard/indicators/opportunities?from=${previous.from}&to=${current.to}`).expect(200)).body;
    expect(custom).toMatchObject({ won: { count: 3 }, period: { from: previous.from, to: current.to, kind: 'CUSTOM' } });
  });

  it.each([
    ['from > to', '?from=2026-10-31&to=2026-10-01', 'from'],
    ['rango > 366 días', '?from=2025-01-01&to=2026-06-01', 'to'],
    ['period desconocido', '?period=WEEK', 'period'],
    ['from sin to', '?from=2026-10-01', 'to'],
  ])('%s → 400 VALIDATION_FAILED (AC-01.20)', async (_label, query, field) => {
    const user = await seller();
    const response = await api(context, user.token).get(`/dashboard/indicators/opportunities${query}`).expect(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.details[0].field).toBe(field);
  });

  it('K5: solo toneladas de la ventana M+1…M+6, líneas sin conversión y cantidades por unidad aparte (AC-01.11)', async () => {
    const user = await seller();
    const project = await projectOf(user);
    const family = await insertProductFamily(context.prisma);
    const kg = await unitId(context.prisma, 'KG');
    // FK (regla, unidad): la regla convierte desde la unidad de la línea.
    const mass = (await insertUnit(context.prisma, { dimension: 'MASS' })).id;
    const rule = await insertConversionRule(context.prisma, { fromUnitId: mass, factor: '1' });
    const line = async (offset: number, tonnage: string | null, unit = mass, quantity = '1'): Promise<void> => {
      const product = await insertProduct(context.prisma, { familyId: family, baseUnitId: unit });
      const { year, month } = businessMonthOffset(offset);
      const id = await insertForecastLine(context.prisma, { projectId: project, productId: product.id, unitId: unit, ownerId: user.id, year, month, quantity });
      // ck_forecast_lines_conversion: toneladas, regla y factor van juntos.
      if (tonnage !== null) await context.prisma.forecastLine.update({ where: { id }, data: { tonnage, conversionRuleId: rule, conversionFactor: '1' } });
    };
    await line(0, '10');
    await line(1, '20');
    await line(6, '5');
    await line(7, '7');
    await line(2, null, kg, '1200');

    const { body } = await api(context, user.token).get('/dashboard/indicators/forecast').expect(200);
    expect(body.window).toEqual({ from: businessMonthOffset(1), to: businessMonthOffset(6) });
    expect(body.totalTonnage).toBe('25.0000');
    expect(body.unconvertedLines).toBe(1);
    expect(body.months).toHaveLength(6);
    expect(body.quantitiesByUnit).toEqual(expect.arrayContaining([{ unitCode: 'KG', unitSymbol: expect.any(String), quantity: '1200.0000' }]));
    expect(body.tonnageUnit).toMatchObject({ code: 'TON' });

    const empty = await seller();
    expect((await api(context, empty.token).get('/dashboard/indicators/forecast').expect(200)).body.totalTonnage).toBeNull();
  });

  it('K6: pendientes, próximas y atrasadas; la cancelada no cuenta (AC-01.12)', async () => {
    const user = await seller();
    const customerId = await customerOf(user);
    const now = Date.now();
    await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'PROGRAMADA', scheduledStartAt: new Date(now + DAY) });
    await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'REPROGRAMADA', scheduledStartAt: new Date(now + 10 * DAY) });
    await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'PROGRAMADA', scheduledStartAt: new Date(now - DAY) });
    await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'CANCELADA', scheduledStartAt: new Date(now + DAY) });
    const { body } = await api(context, user.token).get('/dashboard/indicators/visits').expect(200);
    expect(body).toMatchObject({ pending: { count: 3, overdueCount: 1 }, upcoming: { count: 1, days: 7 } });
  });

  it('K7/K8: pendientes no vencidas con "por vencer" y vencidas, disjuntas (AC-01.13, AC-01.14)', async () => {
    const user = await seller();
    const customerId = await customerOf(user);
    const now = Date.now();
    await insertActivity(context.prisma, { customerId, ownerId: user.id });
    await insertActivity(context.prisma, { customerId, ownerId: user.id, dueAt: new Date(now + 24 * HOUR) });
    await insertActivity(context.prisma, { customerId, ownerId: user.id, dueAt: new Date(now + 5 * DAY) });
    await insertActivity(context.prisma, { customerId, ownerId: user.id, statusCode: 'COMPLETADA', completedAt: new Date(), dueAt: new Date(now + DAY) });
    await insertActivity(context.prisma, { customerId, ownerId: user.id, dueAt: new Date(now - HOUR) });
    await insertActivity(context.prisma, { customerId, ownerId: user.id, statusCode: 'CANCELADA', dueAt: new Date(now - HOUR) });
    const { body } = await api(context, user.token).get('/dashboard/indicators/activities').expect(200);
    expect(body).toMatchObject({ pending: { count: 3, dueSoonCount: 1, dueSoonHours: 48 }, overdue: { count: 1 } });
  });

  describe('K9 metas (AC-01.15, AC-01.40, AC-01.41)', () => {
    it('sin metas → hasTargets false; meta WON_OPPORTUNITIES 4 con 2 ganadas → 50.00; objetivo 0 → null', async () => {
      const user = await seller();
      const empty = (await api(context, user.token).get('/dashboard/indicators/targets').expect(200)).body;
      expect(empty).toMatchObject({ hasTargets: false, items: [] });

      const { year, month } = businessMonthOffset(0);
      const project = await projectOf(user);
      const current = monthRange(0);
      await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'GANADO', outcome: 'WON', decisionDate: current.from });
      await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'GANADO', outcome: 'PARTIAL', decisionDate: current.from });
      await insertSalesTarget(context.prisma, { metric: 'WON_OPPORTUNITIES', year, month, userId: user.id, targetValue: '4' });
      await insertSalesTarget(context.prisma, { metric: 'VISITS', year, month, userId: user.id, targetValue: '0' });
      // Meta de otro mes: no aplica (PF-01.50).
      const other = businessMonthOffset(-1);
      await insertSalesTarget(context.prisma, { metric: 'ACTIVITIES', year: other.year, month: other.month, userId: user.id, targetValue: '9' });

      const { body } = await api(context, user.token).get('/dashboard/indicators/targets').expect(200);
      expect(body.hasTargets).toBe(true);
      expect(body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ metric: 'WON_OPPORTUNITIES', targetValue: '4.0000', achievedValue: '2.0000', compliancePercent: '50.00', subject: { type: 'USER', id: user.id, label: expect.any(String) } }),
          expect.objectContaining({ metric: 'VISITS', targetValue: '0.0000', compliancePercent: null }),
        ]),
      );
      expect(body.items.some((item: { metric: string }) => item.metric === 'ACTIVITIES')).toBe(false);
    });

    it('TONNAGE: WON + PARTIAL ponderada → 420 t y 84.00; AMOUNT en USD → 7000 y 70.00', async () => {
      const user = await seller();
      const project = await projectOf(user);
      const { year, month } = businessMonthOffset(0);
      const current = monthRange(0);
      await insertOpportunity(context.prisma, {
        projectId: project, ownerId: user.id, stageCode: 'GANADO', outcome: 'WON', decisionDate: current.from,
        estimatedTonnage: '300', estimatedAmountUsd: '6000', estimatedAmount: '46500', currencyCode: 'GTQ', exchangeRate: '0.129',
      });
      await insertOpportunity(context.prisma, {
        projectId: project, ownerId: user.id, stageCode: 'GANADO', outcome: 'PARTIAL', awardedPercent: '60', decisionDate: current.from,
        estimatedTonnage: '200', estimatedAmountUsd: '2000',
      });
      await insertSalesTarget(context.prisma, { metric: 'TONNAGE', year, month, userId: user.id, targetValue: '500' });
      await insertSalesTarget(context.prisma, { metric: 'AMOUNT', year, month, userId: user.id, targetValue: '10000' });
      const { body } = await api(context, user.token).get('/dashboard/indicators/targets').expect(200);
      expect(body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ metric: 'TONNAGE', achievedValue: '420.0000', compliancePercent: '84.00', unit: { code: 'TON', symbol: expect.any(String) }, currencyCode: null }),
          // PARTIAL al 60 %: 6000 + 2000 × 0,6 = 7200.
          expect.objectContaining({ metric: 'AMOUNT', achievedValue: '7200.0000', compliancePercent: '72.00', unit: null, currencyCode: 'USD' }),
        ]),
      );
    });
  });

  it('cada indicador respeta el alcance: OWN ≤ TEAM ≤ COUNTRY ≤ ORGANIZATION; COUNTRY nunca ve otro país (AC-01.16, PF-01.20)', async () => {
    const a = await seller(h1);
    const b = await seller(h1);
    const c = await seller(h2);
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: h1 });
    const parent = await insertTeam(context.prisma, { managerId: manager.id });
    await insertTeam(context.prisma, { parentId: parent, memberIds: [a.id] });
    const countryLead = await crmUser(context, { roleCodes: ['responsable-pais'], countryId: h1 });
    const admin = await crmUser(context, { roleCodes: ['administrador'] });
    await projectOf(a);
    await projectOf(b);
    await projectOf(c, { countryId: h2 });

    const k1 = async (user: CrmUser): Promise<number> => (await api(context, user.token).get('/dashboard/indicators/projects').expect(200)).body.activeProjects;
    const [own, team, country, organization] = [await k1(a), await k1(manager), await k1(countryLead), await k1(admin)];
    expect(own).toBe(1);
    expect(team).toBe(1);
    // COUNTRY: todos los de H1 de la base (también de otras pruebas de este archivo), nunca los de H2.
    const h1Active = await context.prisma.project.count({ where: { countryId: h1, deletedAt: null, phase: { code: { not: 'FINALIZADO' } }, customer: { deletedAt: null } } });
    expect(country).toBe(h1Active);
    expect(own).toBeLessThanOrEqual(team);
    expect(team).toBeLessThanOrEqual(country);
    expect(country).toBeLessThanOrEqual(organization);
  });

  it('visitas y actividades heredan por el alcance de proyectos.ver, igual que el Módulo 4 (04 H.3, DM-13)', async () => {
    // País propio: las cifras exactas no dependen de otras pruebas.
    const h3 = await testCountry(context.prisma, 'H3');
    const roleCode = `lector-proyectos-pais-${uniqueSuffix()}`;
    const projectView = await context.prisma.permission.findUniqueOrThrow({ where: { code: 'proyectos.ver' } });
    await context.prisma.role.create({
      data: { code: roleCode, name: 'Lector de proyectos del país (prueba)', dataScope: 'COUNTRY', permissions: { create: [{ permissionId: projectView.id }] } },
    });
    try {
      const owner = await seller(h3);
      const projectId = await projectOf(owner, { countryId: h3 });
      const project = await context.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { customerId: true } });
      const activityId = await insertActivity(context.prisma, { customerId: project.customerId, ownerId: owner.id, projectId, dueAt: new Date(Date.now() - HOUR) });
      await insertVisit(context.prisma, { customerId: project.customerId, ownerId: owner.id, projectId, scheduledStartAt: new Date(Date.now() + DAY) });

      // actividades.ver y visitas.ver OWN (asesor) + proyectos.ver COUNTRY: las ve por herencia.
      const inheritor = await crmUser(context, { roleCodes: ['asesor', roleCode], countryId: h3 });
      const client = api(context, inheritor.token);
      const activities = (await client.get('/dashboard/indicators/activities').expect(200)).body;
      const visits = (await client.get('/dashboard/indicators/visits').expect(200)).body;
      expect(activities.overdue.count).toBe(1);
      expect(visits.pending.count).toBe(1);
      const alerts = (await client.get('/dashboard/alerts').query({ type: 'ACTIVIDAD_VENCIDA' }).expect(200)).body;
      expect(alerts.data.map((alert: { source: { id: string } }) => alert.source.id)).toEqual([activityId]);
      // La bandeja del Módulo 4 aplica el mismo predicado: el mismo número (AC-01.17).
      const pending = (await client.get('/activities/pending').query({ bucket: 'OVERDUE' }).expect(200)).body;
      expect(pending.pagination.totalItems).toBe(activities.overdue.count);

      // Con proyectos.ver OWN (solo asesor) no hay herencia: no las ve.
      const plain = api(context, (await seller(h3)).token);
      expect((await plain.get('/dashboard/indicators/activities').expect(200)).body.overdue.count).toBe(0);
      expect((await plain.get('/dashboard/indicators/visits').expect(200)).body.pending.count).toBe(0);
    } finally {
      // user_roles y role_permissions caen en cascada.
      await context.prisma.role.deleteMany({ where: { code: roleCode } });
    }
  });
});

describe('alertas (PF-01.34–PF-01.43, AC-01.27–AC-01.36)', () => {
  type Alert = { id: string; type: string; description: string; priority: { code: string; weight: number }; responsible: { id: string }; referenceDate: string; source: { type: string; id: string } };

  async function alertsOf(user: CrmUser, query = ''): Promise<Alert[]> {
    return (await api(context, user.token).get(`/dashboard/alerts?pageSize=100${query}`).expect(200)).body.data as Alert[];
  }

  it('AL-1…AL-4 con sus umbrales, prioridad del parámetro, responsable y orden (RN-01.27)', async () => {
    const user = await seller();
    const customerId = await customerOf(user);
    const now = Date.now();
    const overdue = await insertActivity(context.prisma, { customerId, ownerId: user.id, dueAt: new Date(now - DAY - HOUR), subject: 'Llamar a compras' });
    await insertActivity(context.prisma, { customerId, ownerId: user.id, statusCode: 'COMPLETADA', completedAt: new Date(), dueAt: new Date(now - DAY) });
    const oldVisit = await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'REALIZADA', scheduledStartAt: new Date(now - 50 * HOUR), actualStartAt: new Date(now - 50 * HOUR) });
    await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'REALIZADA', scheduledStartAt: new Date(now - 10 * HOUR), actualStartAt: new Date(now - 10 * HOUR) });
    const stale = await projectOf(user, { lastActivityAt: new Date(now - 31 * DAY) });
    await projectOf(user, { phaseCode: 'FINALIZADO', lastActivityAt: new Date(now - 60 * DAY) });
    await projectOf(user, { lastActivityAt: new Date(now - 60 * DAY), deletedAt: new Date() });
    const project = await projectOf(user);
    const quoting = await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'COTIZANDO', nextAction: '   ' });
    await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'COTIZANDO', nextAction: 'Enviar cotización' });
    await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'GANADO', outcome: 'WON' });

    const alerts = await alertsOf(user);
    expect(alerts.map((alert) => alert.id).sort()).toEqual(
      [`ACTIVIDAD_VENCIDA:${overdue}`, `VISITA_SIN_CONFIRMAR:${oldVisit}`, `PROYECTO_SIN_ACTUALIZAR:${stale}`, `OPORTUNIDAD_SIN_SIGUIENTE_ACCION:${quoting}`].sort(),
    );
    const activity = alerts.find((alert) => alert.type === 'ACTIVIDAD_VENCIDA');
    expect(activity).toMatchObject({ priority: { code: 'ALTA', weight: 3 }, responsible: { id: user.id }, source: { type: 'ACTIVITY', id: overdue } });
    expect(activity?.description).toMatch(/^Actividad TEST-ACT-.* «Llamar a compras» vencida hace 1 día$/);
    // Peso descendente: las de prioridad ALTA (3) antes que las MEDIA (2).
    const weights = alerts.map((alert) => alert.priority.weight);
    expect(weights).toEqual([...weights].sort((x, y) => y - x));
    // Identidad estable entre consultas (RN-01.28).
    expect((await alertsOf(user)).map((alert) => alert.id)).toEqual(alerts.map((alert) => alert.id));

    const summary = (await api(context, user.token).get('/dashboard/alerts/summary').expect(200)).body.items;
    expect(summary).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'ACTIVIDAD_VENCIDA', enabled: true, count: 1, disabledReason: null })]),
    );

    // Al completarse la actividad, su alerta desaparece y K8 baja (AC-01.34, RN-01.29).
    await context.prisma.activity.update({
      where: { id: overdue },
      data: { statusId: await catalogItemId(context.prisma, 'crm.estado_actividad', 'COMPLETADA'), completedAt: new Date(), completedById: user.id, resultNotes: 'Hecho' },
    });
    expect((await alertsOf(user)).some((alert) => alert.type === 'ACTIVIDAD_VENCIDA')).toBe(false);
    expect((await api(context, user.token).get('/dashboard/indicators/activities').expect(200)).body.overdue.count).toBe(0);
  });

  it('los parámetros rigen en la siguiente consulta: umbral, prioridad, AL-4 desactivada y valor inválido (AC-01.30, AC-01.32, AC-01.36)', async () => {
    const user = await seller();
    const customerId = await customerOf(user);
    await projectOf(user, { lastActivityAt: new Date(Date.now() - 40 * DAY) });
    const project = await projectOf(user);
    await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'CONTACTADO' });
    await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'REALIZADA', scheduledStartAt: new Date(Date.now() - 60 * HOUR), actualStartAt: new Date(Date.now() - 60 * HOUR) });

    const types = async (): Promise<string[]> => (await alertsOf(user)).map((alert) => alert.type).sort();
    expect(await types()).toEqual(['OPORTUNIDAD_SIN_SIGUIENTE_ACCION', 'PROYECTO_SIN_ACTUALIZAR', 'VISITA_SIN_CONFIRMAR']);

    await withParameter(context.prisma, 'crm.alertas.proyecto_sin_actualizar_dias', '45', async () => {
      expect(await types()).toEqual(['OPORTUNIDAD_SIN_SIGUIENTE_ACCION', 'VISITA_SIN_CONFIRMAR']);
    });
    await withParameter(
      context.prisma,
      'crm.alertas.prioridades',
      '{"ACTIVIDAD_VENCIDA":"ALTA","VISITA_SIN_CONFIRMAR":"MEDIA","PROYECTO_SIN_ACTUALIZAR":"BAJA","OPORTUNIDAD_SIN_SIGUIENTE_ACCION":"ALTA"}',
      async () => {
        const project = (await alertsOf(user)).find((alert) => alert.type === 'PROYECTO_SIN_ACTUALIZAR');
        expect(project?.priority.code).toBe('BAJA');
      },
    );
    await withParameter(context.prisma, 'crm.alertas.oportunidad_sin_siguiente_accion', 'false', async () => {
      expect(await types()).toEqual(['PROYECTO_SIN_ACTUALIZAR', 'VISITA_SIN_CONFIRMAR']);
      const summary = (await api(context, user.token).get('/dashboard/alerts/summary').expect(200)).body.items;
      expect(summary.find((item: { type: string }) => item.type === 'OPORTUNIDAD_SIN_SIGUIENTE_ACCION')).toMatchObject({ enabled: false, disabledReason: 'DISABLED_BY_PARAMETER', count: 0 });
    });

    const logger = context.app.get(AppLogger);
    const warn = jest.spyOn(logger, 'warn');
    try {
      await withParameter(context.prisma, 'crm.alertas.visita_sin_confirmar_horas', '"abc"', async () => {
        expect(await types()).toEqual(['OPORTUNIDAD_SIN_SIGUIENTE_ACCION', 'PROYECTO_SIN_ACTUALIZAR']);
        const summary = (await api(context, user.token).get('/dashboard/alerts/summary').expect(200)).body.items;
        expect(summary.find((item: { type: string }) => item.type === 'VISITA_SIN_CONFIRMAR')).toMatchObject({ enabled: false, disabledReason: 'PARAMETER_INVALID' });
      });
      expect(warn).toHaveBeenCalledWith('dashboard_alert_parameter_invalid', { key: 'crm.alertas.visita_sin_confirmar_horas' });
    } finally {
      warn.mockRestore();
    }
  });

  it('TEAM sin oportunidades.ver: alertas de su equipo, ningún tipo de oportunidades; "Asignadas a mí" (AC-01.35, PF-01.42)', async () => {
    const member = await seller();
    const outsider = await seller();
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: h1, deny: ['oportunidades.ver'] });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id] });
    const memberActivity = await insertActivity(context.prisma, { customerId: await customerOf(member), ownerId: member.id, dueAt: new Date(Date.now() - DAY) });
    const ownActivity = await insertActivity(context.prisma, { customerId: await customerOf(manager), ownerId: manager.id, dueAt: new Date(Date.now() - DAY) });
    const outsiderActivity = await insertActivity(context.prisma, { customerId: await customerOf(outsider), ownerId: outsider.id, dueAt: new Date(Date.now() - DAY) });
    const project = await projectOf(member);
    await insertOpportunity(context.prisma, { projectId: project, ownerId: member.id, stageCode: 'CONTACTADO' });

    const ids = (await alertsOf(manager, '&type=ACTIVIDAD_VENCIDA,OPORTUNIDAD_SIN_SIGUIENTE_ACCION')).map((alert) => alert.id);
    expect(ids).toEqual(expect.arrayContaining([`ACTIVIDAD_VENCIDA:${memberActivity}`, `ACTIVIDAD_VENCIDA:${ownActivity}`]));
    expect(ids).not.toContain(`ACTIVIDAD_VENCIDA:${outsiderActivity}`);
    expect(ids.some((id) => id.startsWith('OPORTUNIDAD_'))).toBe(false);
    const summary = (await api(context, manager.token).get('/dashboard/alerts/summary').expect(200)).body.items;
    expect(summary.some((item: { type: string }) => item.type === 'OPORTUNIDAD_SIN_SIGUIENTE_ACCION')).toBe(false);
    expect((await alertsOf(manager, '&type=ACTIVIDAD_VENCIDA&mine=true')).map((alert) => alert.id)).toEqual([`ACTIVIDAD_VENCIDA:${ownActivity}`]);
  });

  it('filtro por prioridad y orden alternativo por fecha; validación de la consulta', async () => {
    const user = await seller();
    const customerId = await customerOf(user);
    await insertActivity(context.prisma, { customerId, ownerId: user.id, dueAt: new Date(Date.now() - 2 * DAY) });
    await projectOf(user, { lastActivityAt: new Date(Date.now() - 90 * DAY) });
    expect((await alertsOf(user, '&priority=MEDIA')).map((alert) => alert.type)).toEqual(['PROYECTO_SIN_ACTUALIZAR']);
    expect((await alertsOf(user, '&sortBy=referenceDate&sortOrder=asc')).map((alert) => alert.type)).toEqual(['PROYECTO_SIN_ACTUALIZAR', 'ACTIVIDAD_VENCIDA']);
    await api(context, user.token).get('/dashboard/alerts?type=OTRA').expect(400);
    await api(context, user.token).get('/dashboard/alerts?sortBy=owner').expect(400);
    await api(context, user.token).get('/dashboard/alerts?pageSize=101').expect(400);
  });
});

describe('actividad (PF-01.28–PF-01.32, PF-01.46, AC-01.21–AC-01.26)', () => {
  type Event = { id: string; eventType: string; occurredAt: string; summary: string; responsible: { id: string }; source: { type: string; id: string } };

  it('compone los eventos de D.5, fusiona etapa + resultado y ordena de más reciente a más antiguo (AC-01.22, AC-01.23)', async () => {
    const user = await seller();
    const customerId = await customerOf(user);
    await insertContact(context.prisma, { customerId, email: `contacto-${Date.now()}@cliente.example`, phone: '+502 5555 0000', firstName: 'Persona', lastName: 'Contacto Privado' });
    const project = await projectOf(user);
    const now = Date.now();
    const registered = await insertActivity(context.prisma, { customerId, ownerId: user.id, typeCode: 'TAREA', subject: 'Preparar propuesta', createdAt: new Date(now - 5 * DAY) });
    const call = await insertActivity(context.prisma, {
      customerId, ownerId: user.id, typeCode: 'LLAMADA', statusCode: 'COMPLETADA', subject: 'Llamada de seguimiento',
      completedAt: new Date(now - 4 * DAY), createdAt: new Date(now - 40 * DAY),
    });
    const visit = await insertVisit(context.prisma, {
      customerId, ownerId: user.id, statusCode: 'CONFIRMADA', scheduledStartAt: new Date(now - 3 * DAY), actualStartAt: new Date(now - 3 * DAY), confirmedAt: new Date(now - 3 * DAY),
    });
    // Reprogramada dos veces: sigue siendo una sola fila de visita (RN-01.23).
    await context.prisma.visit.update({ where: { id: visit }, data: { rescheduleCount: 2 } });
    const opportunity = await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'GANADO', outcome: 'WON' });
    const closedAt = new Date(now - 2 * DAY);
    const stageFrom = await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'COTIZANDO');
    const stageTo = await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'GANADO');
    await context.prisma.opportunityStageHistory.create({ data: { opportunityId: opportunity, fromStageId: stageFrom, toStageId: stageTo, changedById: user.id, changedAt: closedAt } });
    const result = await context.prisma.opportunityResultHistory.create({ data: { opportunityId: opportunity, action: 'RECORDED', outcome: 'WON', decisionDate: closedAt, changedById: user.id, changedAt: closedAt } });
    const phase = await context.prisma.projectPhaseHistory.create({
      data: {
        projectId: project,
        fromPhaseId: await catalogItemId(context.prisma, 'crm.fase_cliente', 'DISENO'),
        toPhaseId: await catalogItemId(context.prisma, 'crm.fase_cliente', 'CONSTRUCCION'),
        fromProgress: '10',
        toProgress: '40',
        changedById: user.id,
        changedAt: new Date(now - DAY),
      },
    });

    const response = await api(context, user.token).get('/dashboard/recent-activity?pageSize=50').expect(200);
    const events = response.body.data as Event[];
    const ids = events.map((event) => event.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        `ACTIVIDAD_REGISTRADA:${registered}`,
        `INTERACCION:${call}`,
        `INTERACCION:${visit}`,
        `OPORTUNIDAD_CERRADA:${result.id}`,
        `PROYECTO_FASE:${phase.id}`,
      ]),
    );
    // La llamada completada es interacción: no se emite además ACTIVIDAD_COMPLETADA; la visita aparece una vez.
    expect(ids).not.toContain(`ACTIVIDAD_COMPLETADA:${call}`);
    expect(ids.filter((id) => id === `INTERACCION:${visit}`)).toHaveLength(1);
    expect(ids.some((id) => id.startsWith('OPORTUNIDAD_ETAPA:'))).toBe(false);
    const closed = events.find((event) => event.id === `OPORTUNIDAD_CERRADA:${result.id}`);
    expect(closed).toMatchObject({ summary: 'Cotizando → Ganado · Ganada', source: { type: 'OPPORTUNITY', id: opportunity } });
    const times = events.map((event) => Date.parse(event.occurredAt));
    expect(times).toEqual([...times].sort((x, y) => y - x));
    expect(events.every((event) => [...event.summary].length <= 200)).toBe(true);
    // Sin datos de contactos (RN-01.21, PF-01.46).
    const json = JSON.stringify(response.body);
    expect(json).not.toContain('@cliente.example');
    expect(json).not.toContain('Contacto Privado');
    expect(json).not.toContain('5555 0000');
  });

  it('una reapertura (etapa + resultado anulado en la misma operación) es un solo cambio de etapa, nunca "cerrada" (RN-01.23)', async () => {
    const user = await seller();
    const project = await projectOf(user);
    const opportunity = await insertOpportunity(context.prisma, { projectId: project, ownerId: user.id, stageCode: 'COTIZANDO' });
    const at = new Date(Date.now() - HOUR);
    const stage = await context.prisma.opportunityStageHistory.create({
      data: {
        opportunityId: opportunity,
        fromStageId: await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'GANADO'),
        toStageId: await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'COTIZANDO'),
        changedById: user.id,
        changedAt: at,
      },
    });
    const cleared = await context.prisma.opportunityResultHistory.create({ data: { opportunityId: opportunity, action: 'CLEARED', changedById: user.id, changedAt: at } });

    const events = (await api(context, user.token).get('/dashboard/recent-activity?types=OPORTUNIDAD_ETAPA,OPORTUNIDAD_CERRADA,OPORTUNIDAD_RESULTADO').expect(200)).body.data as Event[];
    expect(events.map((event) => [event.id, event.summary])).toEqual([[`OPORTUNIDAD_ETAPA:${stage.id}`, 'Ganado → Cotizando · resultado anulado']]);
    expect(events.some((event) => event.id === `OPORTUNIDAD_CERRADA:${cleared.id}` || event.id === `OPORTUNIDAD_RESULTADO:${cleared.id}`)).toBe(false);
  });

  it('solo actividades.ver y OWN: solo eventos de sus actividades; filtro por tipo y ventana (AC-01.25, PF-01.32)', async () => {
    const user = await crmUser(context, { roleCodes: ['usuario'], grant: ['actividades.ver'] });
    const other = await seller();
    const customerId = await customerOf(other);
    const mine = await insertActivity(context.prisma, { customerId, ownerId: user.id });
    await insertActivity(context.prisma, { customerId, ownerId: other.id });
    await projectOf(other);
    const old = await insertActivity(context.prisma, { customerId, ownerId: user.id, createdAt: new Date(Date.now() - 40 * DAY) });

    const events = (await api(context, user.token).get('/dashboard/recent-activity').expect(200)).body.data as Event[];
    expect(events.map((event) => event.id)).toEqual([`ACTIVIDAD_REGISTRADA:${mine}`]);
    const wider = (await api(context, user.token).get('/dashboard/recent-activity?sinceDays=60&types=ACTIVIDAD_REGISTRADA').expect(200)).body.data as Event[];
    expect(wider.map((event) => event.id)).toEqual([`ACTIVIDAD_REGISTRADA:${mine}`, `ACTIVIDAD_REGISTRADA:${old}`]);
    expect((await api(context, user.token).get('/dashboard/recent-activity?types=PROYECTO_CREADO').expect(200)).body.data).toEqual([]);
    await api(context, user.token).get('/dashboard/recent-activity?sinceDays=91').expect(400);
    await api(context, user.token).get('/dashboard/recent-activity?types=OTRO').expect(400);
  });

  it('próximas visitas: orden ascendente, ventana de N días y recordatorio (AC-01.24, PF-01.31)', async () => {
    const user = await seller();
    const customerId = await customerOf(user);
    const now = Date.now();
    const later = await insertVisit(context.prisma, { customerId, ownerId: user.id, scheduledStartAt: new Date(now + 3 * DAY) });
    const soon = await insertVisit(context.prisma, { customerId, ownerId: user.id, scheduledStartAt: new Date(now + 30 * 60_000), reminderMinutesBefore: 60 });
    await insertVisit(context.prisma, { customerId, ownerId: user.id, scheduledStartAt: new Date(now + 10 * DAY) });
    await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'CANCELADA', scheduledStartAt: new Date(now + DAY) });

    const { body } = await api(context, user.token).get('/dashboard/upcoming-visits?pageSize=10').expect(200);
    expect(body.data.map((visit: { id: string }) => visit.id)).toEqual([soon, later]);
    expect(body.data[0]).toMatchObject({ reminderDue: true, status: { code: 'PROGRAMADA' }, owner: { id: user.id }, customer: { id: customerId }, project: null });
    expect(body.data[1].reminderDue).toBe(false);
    expect(body.pagination).toMatchObject({ totalItems: 2 });
    await api(context, user.token).get('/dashboard/upcoming-visits?pageSize=51').expect(400);
  });
});

describe('OpenAPI (PF-01.47, AC-01.39)', () => {
  it('los 10 endpoints aparecen con su DTO y los códigos 401 y 403', () => {
    const document = SwaggerModule.createDocument(context.app, new DocumentBuilder().build());
    const paths = Object.keys(document.paths).filter((path) => path.startsWith('/api/v1/dashboard/')); // `/reports/dashboard` es de Reportes (05)
    expect(paths).toHaveLength(10);
    for (const path of paths) {
      const operation = document.paths[path]?.get;
      expect(operation?.responses).toEqual(expect.objectContaining({ '200': expect.anything(), '401': expect.anything(), '403': expect.anything() }));
    }
  });
});
