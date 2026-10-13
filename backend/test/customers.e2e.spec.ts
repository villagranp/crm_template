import { randomUUID } from 'node:crypto';

import { CustomerReferenceGuard } from '@/modules/customers/customer-reference.guard';
import { CustomerActorResolver } from '@/modules/customers/customer-actor.resolver';

import {
  api,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertActivity,
  insertContact,
  insertCustomer,
  insertProject,
  insertVisit,
  testCountry,
  uniqueSuffix,
  withParameter,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 2 · Clientes, F1–F8 (02 L.4: PF-02.1–4, 7–8, 12–23, 26–33, 50, 58, 59,
 * 61; y PF-02.19, que vive aquí porque depende de las reglas de duplicidad que
 * este archivo modifica y restaura).
 *
 * Aislamiento: cada prueba usa usuarios nuevos y países de prueba propios (`Q1`,
 * `Q2`, `Q3`) que no usa ninguna otra suite. Un asesor nuevo (alcance OWN) solo
 * ve sus propios clientes, así que sus listas se comparan por igualdad.
 * Los parámetros que se cambian se restauran siempre (`withParameter`).
 */

let context: TestContext;
let q1: string;
let q2: string;
let q3: string;

const DUPLICATE_RULES = 'crm.clientes.reglas_duplicidad';
const CODE_UNIQUENESS = 'crm.clientes.unicidad_codigo';
const REQUIRED_FIELDS = 'crm.campos_obligatorios';

function randomTaxId(): string {
  return String(Math.floor(100_000_000 + Math.random() * 899_999_999));
}

/** Alta válida y completa (todos los opcionales informados con valores únicos). */
function validCustomer(country: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const suffix = uniqueSuffix();
  return {
    legalName: `Cliente ${suffix} S.A.`,
    tradeName: `Comercial ${suffix}`,
    taxId: randomTaxId(),
    countryId: country,
    city: 'Ciudad de prueba',
    address: 'Avenida 1, zona 1',
    phone: '+502 2222 3333',
    email: `empresa-${suffix.toLowerCase()}@example.com`,
    ...overrides,
  };
}

async function advisor(country = q1): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['asesor'], countryId: country });
}

async function countryLead(country = q1): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['responsable-pais'], countryId: country });
}

function createViaApi(user: CrmUser, body: Record<string, unknown>) {
  return api(context, user.token).post('/customers').send(body);
}

async function audit(event: string, resourceId: string) {
  return context.prisma.auditLog.findMany({ where: { event, resourceId }, orderBy: { occurredAt: 'asc' } });
}

beforeAll(async () => {
  context = await createTestContext();
  q1 = await testCountry(context.prisma, 'Q1', { name: 'Prueba Uno' });
  q2 = await testCountry(context.prisma, 'Q2', { name: 'Prueba Dos', phonePattern: '\\+502 \\d{4}-\\d{4}', taxIdPattern: '\\d{6}[0-9K]' });
  q3 = await testCountry(context.prisma, 'Q3', { name: 'Prueba Tres' });
});

afterAll(async () => {
  await closeTestContext(context);
});

describe('Autenticación y permisos (PF-02.8)', () => {
  it('401 sin token en F1–F8', async () => {
    const id = randomUUID();
    const anonymous = api(context);
    await anonymous.get('/customers').expect(401);
    await anonymous.get('/customers/form-options').expect(401);
    await anonymous.get('/customers/sales-owner-options').expect(401);
    await anonymous.get(`/customers/${id}`).expect(401);
    await anonymous.post('/customers').send({}).expect(401);
    await anonymous.patch(`/customers/${id}`).send({}).expect(401);
    await anonymous.delete(`/customers/${id}`).expect(401);
    await anonymous.post(`/customers/${id}/restore`).expect(401);
  });

  it('403 sin el permiso de cada endpoint', async () => {
    const id = randomUUID();
    const plain = await crmUser(context, { roleCodes: ['usuario'] });
    const noPermission = api(context, plain.token);
    await noPermission.get('/customers').expect(403);
    await noPermission.get('/customers/form-options').expect(403);
    await noPermission.get('/customers/sales-owner-options').expect(403);
    await noPermission.get(`/customers/${id}`).expect(403);
    await noPermission.post('/customers').send(validCustomer(q1)).expect(403);
    await noPermission.patch(`/customers/${id}`).send({ city: 'X' }).expect(403);

    const seller = await advisor();
    await api(context, seller.token).delete(`/customers/${id}`).expect(403);
    await api(context, seller.token).post(`/customers/${id}/restore`).expect(403);
  });

  it('la opción "Clientes" llega al menú de quien tiene clientes.ver (PF-02.51)', async () => {
    const seller = await advisor();
    const menu = await api(context, seller.token).get('/me/menu').expect(200);
    const customersModule = (menu.body as { key: string; icon: string; options: { key: string; path: string }[] }[]).find(
      (module) => module.key === 'clientes',
    );
    expect(customersModule).toMatchObject({ icon: 'business' });
    expect(customersModule?.options).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'clientes-buscar', path: '/clientes' })]));

    const plain = await crmUser(context, { roleCodes: ['usuario'] });
    const plainMenu = await api(context, plain.token).get('/me/menu').expect(200);
    expect((plainMenu.body as { key: string }[]).map((module) => module.key)).not.toContain('clientes');
  });
});

