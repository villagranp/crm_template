import { randomUUID } from 'node:crypto';

import type request from 'supertest';

import { HTML_BYTES, PDF_BYTES } from '@/modules/attachments/testing/attachment-fixtures';

import {
  api,
  businessMonthOffset,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertCustomer,
  insertForecastLine,
  insertOpportunity,
  insertProduct,
  insertProductFamily,
  insertProject,
  insertProjectProduct,
  insertTeam,
  insertVisit,
  testCountry,
  unitId,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Proyectos (03 F-10, F-11, F-13): alta, ficha, edición, eliminación, búsqueda,
 * historial, adjuntos y 401/403/404 por endpoint (PF-03.1–PF-03.33, PF-03.113,
 * PF-03.118, PF-03.133). Países propios `P1`–`P4`. Cada prueba aísla sus datos con un
 * cliente propio (`?customerId=`) y compara por pertenencia, nunca por totales globales.
 */

let context: TestContext;
let p1: string;
let p2: string;
let p3: string;

beforeAll(async () => {
  context = await createTestContext();
  p1 = await testCountry(context.prisma, 'P1', { name: 'Proyectos Uno' });
  p2 = await testCountry(context.prisma, 'P2', { name: 'Proyectos Dos' });
  p3 = await testCountry(context.prisma, 'P3', { name: 'Proyectos Tres (inactivo)', isActive: false });
});

afterAll(async () => {
  await closeTestContext(context);
});

const CODE_PATTERN = /^PRY-\d{4}-\d{5}$/;

async function advisorWithCustomer(countryId = p1): Promise<{ user: CrmUser; customerId: string }> {
  const user = await crmUser(context, { roleCodes: ['asesor'], countryId });
  const customer = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId });
  return { user, customerId: customer.id };
}

async function createProject(user: CrmUser, body: Record<string, unknown>): Promise<request.Response> {
  return api(context, user.token).post('/projects').send(body);
}

/** Cuerpo de un error sin `correlationId` (para comparar 404 idénticos). */
function errorShape(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'correlationId' && key !== 'details'));
}

