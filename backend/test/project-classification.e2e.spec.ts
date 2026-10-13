import { randomUUID } from 'node:crypto';

import {
  api,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertConversionRule,
  insertCustomer,
  insertProject,
  insertTeam,
  insertUnit,
  testCountry,
  uniqueSuffix,
  unitId,
  withParameter,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext, tokenWithRoles } from './support/test-app';

/**
 * Módulo 3 · Clasificación del proyecto, F-15 (03 C.5, F.1; PF-03.40, PF-03.43, PF-03.44,
 * PF-03.46, PF-03.47, PF-03.112 y PF-03.113 para `PUT /projects/{id}/classification`).
 *
 * Aislamiento: país de prueba propio `S2`. Cada prueba crea sus unidades (`insertUnit`)
 * y sus reglas de conversión desde esas unidades, así que nunca depende de las reglas
 * de la semilla ni interfiere con otras suites (`(from, to, scope_key)` es único).
 * `crm.campos_obligatorios` solo se cambia dentro de `withParameter`.
 */

let context: TestContext;
let s2: string;
let tonId: string;
let vivienda: string;
let edificio: string;
let residencial: string;
let comercialSector: string;

const REQUIRED_FIELDS = 'crm.campos_obligatorios';

// ---------------------------------------------------------------------------
// Ayudantes locales
// ---------------------------------------------------------------------------

async function advisor(): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['asesor'], countryId: s2 });
}

async function projectOf(owner: CrmUser, options: { lastActivityAt?: Date; deletedAt?: Date | null; projectTypeId?: string | null } = {}): Promise<string> {
  const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: s2 });
  return insertProject(context.prisma, { customerId: customer.id, ownerId: owner.id, countryId: s2, ...options });
}

function classify(user: CrmUser | { token: string }, projectId: string, body: Record<string, unknown>) {
  return api(context, user.token).put(`/projects/${projectId}/classification`).send(body);
}

/** Unidad propia de área con reglas GLOBAL (0.025) y PROJECT_TYPE `VIVIENDA` (0.035) hacia TON. */
async function unitWithRules(): Promise<{ unit: { id: string; code: string }; globalRule: string; typeRule: string }> {
  const unit = await insertUnit(context.prisma, { dimension: 'AREA' });
  const globalRule = await insertConversionRule(context.prisma, { fromUnitId: unit.id, factor: '0.025' });
  const typeRule = await insertConversionRule(context.prisma, { fromUnitId: unit.id, factor: '0.035', scope: 'PROJECT_TYPE', projectTypeId: vivienda });
  return { unit, globalRule, typeRule };
}

function unitRef(unit: { id: string; code: string }, dimension = 'AREA') {
  return { id: unit.id, code: unit.code, symbol: unit.code.toLowerCase(), dimension };
}

async function projectRow(projectId: string) {
  return context.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
}

/** Cuerpo de un 404 sin `correlationId` ni el identificador. */
function notFoundShape(body: Record<string, unknown>): unknown {
  const details = (body['details'] as { resource: string }[]).map((detail) => ({ resource: detail.resource }));
  return { statusCode: body['statusCode'], code: body['code'], message: body['message'], details };
}

async function inactiveCatalogItem(catalogKey: string): Promise<string> {
  const catalog = await context.prisma.catalog.findUniqueOrThrow({ where: { key: catalogKey } });
  const item = await context.prisma.catalogItem.create({
    data: { catalogId: catalog.id, code: `TEST-${uniqueSuffix()}`, label: 'Elemento inactivo de prueba', sortOrder: 990, isActive: false },
  });
  return item.id;
}

beforeAll(async () => {
  context = await createTestContext();
  s2 = await testCountry(context.prisma, 'S2', { name: 'Clasificación Dos' });
  tonId = await unitId(context.prisma, 'TON');
  vivienda = await catalogItemId(context.prisma, 'crm.tipo_proyecto', 'VIVIENDA');
  edificio = await catalogItemId(context.prisma, 'crm.tipo_proyecto', 'EDIFICIO');
  residencial = await catalogItemId(context.prisma, 'crm.sector_proyecto', 'RESIDENCIAL');
  comercialSector = await catalogItemId(context.prisma, 'crm.sector_proyecto', 'COMERCIAL');
});

