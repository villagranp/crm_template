import type { AccessService } from '@/modules/access/access.service';
import type { VisibilityScopeResolver } from '@/modules/access/visibility-scope.resolver';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import { ActivityReportService } from './activity-report.service';
import { ForecastReportService } from './forecast-report.service';
import type { ActivityReportRecord, ProjectReportRecord, VisitReportRecord } from './ports/reporting.repository.port';
import { ProjectReportService } from './project-report.service';
import { ReportContextResolver } from './report-context';
import { fakeMetrics, fakeReporting, page, REPORT_CONTEXT } from './testing/report-fixtures';
import { VisitReportService } from './visit-report.service';

/** Servicios de F-34, F-36, F-37 y F-38 y la resolución del contexto (deny-by-default). */

function parameters(values: Record<string, unknown>): jest.Mocked<ParameterReader> {
  return { get: jest.fn((key: string) => Promise.resolve(values[key])) } as unknown as jest.Mocked<ParameterReader>;
}

describe('ProjectReportService (F-34)', () => {
  it('fase con su semántica y estado comercial DEF-B desde el agregado; orden por defecto lastActivityAt desc', async () => {
    const row = (id: string, phaseId: string, commercial: ProjectReportRecord['commercial']): ProjectReportRecord => ({
      id,
      code: id,
      name: id,
      customer: { id: 'c', name: 'C' },
      country: { id: 'gt', name: 'GT' },
      city: null,
      owner: { id: 'user-1', displayName: 'A' },
      projectType: null,
      phase: { id: phaseId, label: phaseId },
      phaseProgress: '0.00',
      commercial,
      estimatedDecisionDate: null,
      lastActivityAt: new Date(),
    });
    const reporting = fakeReporting({
      projectRows: jest.fn().mockResolvedValue(
        page([
          row('p1', 'phase-design', { leadingOpenStage: { id: 's', code: 'COTIZANDO', label: 'Cotizando' }, opportunityCount: 2, hasWon: false }),
          row('p2', 'phase-final', { leadingOpenStage: null, opportunityCount: 1, hasWon: true }),
          row('p3', 'phase-design', { leadingOpenStage: null, opportunityCount: 0, hasWon: false }),
        ]),
      ),
    });
    const result = await new ProjectReportService(fakeMetrics(), reporting).list(REPORT_CONTEXT, { page: 1, pageSize: 20, situation: 'ACTIVE' });
    expect(reporting.projectRows).toHaveBeenCalledWith(expect.objectContaining({ situation: 'ACTIVE', nonFinalPhaseIds: ['phase-design'] }), {
      page: 1,
      pageSize: 20,
      sortBy: 'lastActivityAt',
      sortOrder: 'desc',
    });
    expect(result.items.map((item) => [item.phase.isFinal, item.commercialStatus.kind, item.commercialStatus.label])).toEqual([
      [false, 'OPEN_STAGE', 'Cotizando'],
      [true, 'WON', 'Ganado'],
      [false, 'NO_OPPORTUNITIES', 'Sin oportunidades'],
    ]);
  });
});

describe('ForecastReportService (F-36)', () => {
  it('rango por defecto con el horizonte del parámetro; `thenBy = groupBy` es 400; el resumen trae la unidad de tonelaje', async () => {
    const metrics = fakeMetrics({
      forecastConsolidation: jest.fn().mockResolvedValue(page([])),
      forecastTotals: jest.fn().mockResolvedValue({ range: {}, months: [], totals: {}, lastUpdatedAt: null, lineCount: 0 }),
    });
    const service = new ForecastReportService(metrics, fakeReporting(), parameters({ 'crm.forecast.horizonte_meses': 3, 'crm.forecast.unidad_tonelaje': 'TON' }));
    await expect(service.consolidated(REPORT_CONTEXT, { page: 1, pageSize: 20, groupBy: 'OWNER', thenBy: 'OWNER' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'thenBy', issue: 'thenBy must be different from groupBy' }],
    });
    await service.consolidated(REPORT_CONTEXT, { page: 2, pageSize: 5 });
    expect(metrics.forecastConsolidation).toHaveBeenCalledWith(
      expect.objectContaining({ fromMonth: { year: 2026, month: 11 }, toMonth: { year: 2027, month: 1 } }),
      { groupBy: 'MONTH', thenBy: null },
      { page: 2, pageSize: 5 },
    );
    await expect(service.summary(REPORT_CONTEXT, {})).resolves.toMatchObject({ tonnageUnit: 'TON', lineCount: 0 });
  });
});

