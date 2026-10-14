import { randomUUID } from 'node:crypto';

import type request from 'supertest';

import {
  COMMERCIAL_ACTIVITY_USAGE_QUERY,
  type CommercialActivityUsageQuery,
} from '@/modules/commercial-activity/ports/commercial-activity-usage.port';

import {
  api,
  type CrmUser,
  crmUser,
  insertActivity,
  insertContact,
  insertCustomer,
  insertProject,
  insertTeam,
  insertVisit,
  testCountry,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 4 · Seguridad (04 H, PF-04.43–PF-04.47): 401/403 en cada endpoint de
 * visitas y modelos de lectura, visibilidad por alcance (OWN, TEAM con subequipos,
 * COUNTRY, ORGANIZATION, herencia por proyecto DM-13), roles combinados,
 * `schedule-conflicts` sin datos fuera del alcance y `CommercialActivityUsageQuery`.
 * Países propios `S4` y `S5`.
 */

let context: TestContext;
let s4: string;
let s5: string;
let readerRoleCode: string;
let plannerRoleCode: string;

const HOUR = 3_600_000;

beforeAll(async () => {
  context = await createTestContext();
  s4 = await testCountry(context.prisma, 'S4', { name: 'Prueba Seguridad' });
  s5 = await testCountry(context.prisma, 'S5', { name: 'Prueba Seguridad Dos' });
  const suffix = randomUUID().slice(0, 8);
  // Roles combinados: lector de visitas ORGANIZATION; planificador ORGANIZATION sin `visitas.ver`.
  readerRoleCode = `lector-vis-${suffix}`;
  plannerRoleCode = `planif-vis-${suffix}`;
  const permissionIds = async (codes: string[]): Promise<{ permissionId: string }[]> =>
    (await context.prisma.permission.findMany({ where: { code: { in: codes } } })).map((permission) => ({ permissionId: permission.id }));
  await context.prisma.role.create({
    data: { code: readerRoleCode, name: 'Lector de visitas (prueba)', dataScope: 'ORGANIZATION', permissions: { create: await permissionIds(['visitas.ver']) } },
  });
  await context.prisma.role.create({
    data: {
      code: plannerRoleCode,
      name: 'Planificador de visitas (prueba)',
      dataScope: 'ORGANIZATION',
      permissions: { create: await permissionIds(['visitas.crear', 'visitas.administrar']) },
    },
  });
});

afterAll(async () => {
  await context?.prisma.role.deleteMany({ where: { code: { in: [readerRoleCode, plannerRoleCode] } } });
  await closeTestContext(context);
});

async function asesor(countryId = s4): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['asesor'], countryId });
}

function at(offsetHours: number): Date {
  return new Date(Date.now() + offsetHours * HOUR);
}

// ---------------------------------------------------------------------------
// PF-04.45 · 401 y 403 por endpoint
// ---------------------------------------------------------------------------