describe('F1 · Búsqueda', () => {
  it('asesor: solo sus clientes, razón social ascendente, 20 por página (PF-02.1)', async () => {
    const seller = await advisor();
    const other = await advisor();
    const suffix = uniqueSuffix();
    for (const name of ['Bravo', 'alfa', 'Charlie']) {
      await insertCustomer(context.prisma, { salesOwnerId: seller.id, countryId: q1, legalName: `${name} ${suffix}` });
    }
    await insertCustomer(context.prisma, { salesOwnerId: other.id, countryId: q1, legalName: `Ajeno ${suffix}` });

    const response = await api(context, seller.token).get('/customers').expect(200);
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
    expect(response.body.data.map((item: { legalName: string }) => item.legalName)).toEqual([
      `alfa ${suffix}`,
      `Bravo ${suffix}`,
      `Charlie ${suffix}`,
    ]);
    expect(response.body.data[0]).toMatchObject({
      crmCode: expect.any(String),
      country: { id: q1, isoCode: 'Q1', name: 'Prueba Uno' },
      status: { code: 'ACTIVO', isActive: true },
      salesOwner: { id: seller.id },
      access: 'DIRECT',
      isDeleted: false,
    });
    expect(response.body.data[0]).not.toHaveProperty('taxIdNormalized');
  });

  it('cada filtro aislado y los siete combinados (PF-02.2)', async () => {
    const lead = await countryLead(q3);
    const seller = await crmUser(context, { roleCodes: ['asesor'], countryId: q3 });
    const suffix = uniqueSuffix();
    const target = await createViaApi(
      lead,
      validCustomer(q3, { customerCode: `F${suffix}`, legalName: `Objetivo ${suffix}`, city: 'Quetzaltenango', salesOwnerId: seller.id }),
    ).expect(201);
    await createViaApi(lead, validCustomer(q3, { legalName: `Otro ${suffix}`, city: 'Antigua' })).expect(201);
    const inactive = await catalogItemId(context.prisma, 'crm.estado_cliente', 'INACTIVO');
    const prospect = await catalogItemId(context.prisma, 'crm.estado_cliente', 'PROSPECTO');

    const client = api(context, lead.token);
    const ids = async (query: string): Promise<string[]> =>
      (await client.get(`/customers?pageSize=100&${query}`).expect(200)).body.data.map((item: { id: string }) => item.id);

    expect(await ids(`customerCode=f${suffix.toLowerCase()}`)).toEqual([target.body.id]);
    expect(await ids(`crmCode=${target.body.crmCode.toLowerCase()}`)).toEqual([target.body.id]);
    expect(await ids(`legalName=objetivo%20${suffix}`)).toEqual([target.body.id]);
    expect(await ids(`countryId=${q3}&legalName=${suffix}`)).toHaveLength(2);
    expect(await ids(`city=quetzal&legalName=${suffix}`)).toEqual([target.body.id]);
    expect(await ids(`statusId=${prospect}&legalName=${suffix}`)).toHaveLength(2);
    expect(await ids(`statusId=${inactive}&legalName=${suffix}`)).toEqual([]);
    expect(await ids(`salesOwnerId=${seller.id}&legalName=${suffix}`)).toEqual([target.body.id]);
    expect(
      await ids(
        `customerCode=F${suffix}&crmCode=${target.body.crmCode}&legalName=Objetivo&countryId=${q3}&city=QUETZALTENANGO&statusId=${prospect}&salesOwnerId=${seller.id}`,
      ),
    ).toEqual([target.body.id]);
    expect(await ids(`customerCode=F${suffix}&city=Antigua`)).toEqual([]);
  });

  it('búsqueda libre normalizada: palabras sin acentos, prefijo de código CRM y NIT con guiones (PF-02.3)', async () => {
    const seller = await advisor();
    const created = await createViaApi(seller, validCustomer(q1, { legalName: 'Constructora Peña S.A.', taxId: '1234567-8' })).expect(201);
    await insertCustomer(context.prisma, { salesOwnerId: seller.id, countryId: q1, legalName: 'Ferretería Norte' });
    const client = api(context, seller.token);
    const ids = async (search: string): Promise<string[]> =>
      (await client.get(`/customers?search=${encodeURIComponent(search)}`).expect(200)).body.data.map((item: { id: string }) => item.id);

    expect(await ids('construc pena')).toEqual([created.body.id]);
    expect(await ids('PEÑA  constructora')).toEqual([created.body.id]);
    expect(await ids(created.body.crmCode.slice(0, 8))).toContain(created.body.id);
    expect(await ids('12345-67')).toEqual([created.body.id]);
    expect(await ids('pena norte')).toEqual([]);
    // Un comodín de LIKE se busca literal.
    expect(await ids('%')).toEqual([]);
  });

  it('cada sortBy válido ordena en ambos sentidos; fuera de la lista blanca y pageSize=101 → 400 (PF-02.4)', async () => {
    const seller = await advisor();
    const suffix = uniqueSuffix();
    await insertCustomer(context.prisma, { salesOwnerId: seller.id, countryId: q1, legalName: `M ${suffix}`, city: 'Zacapa', customerCode: 'B2' });
    await insertCustomer(context.prisma, { salesOwnerId: seller.id, countryId: q3, legalName: `A ${suffix}`, city: 'Antigua', customerCode: 'C3' });
    await insertCustomer(context.prisma, { salesOwnerId: seller.id, countryId: q1, legalName: `Z ${suffix}`, city: 'Mixco', customerCode: 'A1' });
    const client = api(context, seller.token);
    const values = async (sortBy: string, sortOrder: string, pick: (item: Record<string, unknown>) => unknown) =>
      (await client.get(`/customers?sortBy=${sortBy}&sortOrder=${sortOrder}`).expect(200)).body.data.map(pick);

    expect(await values('legalName', 'asc', (item) => item['legalName'])).toEqual([`A ${suffix}`, `M ${suffix}`, `Z ${suffix}`]);
    expect(await values('legalName', 'desc', (item) => item['legalName'])).toEqual([`Z ${suffix}`, `M ${suffix}`, `A ${suffix}`]);
    expect(await values('city', 'asc', (item) => item['city'])).toEqual(['Antigua', 'Mixco', 'Zacapa']);
    expect(await values('customerCode', 'desc', (item) => item['customerCode'])).toEqual(['C3', 'B2', 'A1']);
    expect(await values('country', 'asc', (item) => (item['country'] as { name: string }).name)).toEqual(['Prueba Tres', 'Prueba Uno', 'Prueba Uno']);
    for (const sortBy of ['crmCode', 'status', 'salesOwner', 'createdAt', 'updatedAt']) {
      for (const sortOrder of ['asc', 'desc']) {
        const body = (await client.get(`/customers?sortBy=${sortBy}&sortOrder=${sortOrder}`).expect(200)).body;
        expect(body.data).toHaveLength(3);
      }
    }
    const crmCodes = await values('crmCode', 'asc', (item) => item['crmCode']);
    expect(crmCodes).toEqual([...(crmCodes as string[])].sort());

    const invalidSort = await client.get('/customers?sortBy=taxIdNormalized').expect(400);
    expect(invalidSort.body.code).toBe('VALIDATION_FAILED');
    await client.get('/customers?pageSize=101').expect(400);
  });

  it('eliminados: ocultos; deleted=true sin clientes.eliminar → 403; con él, solo los de su alcance (PF-02.7)', async () => {
    const seller = await advisor(q3);
    const lead = await countryLead(q3);
    const deleted = await insertCustomer(context.prisma, { salesOwnerId: seller.id, countryId: q3, deletedAt: new Date() });
    const outside = await insertCustomer(context.prisma, { salesOwnerId: seller.id, countryId: q1, deletedAt: new Date() });

    expect((await api(context, seller.token).get('/customers').expect(200)).body.data.map((item: { id: string }) => item.id)).not.toContain(deleted.id);
    await api(context, seller.token).get('/customers?deleted=true').expect(403);

    const deletedList = await api(context, lead.token).get('/customers?deleted=true&pageSize=100').expect(200);
    const ids = deletedList.body.data.map((item: { id: string }) => item.id);
    expect(ids).toContain(deleted.id);
    expect(ids).not.toContain(outside.id);
    expect(deletedList.body.data.every((item: { isDeleted: boolean }) => item.isDeleted)).toBe(true);
  });
});

