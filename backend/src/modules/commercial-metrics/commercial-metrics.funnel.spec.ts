import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { CatalogLookupService } from '@/modules/catalogs/catalog-lookup.service';

import {
  type CommercialDashboardCriteria,
  CommercialMetricsService,
  type CommercialSemantics,
  funnelConversion,
  funnelStagesOf,
  type MetricCatalogItem,
  MIN_FUNNEL_SAMPLE,
  percentOf,
  periodMonths,
  seriesOf,
} from './commercial-metrics.service';
import type { CommercialMetricsReadModel, FunnelReachRecord, OpportunityCriteria } from './ports/commercial-metrics-read-model.port';

/**
 * 05 F-41 (PF-05.5, AC-05.36–AC-05.38) y F-40 (series mensuales, RN-05.52): partes nuevas
 * del servicio compartido. Archivo propio para no chocar con lo que añada el Módulo 1.
 */

function stage(code: string, metadata: Record<string, unknown>, isActive = true): MetricCatalogItem {
  return { id: `id-${code}`, code, label: code, metadata, isActive, sortOrder: 0 };
}

const CONTACTADO = stage('CONTACTADO', { order: 1, isClosed: false, outcome: null, inFunnel: true });
const COTIZANDO = stage('COTIZANDO', { order: 2, isClosed: false, outcome: null, inFunnel: true });
const GANADO = stage('GANADO', { order: 3, isClosed: true, outcome: 'WON', inFunnel: true });
const PERDIDO = stage('PERDIDO', { order: 4, isClosed: true, outcome: 'LOST', inFunnel: false });

const SEMANTICS = {
  stages: [CONTACTADO, COTIZANDO, GANADO, PERDIDO],
  phases: [stage('DISENO', { order: 1, isFinal: false }), stage('FINALIZADO', { order: 4, isFinal: true })],
  visitStatuses: [],
  activityStatuses: [],
  openStageIds: ['id-CONTACTADO', 'id-COTIZANDO'],
  closedStageIds: ['id-GANADO', 'id-PERDIDO'],
  openStageRanking: [],
  nonFinalPhaseIds: ['id-DISENO'],
  finalPhaseIds: ['id-FINALIZADO'],
  phaseRanking: [],
  visitStatusSets: { SCHEDULED: [], COMPLETED: [], CONFIRMED: [], CANCELLED: [] },
  activityStatusSets: { open: [], completed: [], cancelled: [] },
} as unknown as CommercialSemantics;

const SCOPE = { kind: 'FILTERED', userId: 'u1', dataScope: 'OWN', ownerIds: ['u1'], teamIds: [], countryIds: [] } as const;
const CRITERIA = { scope: SCOPE, stageIds: [] } as unknown as OpportunityCriteria;

function service(readModel: Partial<CommercialMetricsReadModel>): CommercialMetricsService {
  return new CommercialMetricsService(readModel as CommercialMetricsReadModel, {} as AppLogger, {} as CatalogLookupService);
}

function reach(rows: [number | null, boolean, number][]): FunnelReachRecord[] {
  return rows.map(([maxOrder, hasHistory, count]) => ({ maxOrder, hasHistory, count }));
}

describe('funnelStagesOf (RN-05.53)', () => {
  it('etapas activas inFunnel en metadata.order; las demás fuera', () => {
    const inactive = stage('VIEJA', { order: 0, isClosed: false, inFunnel: true }, false);
    expect(funnelStagesOf([GANADO, PERDIDO, inactive, CONTACTADO, COTIZANDO]).map((entry) => entry.code)).toEqual(['CONTACTADO', 'COTIZANDO', 'GANADO']);
  });

  it('una etapa inFunnel sin order entero → 422 INVALID_CATALOG_SEMANTICS (PF-05.32)', () => {
    const broken = stage('NEGOCIANDO', { isClosed: false, inFunnel: true });
    expect(() => funnelStagesOf([CONTACTADO, broken])).toThrow(
      expect.objectContaining({
        code: 'INVALID_CATALOG_SEMANTICS',
        details: [{ field: 'crm.etapa_oportunidad', code: 'INVALID_CATALOG_SEMANTICS', itemCode: 'NEGOCIANDO', message: expect.stringContaining('order') }],
      }),
    );
  });
});

