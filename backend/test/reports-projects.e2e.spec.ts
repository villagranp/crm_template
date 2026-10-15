import {
  api,
  catalogItemId,
  crmUser,
  insertActivity,
  insertCustomer,
  insertForecastLine,
  insertOpportunity,
  insertProduct,
  insertProductFamily,
  insertProject,
  insertProjectProduct,
  insertVisit,
  testCountry,
  unitId,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext, tokenWithRoles } from './support/test-app';

/**
 * Módulo 5 · Reporte de proyectos (05 F-34): PF-05.7, PF-05.33, AC-05.1–AC-05.3, y
 * PF-05.20 (401/403/200) para **todos** los endpoints de lectura del módulo (los `/export`, en
 * `reports-export.e2e.spec.ts`). Países propios `T5`, `K6`.
 */

let context: TestContext;
let k5: string;
let k6: string;

const NOW = Date.now();
const DAY = 86_400_000;

/** Endpoints de lectura del módulo (F-34…F-38, opciones de filtro, dashboard F-40 y embudo F-41). */
const READ_ENDPOINTS = [
  '/reports/filter-options',
  '/reports/projects',
  '/reports/opportunities',
  '/reports/opportunities/summary',
  '/reports/forecast',
  '/reports/forecast/consolidated',
  '/reports/forecast/summary',
  '/reports/visits',
  '/reports/visits/summary',
  '/reports/activities',
  '/reports/activities/summary',
  '/reports/dashboard',
  '/reports/dashboard/trends',
  '/reports/funnel',
];

beforeAll(async () => {
  context = await createTestContext();
  k5 = await testCountry(context.prisma, 'T5', { name: 'Prueba Reportes Proyectos' });
  k6 = await testCountry(context.prisma, 'K6', { name: 'Prueba Reportes Proyectos bis' });
});

afterAll(async () => {
  await closeTestContext(context);
});

function idsOf(rows: { id: string }[]): string[] {
  return rows.map((row) => row.id);
}

describe('Autenticación y permiso en cada endpoint (PF-05.20, AC-05.40)', () => {
  it('401 sin token, 403 sin `reportes.ver` y 200 con él', async () => {
    const withoutPermission = await tokenWithRoles(context, ['usuario']);
    const denied = await crmUser(context, { roleCodes: ['asesor'], deny: ['reportes.ver'] });
    const granted = await crmUser(context, { roleCodes: ['usuario'], grant: ['reportes.ver'] });
    for (const path of READ_ENDPOINTS) {
      const anonymous = await api(context).get(path);
      expect({ path, status: anonymous.status, code: anonymous.body.code }).toEqual({ path, status: 401, code: 'UNAUTHENTICATED' });
      const forbidden = await api(context, withoutPermission.token).get(path);
      expect({ path, status: forbidden.status, code: forbidden.body.code }).toEqual({ path, status: 403, code: 'PERMISSION_DENIED' });
      const deniedResponse = await api(context, denied.token).get(path);
      expect({ path, status: deniedResponse.status }).toEqual({ path, status: 403 });
      const ok = await api(context, granted.token).get(path);
      expect({ path, status: ok.status }).toEqual({ path, status: 200 });
    }
  });

  it('un permiso concedido directamente, sin rol, da alcance OWN (opciones de filtro)', async () => {
    const granted = await crmUser(context, { roleCodes: ['usuario'], grant: ['reportes.ver'] });
    const response = await api(context, granted.token).get('/reports/filter-options').expect(200);
    expect(response.body).toMatchObject({ owners: [], scope: 'OWN' });
  });

  it('publica las zonas de presentación: la del negocio y la del perfil (P-05.27, aditivo)', async () => {
    const granted = await crmUser(context, { roleCodes: ['usuario'], grant: ['reportes.ver'] });
    const business = (await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: 'crm.zona_horaria_negocio' } })).value;

    await context.prisma.user.update({ where: { id: granted.id }, data: { timeZone: 'America/Mexico_City' } });
    const withProfile = await api(context, granted.token).get('/reports/filter-options').expect(200);
    expect({ businessTimeZone: withProfile.body.businessTimeZone, timeZone: withProfile.body.timeZone }).toEqual({
      businessTimeZone: business,
      timeZone: 'America/Mexico_City',
    });

    await context.prisma.user.update({ where: { id: granted.id }, data: { timeZone: '  ' } });
    const blankProfile = await api(context, granted.token).get('/reports/filter-options').expect(200);
    expect({ businessTimeZone: blankProfile.body.businessTimeZone, timeZone: blankProfile.body.timeZone }).toEqual({
      businessTimeZone: business,
      timeZone: business,
    });
  });
});

