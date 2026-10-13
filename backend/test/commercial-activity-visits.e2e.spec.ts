import type { PrismaClient } from '@prisma/client';
import type request from 'supertest';

import {
  api,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertContact,
  insertCustomer,
  insertProject,
  insertTeam,
  insertVisit,
  testCountry,
  withParameter,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 4 · Visitas (04 F.1, PF-04.8–PF-04.25 y PF-04.63–PF-04.66): planificar con
 * conflictos, editar, registrar y corregir la realización, confirmar (solo el dueño,
 * DM-20), reprogramar, cancelar e historial de eventos, con auditoría y
 * `projects.last_activity_at`. País propio `V1`.
 */

let context: TestContext;
let v1: string;
const ids: Record<string, string> = {};

const HOUR = 3_600_000;
const VIS_CODE = /^VIS-\d{4}-\d{5}$/;
const REQUIRED_FIELDS = 'crm.campos_obligatorios';
const CONFLICT_MODE = 'crm.visitas.validar_conflicto_horario';

beforeAll(async () => {
  context = await createTestContext();
  v1 = await testCountry(context.prisma, 'V1', { name: 'Prueba Visitas' });
  const codes: [string, string, string][] = [
    ['planned', 'crm.estado_visita', 'PROGRAMADA'],
    ['rescheduled', 'crm.estado_visita', 'REPROGRAMADA'],
    ['done', 'crm.estado_visita', 'REALIZADA'],
    ['confirmed', 'crm.estado_visita', 'CONFIRMADA'],
    ['cancelled', 'crm.estado_visita', 'CANCELADA'],
    ['rescheduleReason', 'crm.motivo_reprogramacion', 'SOLICITUD_CLIENTE'],
    ['cancelReason', 'crm.motivo_cancelacion', 'CANCELA_CLIENTE'],
    ['positive', 'crm.resultado_interaccion', 'POSITIVO'],
  ];
  for (const [key, catalog, code] of codes) ids[key] = await catalogItemId(context.prisma, catalog, code);
});

afterAll(async () => {
  await closeTestContext(context);
});

async function asesor(options: { deny?: string[] } = {}): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['asesor'], countryId: v1, deny: options.deny });
}

async function ownerWithCustomer(options: { deny?: string[] } = {}): Promise<{ user: CrmUser; customerId: string }> {
  const user = await asesor(options);
  const customer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: v1 });
  return { user, customerId: customer.id };
}

function at(offsetHours: number): string {
  return new Date(Date.now() + offsetHours * HOUR).toISOString();
}

function plan(client: ReturnType<typeof api>, customerId: string, extra: Record<string, unknown> = {}): request.Test {
  return client.post('/visits').send({ customerId, scheduledStartAt: at(24), objective: 'Presentar catálogo', ...extra });
}

async function plannedVisit(client: ReturnType<typeof api>, customerId: string, extra: Record<string, unknown> = {}): Promise<string> {
  return (await plan(client, customerId, extra).expect(201)).body.id as string;
}

async function doneVisit(client: ReturnType<typeof api>, customerId: string, completion: Record<string, unknown> = {}): Promise<string> {
  const id = await plannedVisit(client, customerId, { scheduledStartAt: at(-3) });
  await client.post(`/visits/${id}/completion`).send({ actualStartAt: at(-3), ...completion }).expect(200);
  return id;
}

async function auditEvents(resourceId: string): Promise<{ event: string; changes: unknown }[]> {
  return context.prisma.auditLog.findMany({ where: { resourceType: 'crm.visit', resourceId }, orderBy: { occurredAt: 'asc' }, select: { event: true, changes: true } });
}

async function eventTypes(visitId: string): Promise<string[]> {
  const events = await context.prisma.visitEvent.findMany({ where: { visitId }, orderBy: { occurredAt: 'asc' }, select: { eventType: true } });
  return events.map((event) => event.eventType);
}

function requiredFieldsWith(extra: string[]): (current: string) => string {
  return (current) => {
    const value = JSON.parse(current) as Record<string, string[]>;
    return JSON.stringify({ ...value, visit: [...(value['visit'] ?? []), ...extra] });
  };
}

// ---------------------------------------------------------------------------
// PF-04.8–PF-04.13 · Planificar
// ---------------------------------------------------------------------------

