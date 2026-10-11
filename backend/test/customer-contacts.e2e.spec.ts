import { randomUUID } from 'node:crypto';

import { CustomerReferenceGuard } from '@/modules/customers/customer-reference.guard';

import {
  api,
  type CrmUser,
  crmUser,
  insertActivity,
  insertContact,
  insertCustomer,
  insertParticipant,
  insertProject,
  testCountry,
  uniqueSuffix,
  withParameter,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Contactos del cliente y contacto principal (02 F9–F16; PF-02.40–48).
 * Países propios `Q4` (sin patrones) y `Q8` (con patrón de teléfono).
 */

let context: TestContext;
let q4: string;
let q8: string;

const CONTACT_RULES = 'crm.contactos.reglas_duplicidad';

beforeAll(async () => {
  context = await createTestContext();
  q4 = await testCountry(context.prisma, 'Q4', { name: 'Prueba Cuatro' });
  q8 = await testCountry(context.prisma, 'Q8', { name: 'Prueba Ocho', phonePattern: '\\+503 \\d{4}-\\d{4}' });
});

afterAll(async () => {
  await closeTestContext(context);
});

async function ownerWithCustomer(country = q4): Promise<{ owner: CrmUser; customerId: string }> {
  const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: country });
  const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: country });
  return { owner, customerId: customer.id };
}

function contactBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const suffix = uniqueSuffix();
  return {
    firstName: `Ana${suffix}`,
    lastName: 'López',
    jobTitle: 'Gerente de compras',
    phone: '+502 5555 0000',
    email: `ana-${suffix.toLowerCase()}@empresa.example`,
    ...overrides,
  };
}

async function auditFor(event: string, resourceId: string) {
  return context.prisma.auditLog.findMany({ where: { event, resourceId }, orderBy: { occurredAt: 'asc' } });
}

describe('Autenticación y permisos', () => {
  it('401 sin token y 403 sin el permiso en F9–F16', async () => {
    const customerId = randomUUID();
    const contactId = randomUUID();
    const routes = (client: ReturnType<typeof api>) => [
      () => client.get(`/customers/${customerId}/contacts`),
      () => client.get(`/customers/${customerId}/contacts/${contactId}`),
      () => client.post(`/customers/${customerId}/contacts`).send(contactBody()),
      () => client.patch(`/customers/${customerId}/contacts/${contactId}`).send({ jobTitle: 'X' }),
      () => client.put(`/customers/${customerId}/primary-contact`).send({ contactId }),
      () => client.delete(`/customers/${customerId}/primary-contact`),
      () => client.delete(`/customers/${customerId}/contacts/${contactId}`),
      () => client.post(`/customers/${customerId}/contacts/${contactId}/restore`),
    ];
    for (const call of routes(api(context))) {
      await call().expect(401);
    }
    const plain = await crmUser(context, { roleCodes: ['usuario'] });
    for (const call of routes(api(context, plain.token))) {
      await call().expect(403);
    }
    // El asesor no tiene contactos.eliminar.
    const seller = await crmUser(context, { roleCodes: ['asesor'] });
    await api(context, seller.token).delete(`/customers/${customerId}/contacts/${contactId}`).expect(403);
    await api(context, seller.token).post(`/customers/${customerId}/contacts/${contactId}/restore`).expect(403);
  });
});