describe('GET /reports/projects (PF-05.7, AC-05.1–AC-05.3)', () => {
  it('una fila por proyecto con 2 oportunidades y 4 productos; estado comercial = etapa abierta de mayor orden', async () => {
    const user = await crmUser(context, { roleCodes: ['asesor'], countryId: k5 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: k5, legalName: 'Constructora Reportes T5' });
    const typeId = await catalogItemId(context.prisma, 'crm.tipo_proyecto', 'EDIFICIO');
    const projectId = await insertProject(context.prisma, {
      customerId: customer.id,
      ownerId: user.id,
      countryId: k5,
      city: 'Quetzaltenango',
      name: 'Torre Reportes',
      phaseCode: 'COTIZACION',
      phaseProgress: '45',
      projectTypeId: typeId,
      estimatedDecisionDate: '2026-11-30',
      lastActivityAt: new Date('2026-09-01T12:00:00Z'),
    });
    const contacted = await insertOpportunity(context.prisma, { projectId, ownerId: user.id, stageCode: 'CONTACTADO' });
    const quoting = await insertOpportunity(context.prisma, { projectId, ownerId: user.id, stageCode: 'COTIZANDO' });
    const unit = await unitId(context.prisma, 'KG');
    const family = await insertProductFamily(context.prisma);
    for (const opportunityId of [contacted, contacted, quoting, quoting]) {
      const product = await insertProduct(context.prisma, { familyId: family, baseUnitId: unit });
      await insertProjectProduct(context.prisma, { projectId, productId: product.id, unitId: unit, opportunityId });
    }

    const response = await api(context, user.token).get('/reports/projects').expect(200);
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    const [row] = response.body.data;
    expect(row).toEqual({
      id: projectId,
      code: expect.stringMatching(/^TEST-PRY-/),
      name: 'Torre Reportes',
      customer: { id: customer.id, name: 'Constructora Reportes T5' },
      country: { id: k5, name: 'Prueba Reportes Proyectos' },
      city: 'Quetzaltenango',
      owner: { id: user.id, displayName: 'Persona De prueba' },
      projectType: { id: typeId, label: 'Edificio' },
      phase: { id: await catalogItemId(context.prisma, 'crm.fase_cliente', 'COTIZACION'), label: 'Cotización', isFinal: false },
      phaseProgress: '45.00',
      commercialStatus: {
        kind: 'OPEN_STAGE',
        label: 'Cotizando',
        stage: { id: await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'COTIZANDO'), label: 'Cotizando' },
      },
      estimatedDecisionDate: '2026-11-30',
      lastActivityAt: '2026-09-01T12:00:00.000Z',
    });
  });

  it('estado comercial Ganado, Perdido y Sin oportunidades; filtro por estado comercial', async () => {
    const user = await crmUser(context, { roleCodes: ['asesor'], countryId: k5 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: k5 });
    const project = (): Promise<string> => insertProject(context.prisma, { customerId: customer.id, ownerId: user.id, countryId: k5 });
    const won = await project();
    await insertOpportunity(context.prisma, { projectId: won, ownerId: user.id, stageCode: 'GANADO', outcome: 'PARTIAL' });
    await insertOpportunity(context.prisma, { projectId: won, ownerId: user.id, stageCode: 'PERDIDO', outcome: 'LOST' });
    const lost = await project();
    await insertOpportunity(context.prisma, { projectId: lost, ownerId: user.id, stageCode: 'PERDIDO', outcome: 'LOST' });
    const empty = await project();
    // Solo una oportunidad eliminada: "Sin oportunidades".
    await insertOpportunity(context.prisma, { projectId: empty, ownerId: user.id, stageCode: 'COTIZANDO', deletedAt: new Date() });
    const open = await project();
    await insertOpportunity(context.prisma, { projectId: open, ownerId: user.id, stageCode: 'CONTACTADO' });

    const client = api(context, user.token);
    const all = await client.get('/reports/projects?sortBy=code&sortOrder=asc').expect(200);
    const kinds = new Map((all.body.data as { id: string; commercialStatus: { kind: string; label: string } }[]).map((row) => [row.id, row.commercialStatus]));
    expect(kinds.get(won)).toEqual({ kind: 'WON', label: 'Ganado', stage: null });
    expect(kinds.get(lost)).toEqual({ kind: 'LOST', label: 'Perdido', stage: null });
    expect(kinds.get(empty)).toEqual({ kind: 'NO_OPPORTUNITIES', label: 'Sin oportunidades', stage: null });
    expect(kinds.get(open)).toMatchObject({ kind: 'OPEN_STAGE', label: 'Contactado' });

    const filtered = await client.get('/reports/projects?commercialStatus=WON&commercialStatus=NO_OPPORTUNITIES').expect(200);
    expect(idsOf(filtered.body.data).sort()).toEqual([won, empty].sort());
    const contactedStage = await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'CONTACTADO');
    const byStage = await client.get(`/reports/projects?commercialStatus=OPEN_STAGE:${contactedStage}`).expect(200);
    expect(idsOf(byStage.body.data)).toEqual([open]);
    const anyOpen = await client.get('/reports/projects?commercialStatus=OPEN_STAGE').expect(200);
    expect(idsOf(anyOpen.body.data)).toEqual([open]);
    await client.get('/reports/projects?commercialStatus=OPEN_STAGE:no-uuid').expect(400);
    await client.get('/reports/projects?commercialStatus=GANADO').expect(400);
  });

  it('filtro combinado país + fase + asesor + situación ACTIVE; búsqueda y ciudad sin acentos (AC-05.3)', async () => {
    const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: k6 });
    const other = await crmUser(context, { roleCodes: ['asesor'], countryId: k6 });
    const admin = await crmUser(context, { roleCodes: ['administrador'] });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: k6, legalName: 'Ferretería Ñandú K6' });
    const designId = await catalogItemId(context.prisma, 'crm.fase_cliente', 'DISENO');
    const finalId = await catalogItemId(context.prisma, 'crm.fase_cliente', 'FINALIZADO');
    const match = await insertProject(context.prisma, { customerId: customer.id, ownerId: owner.id, countryId: k6, phaseCode: 'DISENO', city: 'San José Pinula', name: 'Bodega Árbol' });
    await insertProject(context.prisma, { customerId: customer.id, ownerId: owner.id, countryId: k6, phaseCode: 'FINALIZADO', phaseProgress: '100' });
    await insertProject(context.prisma, { customerId: customer.id, ownerId: other.id, countryId: k6, phaseCode: 'DISENO' });
    await insertProject(context.prisma, { customerId: customer.id, ownerId: owner.id, countryId: k6, phaseCode: 'DISENO', deletedAt: new Date() });

    const client = api(context, admin.token);
    const combined = await client.get(`/reports/projects?countryId=${k6}&phaseId=${designId}&ownerId=${owner.id}&situation=ACTIVE`).expect(200);
    expect(idsOf(combined.body.data)).toEqual([match]);
    const finished = await client.get(`/reports/projects?countryId=${k6}&situation=FINISHED`).expect(200);
    expect((finished.body.data as { phase: { id: string; isFinal: boolean } }[]).map((row) => row.phase)).toEqual([
      { id: finalId, label: 'Finalizado', isFinal: true },
    ]);
    const active = await client.get(`/reports/projects?countryId=${k6}&situation=ACTIVE&phaseId=${finalId}`).expect(200);
    expect(active.body.data).toEqual([]);
    const searched = await client.get(`/reports/projects?countryId=${k6}&search=${encodeURIComponent('arbol')}`).expect(200);
    expect(idsOf(searched.body.data)).toEqual([match]);
    const byCustomerName = await client.get(`/reports/projects?countryId=${k6}&search=${encodeURIComponent('ÑANDU')}`).expect(200);
    expect(byCustomerName.body.pagination.totalItems).toBe(3);
    const byCity = await client.get(`/reports/projects?countryId=${k6}&city=${encodeURIComponent('jose pin')}`).expect(200);
    expect(idsOf(byCity.body.data)).toEqual([match]);
    // `%` y `_` se buscan como texto literal (H.2).
    const literal = await client.get(`/reports/projects?countryId=${k6}&search=${encodeURIComponent('%')}`).expect(200);
    expect(literal.body.data).toEqual([]);
    await client.get(`/reports/projects?search=${'x'.repeat(101)}`).expect(400);
  });

  it('período con base de fecha obligatoria; orden por defecto lastActivityAt desc y por fase', async () => {
    const user = await crmUser(context, { roleCodes: ['asesor'], countryId: k5 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: k5 });
    const older = await insertProject(context.prisma, {
      customerId: customer.id,
      ownerId: user.id,
      countryId: k5,
      phaseCode: 'CONSTRUCCION',
      estimatedDecisionDate: '2026-03-31',
      lastActivityAt: new Date('2026-03-01T06:00:00Z'),
      createdAt: new Date('2026-02-01T06:00:00Z'),
    });
    const newer = await insertProject(context.prisma, {
      customerId: customer.id,
      ownerId: user.id,
      countryId: k5,
      phaseCode: 'DISENO',
      estimatedDecisionDate: '2026-04-01',
      lastActivityAt: new Date('2026-04-01T05:59:59Z'),
      createdAt: new Date('2026-03-31T12:00:00Z'),
    });
    const client = api(context, user.token);
    expect(idsOf((await client.get('/reports/projects').expect(200)).body.data)).toEqual([newer, older]);
    expect(idsOf((await client.get('/reports/projects?sortBy=phaseOrder').expect(200)).body.data)).toEqual([newer, older]);
    expect(idsOf((await client.get('/reports/projects?sortBy=phaseOrder&sortOrder=desc').expect(200)).body.data)).toEqual([older, newer]);

    const period = 'from=2026-03-01&to=2026-03-31';
    expect((await client.get(`/reports/projects?${period}`).expect(400)).body).toMatchObject({ code: 'VALIDATION_FAILED', details: [{ field: 'dateBasis' }] });
    expect(idsOf((await client.get(`/reports/projects?${period}&dateBasis=DECISION_ESTIMATED`).expect(200)).body.data)).toEqual([older]);
    expect(idsOf((await client.get(`/reports/projects?${period}&dateBasis=UPDATED`).expect(200)).body.data)).toEqual([newer, older]);
    expect(idsOf((await client.get(`/reports/projects?${period}&dateBasis=CREATED`).expect(200)).body.data)).toEqual([newer]);
    await client.get('/reports/projects?from=2020-01-01&to=2025-01-01&dateBasis=CREATED').expect(422);
    await client.get('/reports/projects?sortBy=updatedAt').expect(400);
  });
});