async function auditRows(resourceId: string, event?: string): Promise<{ event: string; changes: unknown; metadata: unknown }[]> {
  return context.prisma.auditLog.findMany({
    where: { resourceId, ...(event ? { event } : {}) },
    select: { event: true, changes: true, metadata: true },
    orderBy: { occurredAt: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// F-10 Alta
// ---------------------------------------------------------------------------

describe('POST /projects (F-10)', () => {
  it('PF-03.1: alta mínima con código, fase por defecto, historial inicial, asesor = usuario y auditoría', async () => {
    const { user, customerId } = await advisorWithCustomer();
    const before = Date.now();
    const response = await createProject(user, { name: '  Torre Norte  ', customerId, estimatedStartDate: '2026-11-01', estimatedEndDate: '2027-03-31' }).then(
      (res) => res,
    );

    expect(response.status).toBe(201);
    const body = response.body as { id: string; code: string; lastActivityAt: string; phase: { phase: { id: string } } };
    expect(response.headers['location']).toBe(`/api/v1/projects/${body.id}`);
    expect(body.code).toMatch(CODE_PATTERN);
    expect(body.code.slice(4, 8)).toMatch(/^20\d{2}$/);
    expect(body).toMatchObject({
      name: 'Torre Norte',
      customer: { id: customerId },
      country: { id: p1, isoCode: 'P1' },
      owner: { id: user.id },
      phase: { phase: { code: 'DISENO', order: 1, isFinal: false }, progress: '0.00', comment: null },
      commercialStatus: { kind: 'NO_OPPORTUNITIES', label: 'Sin oportunidades', stage: null },
      opportunityCount: 0,
      estimatedStartDate: '2026-11-01',
      estimatedEndDate: '2027-03-31',
      estimatedDecisionDate: null,
      classification: { tonnageMode: 'NONE', conversion: null, estimatedTonnage: null, projectType: null },
      duplicatedFrom: null,
      summary: { openOpportunities: 0, wonOpportunities: 0, partialOpportunities: 0, lostOpportunities: 0, productLines: 0, attachments: 0 },
      createdBy: { id: user.id },
      capabilities: { canEdit: true, canAdminister: false, canDelete: false, canDuplicate: true, canCreateOpportunity: true, canEditForecast: true },
    });
    expect(new Date(body.lastActivityAt).getTime()).toBeGreaterThanOrEqual(before - 1000);

    const history = await context.prisma.projectPhaseHistory.findMany({ where: { projectId: body.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromPhaseId: null, toPhaseId: body.phase.phase.id, changedById: user.id });
    expect(history[0]?.toProgress.toFixed(2)).toBe('0.00');

    const audit = await auditRows(body.id, 'crm.project.created');
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toEqual({ code: body.code });
    expect(audit[0]?.changes).toMatchObject({ name: { before: null, after: 'Torre Norte' }, customerId: { before: null, after: customerId } });
  });

  it('PF-03.2: dos altas simultáneas obtienen códigos distintos', async () => {
    const { user, customerId } = await advisorWithCustomer();
    const [a, b] = await Promise.all([createProject(user, { name: 'Simultáneo A', customerId }), createProject(user, { name: 'Simultáneo B', customerId })]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.code).not.toBe(b.body.code);
    expect(Number(a.body.code.slice(-5))).not.toBe(Number(b.body.code.slice(-5)));
  });

  it('PF-03.3: cliente inexistente, eliminado o fuera de alcance → 404 idéntico y nada creado', async () => {
    const { user } = await advisorWithCustomer();
    const stranger = await crmUser(context, { roleCodes: ['asesor'], countryId: p1 });
    const foreign = await insertCustomer(context.prisma, { salesOwnerId: stranger.id, countryId: p1 });
    const deleted = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: p1, deletedAt: new Date() });

    const responses = await Promise.all(
      [randomUUID(), foreign.id, deleted.id].map((customerId) => createProject(user, { name: 'No debe existir', customerId })),
    );
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(errorShape(response.body)).toEqual({ statusCode: 404, code: 'RESOURCE_NOT_FOUND', message: 'Customer not found' });
    }
    expect(await context.prisma.project.count({ where: { customerId: { in: [foreign.id, deleted.id] } } })).toBe(0);
  });

  it('PF-03.4: cliente inactivo → 422 CUSTOMER_INACTIVE; prospecto admitido', async () => {
    const user = await crmUser(context, { roleCodes: ['asesor'], countryId: p1 });
    const inactive = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: p1, statusCode: 'INACTIVO' });
    const prospect = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: p1, statusCode: 'PROSPECTO' });

    const rejected = await createProject(user, { name: 'Inactivo', customerId: inactive.id }).then((res) => res);
    expect(rejected.status).toBe(422);
    expect(rejected.body).toMatchObject({ code: 'CUSTOMER_INACTIVE', details: [{ field: 'customerId', customerId: inactive.id }] });
    expect((await createProject(user, { name: 'Prospecto', customerId: prospect.id })).status).toBe(201);
  });

  it('PF-03.5 / AC-03.4: forma inválida → 400; fin < inicio → 422 INVALID_DATE_RANGE; país inactivo → 422 UNKNOWN_REFERENCE', async () => {
    const { user, customerId } = await advisorWithCustomer();
    for (const body of [
      { customerId },
      { name: '   ', customerId },
      { name: 'x', customerId, estimatedStartDate: '2026-02-30' },
      { name: 'x', customerId, lastActivityAt: '2026-01-01T00:00:00Z' },
      { name: 'x', customerId, phaseId: randomUUID() },
    ]) {
      const response = await createProject(user, body);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    }

    const dates = await createProject(user, { name: 'Fechas', customerId, estimatedStartDate: '2026-12-01', estimatedEndDate: '2026-11-30' });
    expect(dates.status).toBe(422);
    expect(dates.body).toMatchObject({ code: 'INVALID_DATE_RANGE', details: [{ field: 'estimatedEndDate', code: 'INVALID_DATE_RANGE', startField: 'estimatedStartDate' }] });
    // La fecha de decisión no se restringe (DM-16).
    expect((await createProject(user, { name: 'Decisión', customerId, estimatedStartDate: '2026-12-01', estimatedDecisionDate: '2026-01-01' })).status).toBe(201);

    const country = await createProject(user, { name: 'País', customerId, countryId: p3 });
    expect(country.status).toBe(422);
    expect(country.body).toMatchObject({ code: 'UNKNOWN_REFERENCE', details: [{ field: 'countryId', code: 'UNKNOWN_REFERENCE' }] });
  });

  it('PF-03.9: asesor ajeno sin administrar → 403 FIELD_NOT_EDITABLE; manager: inactivo o fuera de alcance → 422 INVALID_OWNER, miembro → 201', async () => {
    const { user, customerId } = await advisorWithCustomer();
    const other = await crmUser(context, { roleCodes: ['asesor'], countryId: p1 });
    const denied = await createProject(user, { name: 'Ajeno', customerId, ownerId: other.id });
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ code: 'FIELD_NOT_EDITABLE', details: [{ field: 'ownerId', requiredPermission: 'proyectos.administrar' }] });
    // Indicarse a sí mismo no exige administrar.
    expect((await createProject(user, { name: 'Propio', customerId, ownerId: user.id })).status).toBe(201);

    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: p1 });
    const member = await crmUser(context, { roleCodes: ['asesor'], countryId: p1 });
    const suspended = await crmUser(context, { roleCodes: ['asesor'], countryId: p1, status: 'SUSPENDED' });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id, suspended.id] });
    const managerCustomer = await insertCustomer(context.prisma, { salesOwnerId: manager.id, countryId: p1 });

    for (const ownerId of [suspended.id, other.id]) {
      const response = await createProject(manager, { name: 'No elegible', customerId: managerCustomer.id, ownerId });
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'INVALID_OWNER', details: [{ field: 'ownerId', code: 'INVALID_OWNER' }] });
    }
    const created = await createProject(manager, { name: 'Del miembro', customerId: managerCustomer.id, ownerId: member.id });
    expect(created.status).toBe(201);
    expect(created.body.owner).toEqual({ id: member.id, displayName: 'Persona De prueba' });
  });

  it('PF-03.10: código manual sin administrar → 403; repetido → 409 PROJECT_CODE_TAKEN; se guarda en mayúsculas', async () => {
    const { user, customerId } = await advisorWithCustomer();
    const denied = await createProject(user, { name: 'Código', customerId, code: 'MAN-1' });
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ code: 'FIELD_NOT_EDITABLE', details: [{ field: 'code', requiredPermission: 'proyectos.administrar' }] });

    const admin = await crmUser(context, { roleCodes: ['administrador'], countryId: p1 });
    const code = `man-${randomUUID().slice(0, 8)}`;
    const created = await createProject(admin, { name: 'Manual', customerId, code: `  ${code} ` });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe(code.toUpperCase());
    const taken = await createProject(admin, { name: 'Repetido', customerId, code });
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ code: 'PROJECT_CODE_TAKEN', details: [{ field: 'code', code: code.toUpperCase() }] });
  });
});

// ---------------------------------------------------------------------------
// F-11 Ficha y edición
// ---------------------------------------------------------------------------

