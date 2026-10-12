import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type request from 'supertest';

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
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Módulo 3 · Resultado de oportunidades, F-18 (03 J: PF-03.54 con resultado, PF-03.67,
 * 68, 71, 72, 74–78, AC-03.86 en los filtros de resultado).
 *
 * Aislamiento: países propios `W1` y `W2`. Las oportunidades parten de `COTIZANDO`
 * (insertadas sin la API) para no depender de la entrada `CONTACTADO` del parámetro de
 * transiciones, que `opportunities.e2e.spec.ts` cambia en una de sus pruebas.
 */

let context: TestContext;
let w1: string;
let w2: string;

const OLD_ACTIVITY = new Date('2026-01-01T00:00:00.000Z');
const stage: Record<'CONTACTADO' | 'COTIZANDO' | 'GANADO' | 'PERDIDO', string> = { CONTACTADO: '', COTIZANDO: '', GANADO: '', PERDIDO: '' };
const reason: Record<'PRECIO' | 'COMPETENCIA' | 'PROYECTO_CANCELADO', string> = { PRECIO: '', COMPETENCIA: '', PROYECTO_CANCELADO: '' };

beforeAll(async () => {
  context = await createTestContext();
  w1 = await testCountry(context.prisma, 'W1', { name: 'Resultados Uno' });
  w2 = await testCountry(context.prisma, 'W2', { name: 'Resultados Dos' });
  for (const code of Object.keys(stage) as (keyof typeof stage)[]) {
    stage[code] = await catalogItemId(context.prisma, 'crm.etapa_oportunidad', code);
  }
  for (const code of Object.keys(reason) as (keyof typeof reason)[]) {
    reason[code] = await catalogItemId(context.prisma, 'crm.motivo_resultado', code);
  }
});

afterAll(async () => {
  await closeTestContext(context);
});

// ---------------------------------------------------------------------------
// Ayudantes locales
// ---------------------------------------------------------------------------

async function advisor(options: { deny?: string[] } = {}): Promise<CrmUser> {
  return crmUser(context, { roleCodes: ['asesor'], countryId: w1, ...(options.deny ? { deny: options.deny } : {}) });
}

async function projectOf(owner: { id: string }, options: { phaseCode?: string; phaseProgress?: string; countryId?: string } = {}): Promise<string> {
  const countryId = options.countryId ?? w1;
  const customer = await insertCustomer(context.prisma, { salesOwnerId: owner.id, countryId });
  return insertProject(context.prisma, {
    customerId: customer.id,
    ownerId: owner.id,
    countryId,
    lastActivityAt: OLD_ACTIVITY,
    ...(options.phaseCode ? { phaseCode: options.phaseCode } : {}),
    ...(options.phaseProgress ? { phaseProgress: options.phaseProgress } : {}),
  });
}

/** Oportunidad abierta en `COTIZANDO` (o en la etapa indicada, con su resultado). */
async function opportunity(owner: { id: string }, projectId: string, options: { stageCode?: string; outcome?: 'WON' | 'LOST' | 'PARTIAL' } = {}): Promise<string> {
  return insertOpportunity(context.prisma, { projectId, ownerId: owner.id, stageCode: options.stageCode ?? 'COTIZANDO', outcome: options.outcome ?? null });
}

function changeStage(user: CrmUser, opportunityId: string, body: Record<string, unknown>): request.Test {
  return api(context, user.token).post(`/opportunities/${opportunityId}/stage-changes`).send(body);
}

function putResult(user: CrmUser, opportunityId: string, body: Record<string, unknown>): request.Test {
  return api(context, user.token).put(`/opportunities/${opportunityId}/result`).send(body);
}

async function audit(event: string, resourceId: string) {
  return context.prisma.auditLog.findMany({ where: { event, resourceId }, orderBy: { occurredAt: 'asc' } });
}

async function state(opportunityId: string) {
  const row = await context.prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId }, include: { result: true } });
  return {
    stageId: row.stageId,
    closedAt: row.closedAt,
    result: row.result,
    stageHistory: await context.prisma.opportunityStageHistory.count({ where: { opportunityId } }),
    resultHistory: await context.prisma.opportunityResultHistory.findMany({ where: { opportunityId }, orderBy: { changedAt: 'asc' } }),
  };
}