describe('F11 · Alta (PF-02.40–43)', () => {
  it('201 con customerId de la ruta, activo por defecto y auditoría enmascarada (PF-02.40)', async () => {
    const { owner, customerId } = await ownerWithCustomer();
    const body = contactBody();
    const response = await api(context, owner.token).post(`/customers/${customerId}/contacts`).send(body).expect(201);

    expect(response.headers['location']).toBe(`/api/v1/customers/${customerId}/contacts/${response.body.id}`);
    expect(response.body).toMatchObject({
      customerId,
      firstName: body['firstName'],
      fullName: `${body['firstName']} López`,
      isActive: true,
      isPrimary: false,
      hasHistory: false,
      isDeleted: false,
    });
    const [event] = await auditFor('crm.contact.created', response.body.id);
    expect(event).toMatchObject({ resourceType: 'crm.contact', metadata: { customerId } });
    const changes = event?.changes as Record<string, { before: unknown; after: unknown }>;
    expect(changes['firstName']).toEqual({ before: null, after: 'A***' });
    expect(changes['lastName']).toEqual({ before: null, after: 'L***' });
    expect(changes['email']?.after).toBe('a***@e***.example');
    expect(changes['phone']?.after).toBe('+***');
    expect(changes['jobTitle']).toEqual({ before: null, after: 'Gerente de compras' });
    expect(JSON.stringify(event)).not.toContain(String(body['email']));
  });

  it('cliente inexistente, eliminado o fuera de alcance → 404; customerId en el cuerpo → 400 (PF-02.41)', async () => {
    const { owner, customerId } = await ownerWithCustomer();
    const other = await crmUser(context, { roleCodes: ['asesor'], countryId: q4 });
    const foreign = await insertCustomer(context.prisma, { salesOwnerId: other.id, countryId: q4 });
    const deleted = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: q4, deletedAt: new Date() });
    const client = api(context, owner.token);

    for (const id of [randomUUID(), foreign.id, deleted.id]) {
      await client.post(`/customers/${id}/contacts`).send(contactBody()).expect(404);
      await client.get(`/customers/${id}/contacts`).expect(404);
    }
    const withCustomer = await client.post(`/customers/${customerId}/contacts`).send(contactBody({ customerId: foreign.id })).expect(400);
    expect(withCustomer.body.code).toBe('VALIDATION_FAILED');
  });

  it('correo inválido 400; teléfono contra el patrón del país del cliente 422, al crear y al editar (PF-02.42)', async () => {
    const { owner, customerId } = await ownerWithCustomer(q8);
    const client = api(context, owner.token);
    await client.post(`/customers/${customerId}/contacts`).send(contactBody({ email: 'no-valido' })).expect(400);

    const phone = await client.post(`/customers/${customerId}/contacts`).send(contactBody({ phone: '+502 5555 0000' })).expect(422);
    expect(phone.body).toMatchObject({ code: 'INVALID_PHONE_FORMAT', details: [expect.objectContaining({ field: 'phone' })] });

    const created = await client.post(`/customers/${customerId}/contacts`).send(contactBody({ phone: '+503 5555-0000' })).expect(201);
    await client.patch(`/customers/${customerId}/contacts/${created.body.id}`).send({ phone: '5555' }).expect(422);
  });

  it('correo repetido (otras mayúsculas) 409; en otro cliente 201; nombre completo AVISAR → confirmar; BLOQUEAR (PF-02.43)', async () => {
    const { owner, customerId } = await ownerWithCustomer();
    const otherCustomer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: q4 });
    const client = api(context, owner.token);
    const suffix = uniqueSuffix().toLowerCase();
    const first = await client
      .post(`/customers/${customerId}/contacts`)
      .send(contactBody({ firstName: 'Ana', lastName: `López ${suffix}`, email: `ana.${suffix}@empresa.example` }))
      .expect(201);

    const taken = await client
      .post(`/customers/${customerId}/contacts`)
      .send(contactBody({ email: `ANA.${suffix.toUpperCase()}@empresa.example` }))
      .expect(409);
    expect(taken.body).toMatchObject({ code: 'CONTACT_EMAIL_TAKEN', details: [{ field: 'email', contactId: first.body.id, isDeleted: false }] });
    await client.post(`/customers/${otherCustomer.id}/contacts`).send(contactBody({ email: `ana.${suffix}@empresa.example` })).expect(201);

    const warned = await client.post(`/customers/${customerId}/contacts`).send(contactBody({ firstName: 'ANA', lastName: `lopez  ${suffix}` })).expect(409);
    expect(warned.body).toMatchObject({
      code: 'POSSIBLE_DUPLICATE',
      details: [
        {
          rule: 'nombreCompleto',
          reason: 'FULL_NAME',
          candidate: { id: first.body.id, fullName: `Ana López ${suffix}`, jobTitle: 'Gerente de compras', isDeleted: false },
        },
      ],
    });
    await client
      .post(`/customers/${customerId}/contacts`)
      .send(contactBody({ firstName: 'ANA', lastName: `lopez  ${suffix}`, acknowledgedDuplicateIds: [first.body.id] }))
      .expect(201);

    await withParameter(context.prisma, CONTACT_RULES, '{"correo":"BLOQUEAR","nombreCompleto":"BLOQUEAR","telefono":"AVISAR"}', async () => {
      const blocked = await client.post(`/customers/${customerId}/contacts`).send(contactBody({ firstName: 'Ana', lastName: `López ${suffix}` })).expect(409);
      expect(blocked.body.code).toBe('DUPLICATE_BLOCKED');
      const phone = await client.post(`/customers/${customerId}/contacts`).send(contactBody({ phone: '(502) 5555-0000' })).expect(409);
      expect(phone.body.details[0]).toMatchObject({ rule: 'telefono', reason: 'PHONE' });
    });
  });
});

