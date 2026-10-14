import { randomUUID } from 'node:crypto';

import { PDF_BYTES } from '@/modules/attachments/testing/attachment-fixtures';

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
  uniqueSuffix,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 4 · Modelos de lectura (04 F.3, PF-04.37–PF-04.42): agenda (listado y
 * calendario), historial de interacciones y seguimiento comercial con su
 * trazabilidad. Derivados, sin tablas propias (00 §2.12). País propio `R4`.
 */

let context: TestContext;
let r4: string;
const ids: Record<string, string> = {};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

beforeAll(async () => {
  context = await createTestContext();
  r4 = await testCountry(context.prisma, 'R4', { name: 'Prueba Lecturas' });
  const codes: [string, string, string][] = [
    ['call', 'crm.tipo_actividad', 'LLAMADA'],
    ['task', 'crm.tipo_actividad', 'TAREA'],
    ['pending', 'crm.estado_actividad', 'PENDIENTE'],
    ['medium', 'crm.prioridad', 'MEDIA'],
    ['positive', 'crm.resultado_interaccion', 'POSITIVO'],
    ['cancelReason', 'crm.motivo_cancelacion', 'CANCELA_CLIENTE'],
  ];
  for (const [key, catalog, code] of codes) ids[key] = await catalogItemId(context.prisma, catalog, code);
});

afterAll(async () => {
  await closeTestContext(context);
});

async function ownerWithCustomer(options: { grant?: string[]; deny?: string[]; roleCodes?: string[] } = {}): Promise<{ user: CrmUser; customerId: string }> {
  const user = await crmUser(context, { roleCodes: options.roleCodes ?? ['asesor'], countryId: r4, grant: options.grant, deny: options.deny });
  const customer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: r4 });
  return { user, customerId: customer.id };
}

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function idsOf(rows: { id: string }[]): string[] {
  return rows.map((row) => row.id);
}

// ---------------------------------------------------------------------------
// PF-04.37–PF-04.39 · Agenda
// ---------------------------------------------------------------------------

