import type { CatalogLookupService } from '@/modules/catalogs/catalog-lookup.service';
import type { CatalogDetailRecord } from '@/modules/catalogs/ports/catalogs.repository.port';

import { CommercialMetricsService, METRIC_CATALOGS } from './commercial-metrics.service';
import type {
  CommercialMetricsReadModel,
  ForecastCellRecord,
  ForecastGroupCellRecord,
  MetricContext,
  OpportunityCriteria,
} from './ports/commercial-metrics-read-model.port';

type Item = { code: string; metadata: Record<string, unknown> | null; isActive?: boolean; sortOrder?: number };

function catalog(key: string, items: Item[]): CatalogDetailRecord {
  const now = new Date();
  return {
    id: `catalog-${key}`,
    key,
    name: key,
    description: null,
    isSystem: true,
    itemCount: items.length,
    activeItemCount: items.filter((entry) => entry.isActive !== false).length,
    createdAt: now,
    updatedAt: now,
    items: items.map((entry, index) => ({
      id: `id-${entry.code}`,
      catalogId: `catalog-${key}`,
      code: entry.code,
      label: entry.code.charAt(0) + entry.code.slice(1).toLowerCase(),
      metadata: entry.metadata as CatalogDetailRecord['items'][number]['metadata'],
      sortOrder: entry.sortOrder ?? index,
      isActive: entry.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    })),
  };
}

const visit = (flag: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  isPending: false,
  isDone: false,
  isConfirmed: false,
  isCancelled: false,
  [flag]: true,
  ...extra,
});
const activity = (flag: string): Record<string, unknown> => ({ isOpen: false, isCompleted: false, isCancelled: false, [flag]: true });

function seededCatalogs(overrides: Partial<Record<string, Item[]>> = {}): Map<string, CatalogDetailRecord> {
  const items: Record<string, Item[]> = {
    [METRIC_CATALOGS.stage]: [
      { code: 'PERDIDO', metadata: { order: 4, isClosed: true, outcome: 'LOST', inFunnel: false } },
      { code: 'CONTACTADO', metadata: { order: 1, isClosed: false, outcome: null, inFunnel: true } },
      { code: 'GANADO', metadata: { order: 3, isClosed: true, outcome: 'WON', inFunnel: true } },
      { code: 'COTIZANDO', metadata: { order: 2, isClosed: false, outcome: null, inFunnel: true } },
      { code: 'VIEJA', metadata: { order: 5, isClosed: false, outcome: null, inFunnel: false }, isActive: false },
    ],
    [METRIC_CATALOGS.phase]: [
      { code: 'DISENO', metadata: { order: 1, isFinal: false } },
      { code: 'FINALIZADO', metadata: { order: 4, isFinal: true, defaultProgress: 100 } },
    ],
    [METRIC_CATALOGS.visitStatus]: [
      { code: 'PROGRAMADA', metadata: visit('isPending', { isRescheduled: false }) },
      { code: 'REPROGRAMADA', metadata: visit('isPending', { isRescheduled: true }) },
      { code: 'REALIZADA', metadata: visit('isDone') },
      { code: 'CONFIRMADA', metadata: visit('isConfirmed') },
      { code: 'CANCELADA', metadata: visit('isCancelled') },
    ],
    [METRIC_CATALOGS.activityStatus]: [
      { code: 'PENDIENTE', metadata: activity('isOpen') },
      { code: 'COMPLETADA', metadata: activity('isCompleted') },
      { code: 'CANCELADA', metadata: activity('isCancelled') },
    ],
    ...overrides,
  };
  return new Map(Object.entries(items).map(([key, entries]) => [key, catalog(key, entries ?? [])]));
}

function fakeReadModel(overrides: Partial<CommercialMetricsReadModel> = {}): jest.Mocked<CommercialMetricsReadModel> {
  return {
    opportunityTotals: jest.fn().mockResolvedValue({ total: 0, open: 0, won: 0, wonFull: 0, partial: 0, lost: 0, closedWithoutResult: 0, amountUsd: '0.0000', tonnage: '0.0000' }),
    opportunityStageCounts: jest.fn().mockResolvedValue([]),
    opportunityOwnerCounts: jest.fn().mockResolvedValue([]),
    projectCounts: jest.fn().mockResolvedValue({ total: 0, active: 0, finished: 0 }),
    forecastTotals: jest.fn().mockResolvedValue({ cells: [], lastUpdatedAt: null, lineCount: 0 }),
    forecastGroups: jest.fn().mockResolvedValue({ keys: { items: [], totalItems: 0, page: 1, pageSize: 20 }, cells: [] }),
    visitCounts: jest.fn().mockResolvedValue({ total: 0, scheduled: 0, completed: 0, confirmed: 0, cancelled: 0, rescheduledVisits: 0, rescheduleEvents: 0, overduePending: 0, upcoming: 0 }),
    activityCounts: jest.fn().mockResolvedValue({ total: 0, pending: 0, overdue: 0, completed: 0, cancelled: 0, dueSoon: 0 }),
    ...overrides,
  } as jest.Mocked<CommercialMetricsReadModel>;
}

