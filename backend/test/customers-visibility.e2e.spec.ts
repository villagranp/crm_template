import { randomUUID } from 'node:crypto';

import {
  api,
  type CrmUser,
  crmUser,
  insertCustomer,
  insertProject,
  insertTeam,
  testCountry,
  uniqueSuffix,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Visibilidad de clientes (02 H.1, RN-02.18, RN-02.19; PF-02.5, 6 y 27):
 * OWN, TEAM con subequipo y responsable de equipo, COUNTRY (con y sin país,
 * D-02.8), ORGANIZATION y herencia por proyecto (DM-13).
 *
 * Los clientes se insertan directamente con una razón social que lleva un sufijo
 * único: cada consulta se acota con `search` y se compara por igualdad.
 */

let context: TestContext;
let q5: string;
let q6: string;

beforeAll(async () => {
  context = await createTestContext();
  q5 = await testCountry(context.prisma, 'Q5', { name: 'Prueba Cinco' });
  q6 = await testCountry(context.prisma, 'Q6', { name: 'Prueba Seis' });
});

afterAll(async () => {
  await closeTestContext(context);
});

async function visibleIds(user: CrmUser, suffix: string): Promise<string[]> {
  const response = await api(context, user.token).get(`/customers?pageSize=100&search=${suffix}`).expect(200);
  return (response.body.data as { id: string }[]).map((item) => item.id).sort();
}

describe('Alcances de visibilidad (PF-02.5)', () => {
  it('OWN, TEAM con subequipo y responsable, COUNTRY y ORGANIZATION sobre el mismo juego de datos', async () => {
    const suffix = uniqueSuffix();
    const name = (label: string): string => `${label} ${suffix}`;

    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: q5 });
    const subManager = await crmUser(context, { roleCodes: ['manager'], countryId: q5 });
    const memberA = await crmUser(context, { roleCodes: ['asesor'], countryId: q5 });
    const memberB = await crmUser(context, { roleCodes: ['asesor'], countryId: q6 });
    const outsider = await crmUser(context, { roleCodes: ['asesor'], countryId: q6 });
    const countryLead = await crmUser(context, { roleCodes: ['responsable-pais'], countryId: q5 });
    const admin = await crmUser(context, { roleCodes: ['administrador'] });

    const parent = await insertTeam(context.prisma, { managerId: manager.id, memberIds: [memberA.id] });
    await insertTeam(context.prisma, { managerId: subManager.id, parentId: parent, memberIds: [memberB.id] });
    const inactiveChild = await insertTeam(context.prisma, { parentId: parent, memberIds: [outsider.id] });
    await context.prisma.team.update({ where: { id: inactiveChild }, data: { isActive: false } });

    const ofManager = await insertCustomer(context.prisma, { salesOwnerId: manager.id, countryId: q6, legalName: name('Del manager') });
    const ofMemberA = await insertCustomer(context.prisma, { salesOwnerId: memberA.id, countryId: q5, legalName: name('Del miembro A') });
    const ofMemberB = await insertCustomer(context.prisma, { salesOwnerId: memberB.id, countryId: q6, legalName: name('Del miembro B') });
    const ofSubManager = await insertCustomer(context.prisma, { salesOwnerId: subManager.id, countryId: q6, legalName: name('Del submanager') });
    const ofOutsiderQ5 = await insertCustomer(context.prisma, { salesOwnerId: outsider.id, countryId: q5, legalName: name('Ajeno en Q5') });
    const ofOutsiderQ6 = await insertCustomer(context.prisma, { salesOwnerId: outsider.id, countryId: q6, legalName: name('Ajeno en Q6') });
    const all = [ofManager, ofMemberA, ofMemberB, ofSubManager, ofOutsiderQ5, ofOutsiderQ6].map((customer) => customer.id);

    // OWN: solo lo propio.
    expect(await visibleIds(memberA, suffix)).toEqual([ofMemberA.id]);
    // TEAM: propios + miembros y responsables del equipo y de sus subequipos activos.
    expect(await visibleIds(manager, suffix)).toEqual([ofManager.id, ofMemberA.id, ofMemberB.id, ofSubManager.id].sort());
    // El responsable del subequipo ve su subequipo, no el equipo padre.
    expect(await visibleIds(subManager, suffix)).toEqual([ofMemberB.id, ofSubManager.id].sort());
    // COUNTRY: los clientes de su país (y los propios).
    expect(await visibleIds(countryLead, suffix)).toEqual([ofMemberA.id, ofOutsiderQ5.id].sort());
    // ORGANIZATION: todo.
    expect(await visibleIds(admin, suffix)).toEqual([...all].sort());

    const listed = await api(context, manager.token).get(`/customers?search=${suffix}`).expect(200);
    expect(listed.body.data.every((item: { access: string }) => item.access === 'DIRECT')).toBe(true);
  });

  it('COUNTRY sin país se degrada a OWN (D-02.8)', async () => {
    const suffix = uniqueSuffix();
    const lead = await crmUser(context, { roleCodes: ['responsable-pais'], countryId: null });
    const other = await crmUser(context, { roleCodes: ['asesor'], countryId: q5 });
    const own = await insertCustomer(context.prisma, { salesOwnerId: lead.id, countryId: q5, legalName: `Propio ${suffix}` });
    await insertCustomer(context.prisma, { salesOwnerId: other.id, countryId: q5, legalName: `Ajeno ${suffix}` });

    expect(await visibleIds(lead, suffix)).toEqual([own.id]);
  });
});