describe('GET /agenda y /agenda/calendar (PF-04.37–PF-04.39, AC-04.1–AC-04.6)', () => {
  it('PF-04.37: mezcla visitas y actividades en su fecha; una reprogramada dos veces aparece una vez; filtros combinados', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const visit = await client.post('/visits').send({ customerId, scheduledStartAt: iso(DAY), objective: 'Visita agenda' }).expect(201);
    await client.post(`/visits/${visit.body.id}/rescheduling`).send({ newScheduledStartAt: iso(2 * DAY), reasonText: 'uno' }).expect(200);
    const moved = await client.post(`/visits/${visit.body.id}/rescheduling`).send({ newScheduledStartAt: iso(3 * DAY), reasonText: 'dos' }).expect(200);
    const call = await insertActivity(context.prisma, { customerId, ownerId: user.id, scheduledAt: new Date(Date.now() + 1.5 * DAY), subject: 'Llamada agenda' });
    const overdueTask = await insertActivity(context.prisma, { customerId, ownerId: user.id, typeCode: 'TAREA', dueAt: new Date(Date.now() - HOUR), subject: 'Tarea vencida' });
    // Sin `scheduled_at` ni `due_at` no está en la agenda (RN-04.36).
    await insertActivity(context.prisma, { customerId, ownerId: user.id, subject: 'Sin fecha' });

    const from = encodeURIComponent(iso(-DAY));
    const to = encodeURIComponent(iso(5 * DAY));
    const list = await client.get(`/agenda?customerId=${customerId}&from=${from}&to=${to}`).expect(200);
    expect(idsOf(list.body.data)).toEqual([overdueTask, call, visit.body.id]);
    expect(list.body.pagination).toMatchObject({ totalItems: 3 });
    expect(list.body.data[2]).toMatchObject({
      kind: 'VISIT',
      code: moved.body.code,
      date: moved.body.scheduledStartAt,
      typeLabel: 'Visita',
      typeId: null,
      subject: 'Visita agenda',
      status: { code: 'REPROGRAMADA', group: 'PENDING' },
      isRescheduled: true,
      isUnregistered: false,
      detailPath: `/actividad/visitas/${visit.body.id}`,
      owner: { id: user.id },
      customer: { id: customerId },
    });
    expect(list.body.data[0]).toMatchObject({ kind: 'ACTIVITY', typeLabel: 'Tarea', status: { group: 'OVERDUE' }, detailPath: `/actividad/actividades/${overdueTask}` });

    const visitsOnly = await client.get(`/agenda?customerId=${customerId}&kind=VISIT`).expect(200);
    expect(idsOf(visitsOnly.body.data)).toEqual([visit.body.id]);
    const callsOnly = await client.get(`/agenda?customerId=${customerId}&activityTypeId=${ids['call']}`).expect(200);
    expect(idsOf(callsOnly.body.data)).toEqual([call]);
    const overdue = await client.get(`/agenda?customerId=${customerId}&statusGroup=OVERDUE`).expect(200);
    expect(idsOf(overdue.body.data)).toEqual([overdueTask]);
    const byOwnerAndCountry = await client.get(`/agenda?customerId=${customerId}&ownerId=${user.id}&countryId=${r4}&kind=ACTIVITY`).expect(200);
    expect(idsOf(byOwnerAndCountry.body.data)).toEqual([overdueTask, call]);
    const sortedByKind = await client.get(`/agenda?customerId=${customerId}&sortBy=kind&sortOrder=desc`).expect(200);
    expect(sortedByKind.body.data[0].kind).toBe('VISIT');

    const calendar = await client.get(`/agenda/calendar?customerId=${customerId}&from=${from}&to=${to}`).expect(200);
    expect(calendar.body).toMatchObject({ truncated: false });
    expect(idsOf(calendar.body.data)).toEqual([overdueTask, call, visit.body.id]);

    // AC-04.6: cancelada sigue en la agenda (distinguible) y se excluye por estado.
    await client.post(`/visits/${visit.body.id}/cancellation`).send({ reasonId: ids['cancelReason'] }).expect(200);
    const afterCancel = await client.get(`/agenda?customerId=${customerId}&kind=VISIT`).expect(200);
    expect(afterCancel.body.data[0]).toMatchObject({ status: { code: 'CANCELADA', group: 'CANCELLED' } });
    const withoutCancelled = await client.get(`/agenda?customerId=${customerId}&statusGroup=PENDING&statusGroup=OVERDUE`).expect(200);
    expect(idsOf(withoutCancelled.body.data)).toEqual([overdueTask, call]);
  });

  it('agenda, historial, seguimiento y adjuntos no buscan por texto: `search` no se anuncia y responde 400', async () => {
    const { user } = await ownerWithCustomer();
    const client = api(context, user.token);
    for (const path of ['/agenda', '/agenda/calendar', '/interactions', '/follow-ups', `/activities/${randomUUID()}/attachments`]) {
      const response = await client.get(`${path}${path.includes('?') ? '&' : '?'}search=x`).expect(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED', details: expect.arrayContaining([expect.objectContaining({ field: 'search' })]) });
    }
  });

  it('PF-04.38: calendario de 60 días → 400 RANGE_TOO_WIDE; sin rango → 400; más de 500 eventos → truncated', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const wide = await client.get(`/agenda/calendar?from=${encodeURIComponent(iso(0))}&to=${encodeURIComponent(iso(60 * DAY))}`).expect(400);
    expect(wide.body).toMatchObject({ code: 'RANGE_TOO_WIDE', details: [{ field: 'to', maxDays: 42 }] });
    await client.get('/agenda/calendar').expect(400);

    const base = Date.now() + DAY;
    const suffix = uniqueSuffix();
    await context.prisma.activity.createMany({
      data: Array.from({ length: 501 }, (_, index) => ({
        code: `TEST-ACT-${suffix}-${index}`,
        typeId: ids['call']!,
        subject: `Masiva ${index}`,
        customerId,
        ownerId: user.id,
        statusId: ids['pending']!,
        priorityId: ids['medium']!,
        scheduledAt: new Date(base + index * 60_000),
      })),
    });
    const capped = await client.get(`/agenda/calendar?customerId=${customerId}&from=${encodeURIComponent(iso(0))}&to=${encodeURIComponent(iso(2 * DAY))}`).expect(200);
    expect(capped.body.truncated).toBe(true);
    expect(capped.body.data).toHaveLength(500);
    expect(capped.body.data[0].subject).toBe('Masiva 0');
  });

  it('PF-04.39: con solo actividades.ver no hay visitas; con solo visitas.ver no hay actividades', async () => {
    const { user, customerId } = await ownerWithCustomer({ deny: ['visitas.ver'] });
    await insertVisit(context.prisma, { customerId, ownerId: user.id });
    const activity = await insertActivity(context.prisma, { customerId, ownerId: user.id, dueAt: new Date(Date.now() + DAY) });
    const onlyActivities = await api(context, user.token).get(`/agenda?customerId=${customerId}`).expect(200);
    expect(idsOf(onlyActivities.body.data)).toEqual([activity]);

    const visitsOnlyUser = await crmUser(context, { roleCodes: ['asesor'], countryId: r4, deny: ['actividades.ver'] });
    const other = await insertCustomer(context.prisma, { salesOwnerId: visitsOnlyUser.id, countryId: r4 });
    const ownVisit = await insertVisit(context.prisma, { customerId: other.id, ownerId: visitsOnlyUser.id });
    await insertActivity(context.prisma, { customerId: other.id, ownerId: visitsOnlyUser.id, dueAt: new Date(Date.now() + DAY) });
    const onlyVisits = await api(context, visitsOnlyUser.token).get(`/agenda?customerId=${other.id}`).expect(200);
    expect(idsOf(onlyVisits.body.data)).toEqual([ownVisit]);
  });
});

