import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { VisibilityScope } from '@/modules/access/visibility-scope';

import { CommercialMetricsService, type MetricContext, targetInPeriod } from './commercial-metrics.service';
import type { SemanticCatalogItem } from './metric-definitions';
import type { CommercialMetricsReadModel, SalesTargetRecord } from './ports/commercial-metrics-read-model.port';

const item = (id: string, code: string, metadata: Record<string, unknown>, label = code): SemanticCatalogItem => ({ id, code, label, metadata });

const CATALOGS: Record<string, SemanticCatalogItem[]> = {
  'crm.fase_cliente': [item('ph1', 'DISENO', { isFinal: false }), item('ph2', 'FINALIZADO', { isFinal: true })],
  'crm.etapa_oportunidad': [
    item('st2', 'COTIZANDO', { isClosed: false, order: 2 }, 'Cotizando'),
    item('st1', 'CONTACTADO', { isClosed: false, order: 1 }, 'Contactado'),
    item('st3', 'GANADO', { isClosed: true, order: 3 }),
  ],
  'crm.estado_visita': [item('v1', 'PROGRAMADA', { isPending: true }), item('v2', 'REALIZADA', { isDone: true }), item('v3', 'CONFIRMADA', { isConfirmed: true })],
  'crm.estado_actividad': [item('a1', 'PENDIENTE', { isOpen: true }), item('a2', 'COMPLETADA', { isCompleted: true })],
};

function scope(dataScope: VisibilityScope['dataScope'], overrides: Partial<{ ownerIds: string[]; countryIds: string[] }> = {}): VisibilityScope {
  if (dataScope === 'ORGANIZATION') return { kind: 'ALL', userId: 'me', dataScope };
  return { kind: 'FILTERED', userId: 'me', dataScope, ownerIds: overrides.ownerIds ?? ['me'], teamIds: [], countryIds: overrides.countryIds ?? [] };
}

function target(overrides: Partial<SalesTargetRecord>): SalesTargetRecord {
  return {
    id: 't1', metric: 'WON_OPPORTUNITIES', year: 2026, month: 10, userId: 'me', teamId: null, countryId: null, productFamilyId: null,
    targetValue: '4.0000', subjectLabel: 'Ana', ...overrides,
  };
}

