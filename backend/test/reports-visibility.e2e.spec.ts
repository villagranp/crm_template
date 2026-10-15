import {
  api,
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
 * Módulo 5 · Visibilidad por alcance de `reportes.ver` (05 H.1, PF-05.22, PF-05.23,
 * AC-05.25, AC-05.41): asesores A y B (OWN, mismo equipo), C (OWN, subequipo), un
 * asesor ajeno X, el manager del equipo (TEAM con subequipos), un responsable de país
 * (COUNTRY de `T1`) y un administrador, sobre listas, resúmenes y opciones de filtro.
 * Herencias DM-13 / DM-25: oportunidad de un proyecto visible, línea de forecast de un
 * proyecto visible y visita con proyecto visible. Países propios `T1` y `T2`.
 */

let context: TestContext;
let j1: string;
let j2: string;
const users = {} as Record<'a' | 'b' | 'c' | 'x' | 'manager' | 'country' | 'admin', CrmUser>;
const ids = {} as Record<
  'pA' | 'pB' | 'pC' | 'pX' | 'oA' | 'oAX' | 'oXA' | 'oB' | 'oC' | 'oX' | 'vA' | 'vXA' | 'vB' | 'vX' | 'aA' | 'aB' | 'aX' | 'lineXinA' | 'lineAinX' | 'lineB',
  string
>;
const PERIOD = { year: 2030, month: 6 };
const MONTH = '2030-06';

beforeAll(async () => {
  context = await createTestContext();
  const { prisma } = context;
  j1 = await testCountry(prisma, 'T1', { name: 'Prueba Visibilidad Uno' });
  j2 = await testCountry(prisma, 'T2', { name: 'Prueba Visibilidad Dos' });
  users.a = await crmUser(context, { roleCodes: ['asesor'], countryId: j1, displayName: 'Asesora A' });
  users.b = await crmUser(context, { roleCodes: ['asesor'], countryId: j2, displayName: 'Asesor B' });
  users.c = await crmUser(context, { roleCodes: ['asesor'], countryId: j1, displayName: 'Asesor C' });
  users.x = await crmUser(context, { roleCodes: ['asesor'], countryId: j2, displayName: 'Asesor X' });
  users.manager = await crmUser(context, { roleCodes: ['manager'], countryId: j1, displayName: 'Manager' });
  users.country = await crmUser(context, { roleCodes: ['responsable-pais'], countryId: j1, displayName: 'Responsable T1' });
  users.admin = await crmUser(context, { roleCodes: ['administrador'] });
  const team = await insertTeam(prisma, { managerId: users.manager.id, memberIds: [users.a.id, users.b.id] });
  await insertTeam(prisma, { parentId: team, memberIds: [users.c.id] });

  const customer = async (owner: CrmUser, countryId: string): Promise<string> => (await insertCustomer(prisma, { salesOwnerId: owner.id, countryId })).id;
  const cA = await customer(users.a, j1);
  const cB = await customer(users.b, j2);
  const cC = await customer(users.c, j1);
  const cX = await customer(users.x, j2);
  ids.pA = await insertProject(prisma, { customerId: cA, ownerId: users.a.id, countryId: j1 });
  ids.pB = await insertProject(prisma, { customerId: cB, ownerId: users.b.id, countryId: j2 });
  ids.pC = await insertProject(prisma, { customerId: cC, ownerId: users.c.id, countryId: j1 });
  ids.pX = await insertProject(prisma, { customerId: cX, ownerId: users.x.id, countryId: j2 });
  ids.oA = await insertOpportunity(prisma, { projectId: ids.pA, ownerId: users.a.id });
  ids.oAX = await insertOpportunity(prisma, { projectId: ids.pA, ownerId: users.x.id, stageCode: 'GANADO', outcome: 'WON' });
  ids.oXA = await insertOpportunity(prisma, { projectId: ids.pX, ownerId: users.a.id, stageCode: 'PERDIDO', outcome: 'LOST' });
  ids.oB = await insertOpportunity(prisma, { projectId: ids.pB, ownerId: users.b.id });
  ids.oC = await insertOpportunity(prisma, { projectId: ids.pC, ownerId: users.c.id });
  ids.oX = await insertOpportunity(prisma, { projectId: ids.pX, ownerId: users.x.id });
  ids.vA = await insertVisit(prisma, { customerId: cA, ownerId: users.a.id });
  ids.vXA = await insertVisit(prisma, { customerId: cA, ownerId: users.x.id, projectId: ids.pA });
  ids.vB = await insertVisit(prisma, { customerId: cB, ownerId: users.b.id });
  ids.vX = await insertVisit(prisma, { customerId: cX, ownerId: users.x.id });
  ids.aA = await insertActivity(prisma, { customerId: cA, ownerId: users.a.id });
  ids.aB = await insertActivity(prisma, { customerId: cB, ownerId: users.b.id });
  ids.aX = await insertActivity(prisma, { customerId: cX, ownerId: users.x.id });
  const unit = await unitId(prisma, 'VAR');
  const product = await insertProduct(prisma, { familyId: await insertProductFamily(prisma), baseUnitId: unit });
  ids.lineXinA = await insertForecastLine(prisma, { projectId: ids.pA, productId: product.id, unitId: unit, ownerId: users.x.id, ...PERIOD });
  ids.lineAinX = await insertForecastLine(prisma, { projectId: ids.pX, productId: product.id, unitId: unit, ownerId: users.a.id, ...PERIOD });
  ids.lineB = await insertForecastLine(prisma, { projectId: ids.pB, productId: product.id, unitId: unit, ownerId: users.b.id, ...PERIOD });
});

afterAll(async () => {
  await closeTestContext(context);
});

async function visibleIds(user: CrmUser, path: string): Promise<string[]> {
  const response = await api(context, user.token).get(path).expect(200);
  return (response.body.data as { id: string }[]).map((row) => row.id).sort();
}

const sorted = (...values: string[]): string[] => [...values].sort();
const scoped = (path: string, separator = '?'): string => `${path}${separator}countryId=${j1}&countryId=${j2}`;

describe('Cada alcance ve y cuenta solo lo suyo (PF-05.22, AC-05.41)', () => {
  it('OWN: lo propio y las herencias (oportunidad, visita y forecast de su proyecto); nada del compañero', async () => {
    const a = users.a;
    expect(await visibleIds(a, '/reports/projects')).toEqual([ids.pA]);
    expect(await visibleIds(a, '/reports/opportunities')).toEqual(sorted(ids.oA, ids.oAX, ids.oXA));
    expect(await visibleIds(a, '/reports/visits')).toEqual(sorted(ids.vA, ids.vXA));
    expect(await visibleIds(a, '/reports/activities')).toEqual([ids.aA]);
    expect(await visibleIds(a, `/reports/forecast?fromMonth=${MONTH}&toMonth=${MONTH}`)).toEqual(sorted(ids.lineXinA, ids.lineAinX));
    const summary = await api(context, a.token).get('/reports/opportunities/summary').expect(200);
    expect(summary.body).toMatchObject({ total: 3, open: 1, won: 1, lost: 1 });
    const forecast = await api(context, a.token).get(`/reports/forecast/summary?fromMonth=${MONTH}&toMonth=${MONTH}`).expect(200);
    expect(forecast.body.lineCount).toBe(2);
    expect(await visibleIds(users.b, '/reports/projects')).toEqual([ids.pB]);
    expect(await visibleIds(users.b, '/reports/opportunities')).toEqual([ids.oB]);
  });

  it('TEAM (con subequipos): la suma de los OWN del equipo en proyectos propios = lo que ve el manager', async () => {
    const manager = users.manager;
    const own = [...(await visibleIds(users.a, '/reports/projects')), ...(await visibleIds(users.b, '/reports/projects')), ...(await visibleIds(users.c, '/reports/projects'))];
    expect(await visibleIds(manager, '/reports/projects')).toEqual(own.sort());
    expect(await visibleIds(manager, '/reports/opportunities')).toEqual(sorted(ids.oA, ids.oAX, ids.oXA, ids.oB, ids.oC));
    expect(await visibleIds(manager, '/reports/visits')).toEqual(sorted(ids.vA, ids.vXA, ids.vB));
    expect(await visibleIds(manager, '/reports/activities')).toEqual(sorted(ids.aA, ids.aB));
    expect(await visibleIds(manager, `/reports/forecast?fromMonth=${MONTH}&toMonth=${MONTH}`)).toEqual(sorted(ids.lineXinA, ids.lineAinX, ids.lineB));
    const summary = await api(context, manager.token).get('/reports/visits/summary').expect(200);
    expect(summary.body.total).toBe(3);
  });

  it('COUNTRY: los registros de su país (y los propios); nada de T2', async () => {
    const country = users.country;
    expect(await visibleIds(country, '/reports/projects')).toEqual(sorted(ids.pA, ids.pC));
    expect(await visibleIds(country, '/reports/opportunities')).toEqual(sorted(ids.oA, ids.oAX, ids.oC));
    expect(await visibleIds(country, '/reports/visits')).toEqual(sorted(ids.vA, ids.vXA));
    expect(await visibleIds(country, '/reports/activities')).toEqual([ids.aA]);
    expect(await visibleIds(country, `/reports/forecast?fromMonth=${MONTH}&toMonth=${MONTH}`)).toEqual([ids.lineXinA]);
    expect(await visibleIds(country, `/reports/projects?countryId=${j2}`)).toEqual([]);
  });

  it('ORGANIZATION: todo, y filtrar por país acota', async () => {
    const admin = users.admin;
    expect(await visibleIds(admin, scoped('/reports/projects'))).toEqual(sorted(ids.pA, ids.pB, ids.pC, ids.pX));
    expect(await visibleIds(admin, scoped('/reports/opportunities'))).toEqual(sorted(ids.oA, ids.oAX, ids.oXA, ids.oB, ids.oC, ids.oX));
    expect(await visibleIds(admin, scoped('/reports/visits'))).toEqual(sorted(ids.vA, ids.vXA, ids.vB, ids.vX));
    expect(await visibleIds(admin, scoped('/reports/activities'))).toEqual(sorted(ids.aA, ids.aB, ids.aX));
    expect(await visibleIds(admin, scoped(`/reports/forecast?fromMonth=${MONTH}&toMonth=${MONTH}`, '&'))).toEqual(sorted(ids.lineXinA, ids.lineAinX, ids.lineB));
  });
});

describe('Un filtro nunca amplía el alcance (PF-05.23, RN-05.4)', () => {
  it('filtrar por un asesor o país fuera del alcance devuelve 200 con conjunto vacío', async () => {
    const a = api(context, users.a.token);
    for (const path of [
      `/reports/projects?ownerId=${users.b.id}`,
      `/reports/opportunities?ownerId=${users.b.id}`,
      `/reports/visits?ownerId=${users.b.id}`,
      `/reports/activities?ownerId=${users.b.id}`,
      `/reports/forecast?fromMonth=${MONTH}&toMonth=${MONTH}&ownerId=${users.b.id}`,
    ]) {
      const response = await a.get(path).expect(200);
      expect({ path, data: response.body.data, total: response.body.pagination.totalItems }).toEqual({ path, data: [], total: 0 });
    }
    const summary = await a.get(`/reports/opportunities/summary?ownerId=${users.b.id}`).expect(200);
    expect(summary.body).toMatchObject({ total: 0, byOwner: [] });
    const country = await api(context, users.country.token).get(`/reports/visits/summary?countryId=${j2}`).expect(200);
    expect(country.body.total).toBe(0);
  });
});

describe('Opciones de filtro dentro del alcance', () => {
  it('asesores y países de los registros visibles; alcance informado', async () => {
    const forA = await api(context, users.a.token).get('/reports/filter-options').expect(200);
    expect(forA.body.scope).toBe('OWN');
    // Por nombre: "asesor x" < "asesora a".
    expect(forA.body.owners).toEqual([
      { id: users.x.id, displayName: 'Asesor X' },
      { id: users.a.id, displayName: 'Asesora A' },
    ]);
    expect((forA.body.countries as { id: string }[]).map((country) => country.id).sort()).toEqual(sorted(j1, j2));
    const forCountry = await api(context, users.country.token).get('/reports/filter-options').expect(200);
    expect(forCountry.body.scope).toBe('COUNTRY');
    expect((forCountry.body.owners as { id: string }[]).map((owner) => owner.id).sort()).toEqual(sorted(users.a.id, users.c.id, users.x.id));
    expect(forCountry.body.countries).toEqual([{ id: j1, name: 'Prueba Visibilidad Uno' }]);
    const forManager = await api(context, users.manager.token).get('/reports/filter-options').expect(200);
    expect(forManager.body.scope).toBe('TEAM');
    expect((forManager.body.owners as { id: string }[]).map((owner) => owner.id)).not.toContain(users.manager.id);
    expect(forManager.body.catalogs.opportunityStages).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'GANADO', order: 3, isClosed: true, inFunnel: true, isActive: true })]),
    );
    expect(forManager.body.catalogs.visitStatuses).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'REPROGRAMADA', category: 'SCHEDULED' })]));
    expect(forManager.body.catalogs.activityStatuses).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'EN_PROCESO', group: 'OPEN' })]));
    expect(forManager.body.catalogs.priorities).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ALTA', weight: 3 })]));
    expect(forManager.body.catalogs.companyTypes).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CONSTRUCTORA' })]));
    expect(forManager.body.catalogs.projectPhases).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'FINALIZADO', isFinal: true })]));
    expect(Array.isArray(forManager.body.productFamilies)).toBe(true);
  });
});
