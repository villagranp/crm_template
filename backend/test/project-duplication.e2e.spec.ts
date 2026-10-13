import { randomUUID } from 'node:crypto';

import {
  api,
  businessMonthOffset,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertActivity,
  insertConversionRule,
  insertCustomer,
  insertForecastLine,
  insertOpportunity,
  insertProduct,
  insertProductFamily,
  insertProject,
  insertProjectProduct,
  insertTeam,
  insertUnit,
  insertVisit,
  testCountry,
  uniqueSuffix,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 3 · Duplicar proyecto, F-12 (03 J: PF-03.26–PF-03.29; RN-03.20–RN-03.24;
 * PF-03.113 del endpoint `POST /projects/{id}/duplicate`).
 *
 * Aislamiento: países de prueba propios `U2` (origen) y `U3` (país de otro cliente);
 * unidades, productos y reglas propios (códigos únicos). Las comprobaciones de "no se
 * copia" cuentan filas **del proyecto nuevo**, nunca totales globales.
 */

let context: TestContext;
let u2: string;
let u3: string;

const OLD_ACTIVITY = new Date('2026-01-01T00:00:00.000Z');
const CODE_PATTERN = /^PRY-(\d{4})-\d{5}$/;

beforeAll(async () => {
  context = await createTestContext();
  u2 = await testCountry(context.prisma, 'U2', { name: 'Duplicado Dos' });
  u3 = await testCountry(context.prisma, 'U3', { name: 'Duplicado Tres' });
});

afterAll(async () => {
  await closeTestContext(context);
});

// ---------------------------------------------------------------------------
// Ayudantes locales
// ---------------------------------------------------------------------------

async function advisor(): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['asesor'], countryId: u2 });
}

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Año en curso en la zona del negocio (el folio PRY-AAAA se calcula en ella). */
function businessYear(): number {
  return businessMonthOffset(0).year;
}

interface Source {
  id: string;
  code: string;
  name: string;
  customerId: string;
}

/** Proyecto origen propio de `owner`, con ubicación, descripción y fechas. */
async function sourceProject(owner: CrmUser, options: { phaseCode?: string; customerId?: string } = {}): Promise<Source> {
  const customerId = options.customerId ?? (await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: u2 })).id;
  const name = `Origen ${uniqueSuffix()}`;
  const id = await insertProject(context.prisma, {
    customerId,
    ownerId: owner.id,
    countryId: u2,
    name,
    city: 'Ciudad Origen',
    phaseCode: options.phaseCode ?? 'DISENO',
    lastActivityAt: OLD_ACTIVITY,
    estimatedDecisionDate: '2026-12-15',
  });
  await context.prisma.project.update({
    where: { id },
    data: { address: 'Avenida Origen 10', description: 'Descripción del origen', estimatedStartDate: day('2026-11-01'), estimatedEndDate: day('2027-03-31') },
  });
  const row = await context.prisma.project.findUniqueOrThrow({ where: { id } });
  return { id, code: row.code, name, customerId };
}

async function unit(dimension: 'COUNT' | 'MASS' | 'AREA' = 'COUNT', isActive = true): Promise<{ id: string; code: string; symbol: string; dimension: string }> {
  const created = await insertUnit(context.prisma, { dimension, isActive });
  return { id: created.id, code: created.code, symbol: created.code.toLowerCase(), dimension };
}

async function newProduct(baseUnitId: string, isActive = true): Promise<string> {
  const familyId = await insertProductFamily(context.prisma);
  return (await insertProduct(context.prisma, { familyId, baseUnitId, isActive })).id;
}

function duplicate(user: CrmUser, sourceId: string, body: Record<string, unknown>) {
  return api(context, user.token).post(`/projects/${sourceId}/duplicate`).send(body);
}

async function copiesOf(sourceId: string): Promise<number> {
  return context.prisma.project.count({ where: { duplicatedFromId: sourceId } });
}