function service(readModel = fakeReadModel(), catalogs = seededCatalogs()): CommercialMetricsService {
  const lookup = { findByKey: jest.fn((key: string) => Promise.resolve(catalogs.get(key) ?? null)) } as unknown as CatalogLookupService;
  return new CommercialMetricsService(readModel, lookup);
}

const SCOPE = { kind: 'FILTERED', userId: 'u1', dataScope: 'OWN', ownerIds: ['u1'], teamIds: [], countryIds: [] } as const;
const CTX: MetricContext = { scope: SCOPE, now: new Date('2026-10-13T18:00:00Z'), businessTimeZone: 'America/Guatemala' };

const KG = { id: 'kg', code: 'KG', symbol: 'kg' };
const VAR = { id: 'var', code: 'VAR', symbol: 'var' };

function cell(year: number, month: number, unit: typeof KG, quantity: string, tonnage: string, lineCount: number, withoutConversion = 0): ForecastCellRecord {
  return { year, month, unit, quantity, tonnage, lineCount, linesWithoutConversion: withoutConversion };
}

describe('CommercialMetricsService', () => {
  describe('semántica de catálogos (RN-05.6, 05 G.4)', () => {
    it('resuelve conjuntos de ids ordenados por metadata.order, incluidas las etapas inactivas', async () => {
      const semantics = await service().semantics();
      expect(semantics.stages.map((stage) => stage.code)).toEqual(['CONTACTADO', 'COTIZANDO', 'GANADO', 'PERDIDO', 'VIEJA']);
      expect(semantics.openStageIds).toEqual(['id-CONTACTADO', 'id-COTIZANDO', 'id-VIEJA']);
      expect(semantics.closedStageIds).toEqual(['id-GANADO', 'id-PERDIDO']);
      expect(semantics.openStageRanking).toEqual(['id-VIEJA', 'id-COTIZANDO', 'id-CONTACTADO']);
      expect(semantics.nonFinalPhaseIds).toEqual(['id-DISENO']);
      expect(semantics.finalPhaseIds).toEqual(['id-FINALIZADO']);
      expect(semantics.visitStatusSets).toEqual({
        SCHEDULED: ['id-PROGRAMADA', 'id-REPROGRAMADA'],
        COMPLETED: ['id-REALIZADA'],
        CONFIRMED: ['id-CONFIRMADA'],
        CANCELLED: ['id-CANCELADA'],
      });
      expect(semantics.activityStatusSets).toEqual({ open: ['id-PENDIENTE'], completed: ['id-COMPLETADA'], cancelled: ['id-CANCELADA'] });
    });

    it('422 INVALID_CATALOG_SEMANTICS con el catálogo y el elemento afectados (etapa sin order, visita con dos indicadores)', async () => {
      const catalogs = seededCatalogs({
        [METRIC_CATALOGS.stage]: [{ code: 'SIN_ORDEN', metadata: { isClosed: false, outcome: null, inFunnel: true } }],
        [METRIC_CATALOGS.visitStatus]: [{ code: 'DOBLE', metadata: visit('isPending', { isDone: true }) }],
      });
      await expect(service(fakeReadModel(), catalogs).semantics()).rejects.toMatchObject({
        code: 'INVALID_CATALOG_SEMANTICS',
        details: [
          { field: 'crm.etapa_oportunidad', code: 'INVALID_CATALOG_SEMANTICS', itemCode: 'SIN_ORDEN', message: expect.stringContaining('metadata.order') },
          { field: 'crm.estado_visita', code: 'INVALID_CATALOG_SEMANTICS', itemCode: 'DOBLE', message: expect.stringContaining('Exactamente uno') },
        ],
      });
    });

    it('un catálogo que falta también es INVALID_CATALOG_SEMANTICS (no se calculan cifras sin semántica)', async () => {
      const catalogs = seededCatalogs();
      catalogs.delete(METRIC_CATALOGS.activityStatus);
      await expect(service(fakeReadModel(), catalogs).semantics()).rejects.toMatchObject({
        code: 'INVALID_CATALOG_SEMANTICS',
        details: [{ field: 'crm.estado_actividad', itemCode: null, message: 'Catalog not found' }],
      });
    });
  });

  it('RN-05.30: distribución por etapa con las activas en orden (también con 0) y las inactivas solo si tienen oportunidades', async () => {
    const readModel = fakeReadModel({ opportunityStageCounts: jest.fn().mockResolvedValue([{ stageId: 'id-GANADO', count: 2 }]) });
    const metrics = service(readModel);
    const semantics = await metrics.semantics();
    const criteria = metrics.opportunityCriteria(CTX, semantics);
    expect((await metrics.stageDistribution(criteria, semantics)).map((stage) => [stage.code, stage.count, stage.order, stage.isClosed])).toEqual([
      ['CONTACTADO', 0, 1, false],
      ['COTIZANDO', 0, 2, false],
      ['GANADO', 2, 3, true],
      ['PERDIDO', 0, 4, true],
    ]);
    readModel.opportunityStageCounts.mockResolvedValue([{ stageId: 'id-VIEJA', count: 1 }]);
    expect((await metrics.stageDistribution(criteria, semantics)).map((stage) => stage.code)).toContain('VIEJA');
  });

  it('RN-05.34/35: un total por cada mes del rango, acumulados por tonelada y por unidad, sin mezclar unidades', async () => {
    const readModel = fakeReadModel({
      forecastTotals: jest.fn().mockResolvedValue({
        cells: [cell(2026, 11, KG, '1000.0000', '1.0000', 1), cell(2026, 11, VAR, '7.0000', '0.0000', 1, 1), cell(2027, 1, KG, '500.0000', '0.5000', 1)],
        lastUpdatedAt: new Date('2026-10-01T00:00:00Z'),
        lineCount: 3,
      }),
    });
    const metrics = service(readModel);
    const totals = await metrics.forecastTotals(metrics.forecastCriteria(CTX, { year: 2026, month: 11 }, { year: 2027, month: 1 }));
    expect(totals.months.map((month) => [month.month, month.tonnage, month.cumulativeTonnage, month.lineCount, month.linesWithoutConversion])).toEqual([
      [11, '1.0000', '1.0000', 2, 1],
      [12, '0.0000', '1.0000', 0, 0],
      [1, '0.5000', '1.5000', 1, 0],
    ]);
    expect(totals.months[2]?.quantities).toEqual([
      { unit: KG, quantity: '500.0000', cumulative: '1500.0000' },
      { unit: VAR, quantity: '0.0000', cumulative: '7.0000' },
    ]);
    expect(totals.totals).toEqual({
      tonnage: '1.5000',
      quantities: [
        { unit: KG, quantity: '1500.0000' },
        { unit: VAR, quantity: '7.0000' },
      ],
      lineCount: 3,
      linesWithoutConversion: 1,
    });
    expect(totals.lastUpdatedAt).toEqual(new Date('2026-10-01T00:00:00Z'));
  });

  it('RN-05.36: la consolidación arma grupos y subgrupos con cada mes del rango y totales que cuadran', async () => {
    const key = (id: string): ForecastGroupCellRecord['key'] => ({ type: 'PROJECT', id, label: `Proyecto ${id}` });
    const sub = (id: string): ForecastGroupCellRecord['subKey'] => ({ type: 'MONTH', id: null, label: id });
    const readModel = fakeReadModel({
      forecastGroups: jest.fn().mockResolvedValue({
        keys: { items: [key('p1'), key('p2')], totalItems: 2, page: 1, pageSize: 20 },
        cells: [
          { ...cell(2026, 11, KG, '1000.0000', '1.0000', 1), key: key('p1'), subKey: sub('2026-11') },
          { ...cell(2026, 12, KG, '10.0000', '0.0100', 1), key: key('p1'), subKey: sub('2026-12') },
          { ...cell(2026, 12, VAR, '3.0000', '0.0000', 1, 1), key: key('p2'), subKey: sub('2026-12') },
        ],
      }),
    });
    const metrics = service(readModel);
    const page = await metrics.forecastConsolidation(
      metrics.forecastCriteria(CTX, { year: 2026, month: 11 }, { year: 2026, month: 12 }),
      { groupBy: 'PROJECT', thenBy: 'MONTH' },
      { page: 1, pageSize: 20 },
    );
    expect(page.totalItems).toBe(2);
    const [p1, p2] = page.items;
    expect(p1?.total).toMatchObject({ tonnage: '1.0100', lineCount: 2, linesWithoutConversion: 0 });
    expect(p1?.months.map((month) => month.tonnage)).toEqual(['1.0000', '0.0100']);
    expect(p1?.subgroups?.map((group) => [group.key.label, group.total.tonnage])).toEqual([
      ['2026-11', '1.0000'],
      ['2026-12', '0.0100'],
    ]);
    expect(p2?.total).toMatchObject({ tonnage: '0.0000', quantities: [{ unit: VAR, quantity: '3.0000' }], linesWithoutConversion: 1 });
  });

  describe('indicadores de Inicio con la firma de 01 F.2', () => {
    it('KPI-02: abiertas con desglose solo de etapas abiertas, con el filtro OPEN', async () => {
      const readModel = fakeReadModel({
        opportunityTotals: jest.fn().mockResolvedValue({ total: 3, open: 3, won: 0, wonFull: 0, partial: 0, lost: 0, closedWithoutResult: 0, amountUsd: '0.0000', tonnage: '0.0000' }),
        opportunityStageCounts: jest.fn().mockResolvedValue([
          { stageId: 'id-CONTACTADO', count: 1 },
          { stageId: 'id-COTIZANDO', count: 2 },
        ]),
      });
      const result = await service(readModel).countOpenOpportunities(CTX);
      expect(result.total).toBe(3);
      expect(result.byStage.map((stage) => [stage.code, stage.count])).toEqual([
        ['CONTACTADO', 1],
        ['COTIZANDO', 2],
      ]);
      const criteria = readModel.opportunityTotals.mock.calls[0]?.[0] as OpportunityCriteria;
      expect(criteria).toMatchObject({ scope: SCOPE, statuses: ['OPEN'], period: null, ownerIds: [], countryIds: [] });
    });

    it('KPI-03/04: ganadas (WON + PARTIAL) y perdidas por `decision_date` en el período, como el reporte con DECIDED', async () => {
      const readModel = fakeReadModel({
        opportunityTotals: jest.fn().mockResolvedValue({ total: 4, open: 0, won: 3, wonFull: 2, partial: 1, lost: 1, closedWithoutResult: 0, amountUsd: '0.0000', tonnage: '0.0000' }),
      });
      const metrics = service(readModel);
      const period = metrics.resolvePeriod('MONTH', CTX);
      expect(period).toEqual({ from: '2026-10-01', to: '2026-10-31' });
      await expect(metrics.countWonOpportunities(CTX, period)).resolves.toEqual({ total: 3, won: 2, partial: 1 });
      await expect(metrics.countLostOpportunities(CTX, period)).resolves.toBe(1);
      expect(readModel.opportunityTotals.mock.calls[0]?.[0].period).toEqual({
        basis: 'DECIDED',
        window: { from: '2026-10-01', to: '2026-10-31', fromInstant: new Date('2026-10-01T06:00:00Z'), toExclusive: new Date('2026-11-01T06:00:00Z') },
      });
    });

    it('KPI-01, KPI-05 (sin líneas → null), KPI-06/07 y KPI-08/09 con sus umbrales', async () => {
      const readModel = fakeReadModel({
        projectCounts: jest.fn().mockResolvedValue({ total: 5, active: 4, finished: 1 }),
        visitCounts: jest.fn().mockResolvedValue({ total: 9, scheduled: 4, completed: 2, confirmed: 2, cancelled: 1, rescheduledVisits: 1, rescheduleEvents: 2, overduePending: 1, upcoming: 2 }),
        activityCounts: jest.fn().mockResolvedValue({ total: 7, pending: 3, overdue: 2, completed: 1, cancelled: 1, dueSoon: 1 }),
      });
      const metrics = service(readModel);
      await expect(metrics.countActiveProjects(CTX)).resolves.toBe(4);
      const window = await metrics.forecastWindow(CTX, 6);
      expect(window).toMatchObject({ window: { from: { year: 2026, month: 11 }, to: { year: 2027, month: 4 } }, totalTonnage: null, unconvertedLines: 0, quantitiesByUnit: [] });
      expect(window.months).toHaveLength(6);
      await expect(metrics.countVisits(CTX, 7)).resolves.toEqual({ pending: 4, overdue: 1, upcoming: 2 });
      expect(readModel.visitCounts).toHaveBeenCalledWith(expect.objectContaining({ period: null, categories: [] }), CTX.now, new Date('2026-10-20T18:00:00Z'));
      await expect(metrics.countActivities(CTX, 48)).resolves.toEqual({ pending: 3, dueSoon: 1, overdue: 2 });
      expect(readModel.activityCounts).toHaveBeenCalledWith(expect.objectContaining({ now: CTX.now, period: null }), new Date('2026-10-15T18:00:00Z'));
      expect(metrics.forecastWindowMonths(CTX, 2)).toEqual([
        { year: 2026, month: 11 },
        { year: 2026, month: 12 },
      ]);
    });
  });
});