describe('GET/PATCH /projects/{id} (F-11)', () => {
  it('ficha con estado comercial, resumen, fase y clasificación', async () => {
    const { user, customerId } = await advisorWithCustomer();
    const projectId = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: p1, phaseCode: 'CONSTRUCCION', phaseProgress: '45.5' });
    await insertOpportunity(context.prisma, { projectId, ownerId: user.id, stageCode: 'COTIZANDO' });
    await insertOpportunity(context.prisma, { projectId, ownerId: user.id, stageCode: 'CONTACTADO' });
    await insertOpportunity(context.prisma, { projectId, ownerId: user.id, stageCode: 'GANADO', outcome: 'WON' });
    await insertOpportunity(context.prisma, { projectId, ownerId: user.id, stageCode: 'GANADO', outcome: 'PARTIAL' });
    await insertOpportunity(context.prisma, { projectId, ownerId: user.id, stageCode: 'PERDIDO', outcome: 'LOST' });
    await insertOpportunity(context.prisma, { projectId, ownerId: user.id, stageCode: 'COTIZANDO', deletedAt: new Date() });

    const response = await api(context, user.token).get(`/projects/${projectId}`).expect(200);
    expect(response.body).toMatchObject({
      id: projectId,
      phase: { phase: { code: 'CONSTRUCCION', order: 3, isFinal: false }, progress: '45.50' },
      commercialStatus: { kind: 'OPEN_STAGE', label: 'Cotizando', stage: { code: 'COTIZANDO', label: 'Cotizando' } },
      opportunityCount: 5,
      summary: { openOpportunities: 2, wonOpportunities: 1, partialOpportunities: 1, lostOpportunities: 1, productLines: 0, attachments: 0 },
    });
  });

  it('PF-03.15: PATCH del responsable: 200, updatedBy, lastActivityAt y auditoría solo de lo cambiado (texto libre enmascarado); sin cambios no audita', async () => {
    const { user, customerId } = await advisorWithCustomer();
    const projectId = await insertProject(context.prisma, {
      customerId,
      ownerId: user.id,
      countryId: p1,
      name: 'Original',
      lastActivityAt: new Date('2026-01-01T00:00:00Z'),
    });
    const client = api(context, user.token);

    const response = await client.patch(`/projects/${projectId}`).send({ name: 'Renombrado', address: 'Zona 10, calle 5', city: '  ' }).expect(200);
    expect(response.body).toMatchObject({ name: 'Renombrado', address: 'Zona 10, calle 5', city: null, updatedBy: { id: user.id } });
    expect(new Date(response.body.lastActivityAt).getTime()).toBeGreaterThan(new Date('2026-01-02T00:00:00Z').getTime());

    const audit = await auditRows(projectId, 'crm.project.updated');
    expect(audit).toHaveLength(1);
    // Texto libre enmascarado por `AuditService` (DM-29): queda constancia del cambio, no del contenido.
    expect(audit[0]?.changes).toEqual({ name: { before: 'Original', after: 'Renombrado' }, address: { before: null, after: 'Z***' } });

    await client.patch(`/projects/${projectId}`).send({ name: ' Renombrado ', address: 'Zona 10, calle 5' }).expect(200);
    expect(await auditRows(projectId, 'crm.project.updated')).toHaveLength(1);
  });

  it('AC-03.4 / reservados: fechas incoherentes 422; ownerId/code sin administrar → 403; código igual normalizado no cuenta como cambio', async () => {
    const { user, customerId } = await advisorWithCustomer();
    const projectId = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: p1, code: `RES-${randomUUID().slice(0, 6).toUpperCase()}` });
    const project = await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const client = api(context, user.token);

    await client.patch(`/projects/${projectId}`).send({ estimatedStartDate: '2027-01-10' }).expect(200);
    const dates = await client.patch(`/projects/${projectId}`).send({ estimatedEndDate: '2027-01-09' }).expect(422);
    expect(dates.body.code).toBe('INVALID_DATE_RANGE');

    const other = await crmUser(context, { roleCodes: ['asesor'], countryId: p1 });
    const reserved = await client.patch(`/projects/${projectId}`).send({ ownerId: other.id, code: 'OTRO-1' }).expect(403);
    expect(reserved.body).toMatchObject({
      code: 'FIELD_NOT_EDITABLE',
      details: [
        { field: 'ownerId', requiredPermission: 'proyectos.administrar' },
        { field: 'code', requiredPermission: 'proyectos.administrar' },
      ],
    });
    await client.patch(`/projects/${projectId}`).send({ code: project.code.toLowerCase(), ownerId: user.id }).expect(200);
    expect(await auditRows(projectId, 'crm.project.updated')).toHaveLength(1);
    await client.patch(`/projects/${projectId}`).send({ name: null }).expect(400);
  });

  it('PF-03.16: visible por alcance pero ajeno y sin administrar → canEdit=false y PATCH 403', async () => {
    const roleCode = `lector-editor-${randomUUID().slice(0, 8)}`;
    const permissions = await context.prisma.permission.findMany({ where: { code: { in: ['proyectos.ver', 'proyectos.editar'] } } });
    await context.prisma.role.create({
      data: { code: roleCode, name: 'Editor de equipo (prueba)', dataScope: 'TEAM', permissions: { create: permissions.map((p) => ({ permissionId: p.id })) } },
    });
    try {
      const lead = await crmUser(context, { roleCodes: [roleCode], countryId: p1 });
      const member = await crmUser(context, { roleCodes: ['asesor'], countryId: p1 });
      await insertTeam(context.prisma, { managerId: lead.id, memberIds: [member.id] });
      const customer = await insertCustomer(context.prisma, { salesOwnerId: member.id, countryId: p1 });
      const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: member.id, countryId: p1 });
      const client = api(context, lead.token);

      const detail = await client.get(`/projects/${projectId}`).expect(200);
      expect(detail.body.capabilities).toEqual({
        canEdit: false,
        canAdminister: false,
        canDelete: false,
        canDuplicate: false,
        canCreateOpportunity: false,
        canEditForecast: false,
      });
      const patch = await client.patch(`/projects/${projectId}`).send({ name: 'No' }).expect(403);
      expect(patch.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'proyectos.administrar' }] });
    } finally {
      await context.prisma.role.deleteMany({ where: { code: roleCode } });
    }
  });

  it('manager con administrar reasigna el asesor a un miembro y la ficha refleja el cambio', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: p1 });
    const memberA = await crmUser(context, { roleCodes: ['asesor'], countryId: p1 });
    const memberB = await crmUser(context, { roleCodes: ['asesor'], countryId: p1 });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [memberA.id, memberB.id] });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: memberA.id, countryId: p1 });
    const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: memberA.id, countryId: p1 });

    const response = await api(context, manager.token).patch(`/projects/${projectId}`).send({ ownerId: memberB.id }).expect(200);
    expect(response.body).toMatchObject({ owner: { id: memberB.id }, capabilities: { canEdit: true, canAdminister: true, canDelete: true } });
    const audit = await auditRows(projectId, 'crm.project.updated');
    expect(audit[0]?.changes).toEqual({ ownerId: { before: memberA.id, after: memberB.id } });
  });

  it('PF-03.18: inexistente, eliminado y fuera de alcance → 404 idéntico en GET, PATCH, DELETE y subrecursos', async () => {
    const { user, customerId } = await advisorWithCustomer();
    const stranger = await crmUser(context, { roleCodes: ['asesor'], countryId: p1 });
    const foreignCustomer = await insertCustomer(context.prisma, { salesOwnerId: stranger.id, countryId: p1 });
    const foreign = await insertProject(context.prisma, { customerId: foreignCustomer.id, ownerId: stranger.id, countryId: p1 });
    const deleted = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: p1, deletedAt: new Date() });
    const client = api(context, user.token);
    const phaseId = await catalogItemId(context.prisma, 'crm.fase_cliente', 'COTIZACION');

    for (const projectId of [randomUUID(), foreign, deleted]) {
      const calls = [
        client.get(`/projects/${projectId}`),
        client.patch(`/projects/${projectId}`).send({ name: 'x' }),
        client.get(`/projects/${projectId}/history`),
        client.get(`/projects/${projectId}/phase-history`),
        client.post(`/projects/${projectId}/phase-changes`).send({ phaseId }),
        client.put(`/projects/${projectId}/classification`).send({ tonnageMode: 'NONE' }),
        client.get(`/projects/${projectId}/products`),
        client.get(`/projects/${projectId}/attachments`),
        client.post(`/projects/${projectId}/duplicate`).send({ name: 'Copia' }),
      ];
      for (const response of await Promise.all(calls)) {
        expect(response.status).toBe(404);
        expect(errorShape(response.body)).toEqual({ statusCode: 404, code: 'RESOURCE_NOT_FOUND', message: 'Project not found' });
      }
    }
  });

  it('PF-03.22: cambiar el cliente con una visita vinculada → 409 PROJECT_CUSTOMER_LOCKED; sin vínculos → 200; cliente nuevo inactivo → 422', async () => {
    const { user, customerId } = await advisorWithCustomer();
    const target = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: p1 });
    const inactive = await insertCustomer(context.prisma, { salesOwnerId: user.id, countryId: p1, statusCode: 'INACTIVO' });
    const locked = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: p1 });
    await insertVisit(context.prisma, { customerId, ownerId: user.id, projectId: locked });
    const free = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: p1 });
    const client = api(context, user.token);

    const conflict = await client.patch(`/projects/${locked}`).send({ customerId: target.id }).expect(409);
    expect(conflict.body).toMatchObject({ code: 'PROJECT_CUSTOMER_LOCKED', details: [{ field: 'customerId', dependency: 'visits', count: 1 }] });
    const inactiveResponse = await client.patch(`/projects/${free}`).send({ customerId: inactive.id }).expect(422);
    expect(inactiveResponse.body.code).toBe('CUSTOMER_INACTIVE');
    const moved = await client.patch(`/projects/${free}`).send({ customerId: target.id }).expect(200);
    expect(moved.body.customer.id).toBe(target.id);
  });
});

