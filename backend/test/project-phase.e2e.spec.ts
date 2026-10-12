import { randomUUID } from 'node:crypto';

import {
  api,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertCustomer,
  insertOpportunity,
  insertProject,
  insertTeam,
  testCountry,
  uniqueSuffix,
  withParameter,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext, tokenWithRoles } from './support/test-app';

/**
 * Módulo 3 · Fase del cliente, F-16 (03 C.6, F.1; PF-03.49, PF-03.50, PF-03.52 – PF-03.55,
 * PF-03.112 y PF-03.113 para `GET /projects/{id}/phase-history` y
 * `POST /projects/{id}/phase-changes`).
 *
 * Aislamiento: país de prueba propio `S1`, usuarios y proyectos nuevos en cada prueba.
 * El parámetro `crm.proyectos.reglas_avance` se cambia solo dentro de `withParameter`
 * (o con su restauración en `finally`).
 */

let context: TestContext;
let s1: string;
const phase: Record<'DISENO' | 'COTIZACION' | 'CONSTRUCCION' | 'FINALIZADO', string> = {
  DISENO: '',
  COTIZACION: '',
  CONSTRUCCION: '',
  FINALIZADO: '',
};

const PROGRESS_RULES = 'crm.proyectos.reglas_avance';
const PHASE_LABELS: Record<keyof typeof phase, string> = {
  DISENO: 'Diseño',
  COTIZACION: 'Cotización',
  CONSTRUCCION: 'Construcción',
  FINALIZADO: 'Finalizado',
};

// ---------------------------------------------------------------------------
// Ayudantes locales
// ---------------------------------------------------------------------------

async function advisor(displayName?: string): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['asesor'], countryId: s1, ...(displayName ? { displayName } : {}) });
}

/** Proyecto insertado sin la API (sin fila de alta en el historial). */
async function projectOf(
  owner: CrmUser,
  options: { phaseCode?: keyof typeof phase; phaseProgress?: string; lastActivityAt?: Date; deletedAt?: Date | null } = {},
): Promise<string> {
  const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: s1 });
  return insertProject(context.prisma, { customerId: customer.id, ownerId: owner.id, countryId: s1, ...options });
}

/** Proyecto creado por la API (con su fila de alta en el historial). */
async function projectViaApi(owner: CrmUser): Promise<string> {
  const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId: s1 });
  const created = await api(context, owner.token)
    .post('/projects')
    .send({ name: `Obra ${uniqueSuffix()}`, customerId: customer.id, estimatedStartDate: '2026-11-01' })
    .expect(201);
  return created.body.id as string;
}

function changePhase(user: CrmUser, projectId: string, body: Record<string, unknown>) {
  return api(context, user.token).post(`/projects/${projectId}/phase-changes`).send(body);
}

function phaseRef(code: keyof typeof phase): { id: string; code: string; label: string } {
  return { id: phase[code], code, label: PHASE_LABELS[code] };
}

async function projectRow(projectId: string) {
  return context.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
}

async function historyCount(projectId: string): Promise<number> {
  return context.prisma.projectPhaseHistory.count({ where: { projectId } });
}

/** Cuerpo de un 404 sin `correlationId` ni el identificador (que cambia por petición). */
function notFoundShape(body: Record<string, unknown>): unknown {
  const details = (body['details'] as { resource: string; identifier: string }[]).map((detail) => ({ resource: detail.resource }));
  return { statusCode: body['statusCode'], code: body['code'], message: body['message'], details };
}

beforeAll(async () => {
  context = await createTestContext();
  s1 = await testCountry(context.prisma, 'S1', { name: 'Fases Uno' });
  for (const code of Object.keys(phase) as (keyof typeof phase)[]) {
    phase[code] = await catalogItemId(context.prisma, 'crm.fase_cliente', code);
  }
});

afterAll(async () => {
  await closeTestContext(context);
});

// ---------------------------------------------------------------------------
// Autenticación, permisos y visibilidad
// ---------------------------------------------------------------------------