describe('F2/F3 · Opciones', () => {
  it('form-options refleja un elemento desactivado y los límites de adjuntos (PF-02.23, PF-02.24)', async () => {
    const seller = await advisor();
    const catalog = await context.prisma.catalog.findUniqueOrThrow({ where: { key: 'crm.tipo_empresa' } });
    const item = await context.prisma.catalogItem.create({
      data: { catalogId: catalog.id, code: `TEST_${uniqueSuffix()}`, label: 'Tipo de prueba', sortOrder: 999 },
    });

    const before = await api(context, seller.token).get('/customers/form-options').expect(200);
    expect(before.body.companyTypes.map((option: { id: string }) => option.id)).toContain(item.id);
    expect(before.body.countries.map((country: { isoCode: string }) => country.isoCode)).toEqual(expect.arrayContaining(['GT', 'SV', 'Q1']));
    expect(before.body.statuses).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'INACTIVO', isActive: false }), expect.objectContaining({ code: 'ACTIVO', isActive: true })]),
    );
    expect(before.body.defaults.statusId).toBe(await catalogItemId(context.prisma, 'crm.estado_cliente', 'PROSPECTO'));
    expect(before.body.requiredFields).toEqual(expect.arrayContaining(['legalName', 'countryId', 'statusId', 'salesOwnerId']));
    expect(before.body.attachments).toEqual({
      enabled: true,
      maxMb: 10,
      allowedTypes: expect.arrayContaining(['application/pdf', 'image/png', 'image/jpeg']),
    });

    await context.prisma.catalogItem.update({ where: { id: item.id }, data: { isActive: false } });
    const after = await api(context, seller.token).get('/customers/form-options').expect(200);
    expect(after.body.companyTypes.map((option: { id: string }) => option.id)).not.toContain(item.id);
  });

  it('sales-owner-options: sin administrar solo el propio usuario; con él, los elegibles de su país (D-02.2)', async () => {
    const seller = await advisor(q2);
    const lead = await countryLead(q2);
    const plain = await crmUser(context, { roleCodes: ['usuario'], countryId: q2 });

    const own = await api(context, seller.token).get('/customers/sales-owner-options').expect(200);
    expect(own.body.data.map((option: { id: string }) => option.id)).toEqual([seller.id]);
    expect(own.body.data[0]).toEqual({ id: seller.id, displayName: 'Persona De prueba', employeeCode: null, country: { id: q2, name: 'Prueba Dos' } });

    const scoped = await api(context, lead.token).get('/customers/sales-owner-options?pageSize=100').expect(200);
    const ids = scoped.body.data.map((option: { id: string }) => option.id);
    expect(ids).toEqual(expect.arrayContaining([seller.id, lead.id]));
    expect(ids).not.toContain(plain.id);
    expect(JSON.stringify(scoped.body)).not.toContain('@integration.test');
  });
});