describe('percentOf', () => {
  it('dos decimales HALF_UP con aritmética decimal', () => {
    expect(percentOf(3, 7)).toBe('42.86');
    expect(percentOf(1, 3)).toBe('33.33');
    expect(percentOf(2, 3)).toBe('66.67');
    expect(percentOf(5, 5)).toBe('100.00');
  });
});

describe('funnelConversion (RN-05.55, D-05.9)', () => {
  const stages = [CONTACTADO, COTIZANDO, GANADO];

  it('alcanzó k = mayor order visitado ≥ order de k; denominador = alcanzaron la primera', () => {
    const result = funnelConversion(reach([[1, true, 4], [2, true, 3], [3, true, 2], [null, true, 1]]), stages);
    expect(result.reason).toBeNull();
    expect(result.denominator).toBe(9);
    expect([1, 2, 3].map(result.reached)).toEqual([9, 5, 2]);
  });

  it('sin datos → NO_DATA; alguna sin historial → INSUFFICIENT_HISTORY; muestra < mínimo → INSUFFICIENT_SAMPLE', () => {
    expect(funnelConversion([], stages).reason).toBe('NO_DATA');
    expect(funnelConversion(reach([[2, true, 10], [1, false, 1]]), stages).reason).toBe('INSUFFICIENT_HISTORY');
    expect(funnelConversion(reach([[2, true, MIN_FUNNEL_SAMPLE - 1]]), stages).reason).toBe('INSUFFICIENT_SAMPLE');
    expect(funnelConversion(reach([[2, true, MIN_FUNNEL_SAMPLE]]), stages).reason).toBeNull();
  });
});

describe('CommercialMetricsService.funnel (PF-05.5)', () => {
  it('participación y conversión acumulada; el filtro de etapa solo limita las barras (RN-05.56)', async () => {
    const readModel = {
      opportunityStageCounts: jest.fn().mockResolvedValue([
        { stageId: 'id-CONTACTADO', count: 3 },
        { stageId: 'id-COTIZANDO', count: 2 },
        { stageId: 'id-GANADO', count: 2 },
        { stageId: 'id-PERDIDO', count: 3 },
      ]),
      opportunityFunnelReach: jest.fn().mockResolvedValue(reach([[1, true, 3], [2, true, 4], [3, true, 2], [null, true, 1]])),
    };
    const result = await service(readModel).funnel(CRITERIA, SEMANTICS);

    expect(readModel.opportunityFunnelReach).toHaveBeenCalledWith(CRITERIA, [
      { stageId: 'id-CONTACTADO', order: 1 },
      { stageId: 'id-COTIZANDO', order: 2 },
      { stageId: 'id-GANADO', order: 3 },
    ]);
    expect(result).toEqual({
      totalInFunnel: 7,
      sampleMinimum: 5,
      stages: [
        { stage: { id: 'id-CONTACTADO', code: 'CONTACTADO', label: 'CONTACTADO', order: 1 }, count: 3, shareOfTotal: '42.86', cumulativeConversion: '100.00', unavailableReason: null },
        { stage: { id: 'id-COTIZANDO', code: 'COTIZANDO', label: 'COTIZANDO', order: 2 }, count: 2, shareOfTotal: '28.57', cumulativeConversion: '66.67', unavailableReason: null },
        { stage: { id: 'id-GANADO', code: 'GANADO', label: 'GANADO', order: 3 }, count: 2, shareOfTotal: '28.57', cumulativeConversion: '22.22', unavailableReason: null },
      ],
    });

    const onlyQuoting = await service(readModel).funnel(CRITERIA, SEMANTICS, ['id-COTIZANDO']);
    expect(onlyQuoting.stages).toEqual([result.stages[1]]);
    expect(onlyQuoting.totalInFunnel).toBe(7);
  });

  it('conjunto vacío: porcentajes null con NO_DATA, nunca 0 % (AC-05.36)', async () => {
    const result = await service({ opportunityStageCounts: jest.fn().mockResolvedValue([]), opportunityFunnelReach: jest.fn().mockResolvedValue([]) }).funnel(CRITERIA, SEMANTICS);
    expect(result.totalInFunnel).toBe(0);
    expect(result.stages.map(({ count, shareOfTotal, cumulativeConversion, unavailableReason }) => ({ count, shareOfTotal, cumulativeConversion, unavailableReason }))).toEqual(
      Array.from({ length: 3 }, () => ({ count: 0, shareOfTotal: null, cumulativeConversion: null, unavailableReason: 'NO_DATA' })),
    );
  });

  it('una oportunidad sin historial: conversión null con INSUFFICIENT_HISTORY y la participación sí se calcula (AC-05.37)', async () => {
    const result = await service({
      opportunityStageCounts: jest.fn().mockResolvedValue([{ stageId: 'id-CONTACTADO', count: 6 }]),
      opportunityFunnelReach: jest.fn().mockResolvedValue(reach([[1, true, 5], [1, false, 1]])),
    }).funnel(CRITERIA, SEMANTICS);
    expect(result.stages[0]).toMatchObject({ count: 6, shareOfTotal: '100.00', cumulativeConversion: null, unavailableReason: 'INSUFFICIENT_HISTORY' });
  });

  it('muestra menor que el mínimo → INSUFFICIENT_SAMPLE', async () => {
    const result = await service({
      opportunityStageCounts: jest.fn().mockResolvedValue([{ stageId: 'id-COTIZANDO', count: 2 }]),
      opportunityFunnelReach: jest.fn().mockResolvedValue(reach([[2, true, 2]])),
    }).funnel(CRITERIA, SEMANTICS);
    expect(result.stages[1]).toMatchObject({ count: 2, shareOfTotal: '100.00', cumulativeConversion: null, unavailableReason: 'INSUFFICIENT_SAMPLE' });
  });
});

