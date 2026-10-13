import type { CatalogItemRecord } from '@/modules/catalogs/ports/catalogs.repository.port';

import type { VisitAccessScopes } from '../commercial-actor.resolver';
import type { CatalogValueRecord } from '../ports/activity.repository.port';
import type { VisitRecord } from '../ports/visit.repository.port';

import { NOW_ISO, ownScope } from './activity-fixtures';

/** Datos de prueba de las pruebas unitarias de visitas (excluidos del build). */

function catalogItem(id: string, code: string, sortOrder: number, metadata: Record<string, unknown>, isActive = true): CatalogItemRecord {
  const at = new Date(NOW_ISO);
  return { id, catalogId: 'catalog', code, label: code, metadata, sortOrder, isActive, createdAt: at, updatedAt: at };
}

const flags = (flag: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  isPending: false,
  isDone: false,
  isConfirmed: false,
  isCancelled: false,
  [flag]: true,
  ...extra,
});

/** Catálogos de visitas sembrados (00 §3.2, D-04.3), por clave. */
export const VISIT_CATALOG_ITEMS: Readonly<Record<string, CatalogItemRecord[]>> = {
  'crm.estado_visita': [
    catalogItem('visit-planned', 'PROGRAMADA', 1, flags('isPending')),
    catalogItem('visit-rescheduled', 'REPROGRAMADA', 2, flags('isPending', { isRescheduled: true })),
    catalogItem('visit-done', 'REALIZADA', 3, flags('isDone')),
    catalogItem('visit-confirmed', 'CONFIRMADA', 4, flags('isConfirmed')),
    catalogItem('visit-cancelled', 'CANCELADA', 5, flags('isCancelled')),
  ],
  'crm.motivo_reprogramacion': [catalogItem('reason-client', 'SOLICITUD_CLIENTE', 1, {})],
  'crm.motivo_cancelacion': [catalogItem('cancel-client', 'CANCELA_CLIENTE', 1, {})],
  'crm.resultado_interaccion': [catalogItem('result-positive', 'POSITIVO', 1, {})],
};

function statusRef(id: string): CatalogValueRecord {
  const item = VISIT_CATALOG_ITEMS['crm.estado_visita']?.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`fixture visit status ${id} missing`);
  return { id: item.id, code: item.code, label: item.label, isActive: item.isActive, metadata: item.metadata };
}

export function makeVisitScopes(overrides: Partial<VisitAccessScopes> = {}): VisitAccessScopes {
  return {
    visibility: { direct: ownScope(), inherited: ownScope() },
    administer: { kind: 'FILTERED', userId: 'user-1', dataScope: 'NONE', ownerIds: [], teamIds: [], countryIds: [] },
    projects: ownScope(),
    ...overrides,
  };
}

export function makeVisit(overrides: Partial<VisitRecord> & { statusId?: string } = {}): VisitRecord {
  const { statusId, ...rest } = overrides;
  const at = new Date(NOW_ISO);
  const start = new Date('2026-10-20T15:00:00.000Z');
  return {
    id: 'visit-1',
    code: 'VIS-2026-00001',
    customer: { id: 'customer-1', crmCode: 'CLI-000001', legalName: 'Cliente', countryId: 'country-1' },
    project: null,
    owner: { id: 'user-1', displayName: 'Asesora' },
    status: statusRef(statusId ?? 'visit-planned'),
    scheduledStartAt: start,
    scheduledEndAt: null,
    originalScheduledAt: start,
    rescheduleCount: 0,
    objective: 'Presentar catálogo',
    location: null,
    reminderMinutesBefore: null,
    actualStartAt: null,
    actualEndAt: null,
    topics: null,
    agreements: null,
    result: null,
    resultSummary: null,
    comments: null,
    nextAction: null,
    nextActionDate: null,
    completionRecordedBy: null,
    completionRecordedAt: null,
    confirmedAt: null,
    confirmedBy: null,
    confirmationSummary: null,
    cancelledAt: null,
    participants: [],
    attachmentCount: 0,
    createdAt: at,
    createdBy: null,
    updatedAt: at,
    updatedBy: null,
    ...rest,
  };
}
