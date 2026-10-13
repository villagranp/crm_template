import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type request from 'supertest';

import {
  api,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertActivity,
  insertContact,
  insertCustomer,
  insertOpportunity,
  insertParticipant,
  insertProject,
  insertTeam,
  testCountry,
  withParameter,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 4 · Actividades (04 F.2, PF-04.26–PF-04.36) y la parte de seguridad de §J
 * que aplica a actividades (PF-04.43 visibilidad, PF-04.45 401/403, PF-04.46
 * auditoría), más `owner-options` (`@RequireAnyPermission`, addendum ADR-008).
 *
 * País propio `M4`; las comprobaciones de listas filtran por un cliente propio de
 * cada prueba (las suites corren en paralelo sobre el mismo esquema).
 */

let context: TestContext;
let m4: string;
let m5: string;
let readerRoleCode: string;
const ids: Record<string, string> = {};

const HOUR = 3_600_000;
const ACT_CODE = /^ACT-\d{4}-\d{6}$/;

beforeAll(async () => {
  context = await createTestContext();
  m4 = await testCountry(context.prisma, 'M4', { name: 'Prueba Actividades' });
  m5 = await testCountry(context.prisma, 'M5', { name: 'Prueba Actividades Dos' });
  const codes: [string, string, string][] = [
    ['call', 'crm.tipo_actividad', 'LLAMADA'],
    ['meeting', 'crm.tipo_actividad', 'REUNION'],
    ['email', 'crm.tipo_actividad', 'CORREO'],
    ['task', 'crm.tipo_actividad', 'TAREA'],
    ['pending', 'crm.estado_actividad', 'PENDIENTE'],
    ['inProgress', 'crm.estado_actividad', 'EN_PROCESO'],
    ['completed', 'crm.estado_actividad', 'COMPLETADA'],
    ['cancelled', 'crm.estado_actividad', 'CANCELADA'],
    ['high', 'crm.prioridad', 'ALTA'],
    ['medium', 'crm.prioridad', 'MEDIA'],
    ['low', 'crm.prioridad', 'BAJA'],
    ['positive', 'crm.resultado_interaccion', 'POSITIVO'],
    ['cancelReason', 'crm.motivo_cancelacion', 'OTRO'],
  ];
  for (const [key, catalog, code] of codes) ids[key] = await catalogItemId(context.prisma, catalog, code);

  // Rol de solo lectura de actividades con alcance ORGANIZATION (roles combinados).
  readerRoleCode = `lector-act-${randomUUID().slice(0, 8)}`;
  const permissions = await context.prisma.permission.findMany({ where: { code: { in: ['actividades.ver'] } } });
  await context.prisma.role.create({
    data: {
      code: readerRoleCode,
      name: 'Lector de actividades (prueba)',
      dataScope: 'ORGANIZATION',
      permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
    },
  });
});

afterAll(async () => {
  await context?.prisma.role.deleteMany({ where: { code: readerRoleCode } });
  await closeTestContext(context);
});

async function asesor(options: { countryId?: string; deny?: string[]; grant?: string[] } = {}): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['asesor'], countryId: options.countryId ?? m4, deny: options.deny, grant: options.grant });
}

/** Asesor con un cliente propio activo. */
async function ownerWithCustomer(options: { deny?: string[]; grant?: string[] } = {}): Promise<{ user: CrmUser; customerId: string }> {
  const user = await asesor(options);
  const customer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: m4 });
  return { user, customerId: customer.id };
}

async function auditEvents(resourceId: string): Promise<{ event: string; changes: unknown; metadata: unknown }[]> {
  return context.prisma.auditLog.findMany({
    where: { resourceType: 'crm.activity', resourceId },
    orderBy: { occurredAt: 'asc' },
    select: { event: true, changes: true, metadata: true },
  });
}

function createCall(client: ReturnType<typeof api>, customerId: string, extra: Record<string, unknown> = {}): request.Test {
  return client.post('/activities').send({ typeId: ids['call'], subject: 'Llamada de seguimiento', customerId, ...extra });
}

// ---------------------------------------------------------------------------
// PF-04.26 · Alta
// ---------------------------------------------------------------------------