describe('Contacto principal (PF-02.44)', () => {
  it('cambio de principal, inactivo 422, desactivar o eliminar lo limpia, contacto de otro cliente 404, FK compuesta', async () => {
    const lead = await crmUser(context, { roleCodes: ['responsable-pais'], countryId: q4 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: lead.id, countryId: q4 });
    const otherCustomer = await insertCustomer(context.prisma, { salesOwnerId: lead.id, countryId: q4 });
    const client = api(context, lead.token);

    const p1 = await client.post(`/customers/${customer.id}/contacts`).send(contactBody({ isPrimary: true })).expect(201);
    expect(p1.body.isPrimary).toBe(true);
    const p2 = await client.post(`/customers/${customer.id}/contacts`).send(contactBody()).expect(201);
    const inactive = await client.post(`/customers/${customer.id}/contacts`).send(contactBody({ isActive: false })).expect(201);
    const foreign = await insertContact(context.prisma, { customerId: otherCustomer.id });

    const changed = await client.put(`/customers/${customer.id}/primary-contact`).send({ contactId: p2.body.id }).expect(200);
    expect(changed.body).toEqual({ primaryContact: { id: p2.body.id, fullName: p2.body.fullName } });
    const list = await client.get(`/customers/${customer.id}/contacts`).expect(200);
    expect(list.body.data.filter((contact: { isPrimary: boolean }) => contact.isPrimary).map((contact: { id: string }) => contact.id)).toEqual([p2.body.id]);
    const detail = await client.get(`/customers/${customer.id}`).expect(200);
    expect(detail.body.primaryContact).toEqual({ id: p2.body.id, fullName: p2.body.fullName });
    const [event] = await auditFor('crm.customer.primary_contact_changed', customer.id).then((rows) => rows.slice(-1));
    expect(event?.changes).toEqual({ primaryContactId: { before: p1.body.id, after: p2.body.id } });

    const rejected = await client.put(`/customers/${customer.id}/primary-contact`).send({ contactId: inactive.body.id }).expect(422);
    expect(rejected.body.code).toBe('CONTACT_INACTIVE');
    await client.put(`/customers/${customer.id}/primary-contact`).send({ contactId: foreign }).expect(404);
    await client.post(`/customers/${customer.id}/contacts`).send(contactBody({ isActive: false, isPrimary: true })).expect(422);

    // Desactivar el principal lo limpia en la misma operación.
    await client.patch(`/customers/${customer.id}/contacts/${p2.body.id}`).send({ isActive: false }).expect(200);
    expect((await context.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).primaryContactId).toBeNull();
    expect(await auditFor('crm.contact.deactivated', p2.body.id)).toHaveLength(1);

    // Eliminar el principal también.
    await client.put(`/customers/${customer.id}/primary-contact`).send({ contactId: p1.body.id }).expect(200);
    await client.delete(`/customers/${customer.id}/contacts/${p1.body.id}`).expect(204);
    expect((await context.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).primaryContactId).toBeNull();

    // Quitar el principal (F14).
    const p3 = await client.post(`/customers/${customer.id}/contacts`).send(contactBody({ isPrimary: true })).expect(201);
    await client.delete(`/customers/${customer.id}/primary-contact`).expect(204);
    expect((await context.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).primaryContactId).toBeNull();
    expect(p3.body.isPrimary).toBe(true);

    // La FK compuesta rechaza apuntar a un contacto de otro cliente aunque se salte la API.
    await expect(
      context.prisma.customer.update({ where: { id: customer.id }, data: { primaryContactId: foreign } }),
    ).rejects.toThrow();
  });
});

