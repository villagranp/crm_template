import { randomUUID } from 'node:crypto';

import {
  api,
  catalogItemId,
  crmUser,
  insertConversionRule,
  insertCustomer,
  insertProduct,
  insertProductFamily,
  insertProject,
  insertUnit,
  testCountry,
  uniqueSuffix,
  unitId,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext, tokenWithRoles } from './support/test-app';

/**
 * Módulo 7 · Maestros comerciales (07 F.7, D-07.9, RN-07.36, RN-07.37, RN-07.40) contra
 * PostgreSQL: familias, productos, unidades y reglas de conversión (AC-07.32, PF-07.15,
 * PF-07.16, PF-07.36, PF-07.39).
 *
 * Aislamiento: todo se crea con códigos únicos; las listas se filtran por `search` con
 * el sufijo propio o se comparan por pertenencia. La unidad `TON` y su identidad son
 * compartidas: solo se intentan cambios que la API rechaza (nada se escribe en ellas).
 */

let context: TestContext;
let adminToken: string;
let sellerToken: string;
let plainToken: string;
let tonId: string;
let tonIdentityId: string;
let industrialTypeId: string;

async function audit(event: string, resourceId: string) {
  return context.prisma.auditLog.findMany({ where: { event, resourceId }, orderBy: { occurredAt: 'asc' } });
}

beforeAll(async () => {
  context = await createTestContext();
  adminToken = (await tokenWithRoles(context, ['administrador'])).token;
  const s7 = await testCountry(context.prisma, 'E8', { name: 'Maestros Ocho' });
  sellerToken = (await crmUser(context, { roleCodes: ['asesor'], countryId: s7 })).token;
  plainToken = (await tokenWithRoles(context, ['usuario'])).token;
  tonId = await unitId(context.prisma, 'TON');
  const identity = await context.prisma.unitConversionRule.findFirstOrThrow({ where: { fromUnitId: tonId, toUnitId: tonId, scope: 'GLOBAL' } });
  tonIdentityId = identity.id;
  industrialTypeId = await catalogItemId(context.prisma, 'crm.tipo_proyecto', 'INDUSTRIAL');
});

afterAll(async () => {
  await closeTestContext(context);
});

// ---------------------------------------------------------------------------
// Autenticación y permisos
// ---------------------------------------------------------------------------