describe('POST /activities (PF-04.26, AC-04.46)', () => {
  it.each(['call', 'meeting', 'email', 'task'])('crea el tipo %s: 201, Location, folio ACT-, estado abierto inicial y prioridad por defecto', async (typeKey) => {
    const { user, customerId } = await ownerWithCustomer();
    const response = await api(context, user.token)
      .post('/activities')
      .send({ typeId: ids[typeKey], subject: `Alta ${typeKey}`, customerId })
      .expect(201);

    expect(response.headers['location']).toBe(`/api/v1/activities/${response.body.id}`);
    expect(response.body).toMatchObject({
      code: expect.stringMatching(ACT_CODE),
      subject: `Alta ${typeKey}`,
      customer: { id: customerId },
      owner: { id: user.id },
      status: { id: ids['pending'], code: 'PENDIENTE', group: 'PENDING' },
      priority: { id: ids['medium'], code: 'MEDIA', weight: 2 },
      access: 'DIRECT',
      // El asesor no tiene `actividades.eliminar` (00 §5.4).
      allowedActions: ['EDIT', 'COMPLETE', 'CANCEL'],
      completion: null,
      project: null,
      dueBucket: 'PENDING',
    });
    const audit = await auditEvents(response.body.id);
    expect(audit.map((row) => row.event)).toEqual(['crm.activity.created']);
    expect(audit[0]?.metadata).toEqual({ code: response.body.code, completedOnCreation: false });
  });

  it('el tipo de la respuesta trae sus campos (D-04.8) y la auditoría enmascara el texto libre (DM-29)', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const response = await createCall(api(context, user.token), customerId, {
      subject: 'Llamada con Juan Pérez',
      summary: 'Habló de su familia',
      durationMinutes: 15,
      participants: [{ externalName: 'Juan Pérez' }],
    }).expect(201);
    expect(response.body.type).toEqual({
      id: ids['call'],
      code: 'LLAMADA',
      label: 'Llamada',
      fields: ['scheduledAt', 'durationMinutes', 'participants', 'summary', 'resultId', 'resultNotes', 'nextAction', 'nextActionDate'],
      isInteraction: true,
    });
    expect(response.body.participants).toEqual([
      { id: expect.any(String), role: 'INVITED', kind: 'EXTERNAL', contactId: null, userId: null, displayName: 'Juan Pérez' },
    ]);
    const [created] = await auditEvents(response.body.id);
    expect(created?.changes).toMatchObject({
      subject: { before: null, after: 'L***' },
      summary: { before: null, after: 'H***' },
      participants: { before: null, after: ['external:J***'] },
      durationMinutes: { before: null, after: 15 },
    });
    expect(JSON.stringify(created?.changes)).not.toContain('Juan');
  });

  it('PF-04.29: una llamada "ya realizada" se crea completada en un paso; sin actividades.cerrar → 403', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const response = await createCall(api(context, user.token), customerId, {
      completion: { resultId: ids['positive'], comment: 'Acordamos visita' },
    }).expect(201);
    expect(response.body).toMatchObject({
      status: { code: 'COMPLETADA', group: 'DONE' },
      result: { id: ids['positive'], code: 'POSITIVO' },
      completion: { completedBy: { id: user.id }, comment: 'Acordamos visita' },
      dueBucket: null,
      allowedActions: [],
    });
    expect(new Date(response.body.completion.completedAt).getTime()).toBeLessThanOrEqual(Date.now());

    const denied = await ownerWithCustomer({ deny: ['actividades.cerrar'] });
    const forbidden = await createCall(api(context, denied.user.token), denied.customerId, { completion: { resultNotes: 'Hecho' } }).expect(403);
    expect(forbidden.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'actividades.cerrar' }] });
    expect(await context.prisma.activity.count({ where: { customerId: denied.customerId } })).toBe(0);
  });

  it('el bloque completion exige resultado, fecha no futura y no admite statusId', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const noResult = await createCall(client, customerId, { completion: { comment: 'sin resultado' } }).expect(422);
    expect(noResult.body).toMatchObject({ code: 'RESULT_REQUIRED', details: [{ field: 'resultId', code: 'RESULT_REQUIRED' }] });
    const future = new Date(Date.now() + 2 * HOUR).toISOString();
    const inFuture = await createCall(client, customerId, { completion: { resultNotes: 'ok', completedAt: future } }).expect(422);
    expect(inFuture.body.code).toBe('ACTUAL_DATE_IN_FUTURE');
    const withStatus = await createCall(client, customerId, { statusId: ids['pending'], completion: { resultNotes: 'ok' } }).expect(422);
    expect(withStatus.body.code).toBe('USE_LIFECYCLE_OPERATION');
    expect(await context.prisma.activity.count({ where: { customerId } })).toBe(0);
  });

  it('PF-04.30: un correo se registra sin enviar nada (ninguna notificación)', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const response = await api(context, user.token)
      .post('/activities')
      .send({ typeId: ids['email'], subject: 'Correo con cotización', customerId, summary: 'Enviada la cotización por correo' })
      .expect(201);
    expect(response.body.type.code).toBe('CORREO');
    expect(await context.prisma.notification.count({ where: { userId: user.id } })).toBe(0);
  });

  it('un estado explícito debe ser abierto: EN_PROCESO sí, COMPLETADA no (USE_LIFECYCLE_OPERATION)', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const inProgress = await createCall(client, customerId, { statusId: ids['inProgress'] }).expect(201);
    expect(inProgress.body.status).toMatchObject({ code: 'EN_PROCESO', group: 'PENDING' });
    const closed = await createCall(client, customerId, { statusId: ids['completed'] }).expect(422);
    expect(closed.body).toMatchObject({ code: 'USE_LIFECYCLE_OPERATION', details: [{ field: 'statusId' }] });
  });

  it('cliente inexistente o ajeno → 404; cliente inactivo → 422 CUSTOMER_INACTIVE', async () => {
    const { user } = await ownerWithCustomer();
    const stranger = await asesor();
    const foreign = await insertCustomer(context.prisma, { salesOwnerId: stranger.id, countryId: m4 });
    const inactive = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: m4, statusCode: 'INACTIVO' });
    const client = api(context, user.token);
    await createCall(client, randomUUID()).expect(404);
    await createCall(client, foreign.id).expect(404);
    const inactiveResponse = await createCall(client, inactive.id).expect(422);
    expect(inactiveResponse.body.code).toBe('CUSTOMER_INACTIVE');
  });

  it('400 por forma: sin asunto, campo no permitido, participante sin sujeto o repetido', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    await client.post('/activities').send({ typeId: ids['call'], customerId }).expect(400);
    await createCall(client, customerId, { code: 'ACT-2026-000001' }).expect(400);
    await createCall(client, customerId, { participants: [{}] }).expect(400);
    await createCall(client, customerId, { participants: [{ externalName: 'Ana', userId: user.id }] }).expect(400);
    await createCall(client, customerId, { participants: [{ userId: user.id }, { userId: user.id }] }).expect(400);
    await createCall(client, customerId, { dueAt: '2026-10-12T10:00:00' }).expect(400);
    const sample = await createCall(client, customerId, { durationMinutes: -1 }).expect(400);
    expect(sample.body).toMatchObject({ code: 'VALIDATION_FAILED', correlationId: expect.any(String) });
  });
});

// ---------------------------------------------------------------------------
// PF-04.27, PF-04.28 · Relaciones, catálogos, tipo y obligatorios
// ---------------------------------------------------------------------------