describe('POST /visits (PF-04.8–PF-04.13, AC-04.24–AC-04.27)', () => {
  it('PF-04.8: 201, Location, folio VIS-, estado inicial, responsable = yo, evento PLANNED y auditoría', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const response = await plan(api(context, user.token), customerId, { location: 'Oficina central', reminderMinutesBefore: 30 }).expect(201);

    expect(response.headers['location']).toBe(`/api/v1/visits/${response.body.id}`);
    expect(response.body).toMatchObject({
      code: expect.stringMatching(VIS_CODE),
      customer: { id: customerId },
      owner: { id: user.id },
      status: { id: ids['planned'], code: 'PROGRAMADA', group: 'PENDING', isRescheduled: false },
      rescheduleCount: 0,
      objective: 'Presentar catálogo',
      location: 'Oficina central',
      completion: null,
      confirmation: null,
      access: 'DIRECT',
      allowedActions: ['EDIT', 'COMPLETE', 'RESCHEDULE', 'CANCEL'],
      scheduleConflicts: [],
      isUnregistered: false,
    });
    expect(response.body.originalScheduledAt).toBe(response.body.scheduledStartAt);
    // Sin fin: el fin efectivo es inicio + `crm.visitas.duracion_por_defecto_minutos` (60).
    expect(new Date(response.body.effectiveEndAt).getTime() - new Date(response.body.scheduledStartAt).getTime()).toBe(HOUR);
    // PF-04.12: el recordatorio se guarda y se calcula; no se crea ninguna notificación (DM-27).
    expect(new Date(response.body.scheduledStartAt).getTime() - new Date(response.body.reminderAt).getTime()).toBe(30 * 60_000);
    expect(await context.prisma.notification.count({ where: { userId: user.id } })).toBe(0);

    expect(await eventTypes(response.body.id)).toEqual(['PLANNED']);
    const audit = await auditEvents(response.body.id);
    expect(audit.map((row) => row.event)).toEqual(['crm.visit.created']);
    expect(audit[0]?.changes).toMatchObject({ objective: { before: null, after: 'P***' }, location: { before: null, after: 'O***' } });
  });

  it('PF-04.9: sin objetivo → 400; con crm.campos_obligatorios.visit ampliado → 422 REQUIRED_FIELD_MISSING', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    await client.post('/visits').send({ customerId, scheduledStartAt: at(24) }).expect(400);
    const response = await withParameter(context.prisma, REQUIRED_FIELDS, requiredFieldsWith(['location']), () => plan(client, customerId));
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'REQUIRED_FIELD_MISSING', details: [{ field: 'location', code: 'REQUIRED_FIELD_MISSING' }] });
    expect(await context.prisma.visit.count({ where: { customerId } })).toBe(0);
  });

  it('PF-04.10: proyecto de otro cliente, contacto de otro cliente o inactivo → 422; fin < inicio → 422', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const other = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: v1 });
    const client = api(context, user.token);
    const projectOfOther = await insertProject(context.prisma, { customerId: other.id, ownerId: user.id, countryId: v1 });
    expect((await plan(client, customerId, { projectId: projectOfOther }).expect(422)).body.code).toBe('PROJECT_CUSTOMER_MISMATCH');
    const contactOfOther = await insertContact(context.prisma, { customerId: other.id });
    expect((await plan(client, customerId, { participants: [{ contactId: contactOfOther }] }).expect(422)).body.code).toBe('INVALID_CONTACT');
    const inactive = await insertContact(context.prisma, { customerId, isActive: false });
    expect((await plan(client, customerId, { participants: [{ contactId: inactive }] }).expect(422)).body.code).toBe('CONTACT_INACTIVE');
    const range = await plan(client, customerId, { scheduledStartAt: at(24), scheduledEndAt: at(23) }).expect(422);
    expect(range.body).toMatchObject({ code: 'INVALID_DATE_RANGE', details: [{ field: 'scheduledEndAt' }] });
    await plan(client, customerId, { participants: [{ externalName: 'Ana' }, { externalName: 'ana' }] }).expect(400);
    expect(await context.prisma.visit.count({ where: { customerId } })).toBe(0);
  });

  it('PF-04.11: AVISAR guarda y avisa; NO no evalúa; BLOQUEAR → 409 sin escribir; una cancelada no cuenta', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const start = at(72);
    const first = await plannedVisit(client, customerId, { scheduledStartAt: start });
    const firstCode = (await context.prisma.visit.findUniqueOrThrow({ where: { id: first } })).code;

    const warned = await plan(client, customerId, { scheduledStartAt: new Date(new Date(start).getTime() + 30 * 60_000).toISOString() }).expect(201);
    expect(warned.body.scheduleConflicts).toEqual([
      { visitId: first, code: firstCode, scheduledStartAt: start, effectiveEndAt: new Date(new Date(start).getTime() + HOUR).toISOString(), customerName: expect.any(String), isVisible: true },
    ]);

    const silent = await withParameter(context.prisma, CONFLICT_MODE, 'NO', () => plan(client, customerId, { scheduledStartAt: start }));
    expect(silent.status).toBe(201);
    expect(silent.body.scheduleConflicts).toEqual([]);

    const before = await context.prisma.visit.count({ where: { ownerId: user.id } });
    const blocked = await withParameter(context.prisma, CONFLICT_MODE, 'BLOQUEAR', () => plan(client, customerId, { scheduledStartAt: start }));
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: 'SCHEDULE_CONFLICT', details: expect.arrayContaining([expect.objectContaining({ visitId: first })]) });
    expect(await context.prisma.visit.count({ where: { ownerId: user.id } })).toBe(before);

    // Contigua (empieza cuando termina la otra) y solape solo con canceladas: sin conflicto.
    const contiguous = await plan(client, customerId, { scheduledStartAt: at(200), scheduledEndAt: at(201) }).expect(201);
    expect(contiguous.body.scheduleConflicts).toEqual([]);
    const next = await plan(client, customerId, { scheduledStartAt: at(201) }).expect(201);
    expect(next.body.scheduleConflicts).toEqual([]);
    await client.post(`/visits/${next.body.id}/cancellation`).send({ reasonText: 'No va' }).expect(200);
    expect((await plan(client, customerId, { scheduledStartAt: at(201) }).expect(201)).body.scheduleConflicts).toEqual([]);
  });

  it('GET /visits/schedule-conflicts: avisa antes de guardar y con NO devuelve lista vacía', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const start = at(90);
    const existing = await plannedVisit(client, customerId, { scheduledStartAt: start });
    const check = await client.get(`/visits/schedule-conflicts?start=${encodeURIComponent(start)}`).expect(200);
    expect(check.body).toMatchObject({ mode: 'AVISAR', conflicts: [{ visitId: existing, isVisible: true }] });
    const excluded = await client.get(`/visits/schedule-conflicts?start=${encodeURIComponent(start)}&excludeVisitId=${existing}`).expect(200);
    expect(excluded.body.conflicts).toEqual([]);
    const off = await withParameter(context.prisma, CONFLICT_MODE, 'NO', () => client.get(`/visits/schedule-conflicts?start=${encodeURIComponent(start)}`));
    expect(off.body).toEqual({ mode: 'NO', conflicts: [] });
    await client.get('/visits/schedule-conflicts').expect(400);
  });

  it('PF-04.13: un asesor no asigna a otro (403); un manager asigna a su equipo (201) y no fuera (422 OWNER_NOT_ELIGIBLE)', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const peer = await asesor();
    const denied = await plan(api(context, user.token), customerId, { ownerId: peer.id }).expect(403);
    expect(denied.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'visitas.administrar' }] });

    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: v1 });
    const member = await asesor();
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id] });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: manager.id, countryId: v1 });
    const assigned = await plan(api(context, manager.token), customer.id, { ownerId: member.id }).expect(201);
    expect(assigned.body.owner).toEqual({ id: member.id, displayName: 'Persona De prueba' });
    const outside = await plan(api(context, manager.token), customer.id, { ownerId: peer.id }).expect(422);
    expect(outside.body.code).toBe('OWNER_NOT_ELIGIBLE');
  });
});