afterAll(async () => {
  await closeTestContext(context);
});

// ---------------------------------------------------------------------------
// Autenticación, permisos y visibilidad
// ---------------------------------------------------------------------------

describe('Autenticación, permisos y visibilidad (PF-03.113)', () => {
  it('401 sin token', async () => {
    const response = await api(context).put(`/projects/${randomUUID()}/classification`).send({ tonnageMode: 'NONE' }).expect(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('403 sin proyectos.editar (rol sin permisos y dueño con editar denegado)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const plain = await tokenWithRoles(context, ['usuario']);
    expect((await classify(plain, projectId, { tonnageMode: 'NONE' }).expect(403)).body.code).toBe('PERMISSION_DENIED');

    const readOnly = await crmUser(context, { roleCodes: ['asesor'], countryId: s2, deny: ['proyectos.editar'] });
    const own = await projectOf(readOnly);
    expect((await classify(readOnly, own, { tonnageMode: 'NONE', projectTypeId: vivienda }).expect(403)).body.code).toBe('PERMISSION_DENIED');
    expect((await projectRow(own)).projectTypeId).toBeNull();
  });

  it('404 idéntico fuera del alcance, eliminado e inexistente', async () => {
    const owner = await advisor();
    const stranger = await advisor();
    const foreign = await projectOf(stranger);
    const deleted = await projectOf(owner, { deletedAt: new Date('2026-10-01T00:00:00.000Z') });
    const shapes: unknown[] = [];
    for (const id of [foreign, deleted, randomUUID()]) {
      const response = await classify(owner, id, { tonnageMode: 'NONE', projectTypeId: vivienda }).expect(404);
      expect(response.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND', details: [{ resource: 'Project', identifier: id }] });
      shapes.push(notFoundShape(response.body));
    }
    for (const shape of shapes) expect(shape).toEqual(shapes[0]);
    expect((await projectRow(foreign)).projectTypeId).toBeNull();
  });

  it('jefe del equipo: sin proyectos.administrar → 403; con él → 200', async () => {
    const member = await advisor();
    const restricted = await crmUser(context, { roleCodes: ['manager'], countryId: s2, deny: ['proyectos.administrar'] });
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: s2 });
    await insertTeam(context.prisma, { managerId: restricted.id, memberIds: [member.id] });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id] });
    const projectId = await projectOf(member);

    const denied = await classify(restricted, projectId, { tonnageMode: 'NONE', projectTypeId: vivienda }).expect(403);
    expect(denied.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'proyectos.administrar' }] });
    expect((await projectRow(projectId)).projectTypeId).toBeNull();

    const done = await classify(manager, projectId, { tonnageMode: 'NONE', projectTypeId: vivienda }).expect(200);
    expect(done.body.projectType).toEqual({ id: vivienda, code: 'VIVIENDA', label: 'Vivienda', isActive: true });
  });

  it('400: tonnageMode ausente o desconocido, cantidad no decimal, ids no UUID, manualTonnage fuera de MANUAL', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    for (const [body, field] of [
      [{}, 'tonnageMode'],
      [{ tonnageMode: 'AUTO' }, 'tonnageMode'],
      [{ tonnageMode: 'NONE', estimatedQuantity: '1,5' }, 'estimatedQuantity'],
      [{ tonnageMode: 'NONE', estimatedQuantity: 12 }, 'estimatedQuantity'],
      [{ tonnageMode: 'NONE', estimatedQuantity: '1.23456' }, 'estimatedQuantity'],
      [{ tonnageMode: 'NONE', projectTypeId: 'VIVIENDA' }, 'projectTypeId'],
      [{ tonnageMode: 'NONE', measureUnitId: 'M2' }, 'measureUnitId'],
    ] as const) {
      const response = await classify(owner, projectId, body).expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(response.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    }
    for (const tonnageMode of ['RULE', 'NONE']) {
      const response = await classify(owner, projectId, { tonnageMode, manualTonnage: '5' }).expect(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED', details: [expect.objectContaining({ field: 'manualTonnage' })] });
    }
  });
});

