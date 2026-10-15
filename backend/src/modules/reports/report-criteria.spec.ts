import type { CommercialSemantics } from '@/modules/commercial-metrics/commercial-metrics.service';
import type { MetricContext } from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';

import { forecastCriteria, forecastRange, opportunityCriteria, projectCriteria, resolveReportPeriod, visitCriteria } from './report-criteria';
import { reportPage } from './report-paging';

const SCOPE = { kind: 'FILTERED', userId: 'u1', dataScope: 'OWN', ownerIds: ['u1'], teamIds: [], countryIds: [] } as const;
const CTX: MetricContext = { scope: SCOPE, now: new Date('2026-10-13T18:00:00Z'), businessTimeZone: 'America/Guatemala' };
const SEMANTICS = {
  stages: [],
  phases: [],
  visitStatuses: [],
  activityStatuses: [],
  openStageIds: ['open-1'],
  closedStageIds: ['closed-1'],
  openStageRanking: ['open-1'],
  nonFinalPhaseIds: ['phase-1'],
  finalPhaseIds: ['phase-9'],
  phaseRanking: ['phase-1', 'phase-9'],
  visitStatusSets: { SCHEDULED: ['v1'], COMPLETED: ['v2'], CONFIRMED: ['v3'], CANCELLED: ['v4'] },
  activityStatusSets: { open: ['a1'], completed: ['a2'], cancelled: ['a3'] },
} satisfies CommercialSemantics;

const STAGE = '0f6c7a52-1b2c-4d3e-8f90-1234567890ab';