describe('Validación de relaciones y campos (PF-04.27, PF-04.28, AC-04.43, AC-04.44, AC-04.51)', () => {
  it('oportunidad sin proyecto, de otro proyecto, proyecto de otro cliente, eliminado o no visible → 422 con código', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const projectId = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: m4 });
    const otherProjectId = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: m4 });
    const opportunityId = await insertOpportunity(context.prisma, { projectId: otherProjectId, ownerId: user.id });
    const otherCustomer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: m4 });
    const foreignProjectId = await insertProject(context.prisma, { customerId: otherCustomer.id, ownerId: user.id, countryId: m4 });
    const deletedProjectId = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: m4, deletedAt: new Date() });
    const stranger = await asesor({ countryId: m5 });
    const invisibleProjectId = await insertProject(context.prisma, { customerId, ownerId: stranger.id, countryId: m5 });

    const cases: [Record<string, unknown>, string, string][] = [
      [{ opportunityId }, 'OPPORTUNITY_REQUIRES_PROJECT', 'opportunityId'],
      [{ projectId, opportunityId }, 'OPPORTUNITY_PROJECT_MISMATCH', 'opportunityId'],
      [{ projectId: foreignProjectId }, 'PROJECT_CUSTOMER_MISMATCH', 'projectId'],
      [{ projectId: deletedProjectId }, 'INACTIVE_REFERENCE', 'projectId'],
      [{ projectId: invisibleProjectId }, 'UNKNOWN_REFERENCE', 'projectId'],
      [{ projectId: randomUUID() }, 'UNKNOWN_REFERENCE', 'projectId'],
    ];
    for (const [extra, code, field] of cases) {
      const response = await createCall(client, customerId, extra).expect(422);
      expect(response.body).toMatchObject({ code, details: [{ field, code }] });
    }

    const ok = await createCall(client, customerId, { projectId: otherProjectId, opportunityId }).expect(201);
    expect(ok.body).toMatchObject({ project: { id: otherProjectId, isDeleted: false }, opportunity: { id: opportunityId, isDeleted: false } });
  });

  it('un elemento de otro catálogo → 422 INVALID_CATALOG_VALUE', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const type = await client.post('/activities').send({ typeId: ids['high'], subject: 'X', customerId }).expect(422);
    expect(type.body).toMatchObject({ code: 'INVALID_CATALOG_VALUE', details: [{ field: 'typeId', catalogKey: 'crm.tipo_actividad', reason: 'NOT_FOUND' }] });
    const priority = await createCall(client, customerId, { priorityId: ids['call'] }).expect(422);
    expect(priority.body.details).toEqual([{ field: 'priorityId', catalogKey: 'crm.prioridad', reason: 'NOT_FOUND' }]);
    const result = await createCall(client, customerId, { resultId: ids['cancelReason'] }).expect(422);
    expect(result.body.details).toEqual([{ field: 'resultId', catalogKey: 'crm.resultado_interaccion', reason: 'NOT_FOUND' }]);
  });

  it('PF-04.28: una tarea con duración, resumen o participantes → 422 FIELD_NOT_APPLICABLE con todos los campos', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const response = await api(context, user.token)
      .post('/activities')
      .send({ typeId: ids['task'], subject: 'Tarea', customerId, durationMinutes: 30, summary: 'x', participants: [{ externalName: 'Ana' }] })
      .expect(422);
    expect(response.body).toMatchObject({
      code: 'FIELD_NOT_APPLICABLE',
      details: [
        { field: 'durationMinutes', code: 'FIELD_NOT_APPLICABLE' },
        { field: 'participants', code: 'FIELD_NOT_APPLICABLE' },
        { field: 'summary', code: 'FIELD_NOT_APPLICABLE' },
      ],
    });
  });

  it('RN-04.7: crm.campos_obligatorios.activity añade obligatorios → 422 REQUIRED_FIELD_MISSING', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const widened = (current: string): string => {
      const value = JSON.parse(current) as Record<string, string[]>;
      return JSON.stringify({ ...value, activity: [...(value['activity'] ?? []), 'description', 'dueAt', 'durationMinutes'] });
    };
    await withParameter(context.prisma, 'crm.campos_obligatorios', widened, async () => {
      const client = api(context, user.token);
      const missing = await createCall(client, customerId).expect(422);
      // `durationMinutes` lo admite la llamada: también se exige.
      expect(missing.body).toMatchObject({
        code: 'REQUIRED_FIELD_MISSING',
        details: [
          { field: 'description', code: 'REQUIRED_FIELD_MISSING' },
          { field: 'dueAt', code: 'REQUIRED_FIELD_MISSING' },
          { field: 'durationMinutes', code: 'REQUIRED_FIELD_MISSING' },
        ],
      });
      // Una tarea no admite duración: no se le exige (RN-04.24).
      await client
        .post('/activities')
        .send({ typeId: ids['task'], subject: 'Tarea', customerId, description: 'd', dueAt: new Date().toISOString() })
        .expect(201);
    });
  });

  it('participantes: contacto de otro cliente, contacto inactivo, usuario inactivo o inexistente → 422', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const otherCustomer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: m4 });
    const foreignContact = await insertContact(context.prisma, { customerId: otherCustomer.id });
    const inactiveContact = await insertContact(context.prisma, { customerId, isActive: false });
    const suspended = await crmUser(context, { roleCodes: ['asesor'], countryId: m4, status: 'SUSPENDED' });

    const cases: [Record<string, unknown>, string, string][] = [
      [{ contactId: foreignContact }, 'INVALID_CONTACT', 'participants.0.contactId'],
      [{ contactId: inactiveContact }, 'CONTACT_INACTIVE', 'participants.0.contactId'],
      [{ userId: suspended.id }, 'INACTIVE_REFERENCE', 'participants.0.userId'],
      [{ userId: randomUUID() }, 'UNKNOWN_REFERENCE', 'participants.0.userId'],
    ];
    for (const [participant, code, field] of cases) {
      const response = await createCall(client, customerId, { participants: [participant] }).expect(422);
      expect(response.body).toMatchObject({ code, details: [{ field }] });
    }

    const contactId = await insertContact(context.prisma, { customerId, firstName: 'Ana', lastName: 'Contacto' });
    const ok = await createCall(client, customerId, { participants: [{ contactId }, { userId: user.id }, { externalName: 'Externo' }] }).expect(201);
    expect(ok.body.participants.map((item: { kind: string; displayName: string }) => [item.kind, item.displayName])).toEqual([
      ['CONTACT', 'Ana Contacto'],
      ['USER', 'Persona De prueba'],
      ['EXTERNAL', 'Externo'],
    ]);
  });
});