describe('Autenticación y permisos (PF-03.113)', () => {
  it('401 sin token en ambos endpoints', async () => {
    const id = randomUUID();
    const anonymous = api(context);
    const history = await anonymous.get(`/projects/${id}/phase-history`).expect(401);
    expect(history.body.code).toBe('UNAUTHENTICATED');
    const change = await anonymous.post(`/projects/${id}/phase-changes`).send({ phaseId: phase.COTIZACION }).expect(401);
    expect(change.body.code).toBe('UNAUTHENTICATED');
  });

  it('403 sin el permiso base: proyectos.ver (historial) y proyectos.editar (cambio)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const plain = await tokenWithRoles(context, ['usuario']);
    const client = api(context, plain.token);
    // El guard de permisos responde sin `details` (no revela qué permiso falta).
    const history = await client.get(`/projects/${projectId}/phase-history`).expect(403);
    expect(history.body.code).toBe('PERMISSION_DENIED');
    const change = await client.post(`/projects/${projectId}/phase-changes`).send({ phaseId: phase.COTIZACION }).expect(403);
    expect(change.body.code).toBe('PERMISSION_DENIED');

    // Dueño del proyecto con `proyectos.editar` denegado: ve el historial, no cambia la fase.
    const readOnly = await crmUser(context, { roleCodes: ['asesor'], countryId: s1, deny: ['proyectos.editar'] });
    const ownProject = await projectOf(readOnly);
    await api(context, readOnly.token).get(`/projects/${ownProject}/phase-history`).expect(200);
    const denied = await changePhase(readOnly, ownProject, { phaseId: phase.COTIZACION, progress: '20' }).expect(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');
    expect((await projectRow(ownProject)).phaseId).toBe(phase.DISENO);
  });

  it('400 con un id que no es UUID y con un cuerpo inválido', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const client = api(context, owner.token);
    // `ParseUUIDPipe` responde 400 (código `BAD_REQUEST`, como el resto de rutas con id; ver informe).
    await client.get('/projects/no-es-uuid/phase-history').expect(400);
    await client.post('/projects/no-es-uuid/phase-changes').send({ phaseId: phase.COTIZACION }).expect(400);
    const missing = await changePhase(owner, projectId, {}).expect(400);
    expect(missing.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'phaseId' })]));
    const notUuid = await changePhase(owner, projectId, { phaseId: 'COTIZACION' }).expect(400);
    expect(notUuid.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'phaseId' })]));
    for (const progress of ['100.001', 'abc', '1000', '']) {
      const response = await changePhase(owner, projectId, { phaseId: phase.COTIZACION, progress }).expect(400);
      expect(response.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'progress' })]));
    }
    const longComment = await changePhase(owner, projectId, { phaseId: phase.COTIZACION, progress: '20', comment: 'x'.repeat(1001) }).expect(400);
    expect(longComment.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'comment' })]));
    const sortOrder = await client.get(`/projects/${projectId}/phase-history?sortOrder=sideways`).expect(400);
    expect(sortOrder.body.code).toBe('VALIDATION_FAILED');
    // Nada de lo anterior escribe.
    expect(await historyCount(projectId)).toBe(0);
    expect((await projectRow(projectId)).phaseId).toBe(phase.DISENO);
  });

  it('404 idéntico fuera del alcance, eliminado e inexistente, en ambos endpoints (H.1)', async () => {
    const owner = await advisor();
    const stranger = await advisor();
    const foreign = await projectOf(stranger);
    const deleted = await projectOf(owner, { deletedAt: new Date('2026-10-01T00:00:00.000Z') });
    const missing = randomUUID();
    const client = api(context, owner.token);
    const body = { phaseId: phase.COTIZACION, progress: '30' };

    const shapes: unknown[] = [];
    for (const id of [foreign, deleted, missing]) {
      const history = await client.get(`/projects/${id}/phase-history`).expect(404);
      expect(history.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND', details: [{ resource: 'Project', identifier: id }] });
      shapes.push(notFoundShape(history.body));
      const change = await client.post(`/projects/${id}/phase-changes`).send(body).expect(404);
      expect(change.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND', details: [{ resource: 'Project', identifier: id }] });
      shapes.push(notFoundShape(change.body));
    }
    for (const shape of shapes) expect(shape).toEqual(shapes[0]);
    expect((await projectRow(foreign)).phaseId).toBe(phase.DISENO);
    expect((await projectRow(deleted)).phaseId).toBe(phase.DISENO);
    expect(await historyCount(foreign)).toBe(0);
  });

  it('jefe sin proyectos.administrar ve el historial del proyecto de su equipo pero no cambia la fase → 403', async () => {
    const member = await advisor();
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: s1, deny: ['proyectos.administrar'] });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id] });
    const projectId = await projectOf(member, { phaseProgress: '10' });

    await api(context, manager.token).get(`/projects/${projectId}/phase-history`).expect(200);
    const denied = await changePhase(manager, projectId, { phaseId: phase.COTIZACION, progress: '30' }).expect(403);
    expect(denied.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'proyectos.administrar' }] });
    const row = await projectRow(projectId);
    expect(row.phaseId).toBe(phase.DISENO);
    expect(row.phaseProgress.toFixed(2)).toBe('10.00');
    expect(await historyCount(projectId)).toBe(0);
  });

  it('jefe con proyectos.administrar cambia la fase de un proyecto de su equipo → 201 y queda como autor', async () => {
    const member = await advisor();
    const suffix = uniqueSuffix();
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: s1, displayName: `Jefa ${suffix}` });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id] });
    const projectId = await projectOf(member, { phaseProgress: '10' });

    const changed = await changePhase(manager, projectId, { phaseId: phase.COTIZACION, progress: '30' }).expect(201);
    expect(changed.body.phase).toEqual({ ...phaseRef('COTIZACION'), order: 2, isFinal: false });
    const history = await api(context, manager.token).get(`/projects/${projectId}/phase-history`).expect(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].changedBy).toEqual({ id: manager.id, displayName: `Jefa ${suffix}` });

    // El asesor del proyecto sigue siendo el dueño y lo ve.
    const detail = await api(context, member.token).get(`/projects/${projectId}`).expect(200);
    expect(detail.body.owner.id).toBe(member.id);
    expect(detail.body.phase.phase.code).toBe('COTIZACION');
  });
});