describe('F5 · Alta', () => {
  it('201 con Location, crmCode CLI-NNNNNN, responsable por defecto y auditoría con source UI (PF-02.12)', async () => {
    const seller = await advisor();
    const body = validCustomer(q1);
    const response = await createViaApi(seller, body).expect(201);

    expect(response.headers['location']).toBe(`/api/v1/customers/${response.body.id}`);
    expect(response.body).toMatchObject({
      crmCode: expect.stringMatching(/^CLI-\d{6}$/),
      legalName: body['legalName'],
      salesOwner: { id: seller.id, isActive: true },
      createdBy: { id: seller.id },
      status: { code: 'PROSPECTO', isActive: true },
      country: { id: q1, taxIdLabel: 'NIT' },
      access: 'DIRECT',
      isDeleted: false,
      primaryContact: null,
      capabilities: { canEdit: true, canDelete: false, canReassignOwner: false },
    });
    expect(new Date(response.body.createdAt).toISOString()).toBe(response.body.createdAt);
    const [event] = await audit('crm.customer.created', response.body.id);
    expect(event).toMatchObject({ resourceType: 'crm.customer', metadata: expect.objectContaining({ source: 'UI', crmCode: response.body.crmCode }) });
  });

  it('obligatorios de base → 400; del parámetro → 422 REQUIRED_FIELD_MISSING (PF-02.13)', async () => {
    const seller = await advisor();
    const withoutName = await createViaApi(seller, { ...validCustomer(q1), legalName: undefined }).expect(400);
    expect(withoutName.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'legalName' })]));
    const withoutCountry = await createViaApi(seller, { ...validCustomer(q1), countryId: undefined }).expect(400);
    expect(withoutCountry.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'countryId' })]));

    await withParameter(context.prisma, REQUIRED_FIELDS, JSON.stringify({ customer: ['legalName', 'countryId', 'statusId', 'salesOwnerId', 'email'] }), async () => {
      const response = await createViaApi(seller, { ...validCustomer(q1), email: undefined }).expect(422);
      expect(response.body).toMatchObject({ code: 'REQUIRED_FIELD_MISSING', details: [expect.objectContaining({ field: 'email', code: 'REQUIRED_FIELD_MISSING' })] });
    });
  });

  it('correo inválido 400; teléfono contra el patrón del país y contra la regla genérica 422 (PF-02.14)', async () => {
    const seller = await advisor(q2);
    await createViaApi(seller, validCustomer(q2, { email: 'no-es-correo' })).expect(400);

    const patterned = await createViaApi(seller, validCustomer(q2, { phone: '2222 3333', taxId: '1234567' })).expect(422);
    expect(patterned.body).toMatchObject({ code: 'INVALID_PHONE_FORMAT', details: [expect.objectContaining({ field: 'phone' })] });
    await createViaApi(seller, validCustomer(q2, { phone: '+502 2222-3333', taxId: '7654321' })).expect(201);

    const generic = await createViaApi(seller, validCustomer(q1, { phone: 'llamar' })).expect(422);
    expect(generic.body.code).toBe('INVALID_PHONE_FORMAT');
    await createViaApi(seller, validCustomer(q1, { phone: '12 34' })).expect(422);
  });

  it('NIT contra taxIdPattern tras normalizar; se guarda normalizado (PF-02.15)', async () => {
    const seller = await advisor(q2);
    const invalid = await createViaApi(seller, validCustomer(q2, { phone: null, taxId: '12-34' })).expect(422);
    expect(invalid.body).toMatchObject({ code: 'INVALID_TAX_ID_FORMAT', details: [expect.objectContaining({ field: 'taxId' })] });

    const taxId = `${String(Math.floor(100_000 + Math.random() * 899_999))}`;
    const created = await createViaApi(seller, validCustomer(q2, { phone: null, taxId: `${taxId.slice(0, 3)}.${taxId.slice(3)}-k` })).expect(201);
    const row = await context.prisma.customer.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.taxIdNormalized).toBe(`${taxId}K`);
    expect(created.body.taxId).toBe(`${taxId.slice(0, 3)}.${taxId.slice(3)}-k`);
  });

  it('código de cliente único por país; en otro país con PAIS sí, con GLOBAL no (PF-02.16)', async () => {
    const lead = await crmUser(context, { roleCodes: ['administrador'] });
    const code = `AB-${uniqueSuffix()}`;
    await createViaApi(lead, validCustomer(q1, { customerCode: code })).expect(201);

    const sameCountry = await createViaApi(lead, validCustomer(q1, { customerCode: code.replace('-', '').toLowerCase() })).expect(409);
    expect(sameCountry.body).toMatchObject({ code: 'CUSTOMER_CODE_TAKEN', details: [expect.objectContaining({ field: 'customerCode', isDeleted: false })] });

    await withParameter(context.prisma, CODE_UNIQUENESS, 'GLOBAL', async () => {
      const global = await createViaApi(lead, validCustomer(q3, { customerCode: code })).expect(409);
      expect(global.body.code).toBe('CUSTOMER_CODE_TAKEN');
    });
    await createViaApi(lead, validCustomer(q3, { customerCode: code })).expect(201);
  });

  it('NIT repetido en el país → POSSIBLE_DUPLICATE (TAX_ID, incluido eliminado) → confirmar → 201; otro país o nit=NO sin aviso (PF-02.17)', async () => {
    const seller = await advisor();
    const taxId = randomTaxId();
    const existing = await insertCustomer(context.prisma, { salesOwnerId: seller.id, countryId: q1, taxId, deletedAt: new Date() });

    const warned = await createViaApi(seller, validCustomer(q1, { taxId: `${taxId.slice(0, 4)}-${taxId.slice(4)}` })).expect(409);
    expect(warned.body.code).toBe('POSSIBLE_DUPLICATE');
    expect(warned.body.details).toEqual([
      {
        rule: 'nit',
        reason: 'TAX_ID',
        candidate: expect.objectContaining({ crmCode: existing.crmCode, isDeleted: true, isVisible: false, id: null }),
      },
    ]);

    const confirmed = await createViaApi(seller, validCustomer(q1, { taxId, acknowledgedDuplicateIds: [] })).expect(201);
    const both = await context.prisma.customer.findMany({ where: { taxIdNormalized: taxId, countryId: q1 } });
    expect(both.map((row) => row.id)).toEqual(expect.arrayContaining([existing.id, confirmed.body.id]));

    await createViaApi(seller, validCustomer(q3, { taxId })).expect(201);
    await withParameter(context.prisma, DUPLICATE_RULES, '{"razonSocialNormalizada":"AVISAR","nit":"NO"}', async () => {
      await createViaApi(seller, validCustomer(q1, { taxId })).expect(201);
    });
  });

  it('razón social AVISAR → 409 → confirmar → 201; candidato nuevo no confirmado → 409; BLOQUEAR; NO (PF-02.18)', async () => {
    const seller = await advisor();
    const suffix = uniqueSuffix();
    const first = await createViaApi(seller, validCustomer(q1, { legalName: `Ferretería El Sol ${suffix}` })).expect(201);

    const warned = await createViaApi(seller, validCustomer(q1, { legalName: `FERRETERIA  el sol ${suffix}` })).expect(409);
    expect(warned.body).toMatchObject({
      code: 'POSSIBLE_DUPLICATE',
      details: [{ rule: 'razonSocialNormalizada', reason: 'LEGAL_NAME', candidate: expect.objectContaining({ id: first.body.id, isVisible: true }) }],
    });
    const second = await createViaApi(seller, validCustomer(q1, { legalName: `FERRETERIA  el sol ${suffix}`, acknowledgedDuplicateIds: [first.body.id] })).expect(201);

    // Ahora hay dos candidatos; confirmar solo el primero no basta.
    const again = await createViaApi(seller, validCustomer(q1, { legalName: `Ferreteria El Sol ${suffix}`, acknowledgedDuplicateIds: [first.body.id] })).expect(409);
    expect(again.body.details.map((detail: { candidate: { id: string } }) => detail.candidate.id)).toEqual(
      expect.arrayContaining([first.body.id, second.body.id]),
    );

    await withParameter(context.prisma, DUPLICATE_RULES, '{"razonSocialNormalizada":"BLOQUEAR","nit":"AVISAR"}', async () => {
      const blocked = await createViaApi(
        seller,
        validCustomer(q1, { legalName: `Ferretería el Sol ${suffix}`, acknowledgedDuplicateIds: [first.body.id, second.body.id] }),
      ).expect(409);
      expect(blocked.body.code).toBe('DUPLICATE_BLOCKED');
    });
    await withParameter(context.prisma, DUPLICATE_RULES, '{"razonSocialNormalizada":"NO","nit":"AVISAR"}', async () => {
      await createViaApi(seller, validCustomer(q1, { legalName: `Ferretería el Sol ${suffix}` })).expect(201);
    });
  });

  it('candidato fuera del alcance: id null, isVisible false y solo datos mínimos (PF-02.19)', async () => {
    const owner = await advisor();
    const seller = await advisor();
    const taxId = randomTaxId();
    const hidden = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: q1, taxId, customerCode: `H${uniqueSuffix()}` });

    const response = await createViaApi(seller, validCustomer(q1, { taxId })).expect(409);
    expect(response.body.details).toEqual([
      {
        rule: 'nit',
        reason: 'TAX_ID',
        candidate: {
          id: null,
          crmCode: hidden.crmCode,
          customerCode: expect.any(String),
          legalName: hidden.legalName,
          country: { isoCode: 'Q1', name: 'Prueba Uno' },
          salesOwnerName: 'Persona De prueba',
          isVisible: false,
          isDeleted: false,
        },
      },
    ]);
  });

  it('valores de catálogo: de otro catálogo o inactivo → 422 por columna; estado por defecto (PF-02.20)', async () => {
    const seller = await advisor();
    const priority = await catalogItemId(context.prisma, 'crm.prioridad', 'ALTA');
    const status = await createViaApi(seller, validCustomer(q1, { statusId: priority })).expect(422);
    expect(status.body).toMatchObject({ code: 'INVALID_CATALOG_VALUE', details: [expect.objectContaining({ field: 'statusId', catalogKey: 'crm.estado_cliente' })] });

    const catalog = await context.prisma.catalog.findUniqueOrThrow({ where: { key: 'crm.tipo_empresa' } });
    const inactive = await context.prisma.catalogItem.create({
      data: { catalogId: catalog.id, code: `TEST_${uniqueSuffix()}`, label: 'Inactivo de prueba', isActive: false },
    });
    const companyType = await createViaApi(seller, validCustomer(q1, { companyTypeId: inactive.id })).expect(422);
    expect(companyType.body.details).toEqual([expect.objectContaining({ field: 'companyTypeId', reason: 'INACTIVE' })]);

    const rating = await createViaApi(seller, validCustomer(q1, { ratingId: priority })).expect(422);
    expect(rating.body.details).toEqual([expect.objectContaining({ field: 'ratingId', catalogKey: 'crm.calificacion_cliente' })]);

    const defaulted = await createViaApi(seller, validCustomer(q1)).expect(201);
    expect(defaulted.body.status.code).toBe('PROSPECTO');
  });

  it('responsable inexistente, suspendido o sin clientes.ver → 422; asesor que asigna a otro → 403 FIELD_NOT_EDITABLE (PF-02.21)', async () => {
    const lead = await countryLead(q2);
    const suspended = await crmUser(context, { roleCodes: ['asesor'], countryId: q2, status: 'SUSPENDED' });
    const plain = await crmUser(context, { roleCodes: ['usuario'], countryId: q2 });
    const eligible = await crmUser(context, { roleCodes: ['asesor'], countryId: q2 });
    const body = (salesOwnerId: string) => validCustomer(q2, { salesOwnerId, phone: null, taxId: null });

    for (const salesOwnerId of [randomUUID(), suspended.id, plain.id]) {
      const response = await createViaApi(lead, body(salesOwnerId)).expect(422);
      expect(response.body).toMatchObject({ code: 'INVALID_SALES_OWNER', details: [expect.objectContaining({ field: 'salesOwnerId' })] });
    }
    const assigned = await createViaApi(lead, body(eligible.id)).expect(201);
    expect(assigned.body.salesOwner.id).toBe(eligible.id);

    const seller = await advisor(q2);
    const denied = await createViaApi(seller, body(eligible.id)).expect(403);
    expect(denied.body).toMatchObject({ code: 'FIELD_NOT_EDITABLE', details: [{ field: 'salesOwnerId', requiredPermission: 'clientes.administrar' }] });
  });

  it('concurrencia: 10 altas → crmCode únicos y consecutivos; mismo código en paralelo → un 201 y un 409 (PF-02.22)', async () => {
    const seller = await advisor();
    const responses = await Promise.all(Array.from({ length: 10 }, () => createViaApi(seller, validCustomer(q1))));
    expect(responses.map((response) => response.status)).toEqual(Array(10).fill(201));
    const numbers = responses.map((response) => Number(String(response.body.crmCode).slice(4))).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(10);
    // Sin huecos: la secuencia es compartida con otras suites que dan de alta clientes en paralelo,
    // así que el rango puede incluir números ajenos; lo que no puede haber es números perdidos.
    const prefix = String(responses[0]!.body.crmCode).slice(0, 4);
    const width = String(responses[0]!.body.crmCode).length - 4;
    const range = Array.from({ length: numbers[9]! - numbers[0]! + 1 }, (_, i) => `${prefix}${String(numbers[0]! + i).padStart(width, '0')}`);
    expect(await context.prisma.customer.count({ where: { crmCode: { in: range } } })).toBe(range.length);

    const code = `PAR-${uniqueSuffix()}`;
    const pair = await Promise.all([
      createViaApi(seller, validCustomer(q1, { customerCode: code })),
      createViaApi(seller, validCustomer(q1, { customerCode: code })),
    ]);
    expect(pair.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(pair.find((response) => response.status === 409)?.body.code).toBe('CUSTOMER_CODE_TAKEN');
  });

  it('texto que empieza por =, @, tabulador o retorno → 422 FORMULA_NOT_ALLOWED en alta y edición; teléfono con + aceptado (PF-02.59)', async () => {
    const seller = await advisor();
    for (const field of ['legalName', 'tradeName', 'city', 'address']) {
      for (const prefix of ['=', '@', '\t', '\r', '  =']) {
        const value = `${prefix}HYPERLINK("x")`;
        const response = await createViaApi(seller, validCustomer(q1, { [field]: value })).expect(422);
        expect(response.body).toMatchObject({ code: 'FORMULA_NOT_ALLOWED', details: [expect.objectContaining({ field })] });
        expect(JSON.stringify(response.body)).not.toContain('HYPERLINK');
      }
    }
    const created = await createViaApi(seller, validCustomer(q1, { phone: '+502 5555 1234' })).expect(201);
    for (const field of ['legalName', 'tradeName', 'city', 'address']) {
      const response = await api(context, seller.token).patch(`/customers/${created.body.id}`).send({ [field]: '=1+1' }).expect(422);
      expect(response.body.details).toEqual([expect.objectContaining({ field, code: 'FORMULA_NOT_ALLOWED' })]);
    }
  });

  it('establecimientos con el mismo NIT y códigos distintos (PF-02.61)', async () => {
    const lead = await crmUser(context, { roleCodes: ['administrador'] });
    const taxId = randomTaxId();
    const prefix = `EST${uniqueSuffix()}`;
    const first = await createViaApi(lead, validCustomer(q1, { taxId, customerCode: `${prefix}-01` })).expect(201);
    const second = await createViaApi(lead, validCustomer(q1, { taxId, customerCode: `${prefix}-02`, acknowledgedDuplicateIds: [first.body.id] })).expect(201);

    const found = await api(context, lead.token).get(`/customers?search=${taxId}&countryId=${q1}`).expect(200);
    expect(found.body.data.map((item: { id: string }) => item.id).sort()).toEqual([first.body.id, second.body.id].sort());

    const taken = await createViaApi(lead, validCustomer(q1, { taxId, customerCode: `${prefix}-01`, acknowledgedDuplicateIds: [] })).expect(409);
    expect(taken.body.code).toBe('CUSTOMER_CODE_TAKEN');

    const warned = await createViaApi(lead, validCustomer(q1, { taxId })).expect(409);
    expect(warned.body.details.map((detail: { reason: string }) => detail.reason)).toEqual(['TAX_ID', 'TAX_ID']);
    await createViaApi(lead, validCustomer(q1, { taxId, acknowledgedDuplicateIds: [first.body.id, second.body.id] })).expect(201);
  });
});