// ---------------------------------------------------------------------------
// RN-04.5 · Responsable
// ---------------------------------------------------------------------------

describe('Responsable (RN-04.5, PF-04.13 aplicado a actividades)', () => {
  it('un asesor no asigna a otro (403); un manager asigna a su equipo (201) y no fuera de él (422 OWNER_NOT_ELIGIBLE)', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const colleague = await asesor();
    const forbidden = await createCall(api(context, user.token), customerId, { ownerId: colleague.id }).expect(403);
    expect(forbidden.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'actividades.administrar' }] });

    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: m4 });
    const member = await asesor();
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id] });
    const memberCustomer = await insertCustomer(context.prisma, { salesOwnerId: member.id, countryId: m4 });
    const assigned = await createCall(api(context, manager.token), memberCustomer.id, { ownerId: member.id }).expect(201);
    expect(assigned.body.owner.id).toBe(member.id);

    const outside = await createCall(api(context, manager.token), memberCustomer.id, { ownerId: colleague.id }).expect(422);
    expect(outside.body).toMatchObject({ code: 'OWNER_NOT_ELIGIBLE', details: [{ field: 'ownerId' }] });
  });
});

// ---------------------------------------------------------------------------
// PF-04.31 · Edición
// ---------------------------------------------------------------------------

describe('PATCH /activities/:id (PF-04.31, AC-04.45)', () => {
  it('propia abierta → 200 y auditoría; sin cambios no audita; cambio a otro estado abierto permitido', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const created = await createCall(client, customerId, { durationMinutes: 10 }).expect(201);
    const id = created.body.id as string;

    const updated = await client.patch(`/activities/${id}`).send({ durationMinutes: 25, statusId: ids['inProgress'], nextActionDate: '2026-11-02' }).expect(200);
    expect(updated.body).toMatchObject({ durationMinutes: 25, status: { code: 'EN_PROCESO' }, nextActionDate: '2026-11-02' });
    await client.patch(`/activities/${id}`).send({ durationMinutes: 25 }).expect(200);

    const audit = await auditEvents(id);
    expect(audit.map((row) => row.event)).toEqual(['crm.activity.created', 'crm.activity.updated']);
    expect(audit[1]?.changes).toEqual({
      durationMinutes: { before: 10, after: 25 },
      statusId: { before: ids['pending'], after: ids['inProgress'] },
      nextActionDate: { before: null, after: '2026-11-02' },
    });
  });

  it('a completada por PATCH → 422 USE_LIFECYCLE_OPERATION; completada o cancelada → 409 RECORD_READ_ONLY', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const open = await insertActivity(context.prisma, { customerId, ownerId: user.id });
    const lifecycle = await client.patch(`/activities/${open}`).send({ statusId: ids['completed'] }).expect(422);
    expect(lifecycle.body.code).toBe('USE_LIFECYCLE_OPERATION');

    for (const statusCode of ['COMPLETADA', 'CANCELADA']) {
      const closed = await insertActivity(context.prisma, { customerId, ownerId: user.id, statusCode });
      const response = await client.patch(`/activities/${closed}`).send({ subject: 'Cambio' }).expect(409);
      expect(response.body).toMatchObject({ code: 'RECORD_READ_ONLY', details: [{ field: 'statusId', currentStatus: statusCode }] });
    }
  });

  it('ajena visible sin actividades.administrar → 403 (roles combinados: asesor + lector ORGANIZATION)', async () => {
    const reader = await crmUser(context, { roleCodes: ['asesor', readerRoleCode], countryId: m4 });
    const { user: other, customerId } = await ownerWithCustomer();
    const foreign = await insertActivity(context.prisma, { customerId, ownerId: other.id });
    const client = api(context, reader.token);

    const detail = await client.get(`/activities/${foreign}`).expect(200);
    expect(detail.body).toMatchObject({ access: 'DIRECT', allowedActions: [] });
    const edit = await client.patch(`/activities/${foreign}`).send({ subject: 'Ajena' }).expect(403);
    expect(edit.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'actividades.administrar' }] });
    const complete = await client.post(`/activities/${foreign}/completion`).send({ resultNotes: 'x' }).expect(403);
    expect(complete.body.details).toEqual([{ requiredPermission: 'actividades.administrar' }]);
    await client.post(`/activities/${foreign}/cancellation`).send({}).expect(403);
    expect((await context.prisma.activity.findUniqueOrThrow({ where: { id: foreign } })).subject).toBe('Actividad de prueba');
  });

  it('cambiar el tipo revalida lo guardado (FIELD_NOT_APPLICABLE); cambiar el cliente con contactos del anterior → INVALID_CONTACT', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const created = await createCall(client, customerId, { durationMinutes: 20 }).expect(201);
    const typeChange = await client.patch(`/activities/${created.body.id}`).send({ typeId: ids['task'] }).expect(422);
    expect(typeChange.body).toMatchObject({ code: 'FIELD_NOT_APPLICABLE', details: [{ field: 'durationMinutes' }] });
    await client.patch(`/activities/${created.body.id}`).send({ typeId: ids['task'], durationMinutes: null }).expect(200);

    const contactId = await insertContact(context.prisma, { customerId });
    const withContact = await createCall(client, customerId, { participants: [{ contactId }] }).expect(201);
    const newCustomer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: m4 });
    const moved = await client.patch(`/activities/${withContact.body.id}`).send({ customerId: newCustomer.id }).expect(422);
    expect(moved.body).toMatchObject({ code: 'INVALID_CONTACT', details: [{ field: 'participants' }] });
    // Reemplazando los participantes en la misma petición sí se puede.
    const ok = await client
      .patch(`/activities/${withContact.body.id}`)
      .send({ customerId: newCustomer.id, participants: [{ externalName: 'Nuevo' }] })
      .expect(200);
    expect(ok.body).toMatchObject({ customer: { id: newCustomer.id }, participants: [{ kind: 'EXTERNAL', displayName: 'Nuevo' }] });
    expect(await context.prisma.interactionParticipant.count({ where: { activityId: withContact.body.id, customerId: newCustomer.id } })).toBe(1);
  });

  it('vaciar un campo obligatorio → 422 REQUIRED_FIELD_MISSING', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const created = await createCall(api(context, user.token), customerId).expect(201);
    const response = await api(context, user.token).patch(`/activities/${created.body.id}`).send({ subject: '   ' }).expect(422);
    expect(response.body).toMatchObject({ code: 'REQUIRED_FIELD_MISSING', details: [{ field: 'subject' }] });
  });
});