// ---------------------------------------------------------------------------
// Modo RULE
// ---------------------------------------------------------------------------

describe('Modo RULE (PF-03.43, PF-03.44)', () => {
  it('tipo VIVIENDA: aplica la regla de tipo (precedencia), guarda la foto y el tonelaje exacto; la ficha coincide (AC-03.31)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const { unit, typeRule } = await unitWithRules();

    const response = await classify(owner, projectId, {
      projectTypeId: vivienda,
      sectorId: residencial,
      measureUnitId: unit.id,
      estimatedQuantity: '1200',
      tonnageMode: 'RULE',
    }).expect(200);
    expect(response.body).toEqual({
      projectType: { id: vivienda, code: 'VIVIENDA', label: 'Vivienda', isActive: true },
      sector: { id: residencial, code: 'RESIDENCIAL', label: 'Residencial', isActive: true },
      measureUnit: unitRef(unit),
      estimatedQuantity: '1200.0000',
      tonnageMode: 'RULE',
      conversion: { ruleId: typeRule, scope: 'PROJECT_TYPE', factor: '0.03500000', toUnit: { id: tonId, code: 'TON' } },
      estimatedTonnage: '42.0000',
    });

    const row = await projectRow(projectId);
    expect(row.conversionRuleId).toBe(typeRule);
    expect(row.conversionFactor?.toFixed(8)).toBe('0.03500000');
    expect(row.estimatedTonnage?.toFixed(4)).toBe('42.0000');

    const detail = await api(context, owner.token).get(`/projects/${projectId}`).expect(200);
    expect(detail.body.classification).toEqual(response.body);
    expect(detail.body.projectType).toEqual({ id: vivienda, code: 'VIVIENDA', label: 'Vivienda' });

    const audits = await context.prisma.auditLog.findMany({ where: { event: 'crm.project.classified', resourceId: projectId } });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.resourceType).toBe('crm.project');
    expect(audits[0]?.changes).toMatchObject({
      projectTypeId: { before: null, after: vivienda },
      sectorId: { before: null, after: residencial },
      measureUnitId: { before: null, after: unit.id },
      estimatedQuantity: { before: null, after: '1200.0000' },
      conversionRuleId: { before: null, after: typeRule },
      conversionFactor: { before: null, after: '0.03500000' },
      estimatedTonnage: { before: null, after: '42.0000' },
    });
  });

  it('otro tipo (EDIFICIO) o sin tipo: aplica la GLOBAL; redondeo HALF_UP a 4 decimales', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const { unit, globalRule } = await unitWithRules();

    const other = await classify(owner, projectId, { projectTypeId: edificio, measureUnitId: unit.id, estimatedQuantity: '1200', tonnageMode: 'RULE' }).expect(200);
    expect(other.body.conversion).toEqual({ ruleId: globalRule, scope: 'GLOBAL', factor: '0.02500000', toUnit: { id: tonId, code: 'TON' } });
    expect(other.body.estimatedTonnage).toBe('30.0000');

    // 0.002 × 0.025 = 0.00005 → HALF_UP 0.0001 (HALF_EVEN daría 0.0000).
    const halfUp = await classify(owner, projectId, { measureUnitId: unit.id, estimatedQuantity: '0.002', tonnageMode: 'RULE' }).expect(200);
    expect(halfUp.body).toMatchObject({ projectType: null, sector: null, estimatedQuantity: '0.0020', estimatedTonnage: '0.0001' });
    expect(halfUp.body.conversion.ruleId).toBe(globalRule);

    // 0.0019 × 0.025 = 0.0000475 → 0.0000.
    const down = await classify(owner, projectId, { measureUnitId: unit.id, estimatedQuantity: '0.0019', tonnageMode: 'RULE' }).expect(200);
    expect(down.body.estimatedTonnage).toBe('0.0000');

    // Cantidad grande: 999999999999999.9999 × 0.025 sin pérdida de precisión.
    const big = await classify(owner, projectId, { measureUnitId: unit.id, estimatedQuantity: '999999999999999.9999', tonnageMode: 'RULE' }).expect(200);
    expect(big.body).toMatchObject({ estimatedQuantity: '999999999999999.9999', estimatedTonnage: '25000000000000.0000' });

    // Cantidad 0 admitida (≥ 0).
    const zero = await classify(owner, projectId, { measureUnitId: unit.id, estimatedQuantity: '0', tonnageMode: 'RULE' }).expect(200);
    expect(zero.body).toMatchObject({ estimatedQuantity: '0.0000', estimatedTonnage: '0.0000', tonnageMode: 'RULE' });
  });

  it('sin unidad o sin cantidad → 422 REQUIRED_FIELD_MISSING con ambas incidencias', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const response = await classify(owner, projectId, { tonnageMode: 'RULE', projectTypeId: vivienda }).expect(422);
    expect(response.body.code).toBe('REQUIRED_FIELD_MISSING');
    expect(response.body.details).toEqual([
      { field: 'measureUnitId', code: 'REQUIRED_FIELD_MISSING', message: 'The field is required', tonnageMode: 'RULE' },
      { field: 'estimatedQuantity', code: 'REQUIRED_FIELD_MISSING', message: 'The field is required', tonnageMode: 'RULE' },
    ]);
    const { unit } = await unitWithRules();
    const quantityOnly = await classify(owner, projectId, { tonnageMode: 'RULE', measureUnitId: unit.id }).expect(422);
    expect(quantityOnly.body.details).toEqual([expect.objectContaining({ field: 'estimatedQuantity', code: 'REQUIRED_FIELD_MISSING' })]);
    expect((await projectRow(projectId)).projectTypeId).toBeNull();
  });

  it('sin regla aplicable → 422 CONVERSION_RULE_NOT_FOUND: sin reglas, regla inactiva, hacia otra unidad, de otro tipo (AC-03.32)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);

    const bare = await insertUnit(context.prisma, { dimension: 'AREA' });
    const inactiveOnly = await insertUnit(context.prisma, { dimension: 'AREA' });
    await insertConversionRule(context.prisma, { fromUnitId: inactiveOnly.id, factor: '0.5', isActive: false });
    const otherTarget = await insertUnit(context.prisma, { dimension: 'AREA' });
    const massUnit = await insertUnit(context.prisma, { dimension: 'MASS' });
    await insertConversionRule(context.prisma, { fromUnitId: otherTarget.id, toUnitId: massUnit.id, factor: '2' });
    const typeOnly = await insertUnit(context.prisma, { dimension: 'AREA' });
    await insertConversionRule(context.prisma, { fromUnitId: typeOnly.id, factor: '0.5', scope: 'PROJECT_TYPE', projectTypeId: vivienda });

    for (const [unit, projectTypeId] of [
      [bare, null],
      [inactiveOnly, null],
      [otherTarget, null],
      [typeOnly, edificio],
      [typeOnly, null],
    ] as const) {
      const response = await classify(owner, projectId, { measureUnitId: unit.id, estimatedQuantity: '10', tonnageMode: 'RULE', projectTypeId }).expect(422);
      expect(response.body).toMatchObject({ code: 'CONVERSION_RULE_NOT_FOUND' });
      expect(response.body.details).toEqual([{ field: 'measureUnitId', code: 'CONVERSION_RULE_NOT_FOUND', fromUnitId: unit.id, toUnitCode: 'TON' }]);
    }
    const row = await projectRow(projectId);
    expect(row.measureUnitId).toBeNull();
    expect(row.estimatedTonnage).toBeNull();

    // La misma unidad con el tipo correcto sí convierte.
    const ok = await classify(owner, projectId, { measureUnitId: typeOnly.id, estimatedQuantity: '10', tonnageMode: 'RULE', projectTypeId: vivienda }).expect(200);
    expect(ok.body).toMatchObject({ estimatedTonnage: '5.0000', conversion: { scope: 'PROJECT_TYPE', factor: '0.50000000' } });
  });

  it('cambiar el factor de la regla no altera el proyecto hasta volver a guardar (PF-03.47, AC-03.34)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const { unit, typeRule } = await unitWithRules();
    const body = { projectTypeId: vivienda, measureUnitId: unit.id, estimatedQuantity: '1200', tonnageMode: 'RULE' };
    await classify(owner, projectId, body).expect(200);

    await context.prisma.unitConversionRule.update({ where: { id: typeRule }, data: { factor: '0.04' } });

    const detail = await api(context, owner.token).get(`/projects/${projectId}`).expect(200);
    expect(detail.body.classification).toMatchObject({
      estimatedTonnage: '42.0000',
      conversion: { ruleId: typeRule, scope: 'PROJECT_TYPE', factor: '0.03500000' },
    });
    const stored = await projectRow(projectId);
    expect(stored.conversionFactor?.toFixed(8)).toBe('0.03500000');
    expect(stored.estimatedTonnage?.toFixed(4)).toBe('42.0000');

    const resaved = await classify(owner, projectId, body).expect(200);
    expect(resaved.body).toMatchObject({
      estimatedTonnage: '48.0000',
      conversion: { ruleId: typeRule, scope: 'PROJECT_TYPE', factor: '0.04000000' },
    });
  });
});