// ---------------------------------------------------------------------------
// PF-04.14 · Editar la planificación
// ---------------------------------------------------------------------------

describe('PATCH /visits/:id (PF-04.14, AC-04.22)', () => {
  it('pendiente propia → 200 y auditoría; sin cambios no audita; invitados reemplazados', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const id = await plannedVisit(client, customerId, { participants: [{ externalName: 'Juan Pérez' }] });
    const updated = await client.patch(`/visits/${id}`).send({ objective: 'Revisar planos', location: 'Obra', participants: [{ userId: user.id }] }).expect(200);
    expect(updated.body).toMatchObject({ objective: 'Revisar planos', location: 'Obra' });
    expect(updated.body.participants).toEqual([
      { id: expect.any(String), role: 'INVITED', kind: 'USER', contactId: null, userId: user.id, displayName: 'Persona De prueba' },
    ]);
    await client.patch(`/visits/${id}`).send({ objective: 'Revisar planos' }).expect(200);
    const audit = await auditEvents(id);
    expect(audit.map((row) => row.event)).toEqual(['crm.visit.created', 'crm.visit.updated']);
    expect(audit[1]?.changes).toMatchObject({ invitees: { before: ['external:J***'], after: [`user:${user.id}`] } });
    expect(JSON.stringify(audit)).not.toContain('Juan');
  });

  it('scheduledStartAt → 422 USE_RESCHEDULE; customerId → 400; confirmada → 409 RECORD_READ_ONLY', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const id = await plannedVisit(client, customerId);
    expect((await client.patch(`/visits/${id}`).send({ scheduledStartAt: at(48) }).expect(422)).body.code).toBe('USE_RESCHEDULE');
    await client.patch(`/visits/${id}`).send({ customerId }).expect(400);
    const confirmed = await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'CONFIRMADA', actualStartAt: new Date(), resultSummary: 'ok', confirmedAt: new Date() });
    expect((await client.patch(`/visits/${confirmed}`).send({ objective: 'x' }).expect(409)).body.code).toBe('RECORD_READ_ONLY');
  });

  it('ajena visible sin visitas.administrar → 403; el manager la reasigna dentro de su equipo', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: v1 });
    const { user: member, customerId } = await ownerWithCustomer();
    const other = await asesor();
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id, other.id] });
    const id = await plannedVisit(api(context, member.token), customerId);
    const reassigned = await api(context, manager.token).patch(`/visits/${id}`).send({ ownerId: other.id }).expect(200);
    expect(reassigned.body.owner.id).toBe(other.id);
    // El antiguo dueño (OWN) ya no la ve.
    await api(context, member.token).patch(`/visits/${id}`).send({ objective: 'x' }).expect(404);
  });
});

