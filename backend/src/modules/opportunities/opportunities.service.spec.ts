import { OpportunitiesService } from './opportunities.service';
import { OpportunityStageService } from './opportunity-stage.service';
import { STAGES } from './testing/opportunity-fixtures';
import { actorWith, fakes, record } from './testing/opportunity-service-fakes';

const ADVISOR = ['oportunidades.ver', 'oportunidades.crear', 'oportunidades.editar', 'oportunidades.cerrar'];
const SUPERVISOR = [...ADVISOR, 'oportunidades.eliminar', 'oportunidades.administrar'];

type Fakes = ReturnType<typeof fakes>;

function services(f: Fakes): { service: OpportunitiesService; stages: OpportunityStageService } {
  const service = new OpportunitiesService(
    f.opportunities as never,
    f.projects as never,
    f.transactions as never,
    f.sequences as never,
    f.access as never,
    f.catalogs as never,
    f.catalogValidator as never,
    f.currencies as never,
    f.parameters as never,
    f.audit as never,
    f.logger as never,
  );
  const stages = new OpportunityStageService(
    f.opportunities as never,
    f.projects as never,
    f.transactions as never,
    f.access as never,
    service,
    f.catalogs as never,
    f.catalogValidator as never,
    f.audit as never,
    f.logger as never,
  );
  return { service, stages };
}

describe('OpportunitiesService', () => {
  it('alta: la tasa se resuelve antes de abrir la transacción; dentro, proyecto bloqueado primero, folio, alta, historial y lastActivityAt con la misma tx', async () => {
    const f = fakes();
    const { service } = services(f);
    const view = await service.create(actorWith(ADVISOR), 'project-1', { estimatedAmount: '7750', currencyCode: 'GTQ', opportunityDate: '2026-10-10' });

    expect(f.calls).toEqual(['convert', 'begin', 'lockProject', 'sequence', 'create', 'stageHistory', 'touch', 'commit', 'audit']);
    expect(f.projects.lockProject).toHaveBeenCalledWith('project-1', 'UPDATE', f.tx);
    expect(f.sequences.next).toHaveBeenCalledWith('crm.oportunidad', f.tx, expect.objectContaining({ timeZone: 'America/Guatemala' }));
    expect(f.opportunities.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'OPO-2026-00042',
        stageId: STAGES.CONTACTADO.id,
        ownerId: 'me',
        estimatedAmount: '7750.0000',
        currencyCode: 'GTQ',
        exchangeRate: '7.75000000',
        exchangeRateDate: '2026-08-01',
        estimatedAmountUsd: '1000.0000',
      }),
      f.tx,
    );
    expect(f.opportunities.insertStageHistory).toHaveBeenCalledWith(expect.objectContaining({ fromStageId: null, toStageId: STAGES.CONTACTADO.id }), f.tx);
    expect(view.warnings).toEqual([expect.objectContaining({ code: 'EXCHANGE_RATE_STALE' })]);
  });

  it('alta: error de la estimación (p. ej. EXCHANGE_RATE_NOT_FOUND) → no se abre la transacción', async () => {
    const f = fakes();
    f.currencies.convertToBase.mockRejectedValueOnce(new Error('EXCHANGE_RATE_NOT_FOUND'));
    await expect(services(f).service.create(actorWith(ADVISOR), 'project-1', { estimatedAmount: '1', currencyCode: 'GTQ' })).rejects.toThrow(
      'EXCHANGE_RATE_NOT_FOUND',
    );
    expect(f.transactions.run).not.toHaveBeenCalled();
  });

  it('alta: otro asesor sin `administrar` → 403 FIELD_NOT_EDITABLE; con él pero no elegible → 422 INVALID_OWNER sin escribir', async () => {
    const f = fakes();
    const { service } = services(f);
    await expect(service.create(actorWith(ADVISOR), 'project-1', { ownerId: 'other' })).rejects.toMatchObject({ code: 'FIELD_NOT_EDITABLE' });
    f.projects.findEligibleOwner.mockResolvedValueOnce(null as never);
    await expect(service.create(actorWith(SUPERVISOR), 'project-1', { ownerId: 'other' })).rejects.toMatchObject({
      code: 'INVALID_OWNER',
      details: [expect.objectContaining({ field: 'ownerId' })],
    });
    expect(f.opportunities.create).not.toHaveBeenCalled();
    expect(f.sequences.next).not.toHaveBeenCalled();
  });

  it('alta: etapa inicial cerrada → 422 INVALID_INITIAL_STAGE sin transacción', async () => {
    const f = fakes();
    await expect(services(f).service.create(actorWith(ADVISOR), 'project-1', { stageId: STAGES.GANADO.id })).rejects.toMatchObject({
      code: 'INVALID_INITIAL_STAGE',
    });
    expect(f.transactions.run).not.toHaveBeenCalled();
  });

  it('edición sin cambios (mismos valores normalizados) no escribe ni audita', async () => {
    const f = fakes(record({ nextAction: 'Llamar', estimatedTonnage: '80.0000' }));
    const view = await services(f).service.update(actorWith(ADVISOR), 'opp-1', { nextAction: 'Llamar', estimatedTonnage: '80' });
    expect(view.warnings).toEqual([]);
    expect(f.transactions.run).not.toHaveBeenCalled();
    expect(f.audit.record).not.toHaveBeenCalled();
  });

  it('edición: bloquea proyecto y oportunidad, escribe solo lo cambiado y toca lastActivityAt', async () => {
    const f = fakes();
    await services(f).service.update(actorWith(ADVISOR), 'opp-1', { nextAction: 'Visitar', description: null });
    expect(f.calls).toEqual(['begin', 'lockProject', 'lock', 'update', 'touch', 'commit', 'audit']);
    expect(f.opportunities.update).toHaveBeenCalledWith('opp-1', { nextAction: 'Visitar' }, 'me', f.tx);
  });

  it('eliminar una cerrada → 409 OPPORTUNITY_CLOSED (decidido con la fila bloqueada), sin borrar', async () => {
    const f = fakes(record({ stage: STAGES.GANADO }));
    await expect(services(f).service.remove(actorWith(SUPERVISOR), 'opp-1')).rejects.toMatchObject({ code: 'OPPORTUNITY_CLOSED' });
    expect(f.opportunities.softDelete).not.toHaveBeenCalled();
    expect(f.audit.record).not.toHaveBeenCalled();
  });

  it('eliminar con dependencias → 409 OPPORTUNITY_HAS_DEPENDENCIES con los bloqueos > 0', async () => {
    const f = fakes();
    f.opportunities.countDependencies.mockResolvedValueOnce({ activeProducts: 0, openActivities: 2 });
    await expect(services(f).service.remove(actorWith(SUPERVISOR), 'opp-1')).rejects.toMatchObject({
      code: 'OPPORTUNITY_HAS_DEPENDENCIES',
      details: [{ dependency: 'openActivities', count: 2 }],
    });
  });
});