// ---------------------------------------------------------------------------
// Modos MANUAL y NONE
// ---------------------------------------------------------------------------

describe('Modos MANUAL y NONE (PF-03.46, AC-03.33)', () => {
  it('MANUAL: tonelaje indicado sin regla; sin manualTonnage → 422 REQUIRED_FIELD_MISSING', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const { unit } = await unitWithRules();

    const manual = await classify(owner, projectId, {
      projectTypeId: vivienda,
      measureUnitId: unit.id,
      estimatedQuantity: '1200',
      tonnageMode: 'MANUAL',
      manualTonnage: '50',
    }).expect(200);
    expect(manual.body).toEqual({
      projectType: { id: vivienda, code: 'VIVIENDA', label: 'Vivienda', isActive: true },
      sector: null,
      measureUnit: unitRef(unit),
      estimatedQuantity: '1200.0000',
      tonnageMode: 'MANUAL',
      conversion: null,
      estimatedTonnage: '50.0000',
    });
    const row = await projectRow(projectId);
    expect(row.conversionRuleId).toBeNull();
    expect(row.conversionFactor).toBeNull();
    expect(row.estimatedTonnage?.toFixed(4)).toBe('50.0000');

    // Más de 4 decimales → 400; MANUAL sin unidad ni cantidad es válido.
    const bare = await classify(owner, projectId, { tonnageMode: 'MANUAL', manualTonnage: '12.34565' }).expect(400);
    expect(bare.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'manualTonnage' })]));
    const minimal = await classify(owner, projectId, { tonnageMode: 'MANUAL', manualTonnage: '12.3456' }).expect(200);
    expect(minimal.body).toMatchObject({ projectType: null, measureUnit: null, estimatedQuantity: null, tonnageMode: 'MANUAL', estimatedTonnage: '12.3456' });

    const missing = await classify(owner, projectId, { tonnageMode: 'MANUAL', measureUnitId: unit.id, estimatedQuantity: '10' }).expect(422);
    expect(missing.body).toMatchObject({ code: 'REQUIRED_FIELD_MISSING' });
    expect(missing.body.details).toEqual([{ field: 'manualTonnage', code: 'REQUIRED_FIELD_MISSING', message: 'The field is required' }]);

    const negative = await classify(owner, projectId, { tonnageMode: 'MANUAL', manualTonnage: '-1' }).expect(422);
    expect(negative.body.details).toEqual([
      { field: 'manualTonnage', code: 'INVALID_QUANTITY', message: 'The quantity must be a decimal greater than or equal to zero' },
    ]);
  });

  it('NONE: tonelaje y regla nulos; PUT reemplaza (lo omitido queda en null)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const { unit } = await unitWithRules();
    await classify(owner, projectId, { projectTypeId: vivienda, sectorId: residencial, measureUnitId: unit.id, estimatedQuantity: '1200', tonnageMode: 'RULE' }).expect(200);

    const none = await classify(owner, projectId, { measureUnitId: unit.id, estimatedQuantity: '80.5', tonnageMode: 'NONE' }).expect(200);
    expect(none.body).toEqual({
      projectType: null,
      sector: null,
      measureUnit: unitRef(unit),
      estimatedQuantity: '80.5000',
      tonnageMode: 'NONE',
      conversion: null,
      estimatedTonnage: null,
    });
    const row = await projectRow(projectId);
    expect(row.projectTypeId).toBeNull();
    expect(row.sectorId).toBeNull();
    expect(row.conversionRuleId).toBeNull();
    expect(row.conversionFactor).toBeNull();
    expect(row.estimatedTonnage).toBeNull();

    const empty = await classify(owner, projectId, { tonnageMode: 'NONE' }).expect(200);
    expect(empty.body).toEqual({
      projectType: null,
      sector: null,
      measureUnit: null,
      estimatedQuantity: null,
      tonnageMode: 'NONE',
      conversion: null,
      estimatedTonnage: null,
    });
    const detail = await api(context, owner.token).get(`/projects/${projectId}`).expect(200);
    expect(detail.body.classification).toEqual(empty.body);
  });
});