// ---------------------------------------------------------------------------
// PF-04.32, PF-04.33 · Completar · cancelar
// ---------------------------------------------------------------------------

describe('POST /activities/:id/completion y /cancellation (PF-04.32, PF-04.33, AC-04.54–57)', () => {
  it('completar con resultado → COMPLETADA, completedBy, auditoría y last_activity_at del proyecto (RN-04.11)', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const projectId = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: m4 });
    const old = new Date('2020-01-01T00:00:00Z');
    await context.prisma.project.update({ where: { id: projectId }, data: { lastActivityAt: old } });

    const start = Date.now();
    const created = await createCall(client, customerId, { projectId }).expect(201);
    const afterCreate = (await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } })).lastActivityAt;
    expect(afterCreate.getTime()).toBeGreaterThanOrEqual(start - 1000);

    await context.prisma.project.update({ where: { id: projectId }, data: { lastActivityAt: old } });
    const completedAt = new Date(Date.now() - HOUR).toISOString();
    const completed = await client
      .post(`/activities/${created.body.id}/completion`)
      .send({ resultId: ids['positive'], resultNotes: 'Cliente interesado', comment: 'Bien', completedAt })
      .expect(200);
    expect(completed.body).toMatchObject({
      status: { code: 'COMPLETADA', group: 'DONE' },
      result: { id: ids['positive'] },
      resultNotes: 'Cliente interesado',
      completion: { completedAt, completedBy: { id: user.id }, comment: 'Bien' },
      allowedActions: [],
    });
    expect((await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } })).lastActivityAt.getTime()).toBeGreaterThan(old.getTime());
    const audit = await auditEvents(created.body.id);
    expect(audit.map((row) => row.event)).toEqual(['crm.activity.created', 'crm.activity.completed']);
    expect(audit[1]?.changes).toMatchObject({
      statusId: { before: ids['pending'], after: ids['completed'] },
      completedById: { before: null, after: user.id },
      resultNotes: { before: null, after: 'C***' },
      completionComment: { before: null, after: 'B***' },
    });
  });

  it('sin resultado → 422; dos veces → 409; fecha futura → 422; sin actividades.cerrar → 403', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const id = await insertActivity(context.prisma, { customerId, ownerId: user.id });

    const noResult = await client.post(`/activities/${id}/completion`).send({ comment: 'x' }).expect(422);
    expect(noResult.body.code).toBe('RESULT_REQUIRED');
    const future = await client
      .post(`/activities/${id}/completion`)
      .send({ resultNotes: 'x', completedAt: new Date(Date.now() + HOUR).toISOString() })
      .expect(422);
    expect(future.body.code).toBe('ACTUAL_DATE_IN_FUTURE');
    await client.post(`/activities/${id}/completion`).send({ resultNotes: 'Hecho' }).expect(200);
    const twice = await client.post(`/activities/${id}/completion`).send({ resultNotes: 'Otra vez' }).expect(409);
    expect(twice.body).toMatchObject({ code: 'INVALID_STATUS_TRANSITION', details: [{ currentStatus: 'COMPLETADA' }] });

    const denied = await ownerWithCustomer({ deny: ['actividades.cerrar'] });
    const deniedId = await insertActivity(context.prisma, { customerId: denied.customerId, ownerId: denied.user.id });
    const forbidden = await api(context, denied.user.token).post(`/activities/${deniedId}/completion`).send({ resultNotes: 'x' }).expect(403);
    expect(forbidden.body.code).toBe('PERMISSION_DENIED');
    const detail = await api(context, denied.user.token).get(`/activities/${deniedId}`).expect(200);
    expect(detail.body.allowedActions).toEqual(['EDIT', 'CANCEL']);
  });

  it('cancelar abierta → CANCELADA con auditoría (comentario enmascarado); cancelar de nuevo → 409', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const id = await insertActivity(context.prisma, { customerId, ownerId: user.id });
    const cancelled = await client.post(`/activities/${id}/cancellation`).send({ comment: 'El cliente pidió anularla' }).expect(200);
    expect(cancelled.body).toMatchObject({ status: { code: 'CANCELADA', group: 'CANCELLED' }, cancelledAt: expect.any(String), allowedActions: [] });
    await client.post(`/activities/${id}/cancellation`).send({}).expect(409);
    const audit = await auditEvents(id);
    expect(audit.map((row) => row.event)).toEqual(['crm.activity.cancelled']);
    expect(audit[0]?.changes).toMatchObject({ cancellationComment: { before: null, after: 'E***' }, statusId: { after: ids['cancelled'] } });
  });

  it('RN-04.12: completar mientras otra transacción completa la misma actividad → espera y responde 409, sin segunda escritura', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const id = await insertActivity(context.prisma, { customerId, ownerId: user.id });
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let signalLocked: () => void = () => undefined;
    const locked = new Promise<void>((resolve) => (signalLocked = resolve));
    const holder = context.prisma.$transaction(
      async (tx) => {
        await (tx as unknown as PrismaClient).activity.update({
          where: { id },
          data: { statusId: ids['completed'], completedAt: new Date(), completedById: user.id, resultNotes: 'Otro usuario' },
        });
        signalLocked();
        await released;
      },
      { timeout: 20_000 },
    );
    await locked;

    let settled = false;
    const pending = api(context, user.token)
      .post(`/activities/${id}/completion`)
      .send({ resultNotes: 'Mío' })
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
    expect((await context.prisma.activity.findUniqueOrThrow({ where: { id } })).resultNotes).toBe('Otro usuario');
    expect((await auditEvents(id)).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PF-04.34 · Eliminación lógica
// ---------------------------------------------------------------------------

describe('DELETE /activities/:id (PF-04.34)', () => {
  it('el manager elimina una abierta de su equipo (204) y desaparece de listado, bandeja y detalle; una completada → 409', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: m4 });
    const member = await asesor();
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id] });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: member.id, countryId: m4 });
    const open = await insertActivity(context.prisma, { customerId: customer.id, ownerId: member.id });
    const cancelled = await insertActivity(context.prisma, { customerId: customer.id, ownerId: member.id, statusCode: 'CANCELADA' });
    const completed = await insertActivity(context.prisma, { customerId: customer.id, ownerId: member.id, statusCode: 'COMPLETADA' });
    const client = api(context, manager.token);

    const detail = await client.get(`/activities/${open}`).expect(200);
    expect(detail.body.allowedActions).toEqual(['EDIT', 'COMPLETE', 'CANCEL', 'DELETE']);
    await client.delete(`/activities/${open}`).expect(204);
    await client.delete(`/activities/${cancelled}`).expect(204);
    const historic = await client.delete(`/activities/${completed}`).expect(409);
    expect(historic.body.code).toBe('RECORD_READ_ONLY');

    await client.get(`/activities/${open}`).expect(404);
    const list = await client.get(`/activities?customerId=${customer.id}`).expect(200);
    expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([completed]);
    const pending = await client.get(`/activities/pending?customerId=${customer.id}`).expect(200);
    expect(pending.body).toMatchObject({ data: [], counts: { overdue: 0, dueSoon: 0, pending: 0, total: 0 } });
    expect((await context.prisma.activity.findUniqueOrThrow({ where: { id: open } })).deletedAt).not.toBeNull();
    expect((await auditEvents(open)).map((row) => row.event)).toEqual(['crm.activity.deleted']);
  });

  it('el asesor (sin actividades.eliminar) no elimina ni la propia → 403', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const id = await insertActivity(context.prisma, { customerId, ownerId: user.id });
    const response = await api(context, user.token).delete(`/activities/${id}`).expect(403);
    expect(response.body).toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});