describe('F9/F12 · Lista y edición (PF-02.45, PF-02.46)', () => {
  it('por defecto activos; filtros, búsqueda, isPrimary y hasHistory; sin contactos.ver 403', async () => {
    const { owner, customerId } = await ownerWithCustomer();
    const client = api(context, owner.token);
    const active = await client.post(`/customers/${customerId}/contacts`).send(contactBody({ lastName: 'Zamora', jobTitle: 'Arquitecta', isPrimary: true })).expect(201);
    const inactive = await client.post(`/customers/${customerId}/contacts`).send(contactBody({ lastName: 'Alvarado', isActive: false })).expect(201);
    const withHistory = await client.post(`/customers/${customerId}/contacts`).send(contactBody({ lastName: 'Méndez' })).expect(201);
    const activityId = await insertActivity(context.prisma, { customerId, ownerId: owner.id });
    await insertParticipant(context.prisma, { activityId, customerId, contactId: withHistory.body.id });

    const ids = async (query: string) =>
      (await client.get(`/customers/${customerId}/contacts?${query}`).expect(200)).body.data.map((contact: { id: string }) => contact.id);
    expect(await ids('')).toEqual([withHistory.body.id, active.body.id]);
    expect(await ids('status=INACTIVE')).toEqual([inactive.body.id]);
    expect(await ids('status=ALL')).toEqual([inactive.body.id, withHistory.body.id, active.body.id]);
    expect(await ids('status=ALL&sortBy=lastName&sortOrder=desc')).toEqual([active.body.id, withHistory.body.id, inactive.body.id]);
    expect(await ids('search=arquitecta')).toEqual([active.body.id]);
    expect(await ids(`search=${String(active.body.email).slice(0, 10)}`)).toEqual([active.body.id]);
    await client.get(`/customers/${customerId}/contacts?sortBy=email`).expect(400);
    await client.get(`/customers/${customerId}/contacts?status=DELETED`).expect(400);

    const all = (await client.get(`/customers/${customerId}/contacts?status=ALL`).expect(200)).body.data as { id: string; isPrimary: boolean; hasHistory: boolean }[];
    expect(all.find((contact) => contact.id === active.body.id)).toMatchObject({ isPrimary: true, hasHistory: false });
    expect(all.find((contact) => contact.id === withHistory.body.id)).toMatchObject({ isPrimary: false, hasHistory: true });

    const single = await client.get(`/customers/${customerId}/contacts/${active.body.id}`).expect(200);
    expect(single.body.id).toBe(active.body.id);

    const noContacts = await crmUser(context, { roleCodes: ['asesor'], countryId: q4, deny: ['contactos.ver'] });
    const ownCustomer = await insertCustomer(context.prisma, { salesOwnerId: noContacts.id, countryId: q4 });
    const primary = await insertContact(context.prisma, { customerId: ownCustomer.id });
    await context.prisma.customer.update({ where: { id: ownCustomer.id }, data: { primaryContactId: primary } });
    await api(context, noContacts.token).get(`/customers/${ownCustomer.id}/contacts`).expect(403);
    const detail = await api(context, noContacts.token).get(`/customers/${ownCustomer.id}`).expect(200);
    expect(detail.body.primaryContact).toBeNull();
  });

  it('editar contacto de cliente propio 200 con diferencias enmascaradas; ajeno o heredado 403', async () => {
    const { owner, customerId } = await ownerWithCustomer();
    const client = api(context, owner.token);
    const created = await client.post(`/customers/${customerId}/contacts`).send(contactBody()).expect(201);

    const edited = await client
      .patch(`/customers/${customerId}/contacts/${created.body.id}`)
      .send({ lastName: 'Pérez', jobTitle: null, comments: 'Prefiere correo' })
      .expect(200);
    expect(edited.body).toMatchObject({ lastName: 'Pérez', jobTitle: null, comments: 'Prefiere correo' });
    const [event] = await auditFor('crm.contact.updated', created.body.id);
    expect(event?.changes).toEqual({
      lastName: { before: 'L***', after: 'P***' },
      jobTitle: { before: 'Gerente de compras', after: null },
      // Texto libre que puede contener datos personales: enmascarado como el resto (DM-29).
      comments: { before: null, after: 'P***' },
    });
    await client.patch(`/customers/${customerId}/contacts/${created.body.id}`).send({ isPrimary: true }).expect(400);

    const inheritor = await crmUser(context, { roleCodes: ['asesor'], countryId: q4 });
    await insertProject(context.prisma, { customerId, ownerId: inheritor.id, countryId: q4 });
    await api(context, inheritor.token).get(`/customers/${customerId}/contacts`).expect(200);
    await api(context, inheritor.token).patch(`/customers/${customerId}/contacts/${created.body.id}`).send({ jobTitle: 'X' }).expect(403);
    await api(context, inheritor.token).post(`/customers/${customerId}/contacts`).send(contactBody()).expect(403);

    const sameCountry = await crmUser(context, { roleCodes: ['asesor'], countryId: q4 });
    await api(context, sameCountry.token).patch(`/customers/${customerId}/contacts/${created.body.id}`).send({ jobTitle: 'X' }).expect(404);
  });
});