// ---------------------------------------------------------------------------
// Cambio de fase e historial
// ---------------------------------------------------------------------------

describe('Cambio de fase y su historial', () => {
  it('cambio con comentario: ficha y fila de historial completas; alta incluida (PF-03.49, AC-03.36)', async () => {
    const suffix = uniqueSuffix();
    const owner = await advisor(`Asesora ${suffix}`);
    const projectId = await projectViaApi(owner);
    const client = api(context, owner.token);

    // Alta: DISENO 0 %, fila con fase anterior nula.
    const initial = await client.get(`/projects/${projectId}/phase-history`).expect(200);
    expect(initial.body.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    expect(initial.body.data[0]).toEqual({
      id: expect.any(String),
      fromPhase: null,
      toPhase: phaseRef('DISENO'),
      fromProgress: null,
      toProgress: '0.00',
      comment: null,
      changedBy: { id: owner.id, displayName: `Asesora ${suffix}` },
      changedAt: expect.any(String),
    });

    await changePhase(owner, projectId, { phaseId: phase.DISENO, progress: '10' }).expect(201);
    const before = Date.now();
    const changed = await changePhase(owner, projectId, { phaseId: phase.COTIZACION, progress: '30', comment: '  Arranca la cotización  ' }).expect(201);
    const after = Date.now();
    expect(changed.body).toEqual({
      phase: { ...phaseRef('COTIZACION'), order: 2, isFinal: false },
      progress: '30.00',
      updatedAt: expect.any(String),
      comment: 'Arranca la cotización',
    });
    const updatedAt = Date.parse(changed.body.updatedAt as string);
    expect(updatedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(updatedAt).toBeLessThanOrEqual(after + 1000);

    // La ficha muestra la nueva fase.
    const detail = await client.get(`/projects/${projectId}`).expect(200);
    expect(detail.body.phase).toEqual(changed.body);

    const history = await client.get(`/projects/${projectId}/phase-history`).expect(200);
    expect(history.body.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
    expect(history.body.data[0]).toEqual({
      id: expect.any(String),
      fromPhase: phaseRef('DISENO'),
      toPhase: phaseRef('COTIZACION'),
      fromProgress: '10.00',
      toProgress: '30.00',
      comment: 'Arranca la cotización',
      changedBy: { id: owner.id, displayName: `Asesora ${suffix}` },
      changedAt: changed.body.updatedAt,
    });
    expect(history.body.data[1]).toMatchObject({ fromPhase: phaseRef('DISENO'), toPhase: phaseRef('DISENO'), fromProgress: '0.00', toProgress: '10.00', comment: null });
    expect(history.body.data[2]).toMatchObject({ fromPhase: null, toPhase: phaseRef('DISENO') });

    // Auditoría: evento propio con el comentario enmascarado.
    const audits = await context.prisma.auditLog.findMany({ where: { event: 'crm.project.phase_changed', resourceId: projectId }, orderBy: { occurredAt: 'asc' } });
    expect(audits).toHaveLength(2);
    const last = audits[1];
    expect(last?.resourceType).toBe('crm.project');
    expect(last?.subjectId).toBe(owner.id);
    expect(last?.changes).toEqual({
      phaseId: { before: phase.DISENO, after: phase.COTIZACION },
      phaseProgress: { before: '10.00', after: '30.00' },
      comment: { before: null, after: 'A***' },
    });
    expect(JSON.stringify(last?.changes)).not.toContain('cotización');
  });

  it('historial: orden por defecto descendente, sortOrder=asc y paginación (AC-03.40)', async () => {
    const owner = await advisor();
    const projectId = await projectViaApi(owner);
    await changePhase(owner, projectId, { phaseId: phase.COTIZACION, progress: '30' }).expect(201);
    await changePhase(owner, projectId, { phaseId: phase.CONSTRUCCION, progress: '60' }).expect(201);
    const client = api(context, owner.token);

    const desc = await client.get(`/projects/${projectId}/phase-history`).expect(200);
    expect(desc.body.data.map((row: { toPhase: { code: string } }) => row.toPhase.code)).toEqual(['CONSTRUCCION', 'COTIZACION', 'DISENO']);
    const asc = await client.get(`/projects/${projectId}/phase-history?sortOrder=asc`).expect(200);
    expect(asc.body.data.map((row: { toPhase: { code: string } }) => row.toPhase.code)).toEqual(['DISENO', 'COTIZACION', 'CONSTRUCCION']);
    const times = asc.body.data.map((row: { changedAt: string }) => Date.parse(row.changedAt));
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    const first = await client.get(`/projects/${projectId}/phase-history?pageSize=2&page=1`).expect(200);
    expect(first.body.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    expect(first.body.data.map((row: { toPhase: { code: string } }) => row.toPhase.code)).toEqual(['CONSTRUCCION', 'COTIZACION']);
    const second = await client.get(`/projects/${projectId}/phase-history?pageSize=2&page=2`).expect(200);
    expect(second.body.data.map((row: { toPhase: { code: string } }) => row.toPhase.code)).toEqual(['DISENO']);
  });

  it('retroceso y cambio solo de porcentaje se registran; sin diferencias → 422 PHASE_UNCHANGED (PF-03.55)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner, { phaseCode: 'CONSTRUCCION', phaseProgress: '60' });

    // Retroceso de fase con porcentaje propio.
    const back = await changePhase(owner, projectId, { phaseId: phase.COTIZACION, progress: '40' }).expect(201);
    expect(back.body).toMatchObject({ phase: { code: 'COTIZACION' }, progress: '40.00' });
    // Solo porcentaje (misma fase).
    const progressOnly = await changePhase(owner, projectId, { phaseId: phase.COTIZACION, progress: '45.5' }).expect(201);
    expect(progressOnly.body).toMatchObject({ phase: { code: 'COTIZACION' }, progress: '45.50' });

    // Misma fase y mismo porcentaje (con otra escritura decimal y omitido) → PHASE_UNCHANGED.
    for (const body of [
      { phaseId: phase.COTIZACION, progress: '45.50' },
      { phaseId: phase.COTIZACION, progress: '45.5', comment: 'Otro comentario' },
      { phaseId: phase.COTIZACION },
    ]) {
      const unchanged = await changePhase(owner, projectId, body).expect(422);
      expect(unchanged.body).toMatchObject({
        code: 'PHASE_UNCHANGED',
        details: [{ field: 'phaseId', code: 'PHASE_UNCHANGED', message: 'The phase and progress are already the current ones' }],
      });
    }

    const history = await api(context, owner.token).get(`/projects/${projectId}/phase-history?sortOrder=asc`).expect(200);
    expect(
      history.body.data.map((row: { fromPhase: { code: string }; toPhase: { code: string }; fromProgress: string; toProgress: string }) => [
        row.fromPhase.code,
        row.fromProgress,
        row.toPhase.code,
        row.toProgress,
      ]),
    ).toEqual([
      ['CONSTRUCCION', '60.00', 'COTIZACION', '40.00'],
      ['COTIZACION', '40.00', 'COTIZACION', '45.50'],
    ]);
  });

  it('porcentaje omitido: defaultProgress de la fase destino (FINALIZADO = 100) o el actual (RN-03.34)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner, { phaseCode: 'DISENO', phaseProgress: '25.5' });

    const keep = await changePhase(owner, projectId, { phaseId: phase.COTIZACION }).expect(201);
    expect(keep.body).toMatchObject({ phase: { code: 'COTIZACION' }, progress: '25.50' });

    const finalized = await changePhase(owner, projectId, { phaseId: phase.FINALIZADO }).expect(201);
    expect(finalized.body).toEqual({
      phase: { ...phaseRef('FINALIZADO'), order: 4, isFinal: true },
      progress: '100.00',
      updatedAt: expect.any(String),
      comment: null,
    });
  });

  it('porcentaje -1 o 100.01 → 422 INVALID_PROGRESS; 0 y 100 son válidos (PF-03.50, AC-03.37)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner, { phaseProgress: '10' });
    for (const progress of ['-1', '100.01', '-0.01', '101']) {
      const response = await changePhase(owner, projectId, { phaseId: phase.COTIZACION, progress }).expect(422);
      expect(response.body).toMatchObject({
        code: 'INVALID_PROGRESS',
        details: [{ field: 'progress', code: 'INVALID_PROGRESS', message: 'The progress must be between 0 and 100', min: '0', max: '100' }],
      });
    }
    expect(await historyCount(projectId)).toBe(0);

    await changePhase(owner, projectId, { phaseId: phase.COTIZACION, progress: '0' }).expect(201);
    const full = await changePhase(owner, projectId, { phaseId: phase.CONSTRUCCION, progress: '100' }).expect(201);
    expect(full.body.progress).toBe('100.00');
  });

  it('regla de avance por defecto: FINALIZADO con 90 → 422 PHASE_PROGRESS_RULE; con 100 → 201 (AC-03.38)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner, { phaseCode: 'CONSTRUCCION', phaseProgress: '80' });
    const rejected = await changePhase(owner, projectId, { phaseId: phase.FINALIZADO, progress: '90' }).expect(422);
    expect(rejected.body).toMatchObject({
      code: 'PHASE_PROGRESS_RULE',
      details: [
        {
          field: 'progress',
          code: 'PHASE_PROGRESS_RULE',
          message: 'The progress is below the minimum required by the phase',
          phaseCode: 'FINALIZADO',
          minimumProgress: '100.00',
        },
      ],
    });
    expect((await projectRow(projectId)).phaseId).toBe(phase.CONSTRUCCION);

    const accepted = await changePhase(owner, projectId, { phaseId: phase.FINALIZADO, progress: '100' }).expect(201);
    expect(accepted.body).toMatchObject({ phase: { code: 'FINALIZADO', isFinal: true }, progress: '100.00' });
  });

  it('cambiar crm.proyectos.reglas_avance por la API de parámetros rige sin reiniciar; vacío no restringe (PF-03.53, PF-03.52)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner, { phaseCode: 'COTIZACION', phaseProgress: '30' });
    const admin = await tokenWithRoles(context, ['administrador']);
    const original = (await context.prisma.systemParameter.findUniqueOrThrow({ where: { key: PROGRESS_RULES } })).value;
    try {
      await api(context, admin.token)
        .patch(`/parameters/${PROGRESS_RULES}`)
        .send({ value: JSON.stringify({ FINALIZADO: { progresoMinimo: 100 }, CONSTRUCCION: { progresoMinimo: 50 } }) })
        .expect(200);

      const rejected = await changePhase(owner, projectId, { phaseId: phase.CONSTRUCCION, progress: '40' }).expect(422);
      expect(rejected.body).toMatchObject({
        code: 'PHASE_PROGRESS_RULE',
        details: [{ field: 'progress', code: 'PHASE_PROGRESS_RULE', phaseCode: 'CONSTRUCCION', minimumProgress: '50.00' }],
      });
      await changePhase(owner, projectId, { phaseId: phase.CONSTRUCCION, progress: '50' }).expect(201);
    } finally {
      await context.prisma.systemParameter.update({ where: { key: PROGRESS_RULES }, data: { value: original } });
    }

    // Parámetro vacío: FINALIZADO con 90 ya no se rechaza.
    await withParameter(context.prisma, PROGRESS_RULES, '{}', async () => {
      const finalized = await changePhase(owner, projectId, { phaseId: phase.FINALIZADO, progress: '90' }).expect(201);
      expect(finalized.body).toMatchObject({ phase: { code: 'FINALIZADO' }, progress: '90.00' });
    });
  });

  it('fase de otro catálogo, inexistente o inactiva → 422 INVALID_CATALOG_VALUE', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner, { phaseProgress: '10' });
    const stage = await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'COTIZANDO');
    const catalog = await context.prisma.catalog.findUniqueOrThrow({ where: { key: 'crm.fase_cliente' } });
    const inactive = await context.prisma.catalogItem.create({
      data: { catalogId: catalog.id, code: `TEST-FASE-${uniqueSuffix()}`, label: 'Fase inactiva de prueba', metadata: { order: 90, isFinal: false }, sortOrder: 990, isActive: false },
    });

    for (const [phaseId, reason] of [
      [stage, 'NOT_FOUND'],
      [randomUUID(), 'NOT_FOUND'],
      [inactive.id, 'INACTIVE'],
    ] as const) {
      const response = await changePhase(owner, projectId, { phaseId, progress: '20' }).expect(422);
      expect(response.body).toMatchObject({ code: 'INVALID_CATALOG_VALUE' });
      expect(response.body.details).toEqual([{ field: 'phaseId', catalogKey: 'crm.fase_cliente', reason }]);
    }
    expect(await historyCount(projectId)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Independencia de las oportunidades (AC-03.39, PF-03.54)
// ---------------------------------------------------------------------------

describe('Independencia de fase y oportunidades (PF-03.54, AC-03.39)', () => {
  it('cambiar la fase nunca toca las oportunidades; un proyecto FINALIZADO sigue listando las suyas', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner, { phaseCode: 'CONSTRUCCION', phaseProgress: '70' });
    const opportunityId = await insertOpportunity(context.prisma, { projectId, ownerId: owner.id, stageCode: 'COTIZANDO' });
    const before = await context.prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });

    await changePhase(owner, projectId, { phaseId: phase.FINALIZADO, progress: '100' }).expect(201);

    const after = await context.prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    expect(after.stageId).toBe(before.stageId);
    expect(after.stageId).toBe(await catalogItemId(context.prisma, 'crm.etapa_oportunidad', 'COTIZANDO'));
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.deletedAt).toBeNull();
    expect(await context.prisma.opportunityStageHistory.count({ where: { opportunityId } })).toBe(0);

    const detail = await api(context, owner.token).get(`/projects/${projectId}`).expect(200);
    expect(detail.body.phase.phase).toMatchObject({ code: 'FINALIZADO', isFinal: true });
    expect(detail.body.opportunityCount).toBe(1);
    expect(detail.body.summary.openOpportunities).toBe(1);
  });

  it('el estado de las oportunidades no altera la fase del proyecto', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner, { phaseCode: 'CONSTRUCCION', phaseProgress: '70' });
    await insertOpportunity(context.prisma, { projectId, ownerId: owner.id, stageCode: 'GANADO', outcome: 'WON' });
    const row = await projectRow(projectId);
    expect(row.phaseId).toBe(phase.CONSTRUCCION);
    expect(row.phaseProgress.toFixed(2)).toBe('70.00');
    const detail = await api(context, owner.token).get(`/projects/${projectId}`).expect(200);
    expect(detail.body.phase).toMatchObject({ phase: { code: 'CONSTRUCCION' }, progress: '70.00' });
  });
});