// ---------------------------------------------------------------------------
// PF-04.15–PF-04.17 · Realización
// ---------------------------------------------------------------------------

describe('POST/PUT /visits/:id/completion (PF-04.15–PF-04.17, AC-04.29–AC-04.32)', () => {
  it('PF-04.15: REALIZADA, quién la registró, asistentes ATTENDED, evento COMPLETED y last_activity_at del proyecto', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const projectId = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: v1 });
    const contactId = await insertContact(context.prisma, { customerId, firstName: 'Ana' });
    const id = await plannedVisit(client, customerId, { projectId, scheduledStartAt: at(-2), participants: [{ contactId }] });
    const before = await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } });

    const response = await client
      .post(`/visits/${id}/completion`)
      .send({
        actualStartAt: at(-2),
        actualEndAt: at(-1),
        attendees: [{ contactId }, { externalName: 'Ingeniero externo' }],
        topics: 'Planos',
        agreements: 'Cotizar',
        resultId: ids['positive'],
        resultSummary: 'Interesado',
        nextAction: 'Enviar cotización',
        nextActionDate: '2030-01-15',
      })
      .expect(200);
    expect(response.body).toMatchObject({
      status: { code: 'REALIZADA', group: 'DONE' },
      completion: {
        topics: 'Planos',
        agreements: 'Cotizar',
        result: { id: ids['positive'], code: 'POSITIVO' },
        resultSummary: 'Interesado',
        nextAction: 'Enviar cotización',
        nextActionDate: '2030-01-15',
        recordedBy: { id: user.id },
      },
      allowedActions: ['CORRECT_COMPLETION', 'CONFIRM'],
    });
    expect(response.body.participants.map((p: { role: string; kind: string }) => `${p.role}:${p.kind}`)).toEqual([
      'INVITED:CONTACT',
      'ATTENDED:CONTACT',
      'ATTENDED:EXTERNAL',
    ]);
    expect(await eventTypes(id)).toEqual(['PLANNED', 'COMPLETED']);
    const after = await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(after.lastActivityAt).not.toBeNull();
    expect(after.lastActivityAt!.getTime()).toBeGreaterThan(before.lastActivityAt?.getTime() ?? 0);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('PF-04.16: fecha real futura → 422; sobre una cancelada → 409', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const id = await plannedVisit(client, customerId);
    expect((await client.post(`/visits/${id}/completion`).send({ actualStartAt: at(2) }).expect(422)).body.code).toBe('ACTUAL_DATE_IN_FUTURE');
    await client.post(`/visits/${id}/cancellation`).send({ reasonId: ids['cancelReason'] }).expect(200);
    expect((await client.post(`/visits/${id}/completion`).send({ actualStartAt: at(-1) }).expect(409)).body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('PF-04.17: PUT corrige sin segundo evento y audita; tras confirmar → 409', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const id = await doneVisit(client, customerId, { resultSummary: 'Bien' });
    const corrected = await client.put(`/visits/${id}/completion`).send({ actualStartAt: at(-3), resultSummary: 'Muy bien', comments: 'Nota' }).expect(200);
    expect(corrected.body.completion).toMatchObject({ resultSummary: 'Muy bien', comments: 'Nota', recordedBy: { id: user.id } });
    expect(await eventTypes(id)).toEqual(['PLANNED', 'COMPLETED']);
    expect((await auditEvents(id)).map((row) => row.event)).toEqual(['crm.visit.created', 'crm.visit.completed', 'crm.visit.completion_corrected']);
    await client.post(`/visits/${id}/confirmation`).send({}).expect(200);
    expect((await client.put(`/visits/${id}/completion`).send({ actualStartAt: at(-3) }).expect(409)).body.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

// ---------------------------------------------------------------------------
// PF-04.18–PF-04.20, PF-04.63–PF-04.66 · Confirmar
// ---------------------------------------------------------------------------

describe('POST /visits/:id/confirmation (PF-04.18–20, PF-04.63–66, AC-04.33–36, AC-04.61–63)', () => {
  it('PF-04.18/PF-04.63: el dueño confirma con resumen → CONFIRMADA, confirmedBy = él, evento CONFIRMED, solo lectura', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const id = await doneVisit(client, customerId);
    const response = await client.post(`/visits/${id}/confirmation`).send({ confirmationSummary: 'Confirmada con el cliente' }).expect(200);
    expect(response.body).toMatchObject({
      status: { code: 'CONFIRMADA', group: 'CONFIRMED' },
      confirmation: { confirmedBy: { id: user.id }, summary: 'Confirmada con el cliente' },
      allowedActions: [],
    });
    expect(await eventTypes(id)).toEqual(['PLANNED', 'COMPLETED', 'CONFIRMED']);
    // AC-04.36: deja de contar como "realizada pendiente de confirmación".
    const pendingConfirmation = await client.get(`/visits?customerId=${customerId}&pendingConfirmation=true`).expect(200);
    expect(pendingConfirmation.body.data).toEqual([]);
  });

  it('PF-04.18: sin resumen pero con comentarios previos → 200; PF-04.19: sin nada → 422, pendiente → 409, sin visitas.cerrar → 403', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const withComments = await doneVisit(client, customerId, { comments: 'Fue bien' });
    await client.post(`/visits/${withComments}/confirmation`).send({}).expect(200);

    const bare = await doneVisit(client, customerId);
    const missing = await client.post(`/visits/${bare}/confirmation`).send({}).expect(422);
    expect(missing.body).toMatchObject({ code: 'CONFIRMATION_SUMMARY_REQUIRED', details: [{ field: 'confirmationSummary' }] });

    const pending = await plannedVisit(client, customerId);
    expect((await client.post(`/visits/${pending}/confirmation`).send({ confirmationSummary: 'x' }).expect(409)).body.code).toBe('INVALID_STATUS_TRANSITION');

    const noClose = await ownerWithCustomer({ deny: ['visitas.cerrar'] });
    const ownDone = await insertVisit(context.prisma, {
      customerId: noClose.customerId,
      ownerId: noClose.user.id,
      statusCode: 'REALIZADA',
      actualStartAt: new Date(Date.now() - HOUR),
      resultSummary: 'ok',
    });
    const forbidden = await api(context, noClose.user.token).post(`/visits/${ownDone}/confirmation`).send({}).expect(403);
    expect(forbidden.body.code).toBe('PERMISSION_DENIED');
    const detail = await api(context, noClose.user.token).get(`/visits/${ownDone}`).expect(200);
    expect(detail.body.allowedActions).toEqual(['CORRECT_COMPLETION']);
  });

  it('PF-04.63/AC-04.61: un manager dueño de su propia visita la confirma', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: v1 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: manager.id, countryId: v1 });
    const client = api(context, manager.token);
    const id = await doneVisit(client, customer.id, { resultSummary: 'ok' });
    const response = await client.post(`/visits/${id}/confirmation`).send({}).expect(200);
    expect(response.body.confirmation.confirmedBy.id).toBe(manager.id);
  });

  it('PF-04.64/AC-04.62: el manager con visitas.administrar no confirma la de su equipo (403 OWNER_ONLY, nada cambia)', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: v1 });
    const { user: member, customerId } = await ownerWithCustomer();
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id] });
    const id = await doneVisit(api(context, member.token), customerId, { resultSummary: 'ok' });
    const detail = await api(context, manager.token).get(`/visits/${id}`).expect(200);
    expect(detail.body.allowedActions).toEqual(['CORRECT_COMPLETION']);
    const denied = await api(context, manager.token).post(`/visits/${id}/confirmation`).send({ confirmationSummary: 'x' }).expect(403);
    expect(denied.body.code).toBe('VISIT_CONFIRMATION_OWNER_ONLY');
    expect((await context.prisma.visit.findUniqueOrThrow({ where: { id } })).statusId).toBe(ids['done']);
    expect(await eventTypes(id)).toEqual(['PLANNED', 'COMPLETED']);
  });

  it('PF-04.65/AC-04.63: el administrador tampoco confirma la de otro; PF-04.66: la base lo impide', async () => {
    const admin = await crmUser(context, { roleCodes: ['administrador'], countryId: v1 });
    const { user, customerId } = await ownerWithCustomer();
    const id = await doneVisit(api(context, user.token), customerId, { resultSummary: 'ok' });
    const denied = await api(context, admin.token).post(`/visits/${id}/confirmation`).send({ confirmationSummary: 'x' }).expect(403);
    expect(denied.body.code).toBe('VISIT_CONFIRMATION_OWNER_ONLY');
    expect((await context.prisma.visit.findUniqueOrThrow({ where: { id } })).confirmedAt).toBeNull();

    await expect(
      context.prisma.$executeRaw`UPDATE visits SET status_id = ${ids['confirmed']}::uuid, confirmed_at = now(), confirmed_by_id = ${admin.id}::uuid WHERE id = ${id}::uuid`,
    ).rejects.toThrow(/ck_visits_confirmed_by_owner/);
  });

  it('PF-04.20: confirmar mientras otra transacción confirma → espera y responde 409 (un solo evento)', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const id = await doneVisit(client, customerId, { resultSummary: 'ok' });
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let signalLocked: () => void = () => undefined;
    const locked = new Promise<void>((resolve) => (signalLocked = resolve));
    const holder = context.prisma.$transaction(
      async (tx) => {
        await (tx as unknown as PrismaClient).visit.update({
          where: { id },
          data: { statusId: ids['confirmed'], confirmedAt: new Date(), confirmedById: user.id, confirmationSummary: 'Otra sesión' },
        });
        await (tx as unknown as PrismaClient).visitEvent.create({
          data: { visitId: id, eventType: 'CONFIRMED', fromStatusId: ids['done'], toStatusId: ids['confirmed']!, performedById: user.id },
        });
        signalLocked();
        await released;
      },
      { timeout: 20_000 },
    );
    await locked;

    let settled = false;
    const pending = client
      .post(`/visits/${id}/confirmation`)
      .send({ confirmationSummary: 'Mía' })
      .then((response) => {
        settled = true;
        return response;
      });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(settled).toBe(false);
    release();
    await holder;

    const response = await pending;
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'INVALID_STATUS_TRANSITION', details: [{ reason: 'CONCURRENT_CHANGE' }] });
    expect(await eventTypes(id)).toEqual(['PLANNED', 'COMPLETED', 'CONFIRMED']);
    expect((await context.prisma.visit.findUniqueOrThrow({ where: { id } })).confirmationSummary).toBe('Otra sesión');
  });

  it('PF-04.20: dos confirmaciones simultáneas por la API → una 200 y otra 409, un solo evento', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const id = await doneVisit(client, customerId, { resultSummary: 'ok' });
    const responses = await Promise.all([
      client.post(`/visits/${id}/confirmation`).send({ confirmationSummary: 'Uno' }),
      api(context, user.token).post(`/visits/${id}/confirmation`).send({ confirmationSummary: 'Dos' }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await eventTypes(id)).filter((type) => type === 'CONFIRMED')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// PF-04.21–PF-04.25 · Reprogramar, cancelar e historial
// ---------------------------------------------------------------------------

describe('POST /visits/:id/rescheduling y /cancellation (PF-04.21–PF-04.25, AC-04.37–AC-04.40)', () => {
  it('PF-04.21/PF-04.25: reprogramar dos veces → una fila, rescheduleCount 2, original intacta, eventos con fechas, estados y motivo', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const original = at(24);
    const id = await plannedVisit(client, customerId, { scheduledStartAt: original, scheduledEndAt: at(26) });
    const first = at(48);
    const second = at(72);
    const one = await client.post(`/visits/${id}/rescheduling`).send({ newScheduledStartAt: first, reasonId: ids['rescheduleReason'], comment: 'Pide el cliente' }).expect(200);
    expect(one.body).toMatchObject({ status: { code: 'REPROGRAMADA', group: 'PENDING', isRescheduled: true }, rescheduleCount: 1, scheduledStartAt: first });
    // Sin fin nuevo, conserva la duración planificada (2 h).
    expect(new Date(one.body.scheduledEndAt).getTime() - new Date(first).getTime()).toBe(2 * HOUR);
    const two = await client.post(`/visits/${id}/rescheduling`).send({ newScheduledStartAt: second, reasonText: 'Agenda' }).expect(200);
    expect(two.body).toMatchObject({ rescheduleCount: 2, scheduledStartAt: second, originalScheduledAt: original });
    expect(await context.prisma.visit.count({ where: { customerId } })).toBe(1);

    const events = await client.get(`/visits/${id}/events`).expect(200);
    expect(events.body.map((event: { eventType: string }) => event.eventType)).toEqual(['PLANNED', 'RESCHEDULED', 'RESCHEDULED']);
    expect(events.body[1]).toMatchObject({
      eventType: 'RESCHEDULED',
      fromStatus: { id: ids['planned'], code: 'PROGRAMADA' },
      toStatus: { id: ids['rescheduled'], code: 'REPROGRAMADA' },
      previousScheduledStartAt: original,
      newScheduledStartAt: first,
      reason: { id: ids['rescheduleReason'], code: 'SOLICITUD_CLIENTE' },
      reasonText: null,
      comment: 'Pide el cliente',
      performedBy: { id: user.id },
      attachmentCount: 0,
    });
    expect(events.body[2]).toMatchObject({ fromStatus: { code: 'REPROGRAMADA' }, previousScheduledStartAt: first, newScheduledStartAt: second, reasonText: 'Agenda' });
    expect(new Date(events.body[0].occurredAt).getTime()).toBeLessThanOrEqual(new Date(events.body[2].occurredAt).getTime());
  });

  it('PF-04.22: sin motivo, misma fecha o pasada → 422; una realizada → 409', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const start = at(24);
    const id = await plannedVisit(client, customerId, { scheduledStartAt: start });
    expect((await client.post(`/visits/${id}/rescheduling`).send({ newScheduledStartAt: at(30) }).expect(422)).body.code).toBe('REASON_REQUIRED');
    expect((await client.post(`/visits/${id}/rescheduling`).send({ newScheduledStartAt: start, reasonText: 'x' }).expect(422)).body.code).toBe('RESCHEDULE_SAME_DATE');
    expect((await client.post(`/visits/${id}/rescheduling`).send({ newScheduledStartAt: at(-1), reasonText: 'x' }).expect(422)).body.code).toBe('DATE_IN_PAST');
    const done = await doneVisit(client, customerId);
    expect((await client.post(`/visits/${done}/rescheduling`).send({ newScheduledStartAt: at(30), reasonText: 'x' }).expect(409)).body.code).toBe(
      'INVALID_STATUS_TRANSITION',
    );
    expect(await eventTypes(id)).toEqual(['PLANNED']);
  });

  it('PF-04.23: cancelar con motivo → CANCELADA y la visita sigue consultable; DELETE no existe (404)', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const id = await plannedVisit(client, customerId);
    const cancelled = await client.post(`/visits/${id}/cancellation`).send({ reasonId: ids['cancelReason'], comment: 'Pospone' }).expect(200);
    expect(cancelled.body).toMatchObject({ status: { code: 'CANCELADA', group: 'CANCELLED' }, allowedActions: [] });
    expect(cancelled.body.cancelledAt).toEqual(expect.any(String));
    await client.get(`/visits/${id}`).expect(200);
    const events = await client.get(`/visits/${id}/events`).expect(200);
    expect(events.body[1]).toMatchObject({ eventType: 'CANCELLED', fromStatus: { code: 'PROGRAMADA' }, toStatus: { code: 'CANCELADA' }, reason: { code: 'CANCELA_CLIENTE' }, comment: 'Pospone' });
    await client.delete(`/visits/${id}`).expect(404);
    expect(await context.prisma.visit.count({ where: { id } })).toBe(1);
  });

  it('PF-04.24: cancelar una confirmada → 409; motivo del catálogo de reprogramación → 422 INVALID_CATALOG_VALUE', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const confirmed = await insertVisit(context.prisma, { customerId, ownerId: user.id, statusCode: 'CONFIRMADA', actualStartAt: new Date(), resultSummary: 'ok', confirmedAt: new Date() });
    expect((await client.post(`/visits/${confirmed}/cancellation`).send({ reasonText: 'x' }).expect(409)).body.code).toBe('INVALID_STATUS_TRANSITION');
    const id = await plannedVisit(client, customerId);
    const wrong = await client.post(`/visits/${id}/cancellation`).send({ reasonId: ids['rescheduleReason'] }).expect(422);
    expect(wrong.body).toMatchObject({ code: 'INVALID_CATALOG_VALUE', details: [expect.objectContaining({ field: 'reasonId' })] });
    expect(await eventTypes(id)).toEqual(['PLANNED']);
  });
});