describe('Autenticación y autorización por endpoint (PF-04.45, AC-04.58)', () => {
  const someId = randomUUID();
  const start = encodeURIComponent(new Date().toISOString());
  const endpoints: [string, (client: ReturnType<typeof api>) => request.Test][] = [
    ['GET /visits', (client) => client.get('/visits')],
    ['GET /visits/form-options', (client) => client.get('/visits/form-options')],
    ['GET /visits/schedule-conflicts', (client) => client.get(`/visits/schedule-conflicts?start=${start}`)],
    ['GET /visits/:id', (client) => client.get(`/visits/${someId}`)],
    ['GET /visits/:id/events', (client) => client.get(`/visits/${someId}/events`)],
    ['POST /visits', (client) => client.post('/visits').send({})],
    ['PATCH /visits/:id', (client) => client.patch(`/visits/${someId}`).send({})],
    ['POST /visits/:id/completion', (client) => client.post(`/visits/${someId}/completion`).send({})],
    ['PUT /visits/:id/completion', (client) => client.put(`/visits/${someId}/completion`).send({})],
    ['POST /visits/:id/confirmation', (client) => client.post(`/visits/${someId}/confirmation`).send({})],
    ['POST /visits/:id/rescheduling', (client) => client.post(`/visits/${someId}/rescheduling`).send({})],
    ['POST /visits/:id/cancellation', (client) => client.post(`/visits/${someId}/cancellation`).send({})],
    ['GET /agenda', (client) => client.get('/agenda')],
    ['GET /agenda/calendar', (client) => client.get(`/agenda/calendar?from=${start}&to=${start}`)],
    ['GET /interactions', (client) => client.get('/interactions')],
    ['GET /follow-ups', (client) => client.get('/follow-ups')],
    ['GET /follow-ups/trace', (client) => client.get(`/follow-ups/trace?customerId=${someId}`)],
  ];

  it.each(endpoints)('%s: 401 sin token y 403 sin permiso', async (_label, call) => {
    const noPermissions = await crmUser(context, { roleCodes: ['usuario'], countryId: s4 });
    await call(api(context)).expect(401);
    const response = await call(api(context, noPermissions.token)).expect(403);
    expect(response.body).toMatchObject({ code: 'PERMISSION_DENIED', correlationId: expect.any(String) });
  });

  it('modelos de lectura con uno solo de los permisos (@RequireAnyPermission): 200; sin visitas.crear ni visitas.editar, schedule-conflicts 403', async () => {
    const onlyVisits = await crmUser(context, { roleCodes: ['usuario'], countryId: s4, grant: ['visitas.ver'] });
    const onlyActivities = await crmUser(context, { roleCodes: ['usuario'], countryId: s4, grant: ['actividades.ver'] });
    for (const user of [onlyVisits, onlyActivities]) {
      const client = api(context, user.token);
      await client.get('/agenda').expect(200);
      await client.get('/interactions').expect(200);
      await client.get('/follow-ups').expect(200);
    }
    await api(context, onlyVisits.token).get(`/visits/schedule-conflicts?start=${start}`).expect(403);
    const onlyEdit = await crmUser(context, { roleCodes: ['usuario'], countryId: s4, grant: ['visitas.ver', 'visitas.editar'] });
    await api(context, onlyEdit.token).get(`/visits/schedule-conflicts?start=${start}`).expect(200);
  });

  it('id que no es UUID → 400', async () => {
    const user = await asesor();
    await api(context, user.token).get('/visits/no-es-uuid').expect(400);
    await api(context, user.token).post('/visits/no-es-uuid/confirmation').send({}).expect(400);
  });
});

// ---------------------------------------------------------------------------
// PF-04.43 · Visibilidad por alcance
// ---------------------------------------------------------------------------