describe('F15/F16 · Eliminación y restauración (PF-02.47)', () => {
  it('sin historia 204 y deja de listarse; con participación 409 y desactivar sí; restaurar; eliminados con deleted=true', async () => {
    const lead = await crmUser(context, { roleCodes: ['responsable-pais'], countryId: q4 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: lead.id, countryId: q4 });
    const client = api(context, lead.token);
    const plain = await client.post(`/customers/${customer.id}/contacts`).send(contactBody()).expect(201);
    const historic = await client.post(`/customers/${customer.id}/contacts`).send(contactBody()).expect(201);
    const activityId = await insertActivity(context.prisma, { customerId: customer.id, ownerId: lead.id });
    await insertParticipant(context.prisma, { activityId, customerId: customer.id, contactId: historic.body.id });

    await client.post(`/customers/${customer.id}/contacts/${plain.body.id}/restore`).expect(409);
    await client.delete(`/customers/${customer.id}/contacts/${plain.body.id}`).expect(204);
    const listed = (await client.get(`/customers/${customer.id}/contacts?status=ALL`).expect(200)).body.data.map((contact: { id: string }) => contact.id);
    expect(listed).not.toContain(plain.body.id);
    expect((await context.prisma.contact.findUniqueOrThrow({ where: { id: plain.body.id } })).deletedAt).not.toBeNull();
    await client.get(`/customers/${customer.id}/contacts/${plain.body.id}`).expect(404);

    const deletedList = await client.get(`/customers/${customer.id}/contacts?deleted=true&status=ALL`).expect(200);
    expect(deletedList.body.data).toEqual([expect.objectContaining({ id: plain.body.id, isDeleted: true })]);
    const seller = await crmUser(context, { roleCodes: ['asesor'], countryId: q4 });
    const sellerCustomer = await insertCustomer(context.prisma, { salesOwnerId: seller.id, countryId: q4 });
    await api(context, seller.token).get(`/customers/${sellerCustomer.id}/contacts?deleted=true`).expect(403);

    // El correo sigue ocupado por el eliminado (RN-02.28).
    const taken = await client.post(`/customers/${customer.id}/contacts`).send(contactBody({ email: plain.body.email })).expect(409);
    expect(taken.body.details[0]).toMatchObject({ contactId: plain.body.id, isDeleted: true });

    const blocked = await client.delete(`/customers/${customer.id}/contacts/${historic.body.id}`).expect(409);
    expect(blocked.body.code).toBe('CONTACT_HAS_HISTORY');
    await client.patch(`/customers/${customer.id}/contacts/${historic.body.id}`).send({ isActive: false }).expect(200);

    const restored = await client.post(`/customers/${customer.id}/contacts/${plain.body.id}/restore`).expect(200);
    expect(restored.body).toMatchObject({ id: plain.body.id, isDeleted: false });
    expect(await auditFor('crm.contact.deleted', plain.body.id)).toHaveLength(1);
    expect(await auditFor('crm.contact.restored', plain.body.id)).toHaveLength(1);
  });
});

describe('Guardas para otros módulos (PF-02.48)', () => {
  it('assertContactOfCustomer acepta solo contactos no eliminados del cliente (y activos si se pide)', async () => {
    const { customerId } = await ownerWithCustomer();
    const other = await ownerWithCustomer();
    const active = await insertContact(context.prisma, { customerId });
    const inactive = await insertContact(context.prisma, { customerId, isActive: false });
    const deleted = await insertContact(context.prisma, { customerId });
    await context.prisma.contact.update({ where: { id: deleted }, data: { deletedAt: new Date() } });
    const foreign = await insertContact(context.prisma, { customerId: other.customerId });
    const guard = context.app.get(CustomerReferenceGuard);

    await expect(guard.assertContactOfCustomer(active, customerId, { requireActive: true })).resolves.toMatchObject({ id: active, customerId, isActive: true });
    await expect(guard.assertContactOfCustomer(inactive, customerId, { requireActive: true })).rejects.toMatchObject({ code: 'CONTACT_INACTIVE' });
    await expect(guard.assertContactOfCustomer(inactive, customerId, { requireActive: false })).resolves.toMatchObject({ isActive: false });
    await expect(guard.assertContactOfCustomer(deleted, customerId, { requireActive: false })).rejects.toMatchObject({ code: 'INVALID_CONTACT' });
    await expect(guard.assertContactOfCustomer(foreign, customerId, { requireActive: false })).rejects.toMatchObject({ code: 'INVALID_CONTACT' });
  });
});
