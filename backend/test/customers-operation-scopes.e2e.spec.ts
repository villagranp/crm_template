import { randomUUID } from 'node:crypto';

import { PDF_BYTES } from '@/modules/attachments/testing/attachment-fixtures';

import { api, type CrmUser, crmUser, insertContact, insertCustomer, insertTeam, testCountry } from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Alcance por operación con roles combinados (02 H.2, "Precisiones de
 * implementación"): un rol de solo lectura con alcance amplio (`clientes.ver`
 * ORGANIZATION) no amplía lo que otro rol (manager, TEAM) deja editar,
 * administrar, eliminar ni hacer con los contactos y adjuntos. Cada operación se
 * evalúa con el alcance del permiso que la concede. País propio `Q0`.
 */

let context: TestContext;
let q0: string;
let readerRoleCode: string;

const NO_CAPABILITIES = {
  canEdit: false,
  canDelete: false,
  canRestore: false,
  canManageAttachments: false,
  canManageContacts: false,
  canReassignOwner: false,
  editableFields: [],
};

beforeAll(async () => {
  context = await createTestContext();
  q0 = await testCountry(context.prisma, 'Q0', { name: 'Prueba Cero' });
  // Rol de solo lectura con alcance ORGANIZATION (p. ej. auditoría comercial).
  readerRoleCode = `lector-org-${randomUUID().slice(0, 8)}`;
  const permissions = await context.prisma.permission.findMany({ where: { code: { in: ['clientes.ver', 'contactos.ver'] } } });
  await context.prisma.role.create({
    data: {
      code: readerRoleCode,
      name: 'Lector de clientes (prueba)',
      dataScope: 'ORGANIZATION',
      permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
    },
  });
});

afterAll(async () => {
  await context?.prisma.role.deleteMany({ where: { code: readerRoleCode } });
  await closeTestContext(context);
});

/** Manager TEAM con un miembro, un cliente del miembro y uno de un ajeno al equipo. */
async function teamSetup(roleCodes: string[]): Promise<{ user: CrmUser; foreignId: string; memberCustomerId: string }> {
  const user = await crmUser(context, { roleCodes, countryId: q0 });
  const member = await crmUser(context, { roleCodes: ['asesor'], countryId: q0 });
  const stranger = await crmUser(context, { roleCodes: ['asesor'], countryId: q0 });
  await insertTeam(context.prisma, { managerId: user.id, memberIds: [member.id] });
  const foreign = await insertCustomer(context.prisma, { salesOwnerId: stranger.id, countryId: q0 });
  const ofMember = await insertCustomer(context.prisma, { salesOwnerId: member.id, countryId: q0 });
  return { user, foreignId: foreign.id, memberCustomerId: ofMember.id };
}

describe('Roles combinados: manager TEAM + lector ORGANIZATION', () => {
  it('ve el cliente ajeno (DIRECT) pero no lo edita, administra, elimina ni toca contactos o adjuntos (403)', async () => {
    const { user, foreignId } = await teamSetup(['manager', readerRoleCode]);
    const contactId = await insertContact(context.prisma, { customerId: foreignId });
    const client = api(context, user.token);

    const detail = await client.get(`/customers/${foreignId}`).expect(200);
    expect(detail.body).toMatchObject({ access: 'DIRECT', capabilities: NO_CAPABILITIES });

    const edit = await client.patch(`/customers/${foreignId}`).send({ city: 'Ciudad nueva' }).expect(403);
    expect(edit.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'clientes.administrar' }] });
    await client.patch(`/customers/${foreignId}`).send({ salesOwnerId: user.id }).expect(403);

    const removal = await client.delete(`/customers/${foreignId}`).expect(403);
    expect(removal.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'clientes.eliminar' }] });

    // Contactos (D-02.7): ajeno fuera del alcance de clientes.administrar.
    await client.get(`/customers/${foreignId}/contacts`).expect(200);
    await client.post(`/customers/${foreignId}/contacts`).send({ firstName: 'Nuevo', lastName: 'Contacto' }).expect(403);
    await client.patch(`/customers/${foreignId}/contacts/${contactId}`).send({ jobTitle: 'X' }).expect(403);
    await client.put(`/customers/${foreignId}/primary-contact`).send({ contactId }).expect(403);
    await client.delete(`/customers/${foreignId}/primary-contact`).expect(403);
    await client.delete(`/customers/${foreignId}/contacts/${contactId}`).expect(403);

    // Adjuntos (RN-02.29): como editar el cliente.
    await client.get(`/customers/${foreignId}/attachments`).expect(200);
    await client.post(`/customers/${foreignId}/attachments`).attach('file', PDF_BYTES, 'a.pdf').expect(403);
    await client.delete(`/customers/${foreignId}/attachments/${randomUUID()}`).expect(403);

    const stored = await context.prisma.customer.findUniqueOrThrow({ where: { id: foreignId } });
    expect(stored).toMatchObject({ deletedAt: null, primaryContactId: null });
    expect(stored.city).not.toBe('Ciudad nueva');
    expect(await context.prisma.contact.count({ where: { customerId: foreignId } })).toBe(1);
    expect(await context.prisma.attachment.count({ where: { customerId: foreignId } })).toBe(0);
  });

  it('el cliente de su equipo sí lo administra (control)', async () => {
    const { user, memberCustomerId } = await teamSetup(['manager', readerRoleCode]);
    const client = api(context, user.token);

    const detail = await client.get(`/customers/${memberCustomerId}`).expect(200);
    expect(detail.body.capabilities).toMatchObject({ canEdit: true, canDelete: true, canReassignOwner: true, canManageContacts: true });
    await client.patch(`/customers/${memberCustomerId}`).send({ city: 'Mixco' }).expect(200);
    await client.post(`/customers/${memberCustomerId}/contacts`).send({ firstName: 'Ana', lastName: 'Equipo' }).expect(201);
  });

  it('un eliminado fuera del alcance de clientes.eliminar se ve, pero no se restaura (403)', async () => {
    const { user } = await teamSetup(['manager', readerRoleCode]);
    const stranger = await crmUser(context, { roleCodes: ['asesor'], countryId: q0 });
    const deleted = await insertCustomer(context.prisma, { salesOwnerId: stranger.id, countryId: q0, deletedAt: new Date() });
    const client = api(context, user.token);

    const detail = await client.get(`/customers/${deleted.id}`).expect(200);
    expect(detail.body.capabilities).toMatchObject({ canRestore: false });
    const restore = await client.post(`/customers/${deleted.id}/restore`).expect(403);
    expect(restore.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'clientes.eliminar' }] });
    expect((await context.prisma.customer.findUniqueOrThrow({ where: { id: deleted.id } })).deletedAt).not.toBeNull();
  });

  it('sin el rol de lectura, el mismo cliente queda fuera de todo alcance (404)', async () => {
    const { user, foreignId } = await teamSetup(['manager']);
    const client = api(context, user.token);

    await client.get(`/customers/${foreignId}`).expect(404);
    await client.patch(`/customers/${foreignId}`).send({ city: 'X' }).expect(404);
    await client.delete(`/customers/${foreignId}`).expect(404);
    await client.post(`/customers/${foreignId}/contacts`).send({ firstName: 'Nuevo', lastName: 'Contacto' }).expect(404);
    await client.post(`/customers/${foreignId}/attachments`).attach('file', PDF_BYTES, 'a.pdf').expect(404);
  });
});