// ---------------------------------------------------------------------------
// Autenticación y permisos (PF-03.113)
// ---------------------------------------------------------------------------

describe('Autenticación y permiso del duplicado', () => {
  it('401 sin token', async () => {
    const response = await api(context).post(`/projects/${randomUUID()}/duplicate`).send({ name: 'Copia' });
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('403 sin proyectos.crear, aunque el origen sea visible', async () => {
    const owner = await advisor();
    const source = await sourceProject(owner);
    const plain = await crmUser(context, { roleCodes: ['usuario'], countryId: u2 });
    const noCreate = await crmUser(context, { roleCodes: ['asesor'], countryId: u2, deny: ['proyectos.crear'] });
    const ownSource = await sourceProject(noCreate);

    for (const [user, sourceId] of [
      [plain, source.id],
      [noCreate, ownSource.id],
    ] as const) {
      const response = await duplicate(user, sourceId, { name: 'Copia' });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'PERMISSION_DENIED' });
    }
    expect(await copiesOf(source.id)).toBe(0);
    expect(await copiesOf(ownSource.id)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PF-03.26 — Opciones por defecto
// ---------------------------------------------------------------------------

describe('Duplicar con las opciones por defecto (PF-03.26, AC-03.17)', () => {
  it('crea un proyecto con código nuevo, origen trazado, datos copiados, tonelaje con la regla vigente y auditoría', async () => {
    const owner = await advisor();
    const source = await sourceProject(owner);
    const area = await unit('AREA');
    const viviendaId = await catalogItemId(context.prisma, 'crm.tipo_proyecto', 'VIVIENDA');
    const residencialId = await catalogItemId(context.prisma, 'crm.sector_proyecto', 'RESIDENCIAL');
    // Clasificación del origen con una regla GLOBAL (foto 0.05 → 50 t)...
    const oldRule = await insertConversionRule(context.prisma, { fromUnitId: area.id, factor: '0.05', scope: 'GLOBAL' });
    await context.prisma.project.update({
      where: { id: source.id },
      data: {
        projectTypeId: viviendaId,
        sectorId: residencialId,
        measureUnitId: area.id,
        estimatedQuantity: '1000',
        conversionRuleId: oldRule,
        conversionFactor: '0.05',
        estimatedTonnage: '50',
      },
    });
    // ...que ya no es la vigente: se desactiva y la nueva es por tipo de proyecto.
    await context.prisma.unitConversionRule.update({ where: { id: oldRule }, data: { isActive: false } });
    const currentRule = await insertConversionRule(context.prisma, { fromUnitId: area.id, factor: '0.02', scope: 'PROJECT_TYPE', projectTypeId: viviendaId });
    const ton = await context.prisma.unitOfMeasure.findUniqueOrThrow({ where: { code: 'TON' } });
    const startedAt = Date.now();

    const response = await duplicate(owner, source.id, { name: '  Copia del origen  ' });
    expect(response.status).toBe(201);
    const body = response.body;
    const newId = body.id as string;
    expect(newId).not.toBe(source.id);
    expect(response.headers.location).toBe(`/api/v1/projects/${newId}`);
    expect(body.code).toMatch(CODE_PATTERN);
    expect(Number(CODE_PATTERN.exec(body.code as string)?.[1])).toBe(businessYear());
    expect(body.code).not.toBe(source.code);
    expect(body).toMatchObject({
      name: 'Copia del origen',
      customer: { id: source.customerId },
      country: { id: u2, isoCode: 'U2', name: 'Duplicado Dos' },
      city: 'Ciudad Origen',
      address: 'Avenida Origen 10',
      description: 'Descripción del origen',
      estimatedStartDate: '2026-11-01',
      estimatedEndDate: '2027-03-31',
      estimatedDecisionDate: '2026-12-15',
      owner: { id: owner.id },
      opportunityCount: 0,
      duplicatedFrom: { id: source.id, code: source.code, name: source.name },
      createdBy: { id: owner.id },
    });
    expect(body.phase.phase).toMatchObject({ code: 'DISENO' });
    expect(body.classification).toEqual({
      projectType: { id: viviendaId, code: 'VIVIENDA', label: 'Vivienda', isActive: true },
      sector: { id: residencialId, code: 'RESIDENCIAL', label: 'Residencial', isActive: true },
      measureUnit: { id: area.id, code: area.code, symbol: area.symbol, dimension: 'AREA' },
      estimatedQuantity: '1000.0000',
      tonnageMode: 'RULE',
      conversion: { ruleId: currentRule, scope: 'PROJECT_TYPE', factor: '0.02000000', toUnit: expect.objectContaining({ id: ton.id, code: 'TON' }) },
      estimatedTonnage: '20.0000',
    });
    expect(new Date(body.lastActivityAt as string).getTime()).toBeGreaterThanOrEqual(startedAt - 1000);

    const stored = await context.prisma.project.findUniqueOrThrow({ where: { id: newId } });
    expect(stored.duplicatedFromId).toBe(source.id);
    expect(stored.createdById).toBe(owner.id);
    expect([stored.conversionRuleId, stored.conversionFactor?.toFixed(8), stored.estimatedTonnage?.toFixed(4)]).toEqual([currentRule, '0.02000000', '20.0000']);
    // El origen no cambia.
    const sourceRow = await context.prisma.project.findUniqueOrThrow({ where: { id: source.id } });
    expect([sourceRow.conversionRuleId, sourceRow.estimatedTonnage?.toFixed(4), sourceRow.lastActivityAt]).toEqual([oldRule, '50.0000', OLD_ACTIVITY]);

    const audits = await context.prisma.auditLog.findMany({ where: { event: 'crm.project.duplicated', resourceId: newId } });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.resourceType).toBe('crm.project');
    expect(audits[0]?.subjectId).toBe(owner.id);
    expect(audits[0]?.metadata).toEqual({ code: body.code, sourceProjectId: source.id, productLinesCopied: 0 });
    expect(audits[0]?.changes).toMatchObject({ name: { before: null, after: 'Copia del origen' }, address: { before: null, after: 'A***' } });

    // La ficha del nuevo muestra el origen.
    const detail = await api(context, owner.token).get(`/projects/${newId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.duplicatedFrom).toEqual({ id: source.id, code: source.code, name: source.name });
  });

  it('una estimación manual se copia como manual; con regla y sin regla vigente queda sin estimación', async () => {
    const owner = await advisor();
    const area = await unit('AREA');
    const manualSource = await sourceProject(owner);
    await context.prisma.project.update({ where: { id: manualSource.id }, data: { measureUnitId: area.id, estimatedQuantity: '300', estimatedTonnage: '75.5' } });
    const ruleSource = await sourceProject(owner);
    const rule = await insertConversionRule(context.prisma, { fromUnitId: area.id, factor: '0.1', scope: 'GLOBAL' });
    await context.prisma.project.update({
      where: { id: ruleSource.id },
      data: { measureUnitId: area.id, estimatedQuantity: '300', conversionRuleId: rule, conversionFactor: '0.1', estimatedTonnage: '30' },
    });
    await context.prisma.unitConversionRule.update({ where: { id: rule }, data: { isActive: false } });

    const manual = await duplicate(owner, manualSource.id, { name: 'Copia manual' });
    expect(manual.status).toBe(201);
    expect(manual.body.classification).toMatchObject({ estimatedQuantity: '300.0000', tonnageMode: 'MANUAL', conversion: null, estimatedTonnage: '75.5000' });

    const noRule = await duplicate(owner, ruleSource.id, { name: 'Copia sin regla' });
    expect(noRule.status).toBe(201);
    expect(noRule.body.classification).toMatchObject({
      measureUnit: { id: area.id },
      estimatedQuantity: '300.0000',
      tonnageMode: 'NONE',
      conversion: null,
      estimatedTonnage: null,
    });
    const stored = await context.prisma.project.findUniqueOrThrow({ where: { id: noRule.body.id as string } });
    expect([stored.conversionRuleId, stored.conversionFactor, stored.estimatedTonnage]).toEqual([null, null, null]);
  });

  it('sin las casillas no copia ubicación, descripción ni clasificación; las fechas se confirman o se vacían', async () => {
    const owner = await advisor();
    const otherCustomer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: u3 });
    const source = await sourceProject(owner);
    await context.prisma.project.update({
      where: { id: source.id },
      data: { projectTypeId: await catalogItemId(context.prisma, 'crm.tipo_proyecto', 'EDIFICIO'), estimatedQuantity: '10' },
    });

    const response = await duplicate(owner, source.id, {
      name: 'Copia vacía',
      customerId: otherCustomer.id,
      estimatedStartDate: '2027-01-10',
      estimatedEndDate: null,
      estimatedDecisionDate: null,
      copy: { location: false, description: false, classification: false },
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      customer: { id: otherCustomer.id },
      // Sin ubicación: país por defecto, el del cliente (RN-03.5).
      country: { id: u3, isoCode: 'U3' },
      city: null,
      address: null,
      description: null,
      estimatedStartDate: '2027-01-10',
      estimatedEndDate: null,
      estimatedDecisionDate: null,
      projectType: null,
    });
    expect(response.body.classification).toEqual({
      projectType: null,
      sector: null,
      measureUnit: null,
      estimatedQuantity: null,
      tonnageMode: 'NONE',
      conversion: null,
      estimatedTonnage: null,
    });
  });
});

// ---------------------------------------------------------------------------
// PF-03.27 — Lo que nunca se copia (RN-03.23)
// ---------------------------------------------------------------------------

describe('Lo que nunca se copia (PF-03.27, AC-03.18)', () => {
  it('el duplicado de un origen completo no hereda oportunidades, resultados, fase, forecast, adjuntos, visitas, actividades ni auditoría', async () => {
    const owner = await advisor();
    const source = await sourceProject(owner, { phaseCode: 'COTIZACION' });
    await context.prisma.project.update({ where: { id: source.id }, data: { phaseProgress: '40' } });
    const cotizacionId = await catalogItemId(context.prisma, 'crm.fase_cliente', 'COTIZACION');
    const disenoId = await catalogItemId(context.prisma, 'crm.fase_cliente', 'DISENO');
    await context.prisma.projectPhaseHistory.createMany({
      data: [
        { projectId: source.id, fromPhaseId: null, toPhaseId: disenoId, toProgress: '0', changedById: owner.id },
        { projectId: source.id, fromPhaseId: disenoId, toPhaseId: cotizacionId, fromProgress: '0', toProgress: '40', changedById: owner.id },
      ],
    });
    await insertOpportunity(context.prisma, { projectId: source.id, ownerId: owner.id, stageCode: 'COTIZANDO' });
    await insertOpportunity(context.prisma, { projectId: source.id, ownerId: owner.id, stageCode: 'GANADO', outcome: 'WON' });
    await insertOpportunity(context.prisma, { projectId: source.id, ownerId: owner.id, stageCode: 'PERDIDO', outcome: 'LOST' });
    const base = await unit();
    const productId = await newProduct(base.id);
    await insertProjectProduct(context.prisma, { projectId: source.id, productId, unitId: base.id });
    for (const offset of [1, 2, 3]) {
      await insertForecastLine(context.prisma, { projectId: source.id, productId, unitId: base.id, ownerId: owner.id, ...businessMonthOffset(offset) });
    }
    await insertVisit(context.prisma, { customerId: source.customerId, ownerId: owner.id, projectId: source.id });
    await insertActivity(context.prisma, { customerId: source.customerId, ownerId: owner.id, projectId: source.id });
    const file = await context.prisma.storedFile.create({
      data: { storageKey: `test/dup/${randomUUID()}`, fileName: 'plano.pdf', mimeType: 'application/pdf', sizeBytes: 10, uploadedById: owner.id },
    });
    await context.prisma.attachment.create({ data: { storedFileId: file.id, projectId: source.id, createdById: owner.id } });
    await context.prisma.auditLog.create({
      data: { correlationId: randomUUID(), event: 'crm.project.updated', resourceType: 'crm.project', resourceId: source.id, subjectId: owner.id },
    });

    const response = await duplicate(owner, source.id, { name: 'Copia limpia' });
    expect(response.status).toBe(201);
    const newId = response.body.id as string;
    expect(response.body).toMatchObject({ opportunityCount: 0, summary: { openOpportunities: 0, wonOpportunities: 0, partialOpportunities: 0, lostOpportunities: 0, productLines: 0, attachments: 0 } });
    expect(response.body.phase).toMatchObject({ phase: { code: 'DISENO' }, progress: '0.00', comment: null });

    const prisma = context.prisma;
    const counts = {
      opportunities: await prisma.opportunity.count({ where: { projectId: newId } }),
      results: await prisma.opportunityResult.count({ where: { opportunity: { projectId: newId } } }),
      forecast: await prisma.forecastLine.count({ where: { projectId: newId } }),
      attachments: await prisma.attachment.count({ where: { projectId: newId } }),
      visits: await prisma.visit.count({ where: { projectId: newId } }),
      activities: await prisma.activity.count({ where: { projectId: newId } }),
      products: await prisma.projectProduct.count({ where: { projectId: newId } }),
    };
    expect(counts).toEqual({ opportunities: 0, results: 0, forecast: 0, attachments: 0, visits: 0, activities: 0, products: 0 });

    const history = await prisma.projectPhaseHistory.findMany({ where: { projectId: newId } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromPhaseId: null, toPhaseId: disenoId, changedById: owner.id });
    expect(history[0]?.toProgress.toFixed(2)).toBe('0.00');

    const stored = await prisma.project.findUniqueOrThrow({ where: { id: newId } });
    expect(stored.phaseId).toBe(disenoId);
    expect(stored.phaseProgress.toFixed(2)).toBe('0.00');
    expect(stored.lastActivityAt.getTime()).toBeGreaterThan(OLD_ACTIVITY.getTime());
    expect(stored.deletedAt).toBeNull();

    // Auditoría del nuevo: solo su alta como duplicado.
    const audits = await prisma.auditLog.findMany({ where: { resourceId: newId } });
    expect(audits.map((entry) => entry.event)).toEqual(['crm.project.duplicated']);

    // El origen conserva todo.
    expect(await prisma.opportunity.count({ where: { projectId: source.id } })).toBe(3);
    expect(await prisma.forecastLine.count({ where: { projectId: source.id } })).toBe(3);
    expect(await prisma.projectPhaseHistory.count({ where: { projectId: source.id } })).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// PF-03.28 — Productos asociados
// ---------------------------------------------------------------------------

describe('Duplicar con productos asociados (PF-03.28, AC-03.19)', () => {
  it('copia una vez cada producto activo con unidad activa, en PROPUESTO, sin oportunidad y con tonelaje recalculado; sin la opción, ninguno', async () => {
    const owner = await advisor();
    const source = await sourceProject(owner);
    const opportunityId = await insertOpportunity(context.prisma, { projectId: source.id, ownerId: owner.id });
    const unitA = await unit('COUNT');
    const unitB = await unit('MASS');
    const inactiveUnit = await unit('COUNT');
    const repeated = await newProduct(unitA.id);
    const inactiveProduct = await newProduct(unitA.id);
    const onInactiveUnit = await newProduct(unitA.id);
    const deletedLineProduct = await newProduct(unitA.id);
    const discarded = await newProduct(unitB.id);
    const rule = await insertConversionRule(context.prisma, { fromUnitId: unitA.id, factor: '0.5', scope: 'PRODUCT', productId: repeated });

    // Orden de alta explícito: la primera asociación de `repeated` es la que se copia.
    const lines = [
      { productId: repeated, unitId: unitA.id, quantity: '10', statusCode: 'COTIZADO', opportunityId },
      { productId: repeated, unitId: unitA.id, quantity: '20' },
      { productId: inactiveProduct, unitId: unitA.id, quantity: '30' },
      { productId: onInactiveUnit, unitId: inactiveUnit.id, quantity: '40' },
      { productId: deletedLineProduct, unitId: unitA.id, quantity: '50', deletedAt: new Date() },
      { productId: discarded, unitId: unitB.id, quantity: '7', statusCode: 'DESCARTADO' },
    ];
    for (const [index, line] of lines.entries()) {
      const id = await insertProjectProduct(context.prisma, { projectId: source.id, ...line });
      await context.prisma.projectProduct.update({ where: { id }, data: { createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)) } });
    }
    await context.prisma.product.update({ where: { id: inactiveProduct }, data: { isActive: false } });
    await context.prisma.unitOfMeasure.update({ where: { id: inactiveUnit.id }, data: { isActive: false } });
    const proposedId = await catalogItemId(context.prisma, 'crm.estado_producto_asociado', 'PROPUESTO');

    const withProducts = await duplicate(owner, source.id, { name: 'Copia con productos', copy: { products: true } });
    expect(withProducts.status).toBe(201);
    const newId = withProducts.body.id as string;
    expect(withProducts.body.summary.productLines).toBe(2);

    const copied = await context.prisma.projectProduct.findMany({ where: { projectId: newId }, orderBy: { createdAt: 'asc' } });
    expect(
      copied
        .map((row) => ({
          productId: row.productId,
          unitId: row.unitId,
          quantity: row.quantity.toFixed(4),
          opportunityId: row.opportunityId,
          statusId: row.statusId,
          conversionRuleId: row.conversionRuleId,
          conversionFactor: row.conversionFactor?.toFixed(8) ?? null,
          tonnage: row.tonnage?.toFixed(4) ?? null,
          notes: row.notes,
          deletedAt: row.deletedAt,
          createdById: row.createdById,
        }))
        .sort((a, b) => (a.productId === repeated ? -1 : b.productId === repeated ? 1 : 0)),
    ).toEqual([
      {
        productId: repeated,
        unitId: unitA.id,
        quantity: '10.0000',
        opportunityId: null,
        statusId: proposedId,
        conversionRuleId: rule,
        conversionFactor: '0.50000000',
        tonnage: '5.0000',
        notes: null,
        deletedAt: null,
        createdById: owner.id,
      },
      {
        productId: discarded,
        unitId: unitB.id,
        quantity: '7.0000',
        opportunityId: null,
        statusId: proposedId,
        conversionRuleId: null,
        conversionFactor: null,
        tonnage: null,
        notes: null,
        deletedAt: null,
        createdById: owner.id,
      },
    ]);

    // La ficha del nuevo lo refleja en sus totales (dos líneas activas, una sin conversión).
    const list = await api(context, owner.token).get(`/projects/${newId}/products`);
    expect(list.status).toBe(200);
    expect(list.body.pagination.totalItems).toBe(2);
    expect(list.body.totals).toMatchObject({ tonnage: '5.0000', linesWithoutConversion: 1 });

    const [entry] = await context.prisma.auditLog.findMany({ where: { event: 'crm.project.duplicated', resourceId: newId } });
    expect(entry?.metadata).toEqual({ code: withProducts.body.code, sourceProjectId: source.id, productLinesCopied: 2 });

    const withoutProducts = await duplicate(owner, source.id, { name: 'Copia sin productos' });
    expect(withoutProducts.status).toBe(201);
    expect(await context.prisma.projectProduct.count({ where: { projectId: withoutProducts.body.id as string } })).toBe(0);
    const explicitFalse = await duplicate(owner, source.id, { name: 'Copia sin productos 2', copy: { products: false } });
    expect(explicitFalse.status).toBe(201);
    expect(await context.prisma.projectProduct.count({ where: { projectId: explicitFalse.body.id as string } })).toBe(0);

    // El origen conserva sus seis asociaciones.
    expect(await context.prisma.projectProduct.count({ where: { projectId: source.id } })).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// PF-03.29 — Rechazos
// ---------------------------------------------------------------------------

describe('Rechazos del duplicado (PF-03.29, AC-03.20)', () => {
  it('400 con nombre vacío, ausente o demasiado largo y con opciones mal formadas', async () => {
    const owner = await advisor();
    const source = await sourceProject(owner);
    for (const body of [
      { name: '   ' },
      {},
      { name: 'x'.repeat(201) },
      { name: 'Copia', copy: { products: 'sí' } },
      { name: 'Copia', customerId: 'no-es-uuid' },
      { name: 'Copia', estimatedStartDate: '2026-13-01' },
    ]) {
      const response = await duplicate(owner, source.id, body);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    expect((await api(context, owner.token).post('/projects/no-es-uuid/duplicate').send({ name: 'Copia' })).status).toBe(400);
    expect(await copiesOf(source.id)).toBe(0);
  });

  it('403 FIELD_NOT_EDITABLE con otro asesor o código manual sin proyectos.administrar', async () => {
    const owner = await advisor();
    const colleague = await advisor();
    const source = await sourceProject(owner);

    const otherOwner = await duplicate(owner, source.id, { name: 'Copia', ownerId: colleague.id });
    expect(otherOwner.status).toBe(403);
    expect(otherOwner.body).toMatchObject({ code: 'FIELD_NOT_EDITABLE', details: [{ field: 'ownerId', requiredPermission: 'proyectos.administrar' }] });

    const manualCode = await duplicate(owner, source.id, { name: 'Copia', code: `DUP-${uniqueSuffix()}` });
    expect(manualCode.status).toBe(403);
    expect(manualCode.body).toMatchObject({ code: 'FIELD_NOT_EDITABLE', details: [{ field: 'code', requiredPermission: 'proyectos.administrar' }] });

    const both = await duplicate(owner, source.id, { name: 'Copia', ownerId: colleague.id, code: `DUP-${uniqueSuffix()}` });
    expect(both.status).toBe(403);
    expect(both.body.details).toEqual([
      { field: 'ownerId', requiredPermission: 'proyectos.administrar' },
      { field: 'code', requiredPermission: 'proyectos.administrar' },
    ]);
    expect(await copiesOf(source.id)).toBe(0);

    // Indicarse a sí mismo como asesor sí está permitido.
    const self = await duplicate(owner, source.id, { name: 'Copia propia', ownerId: owner.id });
    expect(self.status).toBe(201);
    expect(self.body.owner).toMatchObject({ id: owner.id });
  });

  it('404 con el cliente elegido inexistente o no visible; 422 CUSTOMER_INACTIVE con un cliente inactivo', async () => {
    const owner = await advisor();
    const stranger = await advisor();
    const source = await sourceProject(owner);
    const foreignCustomer = await insertCustomer(context.prisma, { salesOwnerId: stranger.id, countryId: u2 });
    const deletedCustomer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: u2, deletedAt: new Date() });
    const inactiveCustomer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: u2, statusCode: 'INACTIVO' });

    for (const customerId of [randomUUID(), foreignCustomer.id, deletedCustomer.id]) {
      const response = await duplicate(owner, source.id, { name: 'Copia', customerId });
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    }
    const inactive = await duplicate(owner, source.id, { name: 'Copia', customerId: inactiveCustomer.id });
    expect(inactive.status).toBe(422);
    expect(inactive.body).toMatchObject({ code: 'CUSTOMER_INACTIVE' });

    // El cliente del origen inactivo también bloquea si no se elige otro.
    await context.prisma.customer.update({
      where: { id: source.customerId },
      data: { statusId: await catalogItemId(context.prisma, 'crm.estado_cliente', 'INACTIVO') },
    });
    const inheritedInactive = await duplicate(owner, source.id, { name: 'Copia' });
    expect(inheritedInactive.status).toBe(422);
    expect(inheritedInactive.body).toMatchObject({ code: 'CUSTOMER_INACTIVE' });
    expect(await copiesOf(source.id)).toBe(0);
  });

  it('404 con el origen fuera del alcance, eliminado o inexistente', async () => {
    const owner = await advisor();
    const stranger = await advisor();
    const foreign = await sourceProject(owner);
    const deleted = await sourceProject(stranger);
    await context.prisma.project.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    for (const sourceId of [foreign.id, deleted.id, randomUUID()]) {
      const response = await duplicate(stranger, sourceId, { name: 'Copia' });
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    }
    expect(await copiesOf(foreign.id)).toBe(0);
    expect(await copiesOf(deleted.id)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Asesor por defecto (RN-03.20, RN-03.6)
// ---------------------------------------------------------------------------

describe('Asesor y código del duplicado (RN-03.6, DM-17)', () => {
  it('con proyectos.administrar: por defecto el asesor del origen; puede indicar otro de su alcance y un código manual', async () => {
    const member = await advisor();
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: u2 });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id] });
    const source = await sourceProject(member);

    const inherited = await duplicate(manager, source.id, { name: 'Copia del jefe' });
    expect(inherited.status).toBe(201);
    expect(inherited.body.owner).toMatchObject({ id: member.id });
    expect(inherited.body.createdBy).toMatchObject({ id: manager.id });

    const toSelf = await duplicate(manager, source.id, { name: 'Copia para el jefe', ownerId: manager.id });
    expect(toSelf.status).toBe(201);
    expect(toSelf.body.owner).toMatchObject({ id: manager.id });

    const code = `dup-${uniqueSuffix().toLowerCase()}`;
    const manual = await duplicate(manager, source.id, { name: 'Copia con código', code: `  ${code}  ` });
    expect(manual.status).toBe(201);
    expect(manual.body.code).toBe(code.toUpperCase());

    const taken = await duplicate(manager, source.id, { name: 'Copia con código repetido', code });
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ code: 'PROJECT_CODE_TAKEN', details: [{ field: 'code', code: code.toUpperCase() }] });
    expect(await copiesOf(source.id)).toBe(3);
  });

  it('sin proyectos.administrar: por defecto el propio actor, aunque el origen sea de otro asesor visible', async () => {
    const member = await advisor();
    const viewer = await crmUser(context, { roleCodes: ['manager'], countryId: u2, deny: ['proyectos.administrar'] });
    await insertTeam(context.prisma, { managerId: viewer.id, memberIds: [member.id] });
    const source = await sourceProject(member);

    const response = await duplicate(viewer, source.id, { name: 'Copia del lector' });
    expect(response.status).toBe(201);
    expect(response.body.owner).toMatchObject({ id: viewer.id });

    const denied = await duplicate(viewer, source.id, { name: 'Copia', ownerId: member.id });
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ code: 'FIELD_NOT_EDITABLE', details: [{ field: 'ownerId', requiredPermission: 'proyectos.administrar' }] });
  });

  it('el asesor dueño del origen queda como asesor del duplicado', async () => {
    const owner = await advisor();
    const source = await sourceProject(owner);
    const response = await duplicate(owner, source.id, { name: 'Copia del asesor' });
    expect(response.status).toBe(201);
    expect(response.body.owner).toMatchObject({ id: owner.id });
    expect(response.body.capabilities).toMatchObject({ canEdit: true, canDuplicate: true });
  });
});