describe('series mensuales del dashboard (RN-05.52)', () => {
  it('periodMonths incluye ambos extremos y cambia de año', () => {
    expect(periodMonths({ from: '2025-11-15', to: '2026-02-01' })).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });

  it('monthlyCounts: todos los meses (también en 0), ganadas = WON + PARTIAL, cada indicador en su columna', async () => {
    const readModel = {
      opportunityMonthlyCounts: jest.fn((criteria: OpportunityCriteria) =>
        Promise.resolve(
          criteria.period?.basis === 'IDENTIFIED'
            ? [{ year: 2026, month: 9, total: 4, wonFull: 0, partial: 0, lost: 0 }]
            : [{ year: 2026, month: 10, total: 3, wonFull: 1, partial: 1, lost: 1 }],
        ),
      ),
      activityMonthlyCounts: jest.fn().mockResolvedValue([{ year: 2026, month: 8, count: 2 }]),
      visitMonthlyCounts: jest.fn().mockResolvedValue([{ year: 2026, month: 10, completed: 5, cancelled: 1 }]),
    };
    const criteria: CommercialDashboardCriteria = {
      scope: SCOPE,
      now: new Date('2026-10-13T18:00:00Z'),
      businessTimeZone: 'America/Guatemala',
      period: { from: '2026-08-01', to: '2026-10-31' },
      ownerIds: ['u1'],
      countryIds: [],
    };
    const rows = await service(readModel).monthlyCounts(criteria, SEMANTICS);
    expect(rows).toEqual([
      { year: 2026, month: 8, identified: 0, won: 0, wonFull: 0, partial: 0, lost: 0, activitiesCompleted: 2, visitsCompleted: 0, visitsCancelled: 0 },
      { year: 2026, month: 9, identified: 4, won: 0, wonFull: 0, partial: 0, lost: 0, activitiesCompleted: 0, visitsCompleted: 0, visitsCancelled: 0 },
      { year: 2026, month: 10, identified: 0, won: 2, wonFull: 1, partial: 1, lost: 1, activitiesCompleted: 0, visitsCompleted: 5, visitsCancelled: 1 },
    ]);
    // Filtros del dashboard en cada consulta; la de actividades solo cuenta completadas por `completed_at`.
    expect(readModel.opportunityMonthlyCounts.mock.calls.map(([call]) => [call.period?.basis, call.ownerIds])).toEqual([
      ['IDENTIFIED', ['u1']],
      ['DECIDED', ['u1']],
    ]);
    expect(readModel.activityMonthlyCounts.mock.calls[0]?.[0]).toMatchObject({ period: { basis: 'COMPLETED' }, categories: ['COMPLETED'], ownerIds: ['u1'] });
    expect(seriesOf('WON', rows).map((point) => point.value)).toEqual([0, 0, 2]);
    expect(seriesOf('VISITS_COMPLETED', rows).map((point) => point.value)).toEqual([0, 0, 5]);
  });
});