// ---------------------------------------------------------------------------
// Listado y opciones
// ---------------------------------------------------------------------------

describe('GET /visits y /visits/form-options (AC-04.19, D-04.10)', () => {
  it('filtros: sin registrar, pendientes de confirmar, grupo de estado, búsqueda y orden', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const past = await insertVisit(context.prisma, { customerId, ownerId: user.id, scheduledStartAt: new Date(Date.now() - 2 * HOUR), objective: 'Visita atrasada' });
    const future = await insertVisit(context.prisma, { customerId, ownerId: user.id, objective: 'Visita de obra', reminderMinutesBefore: 15 });
    const done = await insertVisit(context.prisma, {
      customerId,
      ownerId: user.id,
      statusCode: 'REALIZADA',
      scheduledStartAt: new Date(Date.now() - 3 * HOUR),
      actualStartAt: new Date(Date.now() - HOUR),
      resultSummary: 'ok',
    });

    const unregistered = await client.get(`/visits?customerId=${customerId}&unregistered=true`).expect(200);
    expect(unregistered.body.data.map((row: { id: string }) => row.id)).toEqual([past]);
    expect(unregistered.body.data[0]).toMatchObject({ isUnregistered: true, status: { group: 'PENDING' } });
    const toConfirm = await client.get(`/visits?customerId=${customerId}&pendingConfirmation=true`).expect(200);
    expect(toConfirm.body.data.map((row: { id: string }) => row.id)).toEqual([done]);
    const pendingGroup = await client.get(`/visits?customerId=${customerId}&statusGroup=PENDING`).expect(200);
    expect(pendingGroup.body.data.map((row: { id: string }) => row.id)).toEqual([past, future]);
    const search = await client.get(`/visits?customerId=${customerId}&search=obra`).expect(200);
    expect(search.body.data).toEqual([expect.objectContaining({ id: future, hasReminder: true, rescheduleCount: 0, attachmentCount: 0 })]);
    const sorted = await client.get(`/visits?customerId=${customerId}&sortBy=scheduledStartAt&sortOrder=desc`).expect(200);
    expect(sorted.body.pagination).toMatchObject({ totalItems: 3 });
    expect(sorted.body.data[0].id).toBe(future);
    await client.get('/visits?sortBy=objective').expect(400);
  });

  it('form-options: catálogos activos con semántica, modo de conflicto y obligatorios', async () => {
    const { user } = await ownerWithCustomer();
    const response = await api(context, user.token).get('/visits/form-options').expect(200);
    expect(response.body.statuses.map((status: { code: string }) => status.code)).toEqual(
      expect.arrayContaining(['PROGRAMADA', 'REPROGRAMADA', 'REALIZADA', 'CONFIRMADA', 'CANCELADA']),
    );
    expect(response.body.statuses.find((status: { code: string }) => status.code === 'REPROGRAMADA')).toMatchObject({ group: 'PENDING', isRescheduled: true });
    expect(response.body.rescheduleReasons.map((reason: { code: string }) => reason.code)).toEqual(expect.arrayContaining(['SOLICITUD_CLIENTE']));
    expect(response.body.cancellationReasons.map((reason: { code: string }) => reason.code)).toEqual(expect.arrayContaining(['CANCELA_CLIENTE']));
    expect(response.body).toMatchObject({ conflictMode: 'AVISAR', defaultDurationMinutes: 60, completionRequiredFields: ['actualStartAt'] });
    expect(response.body.requiredFields).toEqual(expect.arrayContaining(['customerId', 'scheduledStartAt', 'ownerId', 'objective']));
  });
});