describe('Herencia por proyecto (PF-02.6)', () => {
  it('visible con access INHERITED mientras el usuario ve un proyecto no eliminado del cliente', async () => {
    const suffix = uniqueSuffix();
    const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: q5 });
    const projectOwner = await crmUser(context, { roleCodes: ['asesor'], countryId: q5 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: q5, legalName: `Heredado ${suffix}` });
    const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: projectOwner.id, countryId: q5 });

    const listed = await api(context, projectOwner.token).get(`/customers?search=${suffix}`).expect(200);
    expect(listed.body.data).toEqual([expect.objectContaining({ id: customer.id, access: 'INHERITED' })]);
    const detail = await api(context, projectOwner.token).get(`/customers/${customer.id}`).expect(200);
    expect(detail.body).toMatchObject({ access: 'INHERITED', capabilities: { canEdit: false, editableFields: [] } });

    await context.prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } });
    expect(await visibleIds(projectOwner, suffix)).toEqual([]);
    await api(context, projectOwner.token).get(`/customers/${customer.id}`).expect(404);
  });

  it('la herencia sigue el alcance de proyectos.ver: sin ese permiso no se hereda (DM-13)', async () => {
    const suffix = uniqueSuffix();
    const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: q5 });
    const projectOwner = await crmUser(context, { roleCodes: ['asesor'], countryId: q5, deny: ['proyectos.ver'] });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: q5, legalName: `Sin herencia ${suffix}` });
    await insertProject(context.prisma, { customerId: customer.id, ownerId: projectOwner.id, countryId: q5 });

    expect(await visibleIds(projectOwner, suffix)).toEqual([]);
  });

  it('un manager hereda por los proyectos de su equipo', async () => {
    const suffix = uniqueSuffix();
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: q5 });
    const member = await crmUser(context, { roleCodes: ['asesor'], countryId: q5 });
    const stranger = await crmUser(context, { roleCodes: ['asesor'], countryId: q6 });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id] });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: stranger.id, countryId: q6, legalName: `Por equipo ${suffix}` });
    await insertProject(context.prisma, { customerId: customer.id, ownerId: member.id, countryId: q6 });

    const listed = await api(context, manager.token).get(`/customers?search=${suffix}`).expect(200);
    expect(listed.body.data).toEqual([expect.objectContaining({ id: customer.id, access: 'INHERITED' })]);
    // Heredado = solo lectura, también para quien tiene clientes.administrar (D-02.9).
    await api(context, manager.token).patch(`/customers/${customer.id}`).send({ city: 'X' }).expect(403);
    await api(context, manager.token).delete(`/customers/${customer.id}`).expect(403);
  });
});

describe('404 sin distinguir el motivo (PF-02.27)', () => {
  it('inexistente, fuera de alcance y eliminado (sin clientes.eliminar) devuelven el mismo 404', async () => {
    const seller = await crmUser(context, { roleCodes: ['asesor'], countryId: q5 });
    const other = await crmUser(context, { roleCodes: ['asesor'], countryId: q5 });
    const foreign = await insertCustomer(context.prisma, { salesOwnerId: other.id, countryId: q5 });
    const deleted = await insertCustomer(context.prisma, { salesOwnerId: seller.id, countryId: q5, deletedAt: new Date() });
    const client = api(context, seller.token);

    const bodies = [];
    for (const id of [randomUUID(), foreign.id, deleted.id]) {
      const response = await client.get(`/customers/${id}`).expect(404);
      bodies.push({ code: response.body.code, message: response.body.message });
    }
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    expect(bodies[0]).toEqual({ code: 'RESOURCE_NOT_FOUND', message: 'Customer not found' });

    // Las rutas hijas aplican la misma visibilidad.
    await client.get(`/customers/${foreign.id}/contacts`).expect(404);
    await client.get(`/customers/${foreign.id}/attachments`).expect(404);
    await client.get('/customers/no-es-uuid').expect(400);
  });
});