/** Abre una transacción que ejecuta `hold` y queda abierta hasta `release()` (patrón de customers-concurrency). */
function holdTransaction(hold: (tx: PrismaClient) => Promise<void>): { locked: Promise<void>; release: () => void; done: Promise<void> } {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  let signalLocked: () => void = () => undefined;
  const locked = new Promise<void>((resolve) => (signalLocked = resolve));
  const done = context.prisma.$transaction(
    async (tx) => {
      await hold(tx as unknown as PrismaClient);
      signalLocked();
      await released;
    },
    { timeout: 20_000 },
  );
  return { locked, release, done };
}

async function expectWaiting(test: request.Test): Promise<() => Promise<request.Response>> {
  let settled = false;
  const pending = test.then((response) => {
    settled = true;
    return response;
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(settled).toBe(false);
  return () => pending;
}

// ---------------------------------------------------------------------------
// Cierre con resultado (PF-03.71–PF-03.75)
// ---------------------------------------------------------------------------

describe('Cierre con resultado (stage-changes)', () => {
  it('a cerrada sin resultado → RESULT_REQUIRED; resultado incompatible → RESULT_STAGE_MISMATCH; resultado a abierta → RESULT_NOT_ALLOWED; nada se escribe (PF-03.71, AC-03.51)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const id = await opportunity(owner, projectId);

    const required = await changeStage(owner, id, { toStageId: stage.GANADO }).expect(422);
    expect(required.body).toMatchObject({ code: 'RESULT_REQUIRED', details: [{ field: 'result', code: 'RESULT_REQUIRED', stageCode: 'GANADO' }] });
    const mismatch = await changeStage(owner, id, { toStageId: stage.GANADO, result: { outcome: 'LOST', reasonId: reason.PRECIO, decisionDate: '2026-10-05' } }).expect(422);
    expect(mismatch.body).toMatchObject({
      code: 'RESULT_STAGE_MISMATCH',
      details: [{ field: 'result.outcome', code: 'RESULT_STAGE_MISMATCH', stageCode: 'GANADO', allowedOutcomes: ['WON', 'PARTIAL'] }],
    });
    const notAllowed = await changeStage(owner, id, { toStageId: stage.CONTACTADO, result: { outcome: 'WON', decisionDate: '2026-10-05' } }).expect(422);
    expect(notAllowed.body).toMatchObject({ code: 'RESULT_NOT_ALLOWED', details: [{ field: 'result', stageCode: 'CONTACTADO' }] });

    const after = await state(id);
    expect(after).toMatchObject({ stageId: stage.COTIZANDO, closedAt: null, result: null, stageHistory: 0, resultHistory: [] });
    expect(await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } })).toMatchObject({ lastActivityAt: OLD_ACTIVITY });
  });

  it('cierre WON: 201, closedAt, historial RECORDED, auditoría con comentarios enmascarados y lastActivityAt; PERDIDO con LOST y motivo → 201 (AC-03.51)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const won = await opportunity(owner, projectId);
    const response = await changeStage(owner, won, {
      toStageId: stage.GANADO,
      comment: 'Firmó el contrato',
      result: { outcome: 'WON', decisionDate: '2026-10-31', comments: 'Ana López confirmó' },
    }).expect(201);
    expect(response.body).toMatchObject({
      stage: { code: 'GANADO', isClosed: true, outcome: 'WON' },
      result: {
        outcome: 'WON',
        outcomeLabel: 'Ganado',
        reason: null,
        awardedPercent: null,
        decisionDate: '2026-10-31',
        comments: 'Ana López confirmó',
        recordedBy: { id: owner.id },
        updatedBy: { id: owner.id },
      },
      capabilities: { canEdit: true, canClose: true, canReopen: false, canDelete: false },
      allowedTransitions: [],
    });
    expect(response.body.closedAt).not.toBeNull();
    const row = await state(won);
    // Fecha de calendario sin desplazamiento de zona (PF-03.74).
    expect(row.result?.decisionDate.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(row.resultHistory.map((entry) => entry.action)).toEqual(['RECORDED']);
    expect((await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } })).lastActivityAt.getTime()).toBeGreaterThan(OLD_ACTIVITY.getTime());
    const [recorded] = await audit('crm.opportunity_result.recorded', won);
    expect(recorded).toMatchObject({ resourceType: 'crm.opportunity', metadata: { projectId } });
    expect(recorded?.changes).toMatchObject({ outcome: { before: null, after: 'WON' }, comments: { before: null, after: 'A***' } });
    expect(await audit('crm.opportunity.stage_changed', won)).toHaveLength(1);

    const lost = await opportunity(owner, projectId);
    const lostResponse = await changeStage(owner, lost, {
      toStageId: stage.PERDIDO,
      result: { outcome: 'LOST', reasonId: reason.PROYECTO_CANCELADO, decisionDate: '2026-10-20' },
    }).expect(201);
    expect(lostResponse.body.result).toMatchObject({ outcome: 'LOST', outcomeLabel: 'Perdido', reason: { id: reason.PROYECTO_CANCELADO, code: 'PROYECTO_CANCELADO' } });
  });

  it('LOST sin motivo, PARTIAL sin porcentaje, porcentaje fuera de rango o en WON → 422 con el código correcto (PF-03.72, AC-03.52, AC-03.53)', async () => {
    const owner = await advisor();
    const id = await opportunity(owner, await projectOf(owner));
    const cases: [Record<string, unknown>, string, string, Record<string, unknown>][] = [
      [{ toStageId: stage.PERDIDO, result: { outcome: 'LOST', decisionDate: '2026-10-05' } }, 'RESULT_REASON_REQUIRED', 'result.reasonId', {}],
      [{ toStageId: stage.GANADO, result: { outcome: 'PARTIAL', decisionDate: '2026-10-05' } }, 'RESULT_PERCENT_REQUIRED', 'result.awardedPercent', {}],
      [{ toStageId: stage.GANADO, result: { outcome: 'PARTIAL', awardedPercent: '120', decisionDate: '2026-10-05' } }, 'INVALID_PROGRESS', 'result.awardedPercent', { min: '0', max: '100' }],
      [{ toStageId: stage.GANADO, result: { outcome: 'PARTIAL', awardedPercent: '-1', decisionDate: '2026-10-05' } }, 'INVALID_PROGRESS', 'result.awardedPercent', {}],
      [{ toStageId: stage.GANADO, result: { outcome: 'WON', awardedPercent: '100', decisionDate: '2026-10-05' } }, 'RESULT_PERCENT_NOT_ALLOWED', 'result.awardedPercent', {}],
    ];
    for (const [body, code, field, extra] of cases) {
      const response = await changeStage(owner, id, body).expect(422);
      expect(response.body).toMatchObject({ code, details: [{ field, code, ...extra }] });
    }
    expect(await state(id)).toMatchObject({ stageId: stage.COTIZANDO, result: null, resultHistory: [] });
  });

  it('resultado sin fecha de decisión o con forma inválida → 400 (PF-03.74)', async () => {
    const owner = await advisor();
    const id = await opportunity(owner, await projectOf(owner));
    for (const result of [{ outcome: 'WON' }, { outcome: 'WIN', decisionDate: '2026-10-05' }, { outcome: 'WON', decisionDate: '2026-13-01' }, { outcome: 'PARTIAL', awardedPercent: 60, decisionDate: '2026-10-05' }, { outcome: 'WON', decisionDate: '2026-10-05', extra: 1 }]) {
      const response = await changeStage(owner, id, { toStageId: stage.GANADO, result });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('cierre PARTIAL 60 %: queda en GANADO, una sola fila nueva de historial de etapas y el proyecto cuenta como ganado (PF-03.75, AC-03.55)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const id = await opportunity(owner, projectId);
    const response = await changeStage(owner, id, {
      toStageId: stage.GANADO,
      result: { outcome: 'PARTIAL', awardedPercent: '60', reasonId: reason.COMPETENCIA, decisionDate: '2026-10-05' },
    }).expect(201);
    expect(response.body).toMatchObject({ stage: { code: 'GANADO' }, result: { outcome: 'PARTIAL', outcomeLabel: 'Parcial', awardedPercent: '60.00', reason: { code: 'COMPETENCIA' } } });
    expect((await state(id)).stageHistory).toBe(1);
    const project = await api(context, owner.token).get(`/projects/${projectId}`).expect(200);
    expect(project.body.commercialStatus).toEqual({ kind: 'WON', label: 'Ganado', stage: null });
    expect(project.body.summary).toMatchObject({ openOpportunities: 0, wonOpportunities: 0, partialOpportunities: 1, lostOpportunities: 0 });
    const list = await api(context, owner.token).get(`/projects/${projectId}/opportunities`).expect(200);
    expect(list.body.data[0].result).toEqual({ outcome: 'PARTIAL', awardedPercent: '60.00', decisionDate: '2026-10-05' });
  });

  it('cerrar no toca la fase del proyecto, también en un proyecto FINALIZADO (PF-03.54, AC-03.39)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner, { phaseCode: 'FINALIZADO', phaseProgress: '100' });
    const before = await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const id = await opportunity(owner, projectId);
    await changeStage(owner, id, { toStageId: stage.GANADO, result: { outcome: 'WON', decisionDate: '2026-10-05' } }).expect(201);
    const after = await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect([after.phaseId, after.phaseProgress.toFixed(2), after.phaseUpdatedAt]).toEqual([before.phaseId, before.phaseProgress.toFixed(2), before.phaseUpdatedAt]);
  });

  it('motivo de otro catálogo, inactivo o que no aplica al resultado → 422 INVALID_CATALOG_VALUE (PF-03.77, AC-03.57)', async () => {
    const owner = await advisor();
    const id = await opportunity(owner, await projectOf(owner));
    const catalog = await context.prisma.catalog.findUniqueOrThrow({ where: { key: 'crm.motivo_resultado' } });
    const inactive = await context.prisma.catalogItem.create({
      data: { catalogId: catalog.id, code: `TEST-MOT-${uniqueSuffix()}`, label: 'Motivo inactivo', metadata: { appliesTo: ['WON', 'LOST', 'PARTIAL'] }, sortOrder: 990, isActive: false },
    });
    const cases: [string, string][] = [
      [await catalogItemId(context.prisma, 'crm.fase_cliente', 'DISENO'), 'NOT_FOUND'],
      [inactive.id, 'INACTIVE'],
      [reason.PROYECTO_CANCELADO, 'NOT_APPLICABLE'],
    ];
    for (const [reasonId, failure] of cases) {
      const response = await changeStage(owner, id, { toStageId: stage.GANADO, result: { outcome: 'WON', reasonId, decisionDate: '2026-10-05' } }).expect(422);
      expect(response.body).toMatchObject({ code: 'INVALID_CATALOG_VALUE', details: [{ field: 'result.reasonId', catalogKey: 'crm.motivo_resultado', reason: failure }] });
    }
    expect(await state(id)).toMatchObject({ stageId: stage.COTIZANDO, result: null });
  });

  it('sin `oportunidades.cerrar`: 403 al cerrar y al modificar el resultado, y no se le ofrecen etapas cerradas (PF-03.78, AC-03.58)', async () => {
    const owner = await advisor({ deny: ['oportunidades.cerrar'] });
    const projectId = await projectOf(owner);
    const open = await opportunity(owner, projectId);
    const closed = await opportunity(owner, projectId, { stageCode: 'GANADO', outcome: 'WON' });
    const detail = await api(context, owner.token).get(`/opportunities/${open}`).expect(200);
    expect(detail.body.capabilities).toEqual({ canEdit: true, canClose: false, canReopen: false, canDelete: false });
    expect((detail.body.allowedTransitions as { code: string }[]).map((item) => item.code)).toEqual(['CONTACTADO']);
    const close = await changeStage(owner, open, { toStageId: stage.GANADO, result: { outcome: 'WON', decisionDate: '2026-10-05' } }).expect(403);
    expect(close.body).toMatchObject({ code: 'PERMISSION_DENIED' });
    await putResult(owner, closed, { outcome: 'PARTIAL', awardedPercent: '50', decisionDate: '2026-10-05' }).expect(403);
    expect((await state(open)).stageId).toBe(stage.COTIZANDO);
    expect((await state(closed)).result?.outcome).toBe('WON');
  });

  it('el manager cierra la oportunidad de un miembro de su equipo; un manager ajeno no la ve (404)', async () => {
    const member = await advisor();
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: w1 });
    const otherManager = await crmUser(context, { roleCodes: ['manager'], countryId: w1 });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [member.id] });
    const id = await opportunity(member, await projectOf(member));
    await changeStage(otherManager, id, { toStageId: stage.GANADO, result: { outcome: 'WON', decisionDate: '2026-10-05' } }).expect(404);
    await putResult(otherManager, id, { outcome: 'WON', decisionDate: '2026-10-05' }).expect(404);
    const response = await changeStage(manager, id, { toStageId: stage.GANADO, result: { outcome: 'WON', decisionDate: '2026-10-05' } }).expect(201);
    expect(response.body.result).toMatchObject({ recordedBy: { id: manager.id } });
  });
});

