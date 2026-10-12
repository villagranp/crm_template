import { commercialStatus, type CommercialStatusOpportunity, type OpportunityOutcomeCode } from '@/modules/commercial-metrics/metric-definitions';

import { commercialStatusFromAggregate, openStageRanking, parseCommercialStatusFilter } from './project-commercial-status';
import { STAGES } from './testing/project-fixtures';

const ALL_STAGES = [STAGES.perdido, STAGES.contactado, STAGES.ganado, STAGES.cotizando];

/** Agregado que calcularía el adaptador para un conjunto de oportunidades no eliminadas. */
function aggregateOf(opportunities: readonly CommercialStatusOpportunity[]) {
  const ranking = openStageRanking(ALL_STAGES);
  const open = opportunities.map((opportunity) => opportunity.stage).filter((stage) => ranking.includes(stage.id));
  const leading = [...open].sort((a, b) => ranking.indexOf(a.id) - ranking.indexOf(b.id))[0] ?? null;
  return {
    leadingOpenStage: leading ? { id: leading.id, code: leading.code, label: leading.label } : null,
    opportunityCount: opportunities.length,
    hasWon: opportunities.some((opportunity) => opportunity.outcome === 'WON' || opportunity.outcome === 'PARTIAL'),
  };
}

describe('project-commercial-status (DEF-B, RN-03.14)', () => {
  it('openStageRanking: abiertas por mayor `order`, desempate por código', () => {
    expect(openStageRanking(ALL_STAGES)).toEqual(['stage-cotizando', 'stage-contactado']);
    const tie = { id: 'stage-alfa', code: 'ALFA', label: 'Alfa', metadata: { order: 2, isClosed: false } };
    expect(openStageRanking([...ALL_STAGES, tie])).toEqual(['stage-alfa', 'stage-cotizando', 'stage-contactado']);
  });

  it('equivale a `commercialStatus()` de metric-definitions en todas las combinaciones', () => {
    const open = [STAGES.contactado, STAGES.cotizando];
    const closed: { stage: (typeof STAGES)[keyof typeof STAGES]; outcome: OpportunityOutcomeCode | null }[] = [
      { stage: STAGES.ganado, outcome: 'WON' },
      { stage: STAGES.ganado, outcome: 'PARTIAL' },
      { stage: STAGES.perdido, outcome: 'LOST' },
    ];
    const pool: CommercialStatusOpportunity[] = [
      ...open.map((stage) => ({ stage, outcome: null })),
      ...closed.map((entry) => ({ stage: entry.stage, outcome: entry.outcome })),
    ];
    // Todos los subconjuntos del conjunto (2^5 = 32), incluido el vacío.
    for (let mask = 0; mask < 1 << pool.length; mask += 1) {
      const subset = pool.filter((_, index) => (mask & (1 << index)) !== 0);
      expect(commercialStatusFromAggregate(aggregateOf(subset))).toEqual(commercialStatus(subset));
    }
  });

  it('formas de la API', () => {
    expect(commercialStatusFromAggregate({ leadingOpenStage: null, opportunityCount: 0, hasWon: false })).toEqual({
      kind: 'NO_OPPORTUNITIES',
      label: 'Sin oportunidades',
      stage: null,
    });
    expect(commercialStatusFromAggregate({ leadingOpenStage: { id: 's', code: 'COTIZANDO', label: 'Cotizando' }, opportunityCount: 3, hasWon: true })).toEqual({
      kind: 'OPEN_STAGE',
      label: 'Cotizando',
      stage: { id: 's', code: 'COTIZANDO', label: 'Cotizando' },
    });
    expect(commercialStatusFromAggregate({ leadingOpenStage: null, opportunityCount: 2, hasWon: true }).kind).toBe('WON');
    expect(commercialStatusFromAggregate({ leadingOpenStage: null, opportunityCount: 2, hasWon: false }).kind).toBe('LOST');
  });

  it('parseCommercialStatusFilter: OPEN_STAGE[:<uuid>], WON, LOST, NO_OPPORTUNITIES', () => {
    const id = '0b9d1c9e-9f1c-4b5e-8a7d-3c2b1a0f9e8d';
    expect(parseCommercialStatusFilter('OPEN_STAGE')).toEqual({ kind: 'OPEN_STAGE', stageId: null });
    expect(parseCommercialStatusFilter(`OPEN_STAGE:${id.toUpperCase()}`)).toEqual({ kind: 'OPEN_STAGE', stageId: id });
    expect(parseCommercialStatusFilter(' WON ')).toEqual({ kind: 'WON', stageId: null });
    expect(parseCommercialStatusFilter('NO_OPPORTUNITIES')).toEqual({ kind: 'NO_OPPORTUNITIES', stageId: null });
    for (const invalid of ['OPEN', 'WON:x', `LOST:${id}`, 'OPEN_STAGE:no-uuid', `OPEN_STAGE:${id}:x`, '']) {
      expect(parseCommercialStatusFilter(invalid)).toBeNull();
    }
  });
});
