import {
  api,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertActivity,
  insertCustomer,
  insertProject,
  insertVisit,
  testCountry,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 5 · Reportes de visitas y actividades (05 F-37, F-38): PF-05.16 a PF-05.19,
 * AC-05.17–AC-05.22. Países propios `K8` (cliente) y `K9` (proyecto de otro país).
 */

let context: TestContext;
let k8: string;
let k9: string;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

beforeAll(async () => {
  context = await createTestContext();
  k8 = await testCountry(context.prisma, 'K8', { name: 'Prueba Reportes Actividad' });
  k9 = await testCountry(context.prisma, 'K9', { name: 'Prueba Reportes Actividad bis' });
});

afterAll(async () => {
  await closeTestContext(context);
});

async function advisor(): Promise<{ user: CrmUser; customerId: string }> {
  const user = await crmUser(context, { roleCodes: ['asesor'], countryId: k8 });
  const customer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: k8 });
  return { user, customerId: customer.id };
}

function idsOf(rows: { id: string }[]): string[] {
  return rows.map((row) => row.id).sort();
}

describe('Reporte de visitas (PF-05.16, PF-05.17, AC-05.17, AC-05.18)', () => {
  it('una visita reprogramada dos veces aparece una vez, en el mes de su fecha vigente', async () => {
    const { user, customerId } = await advisor();
    const current = new Date('2026-03-15T15:00:00Z');
    const original = new Date('2026-02-20T15:00:00Z');
    const visitId = await insertVisit(context.prisma, {
      customerId,
      ownerId: user.id,
      statusCode: 'REPROGRAMADA',
      scheduledStartAt: current,
      originalScheduledAt: original,
      rescheduleCount: 2,
    });
    const rescheduled = await catalogItemId(context.prisma, 'crm.estado_visita', 'REPROGRAMADA');
    const planned = await catalogItemId(context.prisma, 'crm.estado_visita', 'PROGRAMADA');
    // Dos eventos de reprogramación: nunca entran en el FROM de un conteo (RN-05.39).
    for (const [from, to] of [
      [original, new Date('2026-03-01T15:00:00Z')],
      [new Date('2026-03-01T15:00:00Z'), current],
    ] as const) {
      await context.prisma.visitEvent.create({
        data: { visitId, eventType: 'RESCHEDULED', fromStatusId: planned, toStatusId: rescheduled, previousScheduledStartAt: from, newScheduledStartAt: to, performedById: user.id, reasonText: 'prueba' },
      });
    }
    const client = api(context, user.token);
    const march = await client.get('/reports/visits?from=2026-03-01&to=2026-03-31').expect(200);
    expect(march.body.pagination.totalItems).toBe(1);
    expect(march.body.data[0]).toMatchObject({
      id: visitId,
      scheduledStartAt: current.toISOString(),
      originalScheduledAt: original.toISOString(),
      rescheduleCount: 2,
      status: { id: rescheduled, label: 'Reprogramada', category: 'SCHEDULED' },
      actualStartAt: null,
      confirmedAt: null,
      project: null,
    });
    const february = await client.get('/reports/visits?from=2026-02-01&to=2026-02-28').expect(200);
    expect(february.body.data).toEqual([]);
    const summary = await client.get('/reports/visits/summary?from=2026-03-01&to=2026-03-31').expect(200);
    expect(summary.body).toEqual({
      total: 1,
      scheduled: 1,
      completed: 0,
      confirmed: 0,
      cancelled: 0,
      completedTotal: 0,
      rescheduledVisits: 1,
      rescheduleEvents: 2,
      overduePending: 1,
    });
  });

  it('visitas en los cinco estados: las categorías suman el total y REPROGRAMADA cuenta como programada', async () => {
    const { user, customerId } = await advisor();
    const base = Date.now();
    const visits = {
      planned: await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'PROGRAMADA', scheduledStartAt: new Date(base + DAY) }),
      overdue: await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'PROGRAMADA', scheduledStartAt: new Date(base - 2 * DAY) }),
      rescheduled: await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'REPROGRAMADA', scheduledStartAt: new Date(base + 2 * DAY), rescheduleCount: 1 }),
      done: await insertVisit(context.prisma, {
        customerId,
        ownerId: user.id,
        statusCode: 'REALIZADA',
        scheduledStartAt: new Date(base - 3 * DAY),
        actualStartAt: new Date(base - 3 * DAY),
        resultSummary: 'Visita realizada',
      }),
      confirmed: await insertVisit(context.prisma, {
        customerId,
        ownerId: user.id,
        statusCode: 'CONFIRMADA',
        scheduledStartAt: new Date(base - 4 * DAY),
        actualStartAt: new Date(base - 4 * DAY),
        resultSummary: 'Visita confirmada',
        confirmedAt: new Date(base - 3 * DAY),
      }),
      cancelled: await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'CANCELADA', scheduledStartAt: new Date(base + 3 * DAY) }),
    };
    const client = api(context, user.token);
    const summary = await client.get('/reports/visits/summary').expect(200);
    expect(summary.body).toEqual({
      total: 6,
      scheduled: 3,
      completed: 1,
      confirmed: 1,
      cancelled: 1,
      completedTotal: 2,
      rescheduledVisits: 1,
      rescheduleEvents: 1,
      overduePending: 1,
    });
    const { scheduled, completed, confirmed, cancelled, total } = summary.body as Record<'scheduled' | 'completed' | 'confirmed' | 'cancelled' | 'total', number>;
    expect(scheduled + completed + confirmed + cancelled).toBe(total);

    const scheduledRows = await client.get('/reports/visits?statusCategory=SCHEDULED').expect(200);
    expect(idsOf(scheduledRows.body.data)).toEqual([visits.planned, visits.overdue, visits.rescheduled].sort());
    const done = await client.get('/reports/visits?statusCategory=COMPLETED&statusCategory=CONFIRMED').expect(200);
    expect(idsOf(done.body.data)).toEqual([visits.done, visits.confirmed].sort());
    const confirmedRow = (done.body.data as { id: string }[]).find((row) => row.id === visits.confirmed);
    expect(confirmedRow).toMatchObject({ status: { category: 'CONFIRMED', label: 'Confirmada' }, resultSummary: 'Visita confirmada', confirmedAt: new Date(base - 3 * DAY).toISOString() });
    const cancelledStatus = await catalogItemId(context.prisma, 'crm.estado_visita', 'CANCELADA');
    const byStatus = await client.get(`/reports/visits?statusId=${cancelledStatus}`).expect(200);
    expect(idsOf(byStatus.body.data)).toEqual([visits.cancelled]);

    // Bases de fecha: con ACTUAL o CONFIRMED solo entran las que tienen ese dato.
    const from = new Date(base - 10 * DAY).toISOString().slice(0, 10);
    const to = new Date(base + 10 * DAY).toISOString().slice(0, 10);
    const actual = await client.get(`/reports/visits?from=${from}&to=${to}&dateBasis=ACTUAL`).expect(200);
    expect(idsOf(actual.body.data)).toEqual([visits.done, visits.confirmed].sort());
    const confirmedBasis = await client.get(`/reports/visits/summary?from=${from}&to=${to}&dateBasis=CONFIRMED`).expect(200);
    expect(confirmedBasis.body).toMatchObject({ total: 1, confirmed: 1 });

    // Orden por defecto: fecha planificada vigente descendente.
    const ordered = await client.get('/reports/visits').expect(200);
    expect((ordered.body.data as { id: string }[]).map((row) => row.id)).toEqual([
      visits.cancelled,
      visits.rescheduled,
      visits.planned,
      visits.overdue,
      visits.done,
      visits.confirmed,
    ]);
    await client.get('/reports/visits?statusCategory=PENDING').expect(400);
    await client.get('/reports/visits?sortBy=code').expect(400);
  });
});

