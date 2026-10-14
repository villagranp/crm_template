import type { CommercialMetricsService, CommercialSemantics, MetricCatalogItem } from '@/modules/commercial-metrics/commercial-metrics.service';
import type { MetricContext } from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';

import type { ReportingRepository } from '../ports/reporting.repository.port';
import type { ReportContext } from '../report-context';

/** Datos de prueba de los servicios de Reportes (excluidos del build). */

export const OWN_SCOPE = { kind: 'FILTERED', userId: 'user-1', dataScope: 'OWN', ownerIds: ['user-1'], teamIds: [], countryIds: [] } as const;

export const REPORT_CONTEXT: ReportContext = {
  userId: 'user-1',
  scope: OWN_SCOPE,
  dataScope: 'OWN',
  now: new Date('2026-10-13T18:00:00Z'),
  businessTimeZone: 'America/Guatemala',
  correlationId: 'corr-1',
};

export const METRIC_CONTEXT: MetricContext = REPORT_CONTEXT;

function item(id: string, code: string, metadata: Record<string, unknown>, sortOrder = 0): MetricCatalogItem {
  return { id, code, label: code.charAt(0) + code.slice(1).toLowerCase(), metadata, isActive: true, sortOrder };
}

const visit = (flag: string): Record<string, unknown> => ({ isPending: false, isDone: false, isConfirmed: false, isCancelled: false, [flag]: true });
const activity = (flag: string): Record<string, unknown> => ({ isOpen: false, isCompleted: false, isCancelled: false, [flag]: true });

export const SEMANTICS: CommercialSemantics = {
  stages: [
    item('stage-open', 'CONTACTADO', { order: 1, isClosed: false, outcome: null, inFunnel: true }),
    item('stage-won', 'GANADO', { order: 3, isClosed: true, outcome: 'WON', inFunnel: true }),
  ],
  phases: [item('phase-design', 'DISENO', { order: 1, isFinal: false }), item('phase-final', 'FINALIZADO', { order: 4, isFinal: true })],
  visitStatuses: [item('visit-planned', 'PROGRAMADA', visit('isPending')), item('visit-done', 'REALIZADA', visit('isDone'))],
  activityStatuses: [item('activity-open', 'PENDIENTE', activity('isOpen')), item('activity-done', 'COMPLETADA', activity('isCompleted'))],
  openStageIds: ['stage-open'],
  closedStageIds: ['stage-won'],
  openStageRanking: ['stage-open'],
  nonFinalPhaseIds: ['phase-design'],
  finalPhaseIds: ['phase-final'],
  phaseRanking: ['phase-design', 'phase-final'],
  visitStatusSets: { SCHEDULED: ['visit-planned'], COMPLETED: ['visit-done'], CONFIRMED: [], CANCELLED: [] },
  activityStatusSets: { open: ['activity-open'], completed: ['activity-done'], cancelled: [] },
};

export function fakeMetrics(overrides: Partial<Record<keyof CommercialMetricsService, jest.Mock>> = {}): jest.Mocked<CommercialMetricsService> {
  return { semantics: jest.fn().mockResolvedValue(SEMANTICS), ...overrides } as unknown as jest.Mocked<CommercialMetricsService>;
}

export function fakeReporting(overrides: Partial<Record<keyof ReportingRepository, jest.Mock>> = {}): jest.Mocked<ReportingRepository> {
  return { ...overrides } as unknown as jest.Mocked<ReportingRepository>;
}

export function page<T>(items: T[]): { items: T[]; totalItems: number; page: number; pageSize: number } {
  return { items, totalItems: items.length, page: 1, pageSize: 20 };
}