// ---------------------------------------------------------------------------
// Modificar el resultado (PF-03.76)
// ---------------------------------------------------------------------------

describe('PUT /opportunities/{id}/result', () => {
  it('WON → PARTIAL 70: 200, historial CHANGED y auditoría; a LOST → 422 RESULT_STAGE_MISMATCH; abierta → 409; sin diferencias no escribe (PF-03.76, AC-03.56)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const id = await opportunity(owner, projectId);
    await changeStage(owner, id, { toStageId: stage.GANADO, result: { outcome: 'WON', decisionDate: '2026-10-05' } }).expect(201);
    await context.prisma.project.update({ where: { id: projectId }, data: { lastActivityAt: OLD_ACTIVITY } });

    const changed = await putResult(owner, id, { outcome: 'PARTIAL', awardedPercent: '70', decisionDate: '2026-10-06', comments: 'Se adjudicó una parte' }).expect(200);
    expect(changed.body).toMatchObject({
      outcome: 'PARTIAL',
      outcomeLabel: 'Parcial',
      awardedPercent: '70.00',
      decisionDate: '2026-10-06',
      comments: 'Se adjudicó una parte',
      recordedBy: { id: owner.id },
      updatedBy: { id: owner.id },
    });
    const row = await state(id);
    expect(row.stageId).toBe(stage.GANADO);
    expect(row.stageHistory).toBe(1);
    expect(row.resultHistory.map((entry) => entry.action)).toEqual(['RECORDED', 'CHANGED']);
    expect((await context.prisma.project.findUniqueOrThrow({ where: { id: projectId } })).lastActivityAt.getTime()).toBeGreaterThan(OLD_ACTIVITY.getTime());
    const [entry] = await audit('crm.opportunity_result.changed', id);
    expect(entry?.changes).toEqual({
      outcome: { before: 'WON', after: 'PARTIAL' },
      awardedPercent: { before: null, after: '70.00' },
      decisionDate: { before: '2026-10-05', after: '2026-10-06' },
      comments: { before: null, after: 'S***' },
    });

    const mismatch = await putResult(owner, id, { outcome: 'LOST', reasonId: reason.PRECIO, decisionDate: '2026-10-06' }).expect(422);
    expect(mismatch.body).toMatchObject({ code: 'RESULT_STAGE_MISMATCH', details: [{ field: 'outcome', code: 'RESULT_STAGE_MISMATCH', allowedOutcomes: ['WON', 'PARTIAL'] }] });

    await putResult(owner, id, { outcome: 'PARTIAL', awardedPercent: '70.0', decisionDate: '2026-10-06', comments: 'Se adjudicó una parte' }).expect(200);
    expect((await state(id)).resultHistory).toHaveLength(2);
    expect(await audit('crm.opportunity_result.changed', id)).toHaveLength(1);

    const open = await opportunity(owner, projectId);
    const notClosed = await putResult(owner, open, { outcome: 'WON', decisionDate: '2026-10-06' }).expect(409);
    expect(notClosed.body).toMatchObject({ code: 'OPPORTUNITY_NOT_CLOSED', details: [{ stageId: stage.COTIZANDO, stageCode: 'COTIZANDO' }] });
  });

  it('404 fuera del alcance o inexistente; 400 con un cuerpo inválido', async () => {
    const owner = await advisor();
    const stranger = await advisor();
    const id = await opportunity(owner, await projectOf(owner), { stageCode: 'GANADO', outcome: 'WON' });
    for (const target of [id, randomUUID()]) {
      const response = await putResult(stranger, target, { outcome: 'PARTIAL', awardedPercent: '50', decisionDate: '2026-10-05' }).expect(404);
      expect(response.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    }
    await putResult(owner, id, { outcome: 'PARTIAL', awardedPercent: '50' }).expect(400);
    expect((await state(id)).result?.outcome).toBe('WON');
  });
});