describe('report-criteria', () => {
  describe('período (RN-05.8, C.2)', () => {
    it('sin from/to no hay período; con ellos, la base por defecto y el intervalo en la zona del negocio', () => {
      expect(resolveReportPeriod({}, 'IDENTIFIED', CTX.businessTimeZone)).toBeNull();
      expect(resolveReportPeriod({ dateBasis: 'DECIDED' }, 'IDENTIFIED', CTX.businessTimeZone)).toBeNull();
      expect(resolveReportPeriod({ from: '2026-03-01', to: '2026-03-31' }, 'IDENTIFIED', CTX.businessTimeZone)).toEqual({
        basis: 'IDENTIFIED',
        window: { from: '2026-03-01', to: '2026-03-31', fromInstant: new Date('2026-03-01T06:00:00Z'), toExclusive: new Date('2026-04-01T06:00:00Z') },
      });
      expect(resolveReportPeriod({ from: '2026-03-01', to: '2026-03-01', dateBasis: 'UPDATED' }, 'IDENTIFIED', CTX.businessTimeZone)?.basis).toBe('UPDATED');
    });

    it('400 si llega uno solo, si from > to o si falta la base obligatoria; 422 PERIOD_TOO_LONG por encima de 5 años', () => {
      expect(() => resolveReportPeriod({ from: '2026-03-01' }, 'IDENTIFIED', 'UTC')).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED', details: [{ field: 'to', issue: 'from and to must be sent together' }] }));
      expect(() => resolveReportPeriod({ to: '2026-03-01' }, 'IDENTIFIED', 'UTC')).toThrow(expect.objectContaining({ details: [{ field: 'from', issue: 'from and to must be sent together' }] }));
      expect(() => resolveReportPeriod({ from: '2026-03-02', to: '2026-03-01' }, 'IDENTIFIED', 'UTC')).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED', details: [{ field: 'to', issue: 'to must be on or after from' }] }));
      expect(() => resolveReportPeriod({ from: '2026-03-01', to: '2026-03-31' }, null, 'UTC')).toThrow(expect.objectContaining({ details: [{ field: 'dateBasis', issue: 'dateBasis is required when a period is sent' }] }));
      expect(() => resolveReportPeriod({ from: '2021-01-01', to: '2026-01-01' }, 'IDENTIFIED', 'UTC')).toThrow(
        expect.objectContaining({ code: 'PERIOD_TOO_LONG', details: [{ field: 'to', code: 'PERIOD_TOO_LONG', message: 'The period cannot exceed 5 years', maxYears: 5 }] }),
      );
      expect(resolveReportPeriod({ from: '2021-01-01', to: '2025-12-31' }, 'IDENTIFIED', 'UTC')).not.toBeNull();
    });
  });

  it('oportunidades: semántica resuelta, ids sin repetir y estados del filtro', () => {
    expect(opportunityCriteria({ ownerId: ['u2', 'u2'], status: ['WON', 'WON', 'LOST'], productFamilyId: ['f1'] }, CTX, SEMANTICS)).toEqual({
      scope: SCOPE,
      openStageIds: ['open-1'],
      closedStageIds: ['closed-1'],
      period: null,
      ownerIds: ['u2'],
      customerIds: [],
      countryIds: [],
      stageIds: [],
      statuses: ['WON', 'LOST'],
      productIds: [],
      productFamilyIds: ['f1'],
    });
  });

  it('proyectos: estado comercial interpretado, búsqueda y ciudad normalizadas, situación por defecto ALL', () => {
    const criteria = projectCriteria({ search: '  Árbol   Grande ', city: 'San José', commercialStatus: ['WON', `OPEN_STAGE:${STAGE.toUpperCase()}`, 'OPEN_STAGE'] }, CTX, SEMANTICS);
    expect(criteria).toMatchObject({
      search: 'arbol grande',
      city: 'san jose',
      situation: 'ALL',
      commercialStatus: [
        { kind: 'WON', stageId: null },
        { kind: 'OPEN_STAGE', stageId: STAGE },
        { kind: 'OPEN_STAGE', stageId: null },
      ],
      nonFinalPhaseIds: ['phase-1'],
      phaseRanking: ['phase-1', 'phase-9'],
    });
    expect(() => projectCriteria({ commercialStatus: ['GANADO'] }, CTX, SEMANTICS)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('visitas: conjuntos de estado por categoría y base SCHEDULED por defecto', () => {
    expect(visitCriteria({ from: '2026-10-01', to: '2026-10-31', statusCategory: ['SCHEDULED', 'SCHEDULED'] }, CTX, SEMANTICS)).toMatchObject({
      statusSets: SEMANTICS.visitStatusSets,
      categories: ['SCHEDULED'],
      period: { basis: 'SCHEDULED' },
    });
  });

  describe('forecast (C.2)', () => {
    it('por defecto M+1…M+H en la zona del negocio; meses pasados admitidos', () => {
      expect(forecastRange({}, CTX, 6)).toEqual({ from: { year: 2026, month: 11 }, to: { year: 2027, month: 4 } });
      expect(forecastCriteria({ fromMonth: '2025-01', toMonth: '2025-03', ownerId: ['u1'] }, CTX, 6)).toMatchObject({
        fromMonth: { year: 2025, month: 1 },
        toMonth: { year: 2025, month: 3 },
        ownerIds: ['u1'],
      });
    });

    it('400 por mes suelto, mal formado o invertido; 422 PERIOD_TOO_LONG con más de 24 meses', () => {
      expect(() => forecastRange({ fromMonth: '2026-01' }, CTX, 6)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED', details: [{ field: 'toMonth', issue: expect.any(String) }] }));
      expect(() => forecastRange({ fromMonth: '2026-13', toMonth: '2027-01' }, CTX, 6)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
      expect(() => forecastRange({ fromMonth: '2027-02', toMonth: '2027-01' }, CTX, 6)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
      expect(forecastRange({ fromMonth: '2026-01', toMonth: '2027-12' }, CTX, 6).to).toEqual({ year: 2027, month: 12 });
      expect(() => forecastRange({ fromMonth: '2026-01', toMonth: '2028-01' }, CTX, 6)).toThrow(
        expect.objectContaining({ code: 'PERIOD_TOO_LONG', details: [{ field: 'toMonth', code: 'PERIOD_TOO_LONG', message: 'The period cannot exceed 24 months', maxMonths: 24 }] }),
      );
    });
  });

  it('orden (RN-05.14): por defecto el del reporte; con sortBy, ascendente salvo que se pida otro sentido', () => {
    const defaults = { sortBy: 'updatedAt', sortOrder: 'desc' } as const;
    expect(reportPage({ page: 2, pageSize: 10 }, defaults)).toEqual({ page: 2, pageSize: 10, sortBy: 'updatedAt', sortOrder: 'desc' });
    expect(reportPage({ page: 1, pageSize: 10, sortOrder: 'asc' }, defaults)).toMatchObject({ sortBy: 'updatedAt', sortOrder: 'asc' });
    expect(reportPage<'code' | 'updatedAt'>({ page: 1, pageSize: 10, sortBy: 'code' }, defaults)).toMatchObject({ sortBy: 'code', sortOrder: 'asc' });
    expect(reportPage<'code' | 'updatedAt'>({ page: 1, pageSize: 10, sortBy: 'code', sortOrder: 'desc' }, defaults)).toMatchObject({ sortOrder: 'desc' });
  });
});