// ---------------------------------------------------------------------------
// PF-04.35, PF-04.36 · Bandeja de pendientes
// ---------------------------------------------------------------------------

describe('GET /activities/pending (PF-04.35, PF-04.36, AC-04.7–AC-04.10)', () => {
  async function inbox(): Promise<{ user: CrmUser; customerId: string; rows: Record<string, string> }> {
    const { user, customerId } = await ownerWithCustomer();
    const now = Date.now();
    const rows: Record<string, string> = {
      overdue: await insertActivity(context.prisma, { customerId, ownerId: user.id, dueAt: new Date(now - HOUR), priorityCode: 'BAJA' }),
      dueSoon: await insertActivity(context.prisma, { customerId, ownerId: user.id, dueAt: new Date(now + 5 * HOUR), priorityCode: 'MEDIA' }),
      later: await insertActivity(context.prisma, { customerId, ownerId: user.id, dueAt: new Date(now + 100 * HOUR), priorityCode: 'ALTA' }),
      noDue: await insertActivity(context.prisma, { customerId, ownerId: user.id, priorityCode: 'ALTA' }),
    };
    await insertActivity(context.prisma, { customerId, ownerId: user.id, statusCode: 'COMPLETADA', dueAt: new Date(now - HOUR) });
    await insertActivity(context.prisma, { customerId, ownerId: user.id, statusCode: 'CANCELADA', dueAt: new Date(now - HOUR) });
    await insertActivity(context.prisma, { customerId, ownerId: user.id, dueAt: new Date(now - HOUR), deletedAt: new Date() });
    return { user, customerId, rows };
  }

  it('grupos, contadores y orden RN-04.32; completadas, canceladas y eliminadas excluidas', async () => {
    const { user, customerId, rows } = await inbox();
    const response = await api(context, user.token).get(`/activities/pending?customerId=${customerId}`).expect(200);
    expect(response.body.counts).toEqual({ overdue: 1, dueSoon: 1, pending: 2, total: 4 });
    expect(response.body.pagination).toMatchObject({ totalItems: 4 });
    expect(response.body.data.map((row: { id: string; bucket: string }) => [row.id, row.bucket])).toEqual([
      // ALTA (peso 3) primero; a igual prioridad, con vencimiento antes que sin él.
      [rows['later'], 'PENDING'],
      [rows['noDue'], 'PENDING'],
      [rows['dueSoon'], 'DUE_SOON'],
      [rows['overdue'], 'OVERDUE'],
    ]);
    expect(response.body.data[0]).toMatchObject({ priority: { code: 'ALTA', weight: 3 }, allowedActions: ['EDIT', 'COMPLETE', 'CANCEL'] });
  });

  it('bucket filtra las filas pero no los contadores; DUE_SOON+PENDING = "pendientes" de Inicio; orden por vencimiento', async () => {
    const { user, customerId, rows } = await inbox();
    const client = api(context, user.token);
    const overdue = await client.get(`/activities/pending?customerId=${customerId}&bucket=OVERDUE`).expect(200);
    expect(overdue.body.data.map((row: { id: string }) => row.id)).toEqual([rows['overdue']]);
    expect(overdue.body.counts.total).toBe(4);
    expect(overdue.body.pagination.totalItems).toBe(1);
    const soonAndPending = await client.get(`/activities/pending?customerId=${customerId}&bucket=DUE_SOON&bucket=PENDING&sortBy=dueAt&sortOrder=asc`).expect(200);
    expect(soonAndPending.body.data.map((row: { id: string }) => row.id)).toEqual([rows['dueSoon'], rows['later'], rows['noDue']]);
    await client.get('/activities/pending?bucket=VENCIDA').expect(400);
  });

  it('PF-04.36: cambiar crm.alertas.actividad_por_vencer_horas cambia la clasificación sin desplegar', async () => {
    const { user, customerId, rows } = await inbox();
    await withParameter(context.prisma, 'crm.alertas.actividad_por_vencer_horas', '200', async () => {
      const response = await api(context, user.token).get(`/activities/pending?customerId=${customerId}`).expect(200);
      expect(response.body.counts).toEqual({ overdue: 1, dueSoon: 2, pending: 1, total: 4 });
      const later = response.body.data.find((row: { id: string }) => row.id === rows['later']);
      expect(later.bucket).toBe('DUE_SOON');
      const detail = await api(context, user.token).get(`/activities/${rows['later']}`).expect(200);
      expect(detail.body.dueBucket).toBe('DUE_SOON');
    });
  });

  it('AC-04.10: al completar o cancelar, sale de la bandeja y de sus contadores', async () => {
    const { user, customerId, rows } = await inbox();
    const client = api(context, user.token);
    await client.post(`/activities/${rows['overdue']}/completion`).send({ resultNotes: 'Hecho' }).expect(200);
    await client.post(`/activities/${rows['noDue']}/cancellation`).send({}).expect(200);
    const response = await client.get(`/activities/pending?customerId=${customerId}`).expect(200);
    expect(response.body.counts).toEqual({ overdue: 0, dueSoon: 1, pending: 1, total: 2 });
  });
});