describe('Reporte de actividades (PF-05.19, AC-05.20–AC-05.22)', () => {
  it('vencida, pendiente, sin vencimiento, completada, cancelada y eliminada: categorías disjuntas y la eliminada fuera', async () => {
    const { user, customerId } = await advisor();
    const now = Date.now();
    const activities = {
      overdue: await insertActivity(context.prisma, { customerId, ownerId: user.id, dueAt: new Date(now - DAY), subject: 'Vencida' }),
      dueSoon: await insertActivity(context.prisma, { customerId, ownerId: user.id, dueAt: new Date(now + DAY), subject: 'Mañana' }),
      noDue: await insertActivity(context.prisma, { customerId, ownerId: user.id, subject: 'Sin vencimiento' }),
      completed: await insertActivity(context.prisma, {
        customerId,
        ownerId: user.id,
        statusCode: 'COMPLETADA',
        dueAt: new Date(now - 2 * DAY),
        completedAt: new Date(now - 2 * DAY),
      }),
      cancelled: await insertActivity(context.prisma, { customerId, ownerId: user.id, statusCode: 'CANCELADA', dueAt: new Date(now - DAY) }),
    };
    await insertActivity(context.prisma, { customerId, ownerId: user.id, dueAt: new Date(now - DAY), deletedAt: new Date() });

    const client = api(context, user.token);
    const summary = await client.get('/reports/activities/summary').expect(200);
    expect(summary.body).toEqual({ total: 5, pending: 2, overdue: 1, completed: 1, cancelled: 1, dueSoon: 1, dueSoonHours: 48 });

    const rows = await client.get('/reports/activities').expect(200);
    expect(idsOf(rows.body.data)).toEqual(Object.values(activities).sort());
    const byId = new Map((rows.body.data as { id: string; status: { category: string }; isOverdue: boolean }[]).map((row) => [row.id, row]));
    expect(byId.get(activities.overdue)).toMatchObject({ status: { category: 'OVERDUE', label: 'Pendiente' }, isOverdue: true });
    expect(byId.get(activities.dueSoon)).toMatchObject({ status: { category: 'PENDING' }, isOverdue: false });
    expect(byId.get(activities.noDue)).toMatchObject({ status: { category: 'PENDING' }, isOverdue: false, activityDate: null, dueAt: null });
    expect(byId.get(activities.completed)).toMatchObject({ status: { category: 'COMPLETED' }, isOverdue: false, resultNotes: 'Resultado de prueba' });
    expect(byId.get(activities.cancelled)).toMatchObject({ status: { category: 'CANCELLED' }, isOverdue: false });
    expect(byId.get(activities.overdue)).toMatchObject({
      type: { id: await catalogItemId(context.prisma, 'crm.tipo_actividad', 'LLAMADA') },
      priority: { id: await catalogItemId(context.prisma, 'crm.prioridad', 'MEDIA'), label: 'Media', weight: 2 },
      subject: 'Vencida',
      customer: { id: customerId },
      owner: { id: user.id },
    });

    const overdue = await client.get('/reports/activities?statusCategory=OVERDUE').expect(200);
    expect(idsOf(overdue.body.data)).toEqual([activities.overdue]);
    const pending = await client.get('/reports/activities/summary?statusCategory=PENDING').expect(200);
    expect(pending.body).toMatchObject({ total: 2, pending: 2, overdue: 0 });
  });

  it('filtros combinados (período, asesor, estado, cliente, tipo): la lista y los conteos usan el mismo conjunto (AC-05.22)', async () => {
    const { user, customerId } = await advisor();
    const other = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: k8 });
    const at = (day: string): Date => new Date(`${day}T15:00:00Z`);
    const match = await insertActivity(context.prisma, { customerId, ownerId: user.id, typeCode: 'TAREA', scheduledAt: at('2026-05-10'), dueAt: at('2026-05-12') });
    await insertActivity(context.prisma, { customerId, ownerId: user.id, typeCode: 'LLAMADA', scheduledAt: at('2026-05-10') });
    await insertActivity(context.prisma, { customerId: other.id, ownerId: user.id, typeCode: 'TAREA', scheduledAt: at('2026-05-10') });
    await insertActivity(context.prisma, { customerId, ownerId: user.id, typeCode: 'TAREA', scheduledAt: at('2026-06-01') });
    // Sin `scheduled_at` pero con vencimiento en mayo: entra por COALESCE(scheduled_at, due_at).
    const byDue = await insertActivity(context.prisma, { customerId, ownerId: user.id, typeCode: 'TAREA', dueAt: at('2026-05-20') });
    await insertActivity(context.prisma, { customerId, ownerId: user.id, typeCode: 'TAREA', statusCode: 'CANCELADA', scheduledAt: at('2026-05-11') });

    const task = await catalogItemId(context.prisma, 'crm.tipo_actividad', 'TAREA');
    const filters = `from=2026-05-01&to=2026-05-31&ownerId=${user.id}&customerId=${customerId}&typeId=${task}&statusCategory=OVERDUE&statusCategory=PENDING`;
    const client = api(context, user.token);
    const list = await client.get(`/reports/activities?${filters}`).expect(200);
    expect(idsOf(list.body.data)).toEqual([match, byDue].sort());
    const summary = await client.get(`/reports/activities/summary?${filters}`).expect(200);
    expect(summary.body.total).toBe(list.body.pagination.totalItems);
    expect(summary.body.overdue + summary.body.pending).toBe(2);
    const due = await client.get(`/reports/activities?from=2026-05-01&to=2026-05-31&dateBasis=DUE&customerId=${customerId}`).expect(200);
    expect(idsOf(due.body.data)).toEqual([match, byDue].sort());
    const completed = await client.get(`/reports/activities/summary?from=2026-05-01&to=2026-05-31&dateBasis=COMPLETED&customerId=${customerId}`).expect(200);
    expect(completed.body.total).toBe(0);
    await client.get('/reports/activities?statusCategory=DONE').expect(400);
  });
});

describe('Filtro por país: el del cliente (PF-05.18, AC-05.19)', () => {
  it('visitas y actividades se filtran por `customers.country_id`, no por el país del proyecto', async () => {
    const { user, customerId } = await advisor();
    const projectId = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: k9 });
    const visit = await insertVisit(context.prisma, { customerId, ownerId: user.id, projectId });
    const activity = await insertActivity(context.prisma, { customerId, ownerId: user.id, projectId });
    const client = api(context, user.token);
    expect(idsOf((await client.get(`/reports/visits?countryId=${k8}`).expect(200)).body.data)).toEqual([visit]);
    expect((await client.get(`/reports/visits?countryId=${k9}`).expect(200)).body.data).toEqual([]);
    expect(idsOf((await client.get(`/reports/activities?countryId=${k8}`).expect(200)).body.data)).toEqual([activity]);
    expect((await client.get(`/reports/activities/summary?countryId=${k9}`).expect(200)).body.total).toBe(0);
    const visitRow = (await client.get(`/reports/visits?projectId=${projectId}`).expect(200)).body.data[0];
    expect(visitRow).toMatchObject({ id: visit, project: { id: projectId } });
  });
});