describe('OpportunityStageService', () => {
  const WON = { outcome: 'WON' as const, decisionDate: '2026-10-05' };

  it('cierre: resultado, historial RECORDED, etapa con closedAt, historial de etapa y lastActivityAt en una tx; auditoría después', async () => {
    const f = fakes(record({ stage: STAGES.COTIZANDO }));
    await services(f).stages.changeStage(actorWith(ADVISOR), 'opp-1', { toStageId: STAGES.GANADO.id, result: WON });
    expect(f.calls).toEqual(['begin', 'lockProject', 'lock', 'upsertResult', 'resultHistory', 'changeStage', 'stageHistory', 'touch', 'commit', 'audit', 'audit']);
    expect(f.opportunities.insertResultHistory).toHaveBeenCalledWith(expect.objectContaining({ action: 'RECORDED' }), f.tx);
    expect(f.opportunities.changeStage).toHaveBeenCalledWith('opp-1', expect.objectContaining({ stageId: STAGES.GANADO.id, closedAt: expect.any(Date) }), 'me', f.tx);
    expect(f.audit.record.mock.calls.map((call) => call[0])).toEqual(['crm.opportunity.stage_changed', 'crm.opportunity_result.recorded']);
  });

  it('rechazo (misma etapa) dentro de la tx: sin escrituras ni auditoría', async () => {
    const f = fakes(record({ stage: STAGES.COTIZANDO }));
    await expect(services(f).stages.changeStage(actorWith(ADVISOR), 'opp-1', { toStageId: STAGES.COTIZANDO.id })).rejects.toMatchObject({ code: 'STAGE_UNCHANGED' });
    expect(f.calls).toEqual(['begin', 'lockProject', 'lock']);
  });

  it('reapertura con resultado: borra el resultado, CLEARED, closedAt nulo', async () => {
    const result = {
      outcome: 'WON' as const,
      reason: null,
      awardedPercent: null,
      decisionDate: '2026-10-05',
      comments: null,
      recordedBy: { id: 'me', displayName: 'Yo' },
      recordedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: null,
    };
    const f = fakes(record({ stage: STAGES.GANADO, result }));
    await services(f).stages.changeStage(actorWith(SUPERVISOR), 'opp-1', { toStageId: STAGES.COTIZANDO.id, comment: 'Reabre' });
    expect(f.calls.slice(0, 7)).toEqual(['begin', 'lockProject', 'lock', 'deleteResult', 'resultHistory', 'changeStage', 'stageHistory']);
    expect(f.opportunities.insertResultHistory).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLEARED', result: null }), f.tx);
    expect(f.opportunities.changeStage).toHaveBeenCalledWith('opp-1', expect.objectContaining({ closedAt: null }), 'me', f.tx);
    expect(f.audit.record.mock.calls.map((call) => call[0])).toEqual(['crm.opportunity.stage_changed', 'crm.opportunity_result.cleared']);
  });

  it('PUT /result en una abierta → 409 OPPORTUNITY_NOT_CLOSED sin escribir', async () => {
    const f = fakes(record({ stage: STAGES.COTIZANDO }));
    await expect(services(f).stages.updateResult(actorWith(ADVISOR), 'opp-1', WON)).rejects.toMatchObject({ code: 'OPPORTUNITY_NOT_CLOSED' });
    expect(f.opportunities.upsertResult).not.toHaveBeenCalled();
  });
});