// ---------------------------------------------------------------------------
// Listado y visibilidad (PF-04.43 para actividades)
// ---------------------------------------------------------------------------

describe('GET /activities y visibilidad (PF-04.43, AC-04.42, AC-04.59)', () => {
  it('filtros, búsqueda y orden; "vencidas" solo abiertas con vencimiento pasado', async () => {
    const { user, customerId } = await ownerWithCustomer();
    const client = api(context, user.token);
    const now = Date.now();
    const a = await insertActivity(context.prisma, { customerId, ownerId: user.id, subject: 'Revisar planos', dueAt: new Date(now - HOUR), typeCode: 'TAREA' });
    const b = await insertActivity(context.prisma, { customerId, ownerId: user.id, subject: 'Llamar al ingeniero', dueAt: new Date(now + HOUR) });
    await insertActivity(context.prisma, {
      customerId,
      ownerId: user.id,
      subject: 'Cerrada',
      typeCode: 'CORREO',
      statusCode: 'COMPLETADA',
      dueAt: new Date(now - HOUR / 2),
    });

    const overdue = await client.get(`/activities?customerId=${customerId}&overdue=true`).expect(200);
    expect(overdue.body.data.map((row: { id: string }) => row.id)).toEqual([a]);
    const byType = await client.get(`/activities?customerId=${customerId}&typeId=${ids['call']}&typeId=${ids['meeting']}`).expect(200);
    expect(byType.body.data.map((row: { id: string }) => row.id)).toEqual([b]);
    const search = await client.get(`/activities?customerId=${customerId}&search=ingeniero`).expect(200);
    expect(search.body.data.map((row: { id: string }) => row.id)).toEqual([b]);
    const sorted = await client.get(`/activities?customerId=${customerId}&sortBy=dueAt&sortOrder=asc`).expect(200);
    expect(sorted.body.pagination).toMatchObject({ totalItems: 3 });
    expect(sorted.body.data[0]).toMatchObject({ id: a, dueBucket: 'OVERDUE', status: { group: 'OVERDUE' }, attachmentCount: 0 });
    await client.get('/activities?sortBy=subject').expect(400);
    await client.get('/activities?pageSize=101').expect(400);
  });

  it('OWN: un asesor no ve (404) ni lista las de otro; sí las de un proyecto suyo (herencia DM-13, solo lectura)', async () => {
    const a = await asesor();
    const { user: b, customerId } = await ownerWithCustomer();
    const hidden = await insertActivity(context.prisma, { customerId, ownerId: b.id });
    const projectOfA = await insertProject(context.prisma, { customerId, ownerId: a.id, countryId: m4 });
    const inherited = await insertActivity(context.prisma, { customerId, ownerId: b.id, projectId: projectOfA });
    const client = api(context, a.token);

    await client.get(`/activities/${hidden}`).expect(404);
    await client.patch(`/activities/${hidden}`).send({ subject: 'x' }).expect(404);
    await client.post(`/activities/${hidden}/completion`).send({ resultNotes: 'x' }).expect(404);
    const list = await client.get(`/activities?customerId=${customerId}`).expect(200);
    expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([inherited]);
    const detail = await client.get(`/activities/${inherited}`).expect(200);
    expect(detail.body).toMatchObject({ access: 'INHERITED', allowedActions: [] });
    const edit = await client.patch(`/activities/${inherited}`).send({ subject: 'x' }).expect(403);
    expect(edit.body.code).toBe('PERMISSION_DENIED');
    // Con el proyecto eliminado deja de heredar.
    await context.prisma.project.update({ where: { id: projectOfA }, data: { deletedAt: new Date() } });
    await client.get(`/activities/${inherited}`).expect(404);
  });

  it('TEAM ve las de su equipo y subequipos; COUNTRY ve las de clientes de su país', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: m4 });
    const child = await asesor();
    const parentTeam = await insertTeam(context.prisma, { managerId: manager.id });
    await insertTeam(context.prisma, { parentId: parentTeam, memberIds: [child.id] });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: child.id, countryId: m4 });
    const ofChild = await insertActivity(context.prisma, { customerId: customer.id, ownerId: child.id });
    await api(context, manager.token).get(`/activities/${ofChild}`).expect(200);

    const countryHead = await crmUser(context, { roleCodes: ['responsable-pais'], countryId: m5 });
    const stranger = await asesor({ countryId: m5 });
    const inM5 = await insertCustomer(context.prisma, { salesOwnerId: stranger.id, countryId: m5 });
    const activityInM5 = await insertActivity(context.prisma, { customerId: inM5.id, ownerId: stranger.id });
    const headClient = api(context, countryHead.token);
    await headClient.get(`/activities/${activityInM5}`).expect(200);
    await headClient.get(`/activities/${ofChild}`).expect(404);
  });

  it('sin contactos.ver no se revela el nombre de un contacto participante', async () => {
    const { user, customerId } = await ownerWithCustomer({ deny: ['contactos.ver'] });
    const contactId = await insertContact(context.prisma, { customerId, firstName: 'Secreta' });
    const id = await insertActivity(context.prisma, { customerId, ownerId: user.id });
    await insertParticipant(context.prisma, { activityId: id, customerId, contactId });
    const detail = await api(context, user.token).get(`/activities/${id}`).expect(200);
    expect(detail.body.participants).toEqual([{ id: expect.any(String), role: 'INVITED', kind: 'CONTACT', contactId, userId: null, displayName: null }]);
  });
});