// ---------------------------------------------------------------------------
// Validaciones de catálogo, unidad, cantidad y obligatorios
// ---------------------------------------------------------------------------

describe('Validaciones (PF-03.40)', () => {
  it('tipo o sector de otro catálogo, inexistente o inactivo → 422 INVALID_CATALOG_VALUE por columna', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const inactiveType = await inactiveCatalogItem('crm.tipo_proyecto');
    const inactiveSector = await inactiveCatalogItem('crm.sector_proyecto');

    for (const [body, detail] of [
      [{ projectTypeId: residencial }, { field: 'projectTypeId', catalogKey: 'crm.tipo_proyecto', reason: 'NOT_FOUND' }],
      [{ projectTypeId: randomUUID() }, { field: 'projectTypeId', catalogKey: 'crm.tipo_proyecto', reason: 'NOT_FOUND' }],
      [{ projectTypeId: inactiveType }, { field: 'projectTypeId', catalogKey: 'crm.tipo_proyecto', reason: 'INACTIVE' }],
      [{ sectorId: vivienda }, { field: 'sectorId', catalogKey: 'crm.sector_proyecto', reason: 'NOT_FOUND' }],
      [{ sectorId: randomUUID() }, { field: 'sectorId', catalogKey: 'crm.sector_proyecto', reason: 'NOT_FOUND' }],
      [{ sectorId: inactiveSector }, { field: 'sectorId', catalogKey: 'crm.sector_proyecto', reason: 'INACTIVE' }],
    ] as const) {
      const response = await classify(owner, projectId, { ...body, tonnageMode: 'NONE' }).expect(422);
      expect(response.body.code).toBe('INVALID_CATALOG_VALUE');
      expect(response.body.details).toEqual([detail]);
    }
    const row = await projectRow(projectId);
    expect(row.projectTypeId).toBeNull();
    expect(row.sectorId).toBeNull();
  });

  it('un tipo desactivado se conserva si no cambia (RN-03.11 aplicado a la clasificación)', async () => {
    const owner = await advisor();
    const inactiveType = await inactiveCatalogItem('crm.tipo_proyecto');
    const projectId = await projectOf(owner, { projectTypeId: inactiveType });
    const kept = await classify(owner, projectId, { projectTypeId: inactiveType, sectorId: comercialSector, tonnageMode: 'NONE' }).expect(200);
    expect(kept.body.projectType).toMatchObject({ id: inactiveType, isActive: false });
    expect(kept.body.sector).toMatchObject({ id: comercialSector, code: 'COMERCIAL', isActive: true });
  });

  it('unidad inexistente o inactiva → 422 UNKNOWN_REFERENCE (measureUnitId)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const inactive = await insertUnit(context.prisma, { dimension: 'AREA', isActive: false });
    await insertConversionRule(context.prisma, { fromUnitId: inactive.id, factor: '0.5' });
    for (const [measureUnitId, tonnageMode] of [
      [randomUUID(), 'NONE'],
      [inactive.id, 'NONE'],
      [inactive.id, 'RULE'],
    ] as const) {
      const response = await classify(owner, projectId, { measureUnitId, estimatedQuantity: '10', tonnageMode }).expect(422);
      expect(response.body.code).toBe('UNKNOWN_REFERENCE');
      expect(response.body.details).toEqual([
        { field: 'measureUnitId', code: 'UNKNOWN_REFERENCE', message: 'The referenced record does not exist or is inactive' },
      ]);
    }
    expect((await projectRow(projectId)).measureUnitId).toBeNull();
  });

  it('cantidad negativa → 422 INVALID_QUANTITY', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const { unit } = await unitWithRules();
    for (const tonnageMode of ['RULE', 'NONE']) {
      const response = await classify(owner, projectId, { measureUnitId: unit.id, estimatedQuantity: '-0.0001', tonnageMode }).expect(422);
      expect(response.body.code).toBe('INVALID_QUANTITY');
      expect(response.body.details).toEqual([
        { field: 'estimatedQuantity', code: 'INVALID_QUANTITY', message: 'The quantity must be a decimal greater than or equal to zero' },
      ]);
    }
  });

  it('crm.campos_obligatorios.project exige tipo y sector al clasificar; vigente sin reiniciar', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const original = JSON.parse((await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: REQUIRED_FIELDS } })).value) as Record<string, string[]>;
    const value = JSON.stringify({ ...original, project: [...new Set([...(original['project'] ?? []), 'projectTypeId', 'sectorId'])] });

    await withParameter(context.prisma, REQUIRED_FIELDS, value, async () => {
      const missing = await classify(owner, projectId, { tonnageMode: 'NONE' }).expect(422);
      expect(missing.body.code).toBe('REQUIRED_FIELD_MISSING');
      expect(missing.body.details).toEqual([
        { field: 'projectTypeId', code: 'REQUIRED_FIELD_MISSING', message: 'The field is required' },
        { field: 'sectorId', code: 'REQUIRED_FIELD_MISSING', message: 'The field is required' },
      ]);
      await classify(owner, projectId, { tonnageMode: 'NONE', projectTypeId: vivienda, sectorId: residencial }).expect(200);
    });
    // Restaurado: ya no se exigen.
    await classify(owner, projectId, { tonnageMode: 'NONE' }).expect(200);
  });
});

