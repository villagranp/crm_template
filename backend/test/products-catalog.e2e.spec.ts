import { randomUUID } from 'node:crypto';

import {
  api,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertConversionRule,
  insertProduct,
  insertProductFamily,
  insertUnit,
  testCountry,
  uniqueSuffix,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext, tokenWithRoles } from './support/test-app';

/**
 * Módulo 3 · Lecturas del maestro de productos y de la conversión (03 F.4; PF-03.80,
 * PF-03.113): `GET /products`, `/product-families`, `/units-of-measure` y
 * `/unit-conversions/resolve`.
 *
 * Aislamiento: familias, productos, unidades y reglas propios con códigos únicos; las
 * listas se filtran por la familia propia o se comparan por pertenencia (nunca totales
 * globales). País de prueba `S3` solo para los usuarios.
 */

let context: TestContext;
let s3: string;
let seller: CrmUser;
let ton: { id: string; code: string; symbol: string };
let industrial: string;
let comercial: string;

// ---------------------------------------------------------------------------
// Ayudantes locales
// ---------------------------------------------------------------------------

interface ResolveQuery {
  fromUnitId?: string;
  productId?: string;
  projectTypeId?: string;
}

function resolve(query: ResolveQuery, token = seller.token) {
  const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined));
  return api(context, token).get(`/unit-conversions/resolve?${params.toString()}`);
}

async function familyRef(familyId: string): Promise<{ id: string; code: string; name: string }> {
  const family = await context.prisma.productFamily.findUniqueOrThrow({ where: { id: familyId } });
  return { id: family.id, code: family.code, name: family.name };
}

beforeAll(async () => {
  context = await createTestContext();
  s3 = await testCountry(context.prisma, 'S3', { name: 'Productos Tres' });
  seller = await crmUser(context, { roleCodes: ['asesor'], countryId: s3 });
  const tonRow = await context.prisma.unitOfMeasure.findUniqueOrThrow({ where: { code: 'TON' } });
  ton = { id: tonRow.id, code: tonRow.code, symbol: tonRow.symbol };
  industrial = await catalogItemId(context.prisma, 'crm.tipo_proyecto', 'INDUSTRIAL');
  comercial = await catalogItemId(context.prisma, 'crm.tipo_proyecto', 'COMERCIAL');
});

afterAll(async () => {
  await closeTestContext(context);
});

// ---------------------------------------------------------------------------
// Autenticación y permisos
// ---------------------------------------------------------------------------