// ---------------------------------------------------------------------------
// Reapertura (PF-03.67, PF-03.68)
// ---------------------------------------------------------------------------

describe('Reabrir una oportunidad cerrada', () => {
  it('con `administrar` y comentario: resultado borrado, CLEARED, closedAt nulo y etapa abierta; sin comentario → 422 COMMENT_REQUIRED; sin `administrar` → 403 (PF-03.67, PF-03.68, AC-03.49)', async () => {
    const owner = await advisor();
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: w1 });
    await insertTeam(context.prisma, { managerId: manager.id, memberIds: [owner.id] });
    const projectId = await projectOf(owner);
    const id = await opportunity(owner, projectId);
    await changeStage(owner, id, { toStageId: stage.GANADO, result: { outcome: 'WON', decisionDate: '2026-10-05' } }).expect(201);

    const managerView = await api(context, manager.token).get(`/opportunities/${id}`).expect(200);
    expect(managerView.body.capabilities).toMatchObject({ canReopen: true, canDelete: false });
    const reopenTargets = (managerView.body.allowedTransitions as { code: string; isClosed: boolean }[]).map((item) => item.code);
    expect(reopenTargets).toEqual(expect.arrayContaining(['CONTACTADO', 'COTIZANDO']));
    expect((managerView.body.allowedTransitions as { isClosed: boolean }[]).every((item) => !item.isClosed)).toBe(true);

    const forbidden = await changeStage(owner, id, { toStageId: stage.COTIZANDO, comment: 'Reabrir' }).expect(403);
    expect(forbidden.body).toMatchObject({ code: 'PERMISSION_DENIED' });
    const noComment = await changeStage(manager, id, { toStageId: stage.COTIZANDO, comment: '   ' }).expect(422);
    expect(noComment.body).toMatchObject({ code: 'COMMENT_REQUIRED', details: [{ field: 'comment', code: 'COMMENT_REQUIRED' }] });
    const withResult = await changeStage(manager, id, { toStageId: stage.COTIZANDO, comment: 'Reabrir', result: { outcome: 'WON', decisionDate: '2026-10-05' } }).expect(422);
    expect(withResult.body).toMatchObject({ code: 'RESULT_NOT_ALLOWED' });
    expect((await state(id)).result).not.toBeNull();

    const reopened = await changeStage(manager, id, { toStageId: stage.COTIZANDO, comment: 'El cliente reabrió la licitación' }).expect(201);
    expect(reopened.body).toMatchObject({ stage: { code: 'COTIZANDO' }, result: null, closedAt: null });
    const row = await state(id);
    expect(row.result).toBeNull();
    expect(row.closedAt).toBeNull();
    expect(row.resultHistory.map((entry) => entry.action)).toEqual(['RECORDED', 'CLEARED']);
    expect(row.resultHistory[1]).toMatchObject({ outcome: null, reasonId: null, decisionDate: null, changedById: manager.id });
    const [cleared] = await audit('crm.opportunity_result.cleared', id);
    expect(cleared?.changes).toMatchObject({ outcome: { before: 'WON', after: null } });

    const history = await api(context, owner.token).get(`/opportunities/${id}/history`).expect(200);
    expect((history.body.results as { action: string }[]).map((item) => item.action)).toEqual(['CLEARED', 'RECORDED']);
    expect((history.body.stages as { toStage: { code: string }; comment: string | null }[])[0]).toMatchObject({ toStage: { code: 'COTIZANDO' }, comment: 'El cliente reabrió la licitación' });

    // Tras reabrir se puede cerrar de nuevo con otro resultado (WON ↔ LOST exige reabrir, RN-03.52).
    await changeStage(owner, id, { toStageId: stage.PERDIDO, result: { outcome: 'LOST', reasonId: reason.PRECIO, decisionDate: '2026-10-09' } }).expect(201);
    expect((await state(id)).resultHistory.map((entry) => entry.action)).toEqual(['RECORDED', 'CLEARED', 'RECORDED']);
  });

  it('de cerrada a cerrada no hay transición con el mapa por defecto → 422 INVALID_STAGE_TRANSITION', async () => {
    const owner = await advisor();
    const id = await opportunity(owner, await projectOf(owner), { stageCode: 'GANADO', outcome: 'WON' });
    const response = await changeStage(owner, id, { toStageId: stage.PERDIDO, result: { outcome: 'LOST', reasonId: reason.PRECIO, decisionDate: '2026-10-05' } }).expect(422);
    expect(response.body).toMatchObject({ code: 'INVALID_STAGE_TRANSITION', details: [{ fromStageCode: 'GANADO', toStageCode: 'PERDIDO' }] });
  });
});