// ---------------------------------------------------------------------------
// F-11 Eliminación
// ---------------------------------------------------------------------------

describe('DELETE /projects/{id} (F-11, RN-03.12)', () => {
  it('PF-03.21: asesor sin proyectos.eliminar → 403 (guard); con eliminar pero proyecto ajeno sin administrar → 403 de la política', async () => {
    const { user, customerId } = await advisorWithCustomer();
    const projectId = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: p1 });
    const response = await api(context, user.token).delete(`/projects/${projectId}`).expect(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');

    const lead = await crmUser(context, { roleCodes: ['manager'], countryId: p1, deny: ['proyectos.administrar'] });
    await insertTeam(context.prisma, { managerId: lead.id, memberIds: [user.id] });
    const policy = await api(context, lead.token).delete(`/projects/${projectId}`).expect(403);
    expect(policy.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'proyectos.eliminar' }] });
    expect((await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } })).deletedAt).toBeNull();
  });

  it('PF-03.20: sin hijos activos: 204, fuera de búsqueda y de ?customerId=, historia conservada', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: p1 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: manager.id, countryId: p1 });
    const client = api(context, manager.token);
    const created = await client.post('/projects').send({ name: 'Para borrar', customerId: customer.id }).expect(201);
    const projectId = created.body.id as string;
    // Oportunidad cerrada y visita cancelada no bloquean.
    await insertOpportunity(context.prisma, { projectId, ownerId: manager.id, stageCode: 'PERDIDO', outcome: 'LOST' });
    await insertVisit(context.prisma, { customerId: customer.id, ownerId: manager.id, projectId, statusCode: 'CANCELADA' });

    await client.delete(`/projects/${projectId}`).expect(204);
    await client.get(`/projects/${projectId}`).expect(404);
    const list = await client.get(`/projects?customerId=${customer.id}`).expect(200);
    expect(list.body.data).toEqual([]);
    expect(await context.prisma.projectPhaseHistory.count({ where: { projectId } })).toBe(1);
    expect((await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } })).deletedAt).not.toBeNull();
    expect(await auditRows(projectId, 'crm.project.deleted')).toHaveLength(1);
  });

  it('PF-03.21: oportunidad abierta, forecast futuro, visita no cancelada y actividad abierta → 409 con el detalle', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: p1 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: manager.id, countryId: p1 });
    const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: manager.id, countryId: p1 });
    await insertOpportunity(context.prisma, { projectId, ownerId: manager.id, stageCode: 'CONTACTADO' });
    const family = await insertProductFamily(context.prisma);
    const und = await unitId(context.prisma, 'UND');
    const product = await insertProduct(context.prisma, { familyId: family, baseUnitId: und });
    await insertProjectProduct(context.prisma, { projectId, productId: product.id, unitId: und });
    const next = businessMonthOffset(2);
    await insertForecastLine(context.prisma, { projectId, productId: product.id, unitId: und, ownerId: manager.id, ...next, quantity: '3' });
    await insertVisit(context.prisma, { customerId: customer.id, ownerId: manager.id, projectId, statusCode: 'REALIZADA' });

    const response = await api(context, manager.token).delete(`/projects/${projectId}`).expect(409);
    expect(response.body).toMatchObject({
      code: 'PROJECT_HAS_ACTIVE_CHILDREN',
      details: [
        { dependency: 'openOpportunities', count: 1 },
        { dependency: 'productsWithForecast', count: 1 },
        { dependency: 'nonCancelledVisits', count: 1 },
      ],
    });
    expect((await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } })).deletedAt).toBeNull();
  });

  it('concurrencia: una oportunidad abierta creada mientras se sostiene el bloqueo del proyecto se cuenta (sin TOCTOU)', async () => {
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: p1 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: manager.id, countryId: p1 });
    const projectId = await insertProject(context.prisma, { customerId: customer.id, ownerId: manager.id, countryId: p1 });
    const stageId = await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'CONTACTADO');

    let deletion: Promise<request.Response> | null = null;
    await context.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
      await tx.opportunity.create({
        data: { code: `TEST-OPO-${randomUUID().slice(0, 8)}`, projectId, ownerId: manager.id, stageId, opportunityDate: new Date('2026-10-01T00:00:00Z') },
      });
      deletion = api(context, manager.token).delete(`/projects/${projectId}`).then((res) => res);
      // La eliminación espera el bloqueo: aún no ha respondido.
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    const response = await (deletion as unknown as Promise<request.Response>);
    expect(response.status).toBe(409);
    expect(response.body.details).toEqual([{ dependency: 'openOpportunities', count: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// F-13 Búsqueda
// ---------------------------------------------------------------------------

describe('GET /projects (F-13)', () => {
  interface SearchFixture {
    admin: CrmUser;
    customerId: string;
    otherCustomerId: string;
    ids: Record<'alpha' | 'beta' | 'gamma' | 'delta', string>;
    ownerA: CrmUser;
    suffix: string;
  }

  async function searchFixture(): Promise<SearchFixture> {
    const admin = await crmUser(context, { roleCodes: ['administrador'], countryId: p1 });
    const ownerA = await crmUser(context, { roleCodes: ['asesor'], countryId: p1 });
    const ownerB = await crmUser(context, { roleCodes: ['asesor'], countryId: p2 });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: ownerA.id, countryId: p1 });
    const otherCustomer = await insertCustomer(context.prisma, { salesOwnerId: ownerB.id, countryId: p2 });
    const vivienda = await catalogItemId(context.prisma, 'crm.tipo_proyecto', 'VIVIENDA');
    const suffix = randomUUID().slice(0, 6).toUpperCase();
    const alpha = await insertProject(context.prisma, {
      customerId: customer.id,
      ownerId: ownerA.id,
      countryId: p1,
      name: 'Edificio Árbol',
      code: `SRCH-${suffix}-A`,
      city: 'Ciudad de Guatemala',
      projectTypeId: vivienda,
      phaseCode: 'DISENO',
      estimatedDecisionDate: '2026-12-15',
      lastActivityAt: new Date('2026-06-01T12:00:00Z'),
    });
    const beta = await insertProject(context.prisma, {
      customerId: customer.id,
      ownerId: ownerA.id,
      countryId: p1,
      name: 'Bodega Beta',
      code: `SRCH-${suffix}-B`,
      city: 'Mixco',
      phaseCode: 'FINALIZADO',
      phaseProgress: '100',
      estimatedDecisionDate: '2026-11-01',
      lastActivityAt: new Date('2026-07-01T12:00:00Z'),
    });
    const gamma = await insertProject(context.prisma, {
      customerId: customer.id,
      ownerId: ownerB.id,
      countryId: p2,
      name: 'Centro Gamma',
      code: `SRCH-${suffix}-C`,
      phaseCode: 'COTIZACION',
      lastActivityAt: new Date('2026-08-01T12:00:00Z'),
    });
    const delta = await insertProject(context.prisma, {
      customerId: otherCustomer.id,
      ownerId: ownerB.id,
      countryId: p2,
      name: 'Delta',
      code: `SRCH-${suffix}-D`,
      phaseCode: 'CONSTRUCCION',
      lastActivityAt: new Date('2026-09-01T12:00:00Z'),
    });
    // alpha: dos oportunidades COTIZANDO (aparece una sola vez); beta: ganada; gamma: perdida; delta: sin oportunidades.
    await insertOpportunity(context.prisma, { projectId: alpha, ownerId: ownerA.id, stageCode: 'COTIZANDO' });
    await insertOpportunity(context.prisma, { projectId: alpha, ownerId: ownerA.id, stageCode: 'COTIZANDO' });
    await insertOpportunity(context.prisma, { projectId: beta, ownerId: ownerA.id, stageCode: 'GANADO', outcome: 'PARTIAL' });
    await insertOpportunity(context.prisma, { projectId: beta, ownerId: ownerA.id, stageCode: 'PERDIDO', outcome: 'LOST' });
    await insertOpportunity(context.prisma, { projectId: gamma, ownerId: ownerB.id, stageCode: 'PERDIDO', outcome: 'LOST' });
    return { admin, customerId: customer.id, otherCustomerId: otherCustomer.id, ids: { alpha, beta, gamma, delta }, ownerA, suffix };
  }

  async function idsFor(user: CrmUser, query: string): Promise<string[]> {
    const response = await api(context, user.token).get(`/projects?${query}`);
    expect(response.status).toBe(200);
    return (response.body.data as { id: string }[]).map((item) => item.id);
  }

  it('PF-03.30 / PF-03.31: cada filtro por separado, combinados con Y, y etapa sin duplicar', async () => {
    const f = await searchFixture();
    const both = `customerId=${f.customerId},${f.otherCustomerId}`;
    const { alpha, beta, gamma, delta } = f.ids;
    const vivienda = await catalogItemId(context.prisma, 'crm.tipo_proyecto', 'VIVIENDA');
    const cotizando = await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'COTIZANDO');
    const diseno = await catalogItemId(context.prisma, 'crm.fase_cliente', 'DISENO');
    const construccion = await catalogItemId(context.prisma, 'crm.fase_cliente', 'CONSTRUCCION');
    const sorted = (values: string[]): string[] => [...values].sort();

    expect(sorted(await idsFor(f.admin, both))).toEqual(sorted([alpha, beta, gamma, delta]));
    expect(await idsFor(f.admin, `${both}&search=arbol`)).toEqual([alpha]);
    expect(await idsFor(f.admin, `${both}&search=${encodeURIComponent('srch')}&code=${f.suffix.toLowerCase()}-b`)).toEqual([beta]);
    expect(sorted(await idsFor(f.admin, `customerId=${f.customerId}`))).toEqual(sorted([alpha, beta, gamma]));
    expect(sorted(await idsFor(f.admin, `${both}&countryId=${p2}`))).toEqual(sorted([gamma, delta]));
    expect(await idsFor(f.admin, `${both}&city=${encodeURIComponent('GUATEMALA')}`)).toEqual([alpha]);
    expect(sorted(await idsFor(f.admin, `${both}&ownerId=${f.ownerA.id}`))).toEqual(sorted([alpha, beta]));
    expect(await idsFor(f.admin, `${both}&projectTypeId=${vivienda}`)).toEqual([alpha]);
    expect(sorted(await idsFor(f.admin, `${both}&phaseId=${diseno},${construccion}`))).toEqual(sorted([alpha, delta]));
    expect(await idsFor(f.admin, `${both}&phaseId=${diseno}&phaseId=${construccion}&countryId=${p1}`)).toEqual([alpha]);

    const stage = await api(context, f.admin.token).get(`/projects?${both}&stageId=${cotizando}`).expect(200);
    expect(stage.body.data.map((item: { id: string }) => item.id)).toEqual([alpha]);
    expect(stage.body.pagination.totalItems).toBe(1);

    expect(sorted(await idsFor(f.admin, `${both}&active=true`))).toEqual(sorted([alpha, gamma, delta]));
    expect(await idsFor(f.admin, `${both}&active=false`)).toEqual([beta]);
    expect(await idsFor(f.admin, `${both}&dateField=estimatedDecisionDate&dateFrom=2026-12-01&dateTo=2026-12-31`)).toEqual([alpha]);
    expect(sorted(await idsFor(f.admin, `${both}&dateField=lastActivityAt&dateFrom=2026-07-01`))).toEqual(sorted([beta, gamma, delta]));

    expect(await idsFor(f.admin, `${both}&commercialStatus=OPEN_STAGE`)).toEqual([alpha]);
    expect(await idsFor(f.admin, `${both}&commercialStatus=OPEN_STAGE:${cotizando}`)).toEqual([alpha]);
    expect(await idsFor(f.admin, `${both}&commercialStatus=WON`)).toEqual([beta]);
    expect(await idsFor(f.admin, `${both}&commercialStatus=LOST`)).toEqual([gamma]);
    expect(await idsFor(f.admin, `${both}&commercialStatus=NO_OPPORTUNITIES`)).toEqual([delta]);
    expect(sorted(await idsFor(f.admin, `${both}&commercialStatus=WON,LOST`))).toEqual(sorted([beta, gamma]));
    // Combinación de todos los filtros.
    expect(
      await idsFor(
        f.admin,
        `customerId=${f.customerId}&search=edificio&countryId=${p1}&city=guatemala&ownerId=${f.ownerA.id}&projectTypeId=${vivienda}&phaseId=${diseno}` +
          `&stageId=${cotizando}&active=true&commercialStatus=OPEN_STAGE&dateField=estimatedDecisionDate&dateFrom=2026-12-15&dateTo=2026-12-15`,
      ),
    ).toEqual([alpha]);
  });

  it('PF-03.118 / AC-03.86: contrato de Clientes F-08 (`?customerId=` con estado comercial y orden)', async () => {
    const f = await searchFixture();
    const response = await api(context, f.admin.token).get(`/projects?customerId=${f.customerId}&commercialStatus=OPEN_STAGE,WON&sortBy=estimatedDecisionDate&sortOrder=asc`).expect(200);
    expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([f.ids.beta, f.ids.alpha]);
    expect(response.body.data[1]).toEqual({
      id: f.ids.alpha,
      code: expect.stringMatching(/^SRCH-.*-A$/),
      name: 'Edificio Árbol',
      customer: { id: f.customerId, legalName: expect.any(String) },
      country: { id: p1, isoCode: 'P1', name: 'Proyectos Uno' },
      city: 'Ciudad de Guatemala',
      owner: { id: f.ownerA.id, displayName: 'Persona De prueba' },
      projectType: { id: expect.any(String), code: 'VIVIENDA', label: 'Vivienda' },
      phase: { id: expect.any(String), code: 'DISENO', label: 'Diseño', progress: '0.00' },
      commercialStatus: { kind: 'OPEN_STAGE', label: 'Cotizando', stage: { id: expect.any(String), code: 'COTIZANDO', label: 'Cotizando' } },
      opportunityCount: 2,
      estimatedDecisionDate: '2026-12-15',
      lastActivityAt: '2026-06-01T12:00:00.000Z',
      capabilities: { canEdit: true, canAdminister: true, canDelete: true, canDuplicate: true, canCreateOpportunity: true, canEditForecast: true },
    });
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
  });

  it('PF-03.33: orden por cada campo de la lista blanca, estable, y por defecto lastActivityAt desc', async () => {
    const f = await searchFixture();
    const both = `customerId=${f.customerId},${f.otherCustomerId}`;
    const { alpha, beta, gamma, delta } = f.ids;
    expect(await idsFor(f.admin, both)).toEqual([delta, gamma, beta, alpha]);
    expect(await idsFor(f.admin, `${both}&sortBy=lastActivityAt&sortOrder=asc`)).toEqual([alpha, beta, gamma, delta]);
    expect(await idsFor(f.admin, `${both}&sortBy=code&sortOrder=asc`)).toEqual([alpha, beta, gamma, delta]);
    expect(await idsFor(f.admin, `${both}&sortBy=name&sortOrder=asc`)).toEqual([beta, gamma, delta, alpha]);
    expect(await idsFor(f.admin, `${both}&sortBy=phaseOrder&sortOrder=asc`)).toEqual([alpha, gamma, delta, beta]);
    expect(await idsFor(f.admin, `${both}&sortBy=estimatedDecisionDate&sortOrder=desc`)).toEqual([alpha, beta, ...[gamma, delta].sort()]);
    const byCustomer = await idsFor(f.admin, `${both}&sortBy=customerName&sortOrder=asc`);
    expect(byCustomer).toHaveLength(4);
    const created = await idsFor(f.admin, `${both}&sortBy=createdAt&sortOrder=asc`);
    expect(created).toEqual([alpha, beta, gamma, delta]);
    const page2 = await api(context, f.admin.token).get(`/projects?${both}&pageSize=3&page=2`).expect(200);
    expect(page2.body.data.map((item: { id: string }) => item.id)).toEqual([alpha]);
    expect(page2.body.pagination).toEqual({ page: 2, pageSize: 3, totalItems: 4, totalPages: 2 });
  });

  it('PF-03.32 / AC-03.24: entradas inválidas y filtro por asesor fuera de alcance', async () => {
    const f = await searchFixture();
    const client = api(context, f.admin.token);
    for (const query of ['sortBy=salary', 'pageSize=101', 'dateFrom=2026-01-01', 'customerId=not-a-uuid', 'commercialStatus=OPEN', 'active=yes']) {
      const response = await client.get(`/projects?${query}`);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    }
    const range = await client.get('/projects?dateField=createdAt&dateFrom=2026-02-01&dateTo=2026-01-01').expect(422);
    expect(range.body).toMatchObject({ code: 'INVALID_DATE_RANGE', details: [{ field: 'dateTo', code: 'INVALID_DATE_RANGE' }] });

    // El asesor A no ve los de B: filtrar por B no amplía el alcance.
    const both = `customerId=${f.customerId},${f.otherCustomerId}`;
    const ownerB = (await context.prisma.project.findUniqueOrThrow({ where: { id: f.ids.delta } })).ownerId;
    expect(await idsFor(f.ownerA, `${both}&ownerId=${ownerB}`)).toEqual([]);
    expect([...(await idsFor(f.ownerA, both))].sort()).toEqual([f.ids.alpha, f.ids.beta].sort());
  });
});