// ---------------------------------------------------------------------------
// last_activity_at (PF-03.112) y concurrencia
// ---------------------------------------------------------------------------

describe('Última actividad y concurrencia', () => {
  it('un cambio correcto mueve last_activity_at y phase_updated_at en la misma transacción; un 422 no los cambia (PF-03.112)', async () => {
    const owner = await advisor();
    const old = new Date('2026-01-15T12:00:00.000Z');
    const projectId = await projectOf(owner, { phaseProgress: '10', lastActivityAt: old });
    const initial = await projectRow(projectId);
    expect(initial.lastActivityAt.toISOString()).toBe(old.toISOString());

    // Fallos de negocio: nada cambia.
    await changePhase(owner, projectId, { phaseId: phase.COTIZACION, progress: '100.01' }).expect(422);
    await changePhase(owner, projectId, { phaseId: phase.DISENO, progress: '10' }).expect(422);
    await changePhase(owner, projectId, { phaseId: phase.FINALIZADO, progress: '50' }).expect(422);
    const untouched = await projectRow(projectId);
    expect(untouched.lastActivityAt.toISOString()).toBe(old.toISOString());
    expect(untouched.phaseUpdatedAt.toISOString()).toBe(initial.phaseUpdatedAt.toISOString());
    expect(untouched.updatedAt.toISOString()).toBe(initial.updatedAt.toISOString());
    expect(await historyCount(projectId)).toBe(0);

    const changed = await changePhase(owner, projectId, { phaseId: phase.COTIZACION, progress: '30' }).expect(201);
    const moved = await projectRow(projectId);
    expect(moved.lastActivityAt.getTime()).toBeGreaterThan(old.getTime());
    expect(moved.lastActivityAt.toISOString()).toBe(moved.phaseUpdatedAt.toISOString());
    expect(moved.phaseUpdatedAt.toISOString()).toBe(changed.body.updatedAt);
    const row = await context.prisma.projectPhaseHistory.findFirstOrThrow({ where: { projectId } });
    expect(row.changedAt.toISOString()).toBe(moved.lastActivityAt.toISOString());
    const detail = await api(context, owner.token).get(`/projects/${projectId}`).expect(200);
    expect(detail.body.lastActivityAt).toBe(moved.lastActivityAt.toISOString());
  });

  it('dos cambios simultáneos se serializan: ambos 201 y el historial encadena from/to (FOR UPDATE)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner, { phaseCode: 'DISENO', phaseProgress: '10' });

    const [first, second] = await Promise.all([
      changePhase(owner, projectId, { phaseId: phase.COTIZACION, progress: '30' }),
      changePhase(owner, projectId, { phaseId: phase.CONSTRUCCION, progress: '60' }),
    ]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const rows = await context.prisma.projectPhaseHistory.findMany({ where: { projectId } });
    expect(rows).toHaveLength(2);
    const head = rows.find((row) => row.fromPhaseId === phase.DISENO);
    const tail = rows.find((row) => row !== head);
    expect(head).toBeDefined();
    expect(tail).toBeDefined();
    expect(head?.fromProgress?.toFixed(2)).toBe('10.00');
    expect(tail?.fromPhaseId).toBe(head?.toPhaseId);
    expect(tail?.fromProgress?.toFixed(2)).toBe(head?.toProgress.toFixed(2));
    expect(new Set([head?.toPhaseId, tail?.toPhaseId])).toEqual(new Set([phase.COTIZACION, phase.CONSTRUCCION]));

    const final = await projectRow(projectId);
    expect(final.phaseId).toBe(tail?.toPhaseId);
    expect(final.phaseProgress.toFixed(2)).toBe(tail?.toProgress.toFixed(2));
  });
});