// ---------------------------------------------------------------------------
// Filtros por resultado (AC-03.86) y concurrencia
// ---------------------------------------------------------------------------

describe('Filtros del pipeline por resultado', () => {
  it('status, outcome y fecha de decisión (destinos de Inicio, AC-03.86)', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner, { countryId: w2 });
    const open = await opportunity(owner, projectId);
    const won = await opportunity(owner, projectId);
    const partial = await opportunity(owner, projectId);
    const lost = await opportunity(owner, projectId);
    await changeStage(owner, won, { toStageId: stage.GANADO, result: { outcome: 'WON', decisionDate: '2026-09-10' } }).expect(201);
    await changeStage(owner, partial, { toStageId: stage.GANADO, result: { outcome: 'PARTIAL', awardedPercent: '40', decisionDate: '2026-10-10' } }).expect(201);
    await changeStage(owner, lost, { toStageId: stage.PERDIDO, result: { outcome: 'LOST', reasonId: reason.PRECIO, decisionDate: '2026-10-12' } }).expect(201);
    const client = api(context, owner.token);
    async function ids(query: string): Promise<string[]> {
      const response = await client.get(`/opportunities?projectId=${projectId}&${query}`).expect(200);
      return (response.body.data as { id: string }[]).map((item) => item.id).sort();
    }
    expect(await ids('status=OPEN')).toEqual([open]);
    expect(await ids('status=CLOSED')).toEqual([won, partial, lost].sort());
    expect(await ids('outcome=WON,PARTIAL')).toEqual([won, partial].sort());
    expect(await ids('outcome=WON,PARTIAL&decisionFrom=2026-10-01&decisionTo=2026-10-31')).toEqual([partial]);
    expect(await ids('decisionFrom=2026-10-11')).toEqual([lost]);
    const summary = await client.get(`/opportunities/stage-summary?projectId=${projectId}&status=CLOSED`).expect(200);
    const counts = Object.fromEntries((summary.body.stages as { stage: { code: string }; count: number }[]).map((item) => [item.stage.code, item.count]));
    expect(counts).toMatchObject({ CONTACTADO: 0, COTIZANDO: 0, GANADO: 2, PERDIDO: 1 });
  });
});