// ---------------------------------------------------------------------------
// F-11 Historial
// ---------------------------------------------------------------------------

describe('GET /projects/{id}/history (F-11, PF-03.19)', () => {
  it('une fase, etapas, resultados y auditoría, más reciente primero, sin duplicar el cambio de fase, con filtro y paginación', async () => {
    const { user, customerId } = await advisorWithCustomer();
    const client = api(context, user.token);
    const created = await client.post('/projects').send({ name: 'Con historia', customerId }).expect(201);
    const projectId = created.body.id as string;
    const cotizacion = await catalogItemId(context.prisma, 'crm.fase_cliente', 'COTIZACION');
    await client.post(`/projects/${projectId}/phase-changes`).send({ phaseId: cotizacion, progress: '30', comment: 'Arranca cotización' }).expect(201);
    await client.patch(`/projects/${projectId}`).send({ name: 'Con historia 2' }).expect(200);

    const opportunityId = await insertOpportunity(context.prisma, { projectId, ownerId: user.id, stageCode: 'GANADO', outcome: 'WON' });
    const contactado = await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'CONTACTADO');
    const ganado = await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'GANADO');
    const later = new Date(Date.now() + 60_000);
    await context.prisma.opportunityStageHistory.create({
      data: { opportunityId, fromStageId: contactado, toStageId: ganado, changedById: user.id, changedAt: later, comment: 'Cierre' },
    });
    await context.prisma.opportunityResultHistory.create({
      data: { opportunityId, action: 'RECORDED', outcome: 'WON', decisionDate: new Date('2026-10-05T00:00:00Z'), changedById: user.id, changedAt: new Date(later.getTime() + 1000) },
    });
    const opportunity = await context.prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });

    const response = await client.get(`/projects/${projectId}/history`).expect(200);
    const kinds = response.body.data.map((entry: { kind: string }) => entry.kind);
    expect(kinds).toEqual(['RESULT', 'STAGE', 'PROJECT_DATA', 'PHASE', 'PROJECT_DATA', 'PHASE']);
    expect(response.body.data[0]).toMatchObject({
      kind: 'RESULT',
      actor: { id: user.id },
      subject: { type: 'OPPORTUNITY', id: opportunityId, label: opportunity.code },
      changes: expect.arrayContaining([{ field: 'outcome', before: null, after: 'WON' }, { field: 'decisionDate', before: null, after: '2026-10-05' }]),
    });
    expect(response.body.data[1]).toMatchObject({ kind: 'STAGE', comment: 'Cierre', changes: [{ field: 'stage', before: 'Contactado', after: 'Ganado' }] });
    expect(response.body.data[2]).toMatchObject({ kind: 'PROJECT_DATA', event: 'crm.project.updated', changes: [{ field: 'name', before: 'Con historia', after: 'Con historia 2' }] });
    expect(response.body.data[3]).toMatchObject({
      kind: 'PHASE',
      event: null,
      comment: 'Arranca cotización',
      changes: [
        { field: 'phase', before: 'Diseño', after: 'Cotización' },
        { field: 'progress', before: '0.00', after: '30.00' },
      ],
    });
    // La auditoría `crm.project.phase_changed` existe pero no se repite en la línea de tiempo.
    expect(await auditRows(projectId, 'crm.project.phase_changed')).toHaveLength(1);

    const filtered = await client.get(`/projects/${projectId}/history?kind=PHASE,STAGE`).expect(200);
    expect(filtered.body.data.map((entry: { kind: string }) => entry.kind)).toEqual(['STAGE', 'PHASE', 'PHASE']);
    const paged = await client.get(`/projects/${projectId}/history?pageSize=2&page=3`).expect(200);
    expect(paged.body.data.map((entry: { kind: string }) => entry.kind)).toEqual(['PROJECT_DATA', 'PHASE']);
    expect(paged.body.pagination).toEqual({ page: 3, pageSize: 2, totalItems: 6, totalPages: 3 });
    await client.get(`/projects/${projectId}/history?kind=OTHER`).expect(400);
  });
});