describe('Autenticación y permisos (PF-03.113)', () => {
  it('401 sin token en los cuatro endpoints', async () => {
    const anonymous = api(context);
    for (const path of ['/products', '/product-families', '/units-of-measure', `/unit-conversions/resolve?fromUnitId=${randomUUID()}`]) {
      const response = await anonymous.get(path).expect(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    }
  });

  it('403 con el rol usuario (sin productos.ver ni proyectos.ver)', async () => {
    const plain = await tokenWithRoles(context, ['usuario']);
    const client = api(context, plain.token);
    for (const path of ['/products', '/product-families', '/units-of-measure', `/unit-conversions/resolve?fromUnitId=${randomUUID()}`]) {
      const response = await client.get(path).expect(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    }
  });

  it('cada ruta exige su permiso: sin productos.ver → 403 en productos y familias; unidades y resolve siguen con proyectos.ver', async () => {
    const noProducts = await crmUser(context, { roleCodes: ['asesor'], countryId: s3, deny: ['productos.ver'] });
    const client = api(context, noProducts.token);
    await client.get('/products').expect(403);
    await client.get('/product-families').expect(403);
    await client.get('/units-of-measure').expect(200);
    await client.get(`/unit-conversions/resolve?fromUnitId=${randomUUID()}`).expect(200);

    const noProjects = await crmUser(context, { roleCodes: ['asesor'], countryId: s3, deny: ['proyectos.ver'] });
    const other = api(context, noProjects.token);
    await other.get('/products').expect(200);
    await other.get('/product-families').expect(200);
    await other.get('/units-of-measure').expect(403);
    await other.get(`/unit-conversions/resolve?fromUnitId=${randomUUID()}`).expect(403);
  });
});

// ---------------------------------------------------------------------------
// GET /products (PF-03.80, AC-03.59)
// ---------------------------------------------------------------------------

describe('GET /products (PF-03.80)', () => {
  it('por familia: solo activos, orden por SKU, forma completa del producto', async () => {
    const suffix = uniqueSuffix();
    const unit = await insertUnit(context.prisma, { dimension: 'LENGTH' });
    const familyId = await insertProductFamily(context.prisma);
    const b = await insertProduct(context.prisma, { familyId, baseUnitId: unit.id, sku: `TSKU-${suffix}-B`, description: 'Tubería galvanizada 2"' });
    const a = await insertProduct(context.prisma, { familyId, baseUnitId: unit.id, sku: `TSKU-${suffix}-A`, description: 'Varilla corrugada 3/8' });
    await insertProduct(context.prisma, { familyId, baseUnitId: unit.id, sku: `TSKU-${suffix}-C`, description: 'Descontinuado', isActive: false });

    const response = await api(context, seller.token).get(`/products?familyId=${familyId}`).expect(200);
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
    expect(response.body.data).toEqual([
      {
        id: a.id,
        sku: a.sku,
        description: 'Varilla corrugada 3/8',
        family: await familyRef(familyId),
        baseUnit: { id: unit.id, code: unit.code, symbol: unit.code.toLowerCase(), dimension: 'LENGTH' },
        isActive: true,
      },
      expect.objectContaining({ id: b.id, sku: b.sku, isActive: true }),
    ]);
  });

  it('búsqueda contenida en SKU o descripción, sin mayúsculas ni acentos', async () => {
    const suffix = uniqueSuffix();
    const unit = await insertUnit(context.prisma);
    const familyId = await insertProductFamily(context.prisma);
    const pipe = await insertProduct(context.prisma, { familyId, baseUnitId: unit.id, sku: `TSKU-${suffix}-P`, description: `Tubería Galvanizada ${suffix}` });
    const rebar = await insertProduct(context.prisma, { familyId, baseUnitId: unit.id, sku: `TSKU-${suffix}-R`, description: `Varilla ${suffix}` });
    await insertProduct(context.prisma, { familyId, baseUnitId: unit.id, sku: `TSKU-${suffix}-X`, description: `Tubería inactiva ${suffix}`, isActive: false });
    const client = api(context, seller.token);
    const ids = async (search: string): Promise<string[]> =>
      (await client.get(`/products?pageSize=100&search=${encodeURIComponent(search)}`).expect(200)).body.data.map((item: { id: string }) => item.id);

    expect(await ids(`TUBERIA galvanizada ${suffix.toLowerCase()}`)).toEqual([pipe.id]);
    expect(await ids(`tubería   GALVANIZADA   ${suffix}`)).toEqual([pipe.id]);
    expect(await ids(`sku-${suffix.toLowerCase()}-r`)).toEqual([rebar.id]);
    expect(await ids(`${suffix}`)).toEqual([pipe.id, rebar.id]);
    expect(await ids(`varilla ${suffix} inexistente`)).toEqual([]);
    // Comodines de LIKE tratados como literales.
    expect(await ids(`%${suffix}`)).toEqual([]);
    expect(await ids(`TSKU_${suffix}`)).toEqual([]);
  });

  it('isActive=false: solo inactivos; paginación; filtros combinados', async () => {
    const suffix = uniqueSuffix();
    const unit = await insertUnit(context.prisma);
    const familyId = await insertProductFamily(context.prisma);
    const otherFamily = await insertProductFamily(context.prisma);
    const skus = ['A', 'B', 'C'].map((letter) => `TSKU-${suffix}-${letter}`);
    for (const sku of skus) await insertProduct(context.prisma, { familyId, baseUnitId: unit.id, sku });
    const inactive = await insertProduct(context.prisma, { familyId, baseUnitId: unit.id, sku: `TSKU-${suffix}-Z`, isActive: false });
    const foreign = await insertProduct(context.prisma, { familyId: otherFamily, baseUnitId: unit.id, sku: `TSKU-${suffix}-F` });
    const client = api(context, seller.token);

    const onlyInactive = await client.get(`/products?familyId=${familyId}&isActive=false`).expect(200);
    expect(onlyInactive.body.data.map((item: { id: string; isActive: boolean }) => [item.id, item.isActive])).toEqual([[inactive.id, false]]);
    const explicitActive = await client.get(`/products?familyId=${familyId}&isActive=true`).expect(200);
    expect(explicitActive.body.data.map((item: { sku: string }) => item.sku)).toEqual(skus);

    const page1 = await client.get(`/products?familyId=${familyId}&pageSize=2&page=1`).expect(200);
    expect(page1.body.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    expect(page1.body.data.map((item: { sku: string }) => item.sku)).toEqual(skus.slice(0, 2));
    const page2 = await client.get(`/products?familyId=${familyId}&pageSize=2&page=2`).expect(200);
    expect(page2.body.data.map((item: { sku: string }) => item.sku)).toEqual(skus.slice(2));

    const combined = await client.get(`/products?familyId=${otherFamily}&search=${suffix}`).expect(200);
    expect(combined.body.data.map((item: { id: string }) => item.id)).toEqual([foreign.id]);
    const noMatch = await client.get(`/products?familyId=${otherFamily}&search=${suffix}-A`).expect(200);
    expect(noMatch.body).toEqual({ data: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });

  it('400: pageSize > 100, familyId no UUID, isActive no booleano, sortBy no admitido', async () => {
    const client = api(context, seller.token);
    for (const query of ['pageSize=101', 'familyId=no-es-uuid', 'isActive=quizas', 'sortBy=description']) {
      const response = await client.get(`/products?${query}`).expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    }
  });
});

// ---------------------------------------------------------------------------
// Familias y unidades
// ---------------------------------------------------------------------------

describe('GET /product-families y /units-of-measure', () => {
  it('familias: solo activas, con id, código, nombre y descripción', async () => {
    const active = await insertProductFamily(context.prisma, { name: `Familia activa ${uniqueSuffix()}` });
    const inactive = await insertProductFamily(context.prisma, { isActive: false });
    const response = await api(context, seller.token).get('/product-families').expect(200);
    const items = response.body.data as { id: string }[];
    expect(items).toContainEqual({ ...(await familyRef(active)), description: null });
    expect(items.map((item) => item.id)).not.toContain(inactive);
    expect(response.body).not.toHaveProperty('pagination');
  });

  it('unidades: solo activas, con id, código, nombre, símbolo y dimensión', async () => {
    const active = await insertUnit(context.prisma, { dimension: 'VOLUME' });
    const inactive = await insertUnit(context.prisma, { isActive: false });
    const response = await api(context, seller.token).get('/units-of-measure').expect(200);
    const items = response.body.data as { id: string; code: string }[];
    expect(items).toContainEqual({ id: active.id, code: active.code, name: `Unidad ${active.code}`, symbol: active.code.toLowerCase(), dimension: 'VOLUME' });
    expect(items.map((item) => item.id)).not.toContain(inactive.id);
    expect(items).toContainEqual(expect.objectContaining({ id: ton.id, code: 'TON', dimension: 'MASS' }));
  });
});

// ---------------------------------------------------------------------------
// GET /unit-conversions/resolve
// ---------------------------------------------------------------------------

describe('GET /unit-conversions/resolve (precedencia, 03 C.5, F.4)', () => {
  it('con producto: PRODUCT > PRODUCT_FAMILY > PROJECT_TYPE > GLOBAL; sin producto: PROJECT_TYPE > GLOBAL', async () => {
    const unit = await insertUnit(context.prisma, { dimension: 'LENGTH' });
    const family = await insertProductFamily(context.prisma);
    const otherFamily = await insertProductFamily(context.prisma);
    const withRule = await insertProduct(context.prisma, { familyId: family, baseUnitId: unit.id });
    const sibling = await insertProduct(context.prisma, { familyId: family, baseUnitId: unit.id });
    const stranger = await insertProduct(context.prisma, { familyId: otherFamily, baseUnitId: unit.id });

    const globalRule = await insertConversionRule(context.prisma, { fromUnitId: unit.id, factor: '0.001' });
    const typeRule = await insertConversionRule(context.prisma, { fromUnitId: unit.id, factor: '0.002', scope: 'PROJECT_TYPE', projectTypeId: industrial });
    const familyRule = await insertConversionRule(context.prisma, { fromUnitId: unit.id, factor: '0.003', scope: 'PRODUCT_FAMILY', productFamilyId: family });
    const productRule = await insertConversionRule(context.prisma, { fromUnitId: unit.id, factor: '0.00412345', scope: 'PRODUCT', productId: withRule.id });

    const fromUnit = { id: unit.id, code: unit.code, symbol: unit.code.toLowerCase() };
    const product = await resolve({ fromUnitId: unit.id, productId: withRule.id, projectTypeId: industrial }).expect(200);
    expect(product.body).toEqual({ rule: { id: productRule, scope: 'PRODUCT', factor: '0.00412345', fromUnit, toUnit: ton } });

    const cases: [ResolveQuery, string, string, string][] = [
      [{ fromUnitId: unit.id, productId: sibling.id, projectTypeId: industrial }, familyRule, 'PRODUCT_FAMILY', '0.00300000'],
      [{ fromUnitId: unit.id, productId: stranger.id, projectTypeId: industrial }, typeRule, 'PROJECT_TYPE', '0.00200000'],
      [{ fromUnitId: unit.id, productId: stranger.id, projectTypeId: comercial }, globalRule, 'GLOBAL', '0.00100000'],
      [{ fromUnitId: unit.id, productId: stranger.id }, globalRule, 'GLOBAL', '0.00100000'],
      // Sin producto (proyecto): las reglas de producto y familia no aplican.
      [{ fromUnitId: unit.id, projectTypeId: industrial }, typeRule, 'PROJECT_TYPE', '0.00200000'],
      [{ fromUnitId: unit.id }, globalRule, 'GLOBAL', '0.00100000'],
    ];
    for (const [query, id, scope, factor] of cases) {
      const response = await resolve(query).expect(200);
      expect(response.body).toEqual({ rule: { id, scope, factor, fromUnit, toUnit: ton } });
    }
  });

  it('las reglas inactivas nunca se devuelven; sin regla aplicable → rule null', async () => {
    const family = await insertProductFamily(context.prisma);
    const unit = await insertUnit(context.prisma);
    const product = await insertProduct(context.prisma, { familyId: family, baseUnitId: unit.id });
    const globalRule = await insertConversionRule(context.prisma, { fromUnitId: unit.id, factor: '0.5' });
    await insertConversionRule(context.prisma, { fromUnitId: unit.id, factor: '0.7', scope: 'PRODUCT', productId: product.id, isActive: false });
    await insertConversionRule(context.prisma, { fromUnitId: unit.id, factor: '0.8', scope: 'PROJECT_TYPE', projectTypeId: industrial, isActive: false });

    const skipped = await resolve({ fromUnitId: unit.id, productId: product.id, projectTypeId: industrial }).expect(200);
    expect(skipped.body.rule).toMatchObject({ id: globalRule, scope: 'GLOBAL', factor: '0.50000000' });

    const onlyInactive = await insertUnit(context.prisma);
    await insertConversionRule(context.prisma, { fromUnitId: onlyInactive.id, factor: '0.5', isActive: false });
    expect((await resolve({ fromUnitId: onlyInactive.id }).expect(200)).body).toEqual({ rule: null });

    const bare = await insertUnit(context.prisma);
    expect((await resolve({ fromUnitId: bare.id, productId: product.id }).expect(200)).body).toEqual({ rule: null });

    // Regla hacia una unidad que no es la de tonelaje: no aplica.
    const towardOther = await insertUnit(context.prisma);
    const mass = await insertUnit(context.prisma, { dimension: 'MASS' });
    await insertConversionRule(context.prisma, { fromUnitId: towardOther.id, toUnitId: mass.id, factor: '3' });
    expect((await resolve({ fromUnitId: towardOther.id }).expect(200)).body).toEqual({ rule: null });

    // Unidad inexistente: sin regla.
    expect((await resolve({ fromUnitId: randomUUID() }).expect(200)).body).toEqual({ rule: null });
  });

  it('identidad TON → TON de la semilla esencial (factor 1, GLOBAL)', async () => {
    const response = await resolve({ fromUnitId: ton.id }).expect(200);
    expect(response.body.rule).toMatchObject({ scope: 'GLOBAL', factor: '1.00000000', fromUnit: ton, toUnit: ton });
  });

  it('400: falta fromUnitId o algún id no es UUID', async () => {
    const unit = await insertUnit(context.prisma);
    for (const query of [{}, { fromUnitId: 'M2' }, { fromUnitId: unit.id, productId: 'no-es-uuid' }, { fromUnitId: unit.id, projectTypeId: 'VIVIENDA' }]) {
      const response = await resolve(query).expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    }
  });
});