describe('Concurrencia del cierre', () => {
  it('dos cierres simultáneos (GANADO y PERDIDO): uno 201 y el otro 422, y queda un único resultado coherente con la etapa', async () => {
    const owner = await advisor();
    const projectId = await projectOf(owner);
    const id = await opportunity(owner, projectId);
    const holder = holdTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
    });
    await holder.locked;
    let responses: request.Response[] = [];
    try {
      const won = await expectWaiting(changeStage(owner, id, { toStageId: stage.GANADO, result: { outcome: 'WON', decisionDate: '2026-10-05' } }));
      const lost = await expectWaiting(
        changeStage(owner, id, { toStageId: stage.PERDIDO, result: { outcome: 'LOST', reasonId: reason.PRECIO, decisionDate: '2026-10-05' } }),
      );
      holder.release();
      await holder.done;
      responses = await Promise.all([won(), lost()]);
    } finally {
      holder.release();
    }
    expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
    expect(responses.find((response) => response.status === 422)?.body).toMatchObject({ code: 'INVALID_STAGE_TRANSITION' });
    const row = await state(id);
    expect(row.stageHistory).toBe(1);
    expect(row.resultHistory).toHaveLength(1);
    expect(row.result?.outcome).toBe(row.stageId === stage.GANADO ? 'WON' : 'LOST');
  });
});