// ---------------------------------------------------------------------------
// PF-04.40 · Historial de interacciones
// ---------------------------------------------------------------------------

describe('GET /interactions (PF-04.40, AC-04.15–AC-04.18)', () => {
  it('solo realizadas/confirmadas y completadas de tipos interacción; una reprogramada una vez; corregir cambia la misma entrada', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const visit = await client.post('/visits').send({ customerId, scheduledStartAt: iso(DAY), objective: 'Visita historial' }).expect(201);
    await client.post(`/visits/${visit.body.id}/rescheduling`).send({ newScheduledStartAt: iso(2 * DAY), reasonText: 'cambio' }).expect(200);
    // Aún pendiente: no es interacción.
    expect((await client.get(`/interactions?customerId=${customerId}`).expect(200)).body.data).toEqual([]);
    await client.post(`/visits/${visit.body.id}/completion`).send({ actualStartAt: iso(-HOUR), resultSummary: 'Primera versión', resultId: ids['positive'] }).expect(200);

    const call = await client
      .post('/activities')
      .send({ typeId: ids['call'], subject: 'Llamada hecha', customerId, summary: 'Resumen llamada', completion: { resultNotes: 'ok', completedAt: iso(-2 * HOUR) } })
      .expect(201);
    // Una tarea completada no es interacción (isInteraction = false, D-04.8).
    await client.post('/activities').send({ typeId: ids['task'], subject: 'Tarea hecha', customerId, completion: { resultNotes: 'ok' } }).expect(201);
    await insertActivity(context.prisma, { customerId, ownerId: user.id, subject: 'Abierta' });

    const history = await client.get(`/interactions?customerId=${customerId}`).expect(200);
    expect(history.body.data.map((row: { sourceId: string }) => row.sourceId)).toEqual([visit.body.id, call.body.id]);
    expect(history.body.data[0]).toMatchObject({
      sourceType: 'VISIT',
      sourceCode: visit.body.code,
      typeLabel: 'Visita',
      user: { id: user.id },
      customer: { id: customerId },
      subject: 'Visita historial',
      summary: 'Primera versión',
      result: { id: ids['positive'], code: 'POSITIVO' },
      sourcePath: `/actividad/visitas/${visit.body.id}`,
    });
    expect(history.body.data[1]).toMatchObject({ sourceType: 'ACTIVITY', typeLabel: 'Llamada', summary: 'Resumen llamada', sourcePath: `/actividad/actividades/${call.body.id}` });

    const reversed = await client.get(`/interactions?customerId=${customerId}&sortOrder=asc`).expect(200);
    expect(reversed.body.data.map((row: { sourceId: string }) => row.sourceId)).toEqual([call.body.id, visit.body.id]);
    const onlyVisits = await client.get(`/interactions?customerId=${customerId}&sourceType=VISIT&resultId=${ids['positive']}&userId=${user.id}`).expect(200);
    expect(onlyVisits.body.data.map((row: { sourceId: string }) => row.sourceId)).toEqual([visit.body.id]);
    const byType = await client.get(`/interactions?customerId=${customerId}&typeId=${ids['call']}`).expect(200);
    expect(byType.body.data.map((row: { sourceId: string }) => row.sourceId)).toEqual([call.body.id]);

    // Corregir la realización cambia la misma entrada (sin duplicar).
    await client.put(`/visits/${visit.body.id}/completion`).send({ actualStartAt: iso(-HOUR), resultSummary: 'Segunda versión' }).expect(200);
    const after = await client.get(`/interactions?customerId=${customerId}&sourceType=VISIT`).expect(200);
    expect(after.body.data).toHaveLength(1);
    expect(after.body.data[0].summary).toBe('Segunda versión');

  });

  it('el historial no lista lo que el usuario no ve', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const stranger = await crmUser(context, { roleCodes: ['asesor'], countryId: r4 });
    await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'REALIZADA', scheduledStartAt: new Date(Date.now() - DAY), actualStartAt: new Date(Date.now() - DAY), resultSummary: 'ok' });
    expect((await api(context, user.token).get(`/interactions?customerId=${customerId}`).expect(200)).body.data).toHaveLength(1);
    expect((await api(context, stranger.token).get(`/interactions?customerId=${customerId}`).expect(200)).body.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PF-04.41–PF-04.42 · Seguimiento comercial
// ---------------------------------------------------------------------------

describe('GET /follow-ups y /follow-ups/trace (PF-04.41, PF-04.42, AC-04.11–AC-04.14)', () => {
  it('PF-04.41: por cliente y por proyecto; tras registrar realizada con próxima acción la fila cambia (sin tabla de seguimiento)', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const projectId = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: r4 });
    const call = await client
      .post('/activities')
      .send({ typeId: ids['call'], subject: 'Llamada previa', customerId, summary: 'Primer contacto', nextAction: 'Llamar de nuevo', completion: { resultNotes: 'ok', completedAt: iso(-3 * DAY) } })
      .expect(201);

    const before = await client.get(`/follow-ups?customerId=${customerId}`).expect(200);
    expect(before.body.data).toEqual([
      {
        customer: { id: customerId, crmCode: expect.any(String), legalName: expect.any(String) },
        project: null,
        lastInteraction: { sourceType: 'ACTIVITY', sourceId: call.body.id, sourceCode: call.body.code, occurredAt: expect.any(String), typeLabel: 'Llamada', summary: 'Primer contacto' },
        // Sin fecha: la próxima acción es la de la última interacción (D-04.9).
        nextAction: 'Llamar de nuevo',
        nextActionDate: null,
        nextActionSource: { sourceType: 'ACTIVITY', sourceId: call.body.id, sourceCode: call.body.code },
        responsible: { id: user.id, displayName: 'Persona De prueba' },
        notes: 'Primer contacto',
        attachmentCount: 0,
      },
    ]);
    // Por proyecto: la llamada no tiene proyecto, así que no hay fila.
    expect((await client.get(`/follow-ups?groupBy=PROJECT&customerId=${customerId}`).expect(200)).body.data).toEqual([]);

    const visit = await client.post('/visits').send({ customerId, projectId, scheduledStartAt: iso(-2 * HOUR), objective: 'Visita de seguimiento' }).expect(201);
    await client
      .post(`/visits/${visit.body.id}/completion`)
      .send({ actualStartAt: iso(-HOUR), resultSummary: 'Pidió cotización', nextAction: 'Enviar cotización', nextActionDate: '2099-01-10' })
      .expect(200);

    const byCustomer = await client.get(`/follow-ups?customerId=${customerId}`).expect(200);
    expect(byCustomer.body.data[0]).toMatchObject({
      lastInteraction: { sourceType: 'VISIT', sourceId: visit.body.id, typeLabel: 'Visita' },
      nextAction: 'Enviar cotización',
      nextActionDate: '2099-01-10',
      nextActionSource: { sourceType: 'VISIT', sourceId: visit.body.id },
      notes: 'Pidió cotización',
    });
    const byProject = await client.get(`/follow-ups?groupBy=PROJECT&customerId=${customerId}`).expect(200);
    expect(byProject.body.data).toHaveLength(1);
    expect(byProject.body.data[0]).toMatchObject({ project: { id: projectId }, lastInteraction: { sourceId: visit.body.id }, nextActionDate: '2099-01-10' });

    expect((await client.get(`/follow-ups?customerId=${customerId}&withoutNextAction=true`).expect(200)).body.data).toEqual([]);
    expect((await client.get(`/follow-ups?customerId=${customerId}&ownerId=${user.id}`).expect(200)).body.data).toHaveLength(1);
    expect(await context.prisma.visit.count({ where: { customerId } })).toBe(1);
  });

  it('PF-04.42: la trazabilidad devuelve interacciones, próximos y adjuntos con su ruta; sin registros visibles → 404', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const done = await client.post('/visits').send({ customerId, scheduledStartAt: iso(-3 * HOUR), objective: 'Hecha' }).expect(201);
    await client.post(`/visits/${done.body.id}/completion`).send({ actualStartAt: iso(-2 * HOUR), resultSummary: 'ok' }).expect(200);
    const upcoming = await client.post('/visits').send({ customerId, scheduledStartAt: iso(DAY), objective: 'Próxima' }).expect(201);
    const openTask = await insertActivity(context.prisma, { customerId, ownerId: user.id, typeCode: 'TAREA', dueAt: new Date(Date.now() + 2 * DAY) });
    const uploaded = await client.post(`/visits/${done.body.id}/attachments`).attach('file', PDF_BYTES, 'acta.pdf').expect(201);

    const trace = await client.get(`/follow-ups/trace?customerId=${customerId}`).expect(200);
    expect(trace.body.row).toMatchObject({ customer: { id: customerId }, lastInteraction: { sourceId: done.body.id }, attachmentCount: 1 });
    expect(trace.body.interactions.map((row: { sourceId: string }) => row.sourceId)).toEqual([done.body.id]);
    expect(trace.body.upcoming.map((row: { id: string }) => row.id)).toEqual([upcoming.body.id, openTask]);
    expect(trace.body.attachments).toEqual([
      expect.objectContaining({
        id: uploaded.body.id,
        fileName: 'acta.pdf',
        ownerType: 'VISIT',
        sourceId: done.body.id,
        sourceCode: done.body.code,
        eventId: null,
        contentPath: `/visits/${done.body.id}/attachments/${uploaded.body.id}/content`,
        sourcePath: `/actividad/visitas/${done.body.id}`,
      }),
    ]);
    // `contentPath` es relativa a la base de la API, como el resto del contrato: se descarga tal cual con el cliente.
    const content = await client.get(trace.body.attachments[0].contentPath).expect(200);
    expect(content.headers['content-disposition']).toContain('attachment');

    await client.get(`/follow-ups/trace?customerId=${customerId}&projectId=${customerId}`).expect(400);
    await client.get('/follow-ups/trace').expect(400);
    const stranger = await crmUser(context, { roleCodes: ['asesor'], countryId: r4 });
    await api(context, stranger.token).get(`/follow-ups/trace?customerId=${customerId}`).expect(404);
  });
});