describe('VisitReportService y ActivityReportService (F-37, F-38)', () => {
  it('categoría de visita en cada fila y "realizadas en total" del resumen', async () => {
    const row = (id: string, statusId: string): VisitReportRecord => ({
      id,
      code: id,
      customer: { id: 'c', name: 'C' },
      project: null,
      owner: { id: 'user-1', displayName: 'A' },
      scheduledStartAt: new Date(),
      originalScheduledAt: new Date(),
      rescheduleCount: 0,
      actualStartAt: null,
      status: { id: statusId, label: statusId },
      result: null,
      resultSummary: null,
      confirmedAt: null,
    });
    const metrics = fakeMetrics({
      countVisitCategories: jest.fn().mockResolvedValue({ total: 5, scheduled: 1, completed: 2, confirmed: 1, cancelled: 1, rescheduledVisits: 0, rescheduleEvents: 0, overduePending: 0, upcoming: 9 }),
    });
    const service = new VisitReportService(metrics, fakeReporting({ visitRows: jest.fn().mockResolvedValue(page([row('v1', 'visit-planned'), row('v2', 'visit-done')])) }));
    const list = await service.list(REPORT_CONTEXT, { page: 1, pageSize: 20 });
    expect(list.items.map((item) => item.status.category)).toEqual(['SCHEDULED', 'COMPLETED']);
    await expect(service.summary(REPORT_CONTEXT, {})).resolves.toEqual({
      total: 5,
      scheduled: 1,
      completed: 2,
      confirmed: 1,
      cancelled: 1,
      completedTotal: 3,
      rescheduledVisits: 0,
      rescheduleEvents: 0,
      overduePending: 0,
    });
    expect(metrics.countVisitCategories).toHaveBeenCalledWith(expect.objectContaining({ period: null }), REPORT_CONTEXT.now, null);
  });

  it('actividad vencida = abierta con vencimiento pasado (respecto de "ahora"); el umbral de "por vencer" sale del parámetro', async () => {
    const row = (id: string, statusId: string, dueAt: Date | null): ActivityReportRecord => ({
      id,
      code: id,
      type: { id: 't', label: 'Llamada' },
      subject: 's',
      customer: { id: 'c', name: 'C' },
      project: null,
      owner: { id: 'user-1', displayName: 'A' },
      activityDate: dueAt,
      dueAt,
      priority: { id: 'p', label: 'Media', weight: 2 },
      status: { id: statusId, label: statusId },
      result: null,
      resultNotes: null,
    });
    const past = new Date(REPORT_CONTEXT.now.getTime() - 1);
    const metrics = fakeMetrics({ countActivityCategories: jest.fn().mockResolvedValue({ total: 0, pending: 0, overdue: 0, completed: 0, cancelled: 0, dueSoon: 0 }) });
    const service = new ActivityReportService(
      metrics,
      fakeReporting({ activityRows: jest.fn().mockResolvedValue(page([row('a1', 'activity-open', past), row('a2', 'activity-open', null), row('a3', 'activity-done', past)])) }),
      parameters({ 'crm.alertas.actividad_por_vencer_horas': 24 }),
    );
    const list = await service.list(REPORT_CONTEXT, { page: 1, pageSize: 20 });
    expect(list.items.map((item) => [item.status.category, item.isOverdue])).toEqual([
      ['OVERDUE', true],
      ['PENDING', false],
      ['COMPLETED', false],
    ]);
    await expect(service.summary(REPORT_CONTEXT, {})).resolves.toMatchObject({ dueSoonHours: 24 });
    expect(metrics.countActivityCategories).toHaveBeenCalledWith(expect.objectContaining({ now: REPORT_CONTEXT.now }), 24);
  });
});

describe('ReportContextResolver (05 H.1)', () => {
  function build(scope: unknown, userId: string | null = 'user-1') {
    const access = { resolveActor: jest.fn().mockResolvedValue({ userId, audit: { correlationId: 'corr-9' } }) } as unknown as AccessService;
    const scopes = { resolve: jest.fn().mockResolvedValue(scope) } as unknown as jest.Mocked<VisibilityScopeResolver>;
    const clock = { now: () => new Date('2026-10-13T00:00:00Z') };
    return { resolver: new ReportContextResolver(access, scopes, parameters({ 'crm.zona_horaria_negocio': 'America/Guatemala' }), clock), scopes };
  }

  it('usa el alcance de `reportes.ver`, el reloj del negocio y la zona del parámetro', async () => {
    const { resolver, scopes } = build({ kind: 'ALL', userId: 'user-1', dataScope: 'ORGANIZATION' });
    await expect(resolver.fromRequest({} as never)).resolves.toEqual({
      userId: 'user-1',
      scope: { kind: 'ALL', userId: 'user-1', dataScope: 'ORGANIZATION' },
      dataScope: 'ORGANIZATION',
      now: new Date('2026-10-13T00:00:00Z'),
      businessTimeZone: 'America/Guatemala',
      correlationId: 'corr-9',
    });
    expect(scopes.resolve).toHaveBeenCalledWith('user-1', 'reportes.ver');
  });

  it('deny-by-default: sin alcance o sin cuenta local no se consulta nada (403)', async () => {
    const none = { kind: 'FILTERED', userId: 'user-1', dataScope: 'NONE', ownerIds: [], teamIds: [], countryIds: [] };
    await expect(build(none).resolver.fromRequest({} as never)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(build({ ...none, userId: null }, null).resolver.fromRequest({} as never)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