// ---------------------------------------------------------------------------
// Adjuntos (PF-03.11, PF-03.133)
// ---------------------------------------------------------------------------

describe('Adjuntos del proyecto (ADR-021)', () => {
  function upload(user: CrmUser, projectId: string, content: Buffer, fileName: string): request.Test {
    return api(context, user.token).post(`/projects/${projectId}/attachments`).attach('file', content, fileName).field('description', 'Plano');
  }

  it('sube, lista, descarga y elimina; actualiza lastActivityAt; nunca expone la clave', async () => {
    const { user, customerId } = await advisorWithCustomer();
    const projectId = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: p1, lastActivityAt: new Date('2026-01-01T00:00:00Z') });
    const client = api(context, user.token);

    const created = await upload(user, projectId, PDF_BYTES, 'plano.pdf').expect(201);
    expect(created.headers['location']).toBe(`/api/v1/projects/${projectId}/attachments/${created.body.id}/content`);
    expect(created.body).toEqual({
      id: expect.any(String),
      fileName: 'plano.pdf',
      contentType: 'application/pdf',
      sizeBytes: PDF_BYTES.length,
      description: 'Plano',
      createdAt: expect.any(String),
      createdBy: { id: user.id, displayName: 'Persona De prueba' },
    });
    expect(JSON.stringify(created.body)).not.toMatch(/storage|\/\d{4}\/\d{2}\//i);
    const touched = await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(touched.lastActivityAt.getTime()).toBeGreaterThan(new Date('2026-01-02T00:00:00Z').getTime());

    const list = await client.get(`/projects/${projectId}/attachments`).expect(200);
    expect(list.body.data.map((item: { id: string }) => item.id)).toEqual([created.body.id]);
    const detail = await client.get(`/projects/${projectId}`).expect(200);
    expect(detail.body.summary.attachments).toBe(1);

    const download = await client
      .get(`/projects/${projectId}/attachments/${created.body.id}/content`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['content-disposition']).toMatch(/^attachment;/);
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(download.body as Buffer, PDF_BYTES)).toBe(0);

    await client.delete(`/projects/${projectId}/attachments/${created.body.id}`).expect(204);
    await client.get(`/projects/${projectId}/attachments/${created.body.id}/content`).expect(404);
    expect(await context.prisma.auditLog.count({ where: { resourceId: created.body.id, event: { in: ['crm.attachment.added', 'crm.attachment.removed'] } } })).toBe(2);
  });

  it('tipo no permitido por firma → 422; sin poder editar → 403 antes del cuerpo; fuera de alcance o adjunto de otro proyecto → 404', async () => {
    const { user, customerId } = await advisorWithCustomer();
    const projectId = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: p1 });
    const otherProject = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: p1 });
    const disguised = await upload(user, projectId, HTML_BYTES, 'falso.pdf').expect(422);
    expect(disguised.body.code).toBe('ATTACHMENT_TYPE_NOT_ALLOWED');
    expect(await context.prisma.attachment.count({ where: { projectId } })).toBe(0);

    const lead = await crmUser(context, { roleCodes: ['manager'], countryId: p1, deny: ['proyectos.administrar'] });
    await insertTeam(context.prisma, { managerId: lead.id, memberIds: [user.id] });
    const forbidden = await upload(lead, projectId, PDF_BYTES, 'plano.pdf').expect(403);
    expect(forbidden.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'proyectos.administrar' }] });

    const stranger = await crmUser(context, { roleCodes: ['asesor'], countryId: p1 });
    await upload(stranger, projectId, PDF_BYTES, 'plano.pdf').expect(404);
    await api(context, stranger.token).get(`/projects/${projectId}/attachments`).expect(404);

    const created = await upload(user, projectId, PDF_BYTES, 'plano.pdf').expect(201);
    await api(context, user.token).get(`/projects/${otherProject}/attachments/${created.body.id}/content`).expect(404);
    await api(context, user.token).delete(`/projects/${otherProject}/attachments/${created.body.id}`).expect(404);
    await api(context, user.token).post(`/projects/not-a-uuid/attachments`).attach('file', PDF_BYTES, 'plano.pdf').expect(400);
  });

  it('archivo mayor que crm.adjuntos.max_mb → 413 ATTACHMENT_TOO_LARGE sin fila', async () => {
    const { user, customerId } = await advisorWithCustomer();
    const projectId = await insertProject(context.prisma, { customerId, ownerId: user.id, countryId: p1 });
    const parameter = await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: 'crm.adjuntos.max_mb' } });
    const maxBytes = Number(parameter.value) * 1024 * 1024;
    const big = Buffer.concat([PDF_BYTES, Buffer.alloc(maxBytes + 1024, 0x20)]);
    const response = await upload(user, projectId, big, 'grande.pdf').expect(413);
    expect(response.body.code).toBe('ATTACHMENT_TOO_LARGE');
    expect(await context.prisma.attachment.count({ where: { projectId } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PF-03.113: 401 y 403 por endpoint
// ---------------------------------------------------------------------------

describe('PF-03.113: 401 sin token y 403 sin el permiso base, en cada endpoint de E2a', () => {
  const id = randomUUID();
  const child = randomUUID();
  const endpoints: [string, string][] = [
    ['get', '/projects'],
    ['get', '/projects/team-view'],
    ['get', '/projects/form-options'],
    ['get', '/projects/owner-options'],
    ['get', '/projects/team-options'],
    ['post', '/projects'],
    ['get', `/projects/${id}`],
    ['patch', `/projects/${id}`],
    ['delete', `/projects/${id}`],
    ['post', `/projects/${id}/duplicate`],
    ['get', `/projects/${id}/history`],
    ['get', `/projects/${id}/phase-history`],
    ['post', `/projects/${id}/phase-changes`],
    ['put', `/projects/${id}/classification`],
    ['get', `/projects/${id}/products`],
    ['post', `/projects/${id}/products`],
    ['patch', `/projects/${id}/products/${child}`],
    ['delete', `/projects/${id}/products/${child}`],
    ['get', `/projects/${id}/attachments`],
    ['post', `/projects/${id}/attachments`],
    ['get', `/projects/${id}/attachments/${child}/content`],
    ['delete', `/projects/${id}/attachments/${child}`],
    ['get', '/products'],
    ['get', '/product-families'],
    ['get', '/units-of-measure'],
    ['get', `/unit-conversions/resolve?fromUnitId=${child}`],
  ];

  it.each(endpoints)('%s %s', async (method, path) => {
    const anonymous = api(context);
    const unauthenticated = await anonymous[method as 'get'](path);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.code).toBe('UNAUTHENTICATED');

    const user = await crmUser(context, { roleCodes: ['usuario'] });
    const forbidden = await api(context, user.token)[method as 'get'](path);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('PERMISSION_DENIED');
  });
});