describe('Autenticación y permisos (PF-07.39)', () => {
  const id = randomUUID();
  const reads: [string][] = [
    ['/product-families'],
    [`/product-families/${id}`],
    ['/products'],
    [`/products/${id}`],
    ['/units-of-measure'],
    [`/units-of-measure/${id}`],
    ['/unit-conversion-rules'],
    [`/unit-conversion-rules/${id}`],
  ];
  const writes: [method: 'post' | 'patch', path: string][] = [
    ['post', '/product-families'],
    ['patch', `/product-families/${id}`],
    ['post', '/products'],
    ['patch', `/products/${id}`],
    ['post', '/units-of-measure'],
    ['patch', `/units-of-measure/${id}`],
    ['post', '/unit-conversion-rules'],
    ['patch', `/unit-conversion-rules/${id}`],
  ];

  it.each([...reads.map(([path]) => ['get', path] as const), ...writes])('401 sin token y 403 con el rol usuario: %s %s', async (method, path) => {
    const anonymous = await api(context)[method](path).send({});
    expect(anonymous.status).toBe(401);
    const forbidden = await api(context, plainToken)[method](path).send({});
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('PERMISSION_DENIED');
  });

  it.each(writes)('403 con productos.ver sin productos.configurar (asesor): %s %s', async (method, path) => {
    const response = await api(context, sellerToken)[method](path).send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
  });

  it('el asesor (productos.ver) lee listas y detalles', async () => {
    const client = api(context, sellerToken);
    for (const path of ['/product-families', '/products', '/units-of-measure', '/unit-conversion-rules', `/units-of-measure/${tonId}`]) {
      expect((await client.get(path)).status).toBe(200);
    }
  });

  it('GET /units-of-measure: basta productos.ver o proyectos.ver; el detalle exige productos.ver', async () => {
    const s7 = await testCountry(context.prisma, 'E8', { name: 'Maestros Ocho' });
    const onlyProjects = await crmUser(context, { roleCodes: ['asesor'], countryId: s7, deny: ['productos.ver'] });
    await api(context, onlyProjects.token).get('/units-of-measure').expect(200);
    await api(context, onlyProjects.token).get(`/units-of-measure/${tonId}`).expect(403);
    const onlyProducts = await crmUser(context, { roleCodes: ['asesor'], countryId: s7, deny: ['proyectos.ver'] });
    await api(context, onlyProducts.token).get('/units-of-measure').expect(200);
    const neither = await crmUser(context, { roleCodes: ['asesor'], countryId: s7, deny: ['productos.ver', 'proyectos.ver'] });
    await api(context, neither.token).get('/units-of-measure').expect(403);
  });

  it('no existe DELETE en ningún maestro (404)', async () => {
    const admin = api(context, adminToken);
    for (const path of [`/product-families/${id}`, `/products/${id}`, `/units-of-measure/${id}`, `/unit-conversion-rules/${id}`]) {
      expect((await admin.delete(path)).status).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// Alta de familia, unidad, producto y regla (PF-07.15)
// ---------------------------------------------------------------------------

describe('Alta, consulta y edición (PF-07.15, AC-07.32)', () => {
  it('familia → unidad → producto → regla, cada uno con su detalle, su edición y su auditoría', async () => {
    const admin = api(context, adminToken);
    const suffix = uniqueSuffix();

    const family = await admin
      .post('/product-families')
      .send({ code: ` fam-${suffix.toLowerCase()} `, name: ` Aceros ${suffix} `, description: 'Largos' })
      .expect(201);
    expect(family.headers['location']).toBe(`/api/v1/product-families/${family.body.id}`);
    expect(family.body).toEqual({
      id: expect.any(String),
      code: `FAM-${suffix}`,
      name: `Aceros ${suffix}`,
      description: 'Largos',
      sortOrder: 0,
      isActive: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(await audit('crm.product_family.created', family.body.id)).toHaveLength(1);
    await admin.get(`/product-families/${family.body.id}`).expect(200);

    const unit = await admin.post('/units-of-measure').send({ code: `u${suffix}`, name: 'Varilla', symbol: 'var', dimension: 'COUNT', sortOrder: 995 }).expect(201);
    expect(unit.body).toMatchObject({ code: `U${suffix}`, name: 'Varilla', symbol: 'var', dimension: 'COUNT', sortOrder: 995, isActive: true });
    expect(await audit('crm.unit_of_measure.created', unit.body.id)).toHaveLength(1);

    const product = await admin
      .post('/products')
      .send({ sku: ` sku-${suffix.toLowerCase()} `, description: 'Varilla corrugada 3/8', familyId: family.body.id, baseUnitId: unit.body.id })
      .expect(201);
    expect(product.body).toEqual({
      id: expect.any(String),
      sku: `SKU-${suffix}`,
      description: 'Varilla corrugada 3/8',
      family: { id: family.body.id, code: `FAM-${suffix}`, name: `Aceros ${suffix}` },
      baseUnit: { id: unit.body.id, code: `U${suffix}`, symbol: 'var', dimension: 'COUNT' },
      isActive: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const [productEvent] = await audit('crm.product.created', product.body.id);
    expect(productEvent?.resourceType).toBe('crm.product');
    expect(productEvent?.changes).toMatchObject({ sku: { before: null, after: `SKU-${suffix}` } });
    await admin.get(`/products/${product.body.id}`).expect(200);

    const rule = await admin
      .post('/unit-conversion-rules')
      .send({ fromUnitId: unit.body.id, factor: '0.0125', scope: 'PRODUCT', productId: product.body.id, description: 'Peso por varilla' })
      .expect(201);
    expect(rule.body).toEqual({
      id: expect.any(String),
      fromUnit: { id: unit.body.id, code: `U${suffix}`, symbol: 'var', dimension: 'COUNT' },
      toUnit: { id: tonId, code: 'TON', symbol: expect.any(String), dimension: 'MASS' },
      factor: '0.01250000',
      scope: 'PRODUCT',
      product: { id: product.body.id, sku: `SKU-${suffix}`, description: 'Varilla corrugada 3/8' },
      productFamily: null,
      projectType: null,
      description: 'Peso por varilla',
      isActive: true,
      isIdentity: false,
      isProtected: false,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(await audit('crm.unit_conversion_rule.created', rule.body.id)).toHaveLength(1);
    const scopeKey = (await context.prisma.unitConversionRule.findUniqueOrThrow({ where: { id: rule.body.id } })).scopeKey;
    expect(scopeKey).toBe(product.body.id);

    // La vista previa de los formularios (Módulo 3) ya ve la regla nueva.
    const preview = await api(context, sellerToken).get(`/unit-conversions/resolve?fromUnitId=${unit.body.id}&productId=${product.body.id}`).expect(200);
    expect(preview.body.rule).toMatchObject({ id: rule.body.id, scope: 'PRODUCT', factor: '0.01250000' });

    // Ediciones con auditoría.
    await admin.patch(`/product-families/${family.body.id}`).send({ name: 'Aceros largos', sortOrder: 5 }).expect(200);
    const [familyUpdated] = await audit('crm.product_family.updated', family.body.id);
    expect(familyUpdated?.changes).toEqual({ name: { before: `Aceros ${suffix}`, after: 'Aceros largos' }, sortOrder: { before: 0, after: 5 } });

    await admin.patch(`/products/${product.body.id}`).send({ description: 'Varilla 3/8 G60', isActive: false }).expect(200);
    const [productUpdated] = await audit('crm.product.updated', product.body.id);
    expect(productUpdated?.changes).toEqual({
      description: { before: 'Varilla corrugada 3/8', after: 'Varilla 3/8 G60' },
      isActive: { before: true, after: false },
    });

    await admin.patch(`/units-of-measure/${unit.body.id}`).send({ name: 'Varilla de 6 m', symbol: 'v6' }).expect(200);
    expect(await audit('crm.unit_of_measure.updated', unit.body.id)).toHaveLength(1);

    const ruleUpdated = await admin.patch(`/unit-conversion-rules/${rule.body.id}`).send({ factor: '0.013', description: null }).expect(200);
    expect(ruleUpdated.body).toMatchObject({ factor: '0.01300000', description: null });
    const [ruleEvent] = await audit('crm.unit_conversion_rule.updated', rule.body.id);
    expect(ruleEvent?.changes).toEqual({ factor: { before: '0.01250000', after: '0.01300000' }, description: { before: 'Peso por varilla', after: null } });

    // Sin cambios: 200 y sin evento nuevo.
    await admin.patch(`/unit-conversion-rules/${rule.body.id}`).send({ factor: '0.01300000' }).expect(200);
    expect(await audit('crm.unit_conversion_rule.updated', rule.body.id)).toHaveLength(1);
  });

  it('reglas de ámbito familia y tipo de proyecto; identidad marcada y protegida en la lista', async () => {
    const admin = api(context, adminToken);
    const unit = await insertUnit(context.prisma, { dimension: 'AREA' });
    const familyId = await insertProductFamily(context.prisma);
    const familyRule = await admin.post('/unit-conversion-rules').send({ fromUnitId: unit.id, factor: '0.02', scope: 'PRODUCT_FAMILY', productFamilyId: familyId }).expect(201);
    expect(familyRule.body).toMatchObject({ scope: 'PRODUCT_FAMILY', productFamily: { id: familyId } });
    const typeRule = await admin
      .post('/unit-conversion-rules')
      .send({ fromUnitId: unit.id, toUnitId: tonId, factor: '0.03', scope: 'PROJECT_TYPE', projectTypeId: industrialTypeId })
      .expect(201);
    expect(typeRule.body).toMatchObject({ scope: 'PROJECT_TYPE', projectType: { id: industrialTypeId, code: 'INDUSTRIAL' } });

    const list = await admin.get(`/unit-conversion-rules?fromUnitId=${unit.id}`).expect(200);
    expect(list.body.data.map((rule: { id: string }) => rule.id).sort()).toEqual([familyRule.body.id, typeRule.body.id].sort());
    const byScope = await admin.get(`/unit-conversion-rules?fromUnitId=${unit.id}&scope=PROJECT_TYPE`).expect(200);
    expect(byScope.body.data.map((rule: { id: string }) => rule.id)).toEqual([typeRule.body.id]);

    const identity = await admin.get(`/unit-conversion-rules/${tonIdentityId}`).expect(200);
    expect(identity.body).toMatchObject({ isIdentity: true, isProtected: true, factor: '1.00000000', scope: 'GLOBAL' });
  });
});

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

describe('Listas: isActive, search, orden y paginación', () => {
  it('familias: activas por defecto, false, all; search y orden', async () => {
    const suffix = uniqueSuffix();
    const admin = api(context, adminToken);
    const a = await admin.post('/product-families').send({ code: `LA-${suffix}`, name: `Lista ${suffix} Alfa`, sortOrder: 2 }).expect(201);
    const b = await admin.post('/product-families').send({ code: `LB-${suffix}`, name: `Lista ${suffix} Beta`, sortOrder: 1 }).expect(201);
    await admin.patch(`/product-families/${b.body.id}`).send({ isActive: false }).expect(200);

    const ids = async (query: string) => (await admin.get(`/product-families?search=${suffix}&${query}`).expect(200)).body.data.map((row: { id: string }) => row.id);
    expect(await ids('')).toEqual([a.body.id]);
    expect(await ids('isActive=false')).toEqual([b.body.id]);
    expect(await ids('isActive=all')).toEqual([b.body.id, a.body.id]);
    expect(await ids('isActive=all&sortBy=code&sortOrder=asc')).toEqual([a.body.id, b.body.id]);
    expect(await ids('isActive=all&sortBy=code&sortOrder=desc')).toEqual([b.body.id, a.body.id]);

    const page = await admin.get(`/product-families?search=${suffix}&isActive=all&pageSize=1&page=2`).expect(200);
    expect(page.body.pagination).toEqual({ page: 2, pageSize: 1, totalItems: 2, totalPages: 2 });
    const defaults = await admin.get(`/product-families?search=${suffix}`).expect(200);
    expect(defaults.body.pagination.pageSize).toBe(100);
  });

  it('unidades y productos: isActive=all y búsqueda; productos por createdAt', async () => {
    const admin = api(context, adminToken);
    const active = await insertUnit(context.prisma);
    const inactive = await insertUnit(context.prisma, { isActive: false });
    const units = await admin.get(`/units-of-measure?isActive=all&pageSize=100&search=${inactive.code}`).expect(200);
    expect(units.body.data).toEqual([expect.objectContaining({ id: inactive.id, isActive: false, sortOrder: 990 })]);
    const defaults = await admin.get('/units-of-measure').expect(200);
    expect(defaults.body.data.map((row: { id: string }) => row.id)).toContain(active.id);
    expect(defaults.body.data.map((row: { id: string }) => row.id)).not.toContain(inactive.id);

    const familyId = await insertProductFamily(context.prisma);
    const first = await insertProduct(context.prisma, { familyId, baseUnitId: active.id, sku: `TSKU-${uniqueSuffix()}-Z` });
    const second = await insertProduct(context.prisma, { familyId, baseUnitId: active.id, sku: `TSKU-${uniqueSuffix()}-A`, isActive: false });
    const all = await admin.get(`/products?familyId=${familyId}&isActive=all&sortBy=createdAt&sortOrder=asc`).expect(200);
    expect(all.body.data.map((row: { id: string }) => row.id)).toEqual([first.id, second.id]);
  });

  it('400 en filtros y orden no admitidos', async () => {
    const admin = api(context, adminToken);
    for (const path of [
      '/product-families?sortBy=description',
      '/product-families?isActive=quizas',
      '/units-of-measure?pageSize=101',
      '/unit-conversion-rules?scope=OTRO',
      '/unit-conversion-rules?fromUnitId=no-es-uuid',
      '/unit-conversion-rules?sortBy=fromUnit',
      '/products?sortBy=description',
      '/products/no-es-uuid',
    ]) {
      expect({ path, status: (await admin.get(path)).status }).toEqual({ path, status: 400 });
    }
    await admin.get(`/product-families/${randomUUID()}`).expect(404);
    await admin.get(`/unit-conversion-rules/${randomUUID()}`).expect(404);
  });
});

// ---------------------------------------------------------------------------
// Errores (PF-07.36)
// ---------------------------------------------------------------------------

describe('Errores (PF-07.36)', () => {
  it('409 RESOURCE_CONFLICT por código de familia, código de unidad y SKU (mayúsculas y espacios)', async () => {
    const admin = api(context, adminToken);
    const suffix = uniqueSuffix();
    await admin.post('/product-families').send({ code: `DUP-${suffix}`, name: 'x' }).expect(201);
    const family = await admin.post('/product-families').send({ code: ` dup-${suffix.toLowerCase()} `, name: 'y' }).expect(409);
    expect(family.body).toMatchObject({ code: 'RESOURCE_CONFLICT', details: [{ field: 'code' }] });

    await admin.post('/units-of-measure').send({ code: `D${suffix}`, name: 'x', symbol: 'x', dimension: 'COUNT' }).expect(201);
    const unit = await admin.post('/units-of-measure').send({ code: `d${suffix.toLowerCase()}`, name: 'x', symbol: 'x', dimension: 'COUNT' }).expect(409);
    expect(unit.body).toMatchObject({ code: 'RESOURCE_CONFLICT', details: [{ field: 'code' }] });

    const baseUnit = await insertUnit(context.prisma);
    const familyId = await insertProductFamily(context.prisma);
    const taken = await insertProduct(context.prisma, { familyId, baseUnitId: baseUnit.id, sku: `TSKU-${suffix}-T` });
    const other = await insertProduct(context.prisma, { familyId, baseUnitId: baseUnit.id });
    const created = await admin.post('/products').send({ sku: ` tsku-${suffix.toLowerCase()}-t `, description: 'x', familyId, baseUnitId: baseUnit.id }).expect(409);
    expect(created.body).toMatchObject({ code: 'RESOURCE_CONFLICT', details: [{ field: 'sku' }] });
    const edited = await admin.patch(`/products/${other.id}`).send({ sku: taken.sku.toLowerCase() }).expect(409);
    expect(edited.body).toMatchObject({ code: 'RESOURCE_CONFLICT', details: [{ field: 'sku' }] });
  });

  it('422 UNKNOWN_REFERENCE: familia inactiva o inexistente, unidad inexistente', async () => {
    const admin = api(context, adminToken);
    const unit = await insertUnit(context.prisma);
    const inactiveFamily = await insertProductFamily(context.prisma, { isActive: false });
    const activeFamily = await insertProductFamily(context.prisma);
    for (const [body, field, issue] of [
      [{ familyId: inactiveFamily, baseUnitId: unit.id }, 'familyId', 'inactive'],
      [{ familyId: randomUUID(), baseUnitId: unit.id }, 'familyId', 'not_found'],
      [{ familyId: activeFamily, baseUnitId: randomUUID() }, 'baseUnitId', 'not_found'],
    ] as const) {
      const response = await admin.post('/products').send({ sku: `TSKU-${uniqueSuffix()}`, description: 'x', ...body }).expect(422);
      expect(response.body).toMatchObject({ code: 'UNKNOWN_REFERENCE', details: [{ field, issue }] });
    }
  });

  it('409 UNIT_DIMENSION_LOCKED si la unidad está referenciada; sin referencias se cambia', async () => {
    const admin = api(context, adminToken);
    const free = await insertUnit(context.prisma, { dimension: 'COUNT' });
    await admin.patch(`/units-of-measure/${free.id}`).send({ dimension: 'LENGTH' }).expect(200);

    const used = await insertUnit(context.prisma, { dimension: 'COUNT' });
    await insertProduct(context.prisma, { familyId: await insertProductFamily(context.prisma), baseUnitId: used.id });
    const locked = await admin.patch(`/units-of-measure/${used.id}`).send({ dimension: 'LENGTH' }).expect(409);
    expect(locked.body).toMatchObject({ code: 'UNIT_DIMENSION_LOCKED', details: [{ field: 'dimension' }] });

    const ruled = await insertUnit(context.prisma, { dimension: 'COUNT' });
    await insertConversionRule(context.prisma, { fromUnitId: ruled.id, factor: '0.5' });
    await admin.patch(`/units-of-measure/${ruled.id}`).send({ dimension: 'AREA' }).expect(409);
    await admin.patch(`/units-of-measure/${tonId}`).send({ dimension: 'COUNT' }).expect(409);
  });

  it('409 CONVERSION_RULE_PROTECTED: identidad TON→TON no se desactiva ni cambia de factor; la unidad de tonelaje no se desactiva', async () => {
    const admin = api(context, adminToken);
    const deactivate = await admin.patch(`/unit-conversion-rules/${tonIdentityId}`).send({ isActive: false }).expect(409);
    expect(deactivate.body).toMatchObject({ code: 'CONVERSION_RULE_PROTECTED', details: [{ reason: 'tonnage_identity' }] });
    const factor = await admin.patch(`/unit-conversion-rules/${tonIdentityId}`).send({ factor: '2' }).expect(409);
    expect(factor.body).toMatchObject({ code: 'CONVERSION_RULE_PROTECTED', details: [{ reason: 'identity_factor' }] });
    const unit = await admin.patch(`/units-of-measure/${tonId}`).send({ isActive: false }).expect(409);
    expect(unit.body).toMatchObject({ code: 'CONVERSION_RULE_PROTECTED', details: [{ reason: 'tonnage_unit' }] });

    const identity = await context.prisma.unitConversionRule.findUniqueOrThrow({ where: { id: tonIdentityId } });
    expect(identity.isActive).toBe(true);
    expect(identity.factor.toFixed(8)).toBe('1.00000000');
  });

  it('reglas: duplicada → 409; destino ≠ tonelaje → 422 INVALID_CONVERSION_TARGET; ámbito incoherente → 422; referencias → 422', async () => {
    const admin = api(context, adminToken);
    const kg = await insertUnit(context.prisma, { dimension: 'MASS' });
    await admin.post('/unit-conversion-rules').send({ fromUnitId: kg.id, factor: '0.001' }).expect(201);
    const duplicate = await admin.post('/unit-conversion-rules').send({ fromUnitId: kg.id, factor: '0.002', scope: 'GLOBAL' }).expect(409);
    expect(duplicate.body).toMatchObject({ code: 'RESOURCE_CONFLICT', details: [{ field: 'fromUnitId' }, { field: 'toUnitId' }, { field: 'scope' }] });

    const target = await admin.post('/unit-conversion-rules').send({ fromUnitId: tonId, toUnitId: kg.id, factor: '1000' }).expect(422);
    expect(target.body).toMatchObject({ code: 'INVALID_CONVERSION_TARGET', details: [{ field: 'toUnitId', tonnageUnitCode: 'TON' }] });

    const scope = await admin.post('/unit-conversion-rules').send({ fromUnitId: kg.id, factor: '0.001', scope: 'PRODUCT' }).expect(422);
    expect(scope.body).toMatchObject({ code: 'INVALID_CONVERSION_SCOPE', details: [{ field: 'productId', issue: 'required' }] });
    const extra = await admin
      .post('/unit-conversion-rules')
      .send({ fromUnitId: kg.id, factor: '0.001', scope: 'GLOBAL', projectTypeId: industrialTypeId })
      .expect(422);
    expect(extra.body).toMatchObject({ code: 'INVALID_CONVERSION_SCOPE', details: [{ field: 'projectTypeId', issue: 'not_allowed' }] });

    const inactiveUnit = await insertUnit(context.prisma, { isActive: false });
    const notActive = await admin.post('/unit-conversion-rules').send({ fromUnitId: inactiveUnit.id, factor: '1.5' }).expect(422);
    expect(notActive.body).toMatchObject({ code: 'UNKNOWN_REFERENCE', details: [{ field: 'fromUnitId', issue: 'inactive' }] });
    const notType = await admin
      .post('/unit-conversion-rules')
      .send({ fromUnitId: kg.id, factor: '0.001', scope: 'PROJECT_TYPE', projectTypeId: await catalogItemId(context.prisma, 'crm.prioridad', 'ALTA') })
      .expect(422);
    expect(notType.body).toMatchObject({ code: 'UNKNOWN_REFERENCE', details: [{ field: 'projectTypeId', issue: 'not_found' }] });
  });

  it('400: factor no positivo o no cadena; campos inmutables en la edición', async () => {
    const admin = api(context, adminToken);
    const unit = await insertUnit(context.prisma);
    for (const factor of ['0', '0.00000000', '-1', 1, '1.123456789']) {
      expect((await admin.post('/unit-conversion-rules').send({ fromUnitId: unit.id, factor })).status).toBe(400);
    }
    const rule = await insertConversionRule(context.prisma, { fromUnitId: unit.id, factor: '0.5' });
    for (const body of [{ fromUnitId: unit.id }, { scope: 'PRODUCT' }, { toUnitId: tonId }, { factor: '0' }]) {
      expect((await admin.patch(`/unit-conversion-rules/${rule}`).send(body)).status).toBe(400);
    }
    const family = await insertProductFamily(context.prisma);
    expect((await admin.patch(`/product-families/${family}`).send({ code: 'OTRO' })).status).toBe(400);
    expect((await admin.patch(`/units-of-measure/${unit.id}`).send({ code: 'OTRO' })).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Cambiar un factor no reescribe líneas (PF-07.16, AC-07.32)
// ---------------------------------------------------------------------------

describe('Cambiar el factor de una regla usada no reescribe las líneas (PF-07.16)', () => {
  it('la línea conserva su factor y su tonelaje; desactivar la regla tampoco la toca', async () => {
    const admin = api(context, adminToken);
    const s8 = await testCountry(context.prisma, 'E8', { name: 'Maestros Ocho' });
    const owner = await crmUser(context, { roleCodes: ['asesor'], countryId: s8 });
    const unit = await insertUnit(context.prisma, { dimension: 'COUNT' });
    const product = await insertProduct(context.prisma, { familyId: await insertProductFamily(context.prisma), baseUnitId: unit.id });
    const ruleId = await insertConversionRule(context.prisma, { fromUnitId: unit.id, factor: '0.02' });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: s8 });
    const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: owner.id, countryId: s8 });

    const line = await api(context, owner.token)
      .post(`/projects/${projectId}/products`)
      .send({ productId: product.id, quantity: '100', unitId: unit.id })
      .expect(201);
    expect(line.body).toMatchObject({ conversion: { ruleId, scope: 'GLOBAL', factor: '0.02000000' }, tonnage: '2.0000' });

    await admin.patch(`/unit-conversion-rules/${ruleId}`).send({ factor: '0.05' }).expect(200);
    await admin.patch(`/unit-conversion-rules/${ruleId}`).send({ isActive: false }).expect(200);

    const stored = await context.prisma.projectProduct.findUniqueOrThrow({ where: { id: line.body.id } });
    expect(stored.conversionRuleId).toBe(ruleId);
    expect(stored.conversionFactor?.toFixed(8)).toBe('0.02000000');
    expect(stored.tonnage?.toFixed(4)).toBe('2.0000');
  });
});
