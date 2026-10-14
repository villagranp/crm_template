import type { PrismaClient } from '@prisma/client';

import {
  api,
  businessMonthOffset,
  crmUser,
  insertActivity,
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
 * Módulo 5 · Solo lectura (05 RN-05.1, PF-05.29, AC-05.43): ningún endpoint de la etapa
 * modifica filas comerciales. Se comparan conteos y `max(updated_at)` de las tablas
 * comerciales **del país propio `J4`** (otras suites escriben a la vez en las suyas) y los
 * eventos de auditoría de los usuarios de la prueba, antes y después de llamar a todo.
 */

let context: TestContext;
let j4: string;

beforeAll(async () => {
  context = await createTestContext();
  j4 = await testCountry(context.prisma, 'J4', { name: 'Prueba Solo lectura' });
});

afterAll(async () => {
  await closeTestContext(context);
});

async function snapshot(prisma: PrismaClient, countryId: string): Promise<unknown> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      (SELECT row(COUNT(*), MAX(updated_at))::text FROM customers WHERE country_id = ${countryId}::uuid) AS customers,
      (SELECT row(COUNT(*), MAX(updated_at), MAX(last_activity_at))::text FROM projects WHERE country_id = ${countryId}::uuid) AS projects,
      (SELECT row(COUNT(*), MAX(o.updated_at))::text FROM opportunities o JOIN projects p ON p.id = o.project_id WHERE p.country_id = ${countryId}::uuid) AS opportunities,
      (SELECT row(COUNT(*), MAX(r.updated_at))::text FROM opportunity_results r JOIN opportunities o ON o.id = r.opportunity_id JOIN projects p ON p.id = o.project_id WHERE p.country_id = ${countryId}::uuid) AS results,
      (SELECT row(COUNT(*), MAX(fl.updated_at))::text FROM forecast_lines fl JOIN projects p ON p.id = fl.project_id WHERE p.country_id = ${countryId}::uuid) AS forecast,
      (SELECT row(COUNT(*), MAX(pp.updated_at))::text FROM project_products pp JOIN projects p ON p.id = pp.project_id WHERE p.country_id = ${countryId}::uuid) AS products,
      (SELECT row(COUNT(*), MAX(v.updated_at))::text FROM visits v JOIN customers c ON c.id = v.customer_id WHERE c.country_id = ${countryId}::uuid) AS visits,
      (SELECT COUNT(*)::int FROM visit_events e JOIN visits v ON v.id = e.visit_id JOIN customers c ON c.id = v.customer_id WHERE c.country_id = ${countryId}::uuid) AS visit_events,
      (SELECT row(COUNT(*), MAX(a.updated_at))::text FROM activities a JOIN customers c ON c.id = a.customer_id WHERE c.country_id = ${countryId}::uuid) AS activities`;
  return rows[0];
}

describe('Ningún endpoint modifica datos comerciales (PF-05.29, AC-05.43)', () => {
  it('conteos, max(updated_at) y auditoría iguales antes y después de llamar a todos los endpoints', async () => {
    const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: j4 });
    const admin = await crmUser(context, { roleCodes: ['administrador'] });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: j4 });
    const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: owner.id, countryId: j4 });
    await insertOpportunity(context.prisma, { projectId, ownerId: owner.id, stageCode: 'GANADO', outcome: 'WON' });
    const unit = await unitId(context.prisma, 'VAR');
    const product = await insertProduct(context.prisma, { familyId: await insertProductFamily(context.prisma), baseUnitId: unit });
    await insertForecastLine(context.prisma, { projectId, productId: product.id, unitId: unit, ownerId: owner.id, ...businessMonthOffset(1) });
    await insertVisit(context.prisma, { customerId: customer.id, ownerId: owner.id, projectId });
    await insertActivity(context.prisma, { customerId: customer.id, ownerId: owner.id, projectId });

    const before = await snapshot(context.prisma, j4);
    const auditBefore = await context.prisma.auditLog.count({ where: { subjectId: { in: [owner.id, admin.id] } } });
    const paths = [
      '/reports/filter-options',
      '/reports/projects',
      '/reports/opportunities',
      '/reports/opportunities/summary',
      '/reports/forecast',
      '/reports/forecast/consolidated?groupBy=PROJECT&thenBy=PRODUCT',
      '/reports/forecast/summary',
      '/reports/visits',
      '/reports/visits/summary',
      '/reports/activities',
      '/reports/activities/summary',
    ];
    for (const user of [owner, admin]) {
      for (const path of paths) {
        const filtered = user === admin && path !== '/reports/filter-options' ? `${path}${path.includes('?') ? '&' : '?'}countryId=${j4}` : path;
        await api(context, user.token).get(filtered).expect(200);
      }
    }
    expect(await snapshot(context.prisma, j4)).toEqual(before);
    expect(await context.prisma.auditLog.count({ where: { subjectId: { in: [owner.id, admin.id] } } })).toBe(auditBefore);
  });
});