describe('Visibilidad de visitas por alcance (PF-04.43, AC-04.5, AC-04.59)', () => {
  it('OWN: A no ve (404) ni lista las de B; sí la de un proyecto suyo (herencia DM-13, solo lectura)', async () => {
    const a = await asesor();
    const b = await asesor();
    const customer = await insertCustomer(context.prisma, { salesOwnerId: b.id, countryId: s4 });
    const hidden = await insertVisit(context.prisma, { customerId: customer.id, ownerId: b.id });
    const projectOfA = await insertProject(context.prisma, { customerId: customer.id, ownerId: a.id, countryId: s4 });
    const inherited = await insertVisit(context.prisma, { customerId: customer.id, ownerId: b.id, projectId: projectOfA });
    const client = api(context, a.token);

    await client.get(`/visits/${hidden}`).expect(404);
    await client.get(`/visits/${hidden}/events`).expect(404);
    await client.patch(`/visits/${hidden}`).send({ objective: 'x' }).expect(404);
    await client.post(`/visits/${hidden}/cancellation`).send({ reasonText: 'x' }).expect(404);
    const list = await client.get(`/visits?customerId=${customer.id}`).expect(200);
    expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([inherited]);
    const agenda = await client.get(`/agenda?customerId=${customer.id}`).expect(200);
    expect(agenda.body.data.map((row: { id: string }) => row.id)).toEqual([inherited]);
    const detail = await client.get(`/visits/${inherited}`).expect(200);
    expect(detail.body).toMatchObject({ access: 'INHERITED', allowedActions: [] });
    expect((await client.patch(`/visits/${inherited}`).send({ objective: 'x' }).expect(403)).body.code).toBe('PERMISSION_DENIED');
    // Con el proyecto eliminado deja de heredar.
    await context.prisma.project.update({ where: { id: projectOfA }, data: { deletedAt: new Date() } });
    await client.get(`/visits/${inherited}`).expect(404);
  });

  it('TEAM ve las de su equipo y subequipos; COUNTRY ve las de clientes de su país; ORGANIZATION todas', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: s4 });
    const child = await asesor();
    const parentTeam = await insertTeam(context.prisma, { managerId: manager.id });
    await insertTeam(context.prisma, { parentId: parentTeam, memberIds: [child.id] });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: child.id, countryId: s4 });
    const ofChild = await insertVisit(context.prisma, { customerId: customer.id, ownerId: child.id });
    const managerClient = api(context, manager.token);
    expect((await managerClient.get(`/visits/${ofChild}`).expect(200)).body.access).toBe('DIRECT');

    const countryHead = await crmUser(context, { roleCodes: ['responsable-pais'], countryId: s5 });
    const stranger = await asesor(s5);
    const inS5 = await insertCustomer(context.prisma, { salesOwnerId: stranger.id, countryId: s5 });
    const visitInS5 = await insertVisit(context.prisma, { customerId: inS5.id, ownerId: stranger.id });
    const headClient = api(context, countryHead.token);
    await headClient.get(`/visits/${visitInS5}`).expect(200);
    await headClient.get(`/visits/${ofChild}`).expect(404);
    await managerClient.get(`/visits/${visitInS5}`).expect(404);
    const agenda = await headClient.get(`/agenda?customerId=${inS5.id}`).expect(200);
    expect(agenda.body.data.map((row: { id: string }) => row.id)).toEqual([visitInS5]);

    const admin = await crmUser(context, { roleCodes: ['administrador'], countryId: s4 });
    const adminClient = api(context, admin.token);
    await adminClient.get(`/visits/${ofChild}`).expect(200);
    await adminClient.get(`/visits/${visitInS5}`).expect(200);
  });

  it('roles combinados: asesor + lector ORGANIZATION ve la ajena pero no la edita (403) ni la confirma', async () => {
    const owner = await asesor();
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: s4 });
    const done = await insertVisit(context.prisma, {
      customerId: customer.id,
      ownerId: owner.id,
      statusCode: 'REALIZADA',
      actualStartAt: at(-1),
      resultSummary: 'ok',
    });
    const combined = await crmUser(context, { roleCodes: ['asesor', readerRoleCode], countryId: s4 });
    const client = api(context, combined.token);
    const detail = await client.get(`/visits/${done}`).expect(200);
    expect(detail.body).toMatchObject({ access: 'DIRECT', allowedActions: [] });
    const edit = await client.put(`/visits/${done}/completion`).send({ actualStartAt: at(-1).toISOString() }).expect(403);
    expect(edit.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'visitas.administrar' }] });
    expect((await client.post(`/visits/${done}/confirmation`).send({ confirmationSummary: 'x' }).expect(403)).body.code).toBe(
      'VISIT_CONFIRMATION_OWNER_ONLY',
    );
  });

  it('interacciones y seguimiento aplican el mismo filtro (sin revelar las de otro asesor)', async () => {
    const owner = await asesor();
    const other = await asesor();
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: s4 });
    await insertVisit(context.prisma, { customerId: customer.id, ownerId: owner.id, statusCode: 'REALIZADA', scheduledStartAt: at(-5), actualStartAt: at(-5), resultSummary: 'ok' });
    await insertActivity(context.prisma, { customerId: customer.id, ownerId: owner.id, dueAt: at(5) });
    for (const path of [`/interactions?customerId=${customer.id}`, `/follow-ups?customerId=${customer.id}`, `/agenda?customerId=${customer.id}`]) {
      expect((await api(context, owner.token).get(path).expect(200)).body.data.length).toBeGreaterThan(0);
      expect((await api(context, other.token).get(path).expect(200)).body.data).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// PF-04.44 · Conflictos sin datos fuera del alcance
// ---------------------------------------------------------------------------

describe('GET /visits/schedule-conflicts (PF-04.44)', () => {
  it('una visita del responsable que el actor no ve se informa sin id, código ni cliente', async () => {
    const owner = await asesor();
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: s4 });
    const start = at(48);
    const hidden = await insertVisit(context.prisma, { customerId: customer.id, ownerId: owner.id, scheduledStartAt: start });
    // Planificador: `visitas.administrar` ORGANIZATION (puede asignar a cualquiera) pero solo ve lo suyo (asesor OWN).
    const planner = await crmUser(context, { roleCodes: ['asesor', plannerRoleCode], countryId: s4 });
    const response = await api(context, planner.token)
      .get(`/visits/schedule-conflicts?ownerId=${owner.id}&start=${encodeURIComponent(start.toISOString())}`)
      .expect(200);
    expect(response.body).toEqual({
      mode: 'AVISAR',
      conflicts: [
        { visitId: null, code: null, scheduledStartAt: start.toISOString(), effectiveEndAt: new Date(start.getTime() + HOUR).toISOString(), customerName: null, isVisible: false },
      ],
    });
    expect(JSON.stringify(response.body)).not.toContain(hidden);
    expect(JSON.stringify(response.body)).not.toContain(customer.legalName);

    // Al planificar para ese responsable, la respuesta tampoco revela la visita ajena.
    const ownCustomer = await insertCustomer(context.prisma, { salesOwnerId: planner.id, countryId: s4 });
    const planned = await api(context, planner.token)
      .post('/visits')
      .send({ customerId: ownCustomer.id, ownerId: owner.id, scheduledStartAt: start.toISOString(), objective: 'Para otro' })
      .expect(201);
    expect(planned.body.scheduleConflicts).toEqual([expect.objectContaining({ visitId: null, code: null, customerName: null, isVisible: false })]);
  });

  it('un asesor no consulta la agenda de otro (403) y un responsable no asignable → 422 OWNER_NOT_ELIGIBLE', async () => {
    const a = await asesor();
    const b = await asesor();
    const start = encodeURIComponent(at(10).toISOString());
    await api(context, a.token).get(`/visits/schedule-conflicts?ownerId=${b.id}&start=${start}`).expect(403);
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: s4 });
    const response = await api(context, manager.token).get(`/visits/schedule-conflicts?ownerId=${b.id}&start=${start}`).expect(422);
    expect(response.body.code).toBe('OWNER_NOT_ELIGIBLE');
  });
});