describe('Proyecto eliminado lógicamente (PF-05.33, D-05.12)', () => {
  it('nada de un proyecto eliminado aparece ni cuenta: proyecto, oportunidad cerrada, forecast, visita y actividad', async () => {
    const user = await crmUser(context, { roleCodes: ['asesor'], countryId: k5 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: k5 });
    const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: user.id, countryId: k5 });
    await insertOpportunity(context.prisma, { projectId, ownerId: user.id, stageCode: 'GANADO', outcome: 'WON' });
    const unit = await unitId(context.prisma, 'KG');
    const product = await insertProduct(context.prisma, { familyId: await insertProductFamily(context.prisma), baseUnitId: unit });
    const window = new Date(NOW + 40 * DAY);
    const period = { year: window.getUTCFullYear(), month: window.getUTCMonth() + 1 };
    await insertForecastLine(context.prisma, { projectId, productId: product.id, unitId: unit, ownerId: user.id, ...period, quantity: '10' });
    await insertVisit(context.prisma, { customerId: customer.id, ownerId: user.id, projectId });
    await insertActivity(context.prisma, { customerId: customer.id, ownerId: user.id, projectId, dueAt: new Date(NOW - DAY) });

    const client = api(context, user.token);
    const month = `${period.year}-${String(period.month).padStart(2, '0')}`;
    const before = {
      projects: (await client.get('/reports/projects').expect(200)).body.pagination.totalItems,
      opportunities: (await client.get('/reports/opportunities/summary').expect(200)).body.total,
      forecast: (await client.get(`/reports/forecast/summary?fromMonth=${month}&toMonth=${month}`).expect(200)).body.lineCount,
      visits: (await client.get('/reports/visits/summary').expect(200)).body.total,
      activities: (await client.get('/reports/activities/summary').expect(200)).body.total,
    };
    expect(before).toEqual({ projects: 1, opportunities: 1, forecast: 1, visits: 1, activities: 1 });

    await context.prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } });
    const after = {
      projects: (await client.get('/reports/projects').expect(200)).body.pagination.totalItems,
      opportunities: (await client.get('/reports/opportunities/summary').expect(200)).body.total,
      opportunityRows: (await client.get('/reports/opportunities').expect(200)).body.pagination.totalItems,
      forecast: (await client.get(`/reports/forecast/summary?fromMonth=${month}&toMonth=${month}`).expect(200)).body.lineCount,
      forecastRows: (await client.get(`/reports/forecast?fromMonth=${month}&toMonth=${month}`).expect(200)).body.pagination.totalItems,
      visits: (await client.get('/reports/visits/summary').expect(200)).body.total,
      activities: (await client.get('/reports/activities/summary').expect(200)).body.total,
      owners: (await client.get('/reports/filter-options').expect(200)).body.owners,
    };
    expect(after).toEqual({ projects: 0, opportunities: 0, opportunityRows: 0, forecast: 0, forecastRows: 0, visits: 0, activities: 0, owners: [] });
  });
});