// ---------------------------------------------------------------------------
// last_activity_at (PF-03.112)
// ---------------------------------------------------------------------------

describe('Última actividad (PF-03.112)', () => {
  it('clasificar actualiza last_activity_at; un 422 no lo cambia', async () => {
    const owner = await advisor();
    const old = new Date('2026-02-10T08:00:00.000Z');
    const projectId = await projectOf(owner, { lastActivityAt: old });
    const initial = await projectRow(projectId);

    await classify(owner, projectId, { measureUnitId: (await insertUnit(context.prisma)).id, estimatedQuantity: '10', tonnageMode: 'RULE' }).expect(422);
    await classify(owner, projectId, { projectTypeId: residencial, tonnageMode: 'NONE' }).expect(422);
    await classify(owner, projectId, { tonnageMode: 'MANUAL' }).expect(422);
    const untouched = await projectRow(projectId);
    expect(untouched.lastActivityAt.toISOString()).toBe(old.toISOString());
    expect(untouched.updatedAt.toISOString()).toBe(initial.updatedAt.toISOString());
    expect(await context.prisma.auditLog.count({ where: { event: 'crm.project.classified', resourceId: projectId } })).toBe(0);

    const before = Date.now();
    await classify(owner, projectId, { projectTypeId: vivienda, tonnageMode: 'NONE' }).expect(200);
    const moved = await projectRow(projectId);
    expect(moved.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(moved.updatedById).toBe(owner.id);
    const detail = await api(context, owner.token).get(`/projects/${projectId}`).expect(200);
    expect(detail.body.lastActivityAt).toBe(moved.lastActivityAt.toISOString());
  });
});