describe('F4/F6 · Ficha y edición', () => {
  it('detalle completo y capabilities por actor: dueño, heredado, manager y administrador (PF-02.26)', async () => {
    const seller = await advisor();
    const inheritor = await advisor();
    const created = await createViaApi(seller, validCustomer(q1, { customerCode: `D${uniqueSuffix()}` })).expect(201);
    await insertProject(context.prisma, { customerId: created.body.id, ownerId: inheritor.id, countryId: q1 });
    const manager = await crmUser(context, { roleCodes: ['manager'] });
    const team = await context.prisma.team.create({ data: { code: `t-${uniqueSuffix().toLowerCase()}`, name: 'Equipo', managerId: manager.id, members: { create: [{ userId: seller.id }] } } });
    const admin = await crmUser(context, { roleCodes: ['administrador'] });

    const own = await api(context, seller.token).get(`/customers/${created.body.id}`).expect(200);
    expect(own.body).toMatchObject({
      id: created.body.id,
      crmCode: created.body.crmCode,
      taxId: expect.any(String),
      address: 'Avenida 1, zona 1',
      phone: '+502 2222 3333',
      country: { id: q1, isoCode: 'Q1', name: 'Prueba Uno', taxIdLabel: 'NIT' },
      status: { code: 'PROSPECTO', label: 'Prospecto', isActive: true },
      companyType: null,
      rating: null,
      sourceImport: null,
      deletedAt: null,
      updatedBy: { id: seller.id },
      access: 'DIRECT',
      capabilities: {
        canEdit: true,
        canDelete: false,
        canRestore: false,
        canManageAttachments: true,
        canManageContacts: true,
        canReassignOwner: false,
        editableFields: ['legalName', 'tradeName', 'taxId', 'city', 'address', 'phone', 'email', 'companyTypeId', 'statusId', 'ratingId'],
      },
    });

    const inherited = await api(context, inheritor.token).get(`/customers/${created.body.id}`).expect(200);
    expect(inherited.body).toMatchObject({
      access: 'INHERITED',
      capabilities: { canEdit: false, canDelete: false, canManageAttachments: false, canManageContacts: false, editableFields: [] },
    });

    const managed = await api(context, manager.token).get(`/customers/${created.body.id}`).expect(200);
    expect(managed.body.capabilities).toMatchObject({ canEdit: true, canDelete: true, canReassignOwner: true });
    expect(managed.body.capabilities.editableFields).toEqual(expect.arrayContaining(['customerCode', 'salesOwnerId', 'countryId']));

    const administrator = await api(context, admin.token).get(`/customers/${created.body.id}`).expect(200);
    expect(administrator.body.capabilities).toMatchObject({ canEdit: true, canDelete: true, canRestore: false, canReassignOwner: true });
    await context.prisma.teamMember.deleteMany({ where: { teamId: team.id } });
  });

  it('editar propio 200 con diferencia auditada; ajeno o heredado 403; manager reasigna 200; sin cambios no audita (PF-02.28, PF-02.50)', async () => {
    const seller = await advisor();
    const other = await advisor();
    const created = await createViaApi(seller, validCustomer(q1)).expect(201);
    await insertProject(context.prisma, { customerId: created.body.id, ownerId: other.id, countryId: q1 });

    const edited = await api(context, seller.token).patch(`/customers/${created.body.id}`).send({ city: 'Cobán', tradeName: null }).expect(200);
    expect(edited.body).toMatchObject({ city: 'Cobán', tradeName: null, updatedBy: { id: seller.id } });
    const [event] = await audit('crm.customer.updated', created.body.id);
    expect(event?.changes).toEqual({
      city: { before: 'Ciudad de prueba', after: 'Cobán' },
      tradeName: { before: created.body.tradeName, after: null },
    });

    await api(context, seller.token).patch(`/customers/${created.body.id}`).send({ city: 'Cobán' }).expect(200);
    expect(await audit('crm.customer.updated', created.body.id)).toHaveLength(1);

    const inherited = await api(context, other.token).patch(`/customers/${created.body.id}`).send({ city: 'Otra' }).expect(403);
    expect(inherited.body.code).toBe('PERMISSION_DENIED');
    const foreign = await insertCustomer(context.prisma, { salesOwnerId: other.id, countryId: q1 });
    await api(context, seller.token).patch(`/customers/${foreign.id}`).send({ city: 'Otra' }).expect(404);

    const manager = await crmUser(context, { roleCodes: ['manager'] });
    await context.prisma.team.create({
      data: { code: `t-${uniqueSuffix().toLowerCase()}`, name: 'Equipo', managerId: manager.id, members: { create: [{ userId: seller.id }, { userId: other.id }] } },
    });
    const reassigned = await api(context, manager.token).patch(`/customers/${created.body.id}`).send({ salesOwnerId: other.id }).expect(200);
    expect(reassigned.body.salesOwner.id).toBe(other.id);
    // El antiguo dueño ya no lo ve directamente: el ajeno con alcance propio es 404.
    await api(context, seller.token).get(`/customers/${created.body.id}`).expect(404);
  });

  it('campos reservados sin administrar → 403 FIELD_NOT_EDITABLE; crmCode → 400; mismo valor sí (PF-02.29)', async () => {
    const seller = await advisor();
    const other = await advisor();
    const created = await createViaApi(seller, validCustomer(q1)).expect(201);
    const client = api(context, seller.token);

    const denied = await client.patch(`/customers/${created.body.id}`).send({ customerCode: 'NUEVO', salesOwnerId: other.id, countryId: q3 }).expect(403);
    expect(denied.body.code).toBe('FIELD_NOT_EDITABLE');
    expect(denied.body.details.map((detail: { field: string }) => detail.field).sort()).toEqual(['countryId', 'customerCode', 'salesOwnerId']);

    const crmCode = await client.patch(`/customers/${created.body.id}`).send({ crmCode: 'CLI-999999' }).expect(400);
    expect(crmCode.body.code).toBe('VALIDATION_FAILED');
    await client.patch(`/customers/${created.body.id}`).send({ deletedAt: null }).expect(400);

    await client.patch(`/customers/${created.body.id}`).send({ countryId: q1, salesOwnerId: seller.id, customerCode: null, city: 'Igual' }).expect(200);
  });

  it('desactivar: visible, filtrable, excluido con activeOnly y rechazado por assertUsableCustomer (PF-02.30)', async () => {
    const seller = await advisor();
    const created = await createViaApi(seller, validCustomer(q1)).expect(201);
    const inactive = await catalogItemId(context.prisma, 'crm.estado_cliente', 'INACTIVO');

    const response = await api(context, seller.token).patch(`/customers/${created.body.id}`).send({ statusId: inactive }).expect(200);
    expect(response.body.status).toMatchObject({ code: 'INACTIVO', isActive: false });
    expect(response.body.capabilities.canEdit).toBe(true);

    const ids = async (query: string) =>
      (await api(context, seller.token).get(`/customers?${query}`).expect(200)).body.data.map((item: { id: string }) => item.id);
    expect(await ids(`statusId=${inactive}`)).toContain(created.body.id);
    expect(await ids('activeOnly=true')).not.toContain(created.body.id);
    expect(await ids('activeOnly=false')).toContain(created.body.id);

    const guard = context.app.get(CustomerReferenceGuard);
    const actor = { userId: seller.id, permissions: new Set(['clientes.ver']), audit: { correlationId: 'it', actorId: seller.id, actorEmail: null, ipAddress: null } };
    await expect(guard.assertUsableCustomer(created.body.id, actor, { requireActive: true })).rejects.toMatchObject({ code: 'CUSTOMER_INACTIVE' });
    await expect(guard.assertUsableCustomer(created.body.id, actor, { requireActive: false })).resolves.toMatchObject({ id: created.body.id, isActive: false });
    await expect(guard.assertUsableCustomer(randomUUID(), actor, { requireActive: false })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect(context.app.get(CustomerActorResolver)).toBeDefined();
  });

  it('edición del NIT: sin cambio no avisa; a uno repetido o a un país donde existe → 409 TAX_ID → confirmar → 200 (PF-02.58)', async () => {
    const lead = await crmUser(context, { roleCodes: ['administrador'] });
    const taxId = randomTaxId();
    const sibling = await createViaApi(lead, validCustomer(q1, { taxId })).expect(201);
    const target = await createViaApi(lead, validCustomer(q1, { taxId, acknowledgedDuplicateIds: [sibling.body.id] })).expect(201);
    const client = api(context, lead.token);

    await client.patch(`/customers/${target.body.id}`).send({ address: 'Nueva dirección' }).expect(200);

    const elsewhere = await createViaApi(lead, validCustomer(q1)).expect(201);
    const changedTaxId = await client.patch(`/customers/${elsewhere.body.id}`).send({ taxId }).expect(409);
    expect(changedTaxId.body.details).toHaveLength(2);
    expect(changedTaxId.body.details.every((detail: { reason: string }) => detail.reason === 'TAX_ID')).toBe(true);
    await client.patch(`/customers/${elsewhere.body.id}`).send({ taxId, acknowledgedDuplicateIds: [sibling.body.id, target.body.id] }).expect(200);
    const moved = await createViaApi(lead, validCustomer(q3, { taxId })).expect(201);
    const changedCountry = await client.patch(`/customers/${moved.body.id}`).send({ countryId: q1 }).expect(409);
    const candidates = [sibling.body.id, target.body.id, elsewhere.body.id];
    expect(changedCountry.body.details.map((detail: { candidate: { id: string } }) => detail.candidate.id).sort()).toEqual([...candidates].sort());
    await client.patch(`/customers/${moved.body.id}`).send({ countryId: q1, acknowledgedDuplicateIds: candidates }).expect(200);
  });
});

describe('F7/F8 · Eliminación y restauración', () => {
  it('eliminación lógica: 204, oculto, hijos intactos, código ocupado, NIT cuenta y auditoría (PF-02.31)', async () => {
    const lead = await countryLead();
    const code = `DEL-${uniqueSuffix()}`;
    const taxId = randomTaxId();
    const created = await createViaApi(lead, validCustomer(q1, { customerCode: code, taxId })).expect(201);
    const contactId = await insertContact(context.prisma, { customerId: created.body.id });

    await api(context, lead.token).delete(`/customers/${created.body.id}`).expect(204);

    const row = await context.prisma.customer.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(await context.prisma.contact.findUnique({ where: { id: contactId } })).not.toBeNull();
    expect((await api(context, lead.token).get(`/customers?search=${code}`).expect(200)).body.data).toEqual([]);
    expect(await audit('crm.customer.deleted', created.body.id)).toHaveLength(1);

    const taken = await createViaApi(lead, validCustomer(q1, { customerCode: code })).expect(409);
    expect(taken.body.details[0]).toMatchObject({ isDeleted: true, customerId: created.body.id });
    const warned = await createViaApi(lead, validCustomer(q1, { taxId })).expect(409);
    expect(warned.body.details[0].candidate).toMatchObject({ id: created.body.id, isDeleted: true, isVisible: true });

    // El eliminado se consulta con clientes.eliminar; sin él es 404.
    await api(context, lead.token).get(`/customers/${created.body.id}`).expect(200);
    const seller = await advisor();
    await api(context, seller.token).get(`/customers/${created.body.id}`).expect(404);
  });

  it('dependencias → 409 CUSTOMER_HAS_DEPENDENCIES con conteos; asesor sin eliminar → 403 (PF-02.32)', async () => {
    const lead = await countryLead();
    const seller = await advisor();
    const created = await createViaApi(lead, validCustomer(q1, { salesOwnerId: seller.id })).expect(201);
    await insertProject(context.prisma, { customerId: created.body.id, ownerId: seller.id, countryId: q1 });
    await insertActivity(context.prisma, { customerId: created.body.id, ownerId: seller.id });
    await insertActivity(context.prisma, { customerId: created.body.id, ownerId: seller.id, statusCode: 'COMPLETADA' });
    await insertVisit(context.prisma, { customerId: created.body.id, ownerId: seller.id });
    await insertVisit(context.prisma, { customerId: created.body.id, ownerId: seller.id, statusCode: 'CANCELADA' });

    const response = await api(context, lead.token).delete(`/customers/${created.body.id}`).expect(409);
    expect(response.body).toMatchObject({
      code: 'CUSTOMER_HAS_DEPENDENCIES',
      details: [
        { dependency: 'projects', count: 1 },
        { dependency: 'openActivities', count: 1 },
        { dependency: 'pendingVisits', count: 1 },
      ],
    });
    await api(context, seller.token).delete(`/customers/${created.body.id}`).expect(403);
  });

  it('restaurar: 200 y auditoría; no eliminado 409; con GLOBAL y código ocupado 409; NIT compartido no impide (PF-02.33)', async () => {
    const admin = await crmUser(context, { roleCodes: ['administrador'] });
    const taxId = randomTaxId();
    const code = `RST-${uniqueSuffix()}`;
    const created = await createViaApi(admin, validCustomer(q1, { customerCode: code, taxId })).expect(201);
    await api(context, admin.token).post(`/customers/${created.body.id}/restore`).expect(409);

    await api(context, admin.token).delete(`/customers/${created.body.id}`).expect(204);
    await createViaApi(admin, validCustomer(q1, { taxId, acknowledgedDuplicateIds: [created.body.id] })).expect(201);
    const restored = await api(context, admin.token).post(`/customers/${created.body.id}/restore`).expect(200);
    expect(restored.body).toMatchObject({ isDeleted: false, deletedAt: null });
    expect(await audit('crm.customer.restored', created.body.id)).toHaveLength(1);
    expect((await api(context, admin.token).get(`/customers?search=${code}`).expect(200)).body.data).toHaveLength(1);

    await api(context, admin.token).delete(`/customers/${created.body.id}`).expect(204);
    await createViaApi(admin, validCustomer(q3, { customerCode: code })).expect(201);
    await withParameter(context.prisma, CODE_UNIQUENESS, 'GLOBAL', async () => {
      const taken = await api(context, admin.token).post(`/customers/${created.body.id}/restore`).expect(409);
      expect(taken.body.code).toBe('CUSTOMER_CODE_TAKEN');
    });
  });
});