// ---------------------------------------------------------------------------
// Opciones (D-04.10) y @RequireAnyPermission
// ---------------------------------------------------------------------------

describe('Opciones del módulo (D-04.10, addendum ADR-008)', () => {
  it('form-options: catálogos activos con semántica, valores por defecto, obligatorios y umbral', async () => {
    const { user } = await ownerWithCustomer();
    const response = await api(context, user.token).get('/activities/form-options').expect(200);
    expect(response.body.types.map((type: { code: string }) => type.code)).toEqual(expect.arrayContaining(['LLAMADA', 'REUNION', 'CORREO', 'TAREA']));
    expect(response.body.types.find((type: { code: string }) => type.code === 'TAREA')).toMatchObject({
      fields: ['scheduledAt', 'resultId', 'resultNotes'],
      isInteraction: false,
    });
    expect(response.body.statuses.find((status: { code: string }) => status.code === 'COMPLETADA')).toMatchObject({ group: 'COMPLETED' });
    expect(response.body.priorities.find((priority: { code: string }) => priority.code === 'ALTA')).toMatchObject({ weight: 3 });
    expect(response.body.defaults).toEqual({ priorityId: ids['medium'], statusId: ids['pending'] });
    expect(response.body.requiredFields).toEqual(expect.arrayContaining(['typeId', 'subject', 'customerId', 'ownerId', 'priorityId']));
    expect(typeof response.body.dueSoonHours).toBe('number');
  });

  it('owner-options: con solo visitas.ver o solo actividades.ver → 200; sin ninguno → 403; un asesor OWN solo se ve a sí mismo', async () => {
    const onlyVisits = await crmUser(context, { roleCodes: ['usuario'], countryId: m4, grant: ['visitas.ver'] });
    const onlyActivities = await crmUser(context, { roleCodes: ['usuario'], countryId: m4, grant: ['actividades.ver'] });
    const none = await crmUser(context, { roleCodes: ['usuario'], countryId: m4 });
    await api(context, onlyVisits.token).get('/commercial-activity/owner-options').expect(200);
    await api(context, onlyActivities.token).get('/commercial-activity/owner-options').expect(200);
    const forbidden = await api(context, none.token).get('/commercial-activity/owner-options').expect(403);
    expect(forbidden.body.code).toBe('PERMISSION_DENIED');
    await api(context).get('/commercial-activity/owner-options').expect(401);

    const self = await asesor();
    const options = await api(context, self.token).get('/commercial-activity/owner-options?pageSize=100').expect(200);
    expect(options.body.data).toEqual([{ id: self.id, displayName: 'Persona De prueba' }]);
    expect(options.body.pagination).toMatchObject({ totalItems: 1 });
  });

  it('owner-options de un manager: su equipo con subequipos, sin usuarios inactivos', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: m4, displayName: 'Mánager Opciones' });
    const member = await crmUser(context, { roleCodes: ['asesor'], countryId: m4, displayName: 'Miembro Opciones' });
    const suspended = await crmUser(context, { roleCodes: ['asesor'], countryId: m4, status: 'SUSPENDED' });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id, suspended.id] });
    const options = await api(context, manager.token).get('/commercial-activity/owner-options?search=Opciones').expect(200);
    expect(options.body.data.map((row: { id: string }) => row.id).sort()).toEqual([manager.id, member.id].sort());
  });
});

// ---------------------------------------------------------------------------
// PF-04.45 · 401 y 403 en todos los endpoints de actividades
// ---------------------------------------------------------------------------

describe('Autenticación y autorización por endpoint (PF-04.45, AC-04.58)', () => {
  const someId = randomUUID();
  const endpoints: [string, (client: ReturnType<typeof api>) => request.Test][] = [
    ['GET /activities', (client) => client.get('/activities')],
    ['GET /activities/pending', (client) => client.get('/activities/pending')],
    ['GET /activities/form-options', (client) => client.get('/activities/form-options')],
    ['GET /activities/:id', (client) => client.get(`/activities/${someId}`)],
    ['POST /activities', (client) => client.post('/activities').send({})],
    ['PATCH /activities/:id', (client) => client.patch(`/activities/${someId}`).send({})],
    ['POST /activities/:id/completion', (client) => client.post(`/activities/${someId}/completion`).send({})],
    ['POST /activities/:id/cancellation', (client) => client.post(`/activities/${someId}/cancellation`).send({})],
    ['DELETE /activities/:id', (client) => client.delete(`/activities/${someId}`)],
  ];

  it.each(endpoints)('%s: 401 sin token y 403 sin permiso', async (_label, call) => {
    const noPermissions = await crmUser(context, { roleCodes: ['usuario'], countryId: m4 });
    await call(api(context)).expect(401);
    const response = await call(api(context, noPermissions.token)).expect(403);
    expect(response.body).toMatchObject({ code: 'PERMISSION_DENIED', correlationId: expect.any(String) });
  });

  it('id que no es UUID → 400', async () => {
    const { user } = await ownerWithCustomer();
    await api(context, user.token).get('/activities/no-es-uuid').expect(400);
  });
});