// ---------------------------------------------------------------------------
// PF-04.47 · Integración con 02/03
// ---------------------------------------------------------------------------

describe('CommercialActivityUsageQuery y FK con proyectos (PF-04.47, G.2)', () => {
  it('un proyecto con visita no cambia de cliente (FK onUpdate Restrict) y los conteos de uso son correctos', async () => {
    const owner = await asesor();
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: s4 });
    const other = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: s4 });
    const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: owner.id, countryId: s4 });
    const visitId = await insertVisit(context.prisma, { customerId: customer.id, ownerId: owner.id, projectId });
    await insertVisit(context.prisma, { customerId: customer.id, ownerId: owner.id, projectId, statusCode: 'CANCELADA' });
    await insertActivity(context.prisma, { customerId: customer.id, ownerId: owner.id, projectId });
    await insertActivity(context.prisma, { customerId: customer.id, ownerId: owner.id, projectId, statusCode: 'COMPLETADA' });
    await insertActivity(context.prisma, { customerId: customer.id, ownerId: owner.id, deletedAt: new Date() });

    await expect(context.prisma.project.update({ where: { id: projectId }, data: { customerId: other.id } })).rejects.toThrow();

    const usage = context.app.get<CommercialActivityUsageQuery>(COMMERCIAL_ACTIVITY_USAGE_QUERY);
    expect(await usage.countOpenByProject(projectId)).toEqual({ visits: 1, activities: 1, total: 2 });
    expect(await usage.countOpenByCustomer(customer.id)).toEqual({ visits: 1, activities: 1, total: 2 });
    expect(await usage.countOpenByCustomer(other.id)).toEqual({ visits: 0, activities: 0, total: 0 });

    const contactId = await insertContact(context.prisma, { customerId: customer.id });
    expect(await usage.countByContact(contactId)).toBe(0);
    await context.prisma.interactionParticipant.create({ data: { visitId, customerId: customer.id, contactId, role: 'ATTENDED' } });
    expect(await usage.countByContact(contactId)).toBe(1);
  });
});