describe('CommercialMetricsService (01 F.2, KPI-01…KPI-10)', () => {
  let readModel: jest.Mocked<CommercialMetricsReadModel>;
  let service: CommercialMetricsService;
  const ctx = (dataScope: VisibilityScope['dataScope'] = 'OWN', extra: Partial<{ countryIds: string[] }> = {}): MetricContext => ({
    scope: scope(dataScope, extra),
    now: new Date('2026-10-10T15:00:00Z'),
    businessTimeZone: 'America/Guatemala',
  });

  beforeEach(() => {
    readModel = {
      catalogItems: jest.fn(async (key: string) => CATALOGS[key] ?? []),
      unitByCode: jest.fn(async (code: string) => ({ id: 'u-ton', code, symbol: 't' })),
      countProjects: jest.fn().mockResolvedValue(2),
      countOpportunitiesByStage: jest.fn().mockResolvedValue([
        { stageId: 'st2', count: 2 },
        { stageId: 'st1', count: 1 },
      ]),
      countOpportunitiesByOutcome: jest.fn().mockResolvedValue([
        { outcome: 'WON', count: 1 },
        { outcome: 'PARTIAL', count: 1 },
        { outcome: 'LOST', count: 3 },
      ]),
      forecastWindow: jest.fn().mockResolvedValue({ months: [], unconvertedLines: 0, quantitiesByUnit: [] }),
      countVisits: jest.fn().mockResolvedValue({ pending: 3, overdue: 1, upcoming: 1 }),
      countActivities: jest.fn().mockResolvedValue({ pending: 3, dueSoon: 1, overdue: 1 }),
      listTargets: jest.fn().mockResolvedValue([]),
      teamsLedOrPrimary: jest.fn().mockResolvedValue(['team-1']),
      teamOwnerIds: jest.fn().mockResolvedValue(['me', 'other']),
      achieved: jest.fn().mockResolvedValue('2.0000'),
    } as unknown as jest.Mocked<CommercialMetricsReadModel>;
    service = new CommercialMetricsService(readModel, { warn: jest.fn() } as unknown as AppLogger);
  });

  it('KPI-01 pasa solo las fases no finales del catálogo', async () => {
    await expect(service.countActiveProjects(ctx())).resolves.toBe(2);
    expect(readModel.countProjects).toHaveBeenCalledWith(ctx().scope, ['ph1']);
  });

  it('KPI-02 filtra etapas abiertas y ordena el desglose por metadata.order', async () => {
    const result = await service.countOpenOpportunities(ctx());
    expect(readModel.countOpportunitiesByStage).toHaveBeenCalledWith(expect.anything(), ['st2', 'st1']);
    expect(result).toEqual({
      total: 3,
      byStage: [
        { stageId: 'st1', code: 'CONTACTADO', label: 'Contactado', order: 1, count: 1 },
        { stageId: 'st2', code: 'COTIZANDO', label: 'Cotizando', order: 2, count: 2 },
      ],
    });
  });

  it('KPI-03/04: ganadas = WON + PARTIAL; perdidas = LOST; countOutcomes las lee una sola vez', async () => {
    const period = { from: '2026-10-01', to: '2026-10-31' };
    await expect(service.countWonOpportunities(ctx(), period)).resolves.toEqual({ total: 2, won: 1, partial: 1 });
    await expect(service.countLostOpportunities(ctx(), period)).resolves.toBe(3);
    readModel.countOpportunitiesByOutcome.mockClear();
    await expect(service.countOutcomes(ctx(), period)).resolves.toEqual({ won: { total: 2, won: 1, partial: 1 }, lost: 3 });
    expect(readModel.countOpportunitiesByOutcome).toHaveBeenCalledTimes(1);
  });

  it('KPI-05: ventana de 6 meses, total null sin toneladas, meses vacíos en 0', async () => {
    const empty = await service.forecastWindow(ctx(), 6, 'TON');
    expect(empty).toMatchObject({ totalTonnage: null, window: { from: { year: 2026, month: 11 }, to: { year: 2027, month: 4 } } });
    expect(empty.months).toHaveLength(6);
    expect(empty.months.every((month) => month.tonnage === '0.0000')).toBe(true);

    readModel.forecastWindow.mockResolvedValue({
      months: [
        { year: 2026, month: 11, tonnage: '20.0000', lineCount: 1 },
        { year: 2027, month: 4, tonnage: '5.0000', lineCount: 2 },
        { year: 2026, month: 12, tonnage: null, lineCount: 1 },
      ],
      unconvertedLines: 1,
      quantitiesByUnit: [{ unit: { id: 'kg', code: 'KG', symbol: 'kg' }, quantity: '1200.0000' }],
    });
    const result = await service.forecastWindow(ctx(), 6, 'TON');
    expect(result).toMatchObject({ totalTonnage: '25.0000', unconvertedLines: 1, quantitiesByUnit: [{ unitCode: 'KG', unitSymbol: 'kg', quantity: '1200.0000' }] });
  });

  it('KPI-06/07 y KPI-08/09 pasan los estados del catálogo y los límites de tiempo', async () => {
    await expect(service.countVisits(ctx(), 7)).resolves.toEqual({ pending: 3, overdue: 1, upcoming: 1, upcomingDays: 7 });
    expect(readModel.countVisits).toHaveBeenCalledWith(expect.anything(), ['v1'], new Date('2026-10-10T15:00:00Z'), new Date('2026-10-17T15:00:00Z'));
    await expect(service.countActivities(ctx(), 48)).resolves.toEqual({ pending: 3, dueSoon: 1, overdue: 1, dueSoonHours: 48 });
    expect(readModel.countActivities).toHaveBeenCalledWith(expect.anything(), ['a1'], new Date('2026-10-10T15:00:00Z'), new Date('2026-10-12T15:00:00Z'));
  });

  it('KPI-06…09 usan la visibilidad del Módulo 4: directa + herencia por proyecto (04 H.3, DM-13)', async () => {
    const projects = scope('TEAM', { ownerIds: ['me', 'mate'] });
    await service.countVisits({ ...ctx(), inheritedProjectScope: projects }, 7);
    expect(readModel.countVisits).toHaveBeenCalledWith({ direct: ctx().scope, inherited: projects }, expect.anything(), expect.anything(), expect.anything());
    // Sin el alcance de proyectos no hay herencia (nunca se usa el alcance directo como herencia).
    await service.countActivities(ctx(), 48);
    expect(readModel.countActivities).toHaveBeenCalledWith(
      { direct: ctx().scope, inherited: expect.objectContaining({ kind: 'FILTERED', ownerIds: [], countryIds: [] }) },
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  describe('KPI-10 (D-01.8)', () => {
    const october = { from: '2026-10-01', to: '2026-10-31' };

    it('OWN: metas del usuario; cumplimiento con dos decimales; objetivo 0 → null', async () => {
      readModel.listTargets.mockResolvedValue([target({}), target({ id: 't2', metric: 'VISITS', targetValue: '0.0000' })]);
      const items = await service.targetCompliance(ctx('OWN'), october);
      expect(readModel.listTargets).toHaveBeenCalledWith({ userIds: ['me'], teamIds: [], countryIds: [], allCountries: false }, [2026]);
      expect(items[0]).toMatchObject({ targetId: 't1', achievedValue: '2.0000', compliancePercent: '50.00', subject: { type: 'USER', id: 'me' }, currencyCode: null });
      expect(readModel.unitByCode).toHaveBeenCalledWith('TON');
      await service.targetCompliance(ctx('OWN'), october, 'T');
      expect(readModel.unitByCode).toHaveBeenLastCalledWith('T');
      expect(items[1]?.compliancePercent).toBeNull();
      expect(readModel.achieved).toHaveBeenCalledWith(expect.objectContaining({ metric: 'WON_OPPORTUNITIES', subject: { kind: 'OWNERS', ownerIds: ['me'] }, period: october }));
    });

    it('TEAM: metas de los equipos que lidera o de su equipo principal; logrado con sus miembros (leídos una vez por equipo)', async () => {
      readModel.listTargets.mockResolvedValue([
        target({ userId: null, teamId: 'team-1', subjectLabel: 'Equipo' }),
        target({ id: 't2', userId: null, teamId: 'team-1', subjectLabel: 'Equipo', metric: 'VISITS' }),
      ]);
      const items = await service.targetCompliance(ctx('TEAM'), october);
      expect(readModel.listTargets).toHaveBeenCalledWith({ userIds: [], teamIds: ['team-1'], countryIds: [], allCountries: false }, [2026]);
      expect(readModel.achieved).toHaveBeenCalledWith(expect.objectContaining({ subject: { kind: 'OWNERS', ownerIds: ['me', 'other'] } }));
      expect(items[0]?.subject).toEqual({ type: 'TEAM', id: 'team-1', label: 'Equipo' });
      expect(readModel.teamOwnerIds).toHaveBeenCalledTimes(1);
    });

    it('COUNTRY: metas de su país; ORGANIZATION: suma de metas de país por métrica', async () => {
      readModel.listTargets.mockResolvedValue([target({ userId: null, countryId: 'gt' })]);
      await service.targetCompliance(ctx('COUNTRY', { countryIds: ['gt'] }), october);
      expect(readModel.listTargets).toHaveBeenLastCalledWith({ userIds: [], teamIds: [], countryIds: ['gt'], allCountries: false }, [2026]);
      expect(readModel.achieved).toHaveBeenLastCalledWith(expect.objectContaining({ subject: { kind: 'COUNTRY', countryId: 'gt' } }));

      readModel.listTargets.mockResolvedValue([
        target({ userId: null, countryId: 'gt', metric: 'AMOUNT', targetValue: '100.0000' }),
        target({ id: 't2', userId: null, countryId: 'sv', metric: 'AMOUNT', targetValue: '50.0000' }),
      ]);
      const items = await service.targetCompliance(ctx('ORGANIZATION'), october);
      expect(items).toEqual([expect.objectContaining({ targetId: null, metric: 'AMOUNT', targetValue: '150.0000', subject: { type: 'ORGANIZATION', id: null, label: 'Organización' }, currencyCode: 'USD' })]);
    });

    it('metas de otro mes y metas por familia de producto no aplican', async () => {
      readModel.listTargets.mockResolvedValue([target({ month: 9 }), target({ id: 't3', productFamilyId: 'fam' })]);
      await expect(service.targetCompliance(ctx(), october)).resolves.toEqual([]);
    });
  });

  it('targetInPeriod: anual solo en el año completo; mensual dentro del rango', () => {
    expect(targetInPeriod({ year: 2026, month: 10 }, { from: '2026-10-01', to: '2026-10-31' })).toBe(true);
    expect(targetInPeriod({ year: 2026, month: null }, { from: '2026-10-01', to: '2026-12-31' })).toBe(false);
    expect(targetInPeriod({ year: 2026, month: null }, { from: '2026-01-01', to: '2026-12-31' })).toBe(true);
  });
});

describe('fuente única de las fórmulas (PF-01.24)', () => {
  function sources(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) return sources(path);
      return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
    });
  }

  it('ningún archivo fuera de metric-definitions.ts consulta isClosed o isFinal del catálogo', () => {
    const root = join(__dirname, '..', '..');
    const offenders = sources(root)
      // El módulo de catálogos valida la semántica al administrarla (no calcula indicadores).
      .filter((path) => !path.endsWith('metric-definitions.ts') && !path.includes(join('modules', 'catalogs')))
      .filter((path) => /['"]is(Closed|Final)['"]/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path));
    expect(offenders).toEqual([]);
  });
});
