import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { CatalogItemRecord } from '@/modules/catalogs/ports/catalogs.repository.port';

import type { ActivityAccessScopes, CommercialActor } from '../commercial-actor.resolver';
import type { ActivityRecord, CatalogValueRecord } from '../ports/activity.repository.port';

/** Datos de prueba de las pruebas unitarias del Módulo 4 (excluidos del build). */

export const TX = { tx: true } as unknown as TransactionContext;
export const NOW_ISO = '2026-10-12T15:00:00.000Z';

export const AUDIT = { correlationId: 'corr-1', actorId: 'subject-1', actorEmail: null, ipAddress: null };

export function makeActor(permissions: readonly string[], userId: string | null = 'user-1'): CommercialActor {
  return { userId, permissions: new Set(permissions), audit: AUDIT };
}

export function ownScope(userId = 'user-1'): VisibilityScope {
  return { kind: 'FILTERED', userId, dataScope: 'OWN', ownerIds: [userId], teamIds: [], countryIds: [] };
}

export function teamScope(ownerIds: string[]): VisibilityScope {
  return { kind: 'FILTERED', userId: ownerIds[0] ?? null, dataScope: 'TEAM', ownerIds, teamIds: ['team-1'], countryIds: [] };
}

export function makeScopes(overrides: Partial<ActivityAccessScopes> = {}): ActivityAccessScopes {
  return {
    visibility: { direct: ownScope(), inherited: ownScope() },
    administer: { kind: 'FILTERED', userId: 'user-1', dataScope: 'NONE', ownerIds: [], teamIds: [], countryIds: [] },
    delete: { kind: 'FILTERED', userId: 'user-1', dataScope: 'NONE', ownerIds: [], teamIds: [], countryIds: [] },
    projects: ownScope(),
    opportunities: ownScope(),
    ...overrides,
  };
}

function catalogItem(id: string, code: string, sortOrder: number, metadata: Record<string, unknown>, isActive = true): CatalogItemRecord {
  const at = new Date(NOW_ISO);
  return { id, catalogId: 'catalog', code, label: code, metadata, sortOrder, isActive, createdAt: at, updatedAt: at };
}

const CALL_FIELDS = ['scheduledAt', 'durationMinutes', 'participants', 'summary', 'resultId', 'resultNotes', 'nextAction', 'nextActionDate'];

/** Catálogos sembrados (00 §3.2, D-04.8), por clave. */
export const CATALOG_ITEMS: Readonly<Record<string, CatalogItemRecord[]>> = {
  'crm.tipo_actividad': [
    catalogItem('type-call', 'LLAMADA', 1, { isInteraction: true, fields: CALL_FIELDS }),
    catalogItem('type-task', 'TAREA', 4, { isInteraction: false, fields: ['scheduledAt', 'resultId', 'resultNotes'] }),
  ],
  'crm.estado_actividad': [
    catalogItem('status-pending', 'PENDIENTE', 1, { isOpen: true, isCompleted: false, isCancelled: false }),
    catalogItem('status-in-progress', 'EN_PROCESO', 2, { isOpen: true, isCompleted: false, isCancelled: false }),
    catalogItem('status-completed', 'COMPLETADA', 3, { isOpen: false, isCompleted: true, isCancelled: false }),
    catalogItem('status-cancelled', 'CANCELADA', 4, { isOpen: false, isCompleted: false, isCancelled: true }),
  ],
  'crm.prioridad': [
    catalogItem('priority-high', 'ALTA', 1, { weight: 3 }),
    catalogItem('priority-medium', 'MEDIA', 2, { weight: 2 }),
  ],
  'crm.resultado_interaccion': [catalogItem('result-positive', 'POSITIVO', 1, {})],
};

function ref(item: CatalogItemRecord | undefined): CatalogValueRecord {
  if (!item) throw new Error('fixture catalog item missing');
  return { id: item.id, code: item.code, label: item.label, isActive: item.isActive, metadata: item.metadata };
}

const find = (key: string, id: string): CatalogItemRecord | undefined => CATALOG_ITEMS[key]?.find((item) => item.id === id);

export function makeActivity(overrides: Partial<ActivityRecord> & { statusId?: string; typeId?: string } = {}): ActivityRecord {
  const { statusId, typeId, ...rest } = overrides;
  const at = new Date(NOW_ISO);
  return {
    id: 'activity-1',
    code: 'ACT-2026-000001',
    subject: 'Llamada',
    description: null,
    type: ref(find('crm.tipo_actividad', typeId ?? 'type-call')),
    status: ref(find('crm.estado_actividad', statusId ?? 'status-pending')),
    priority: ref(find('crm.prioridad', 'priority-medium')),
    result: null,
    customer: { id: 'customer-1', crmCode: 'CLI-000001', legalName: 'Cliente', countryId: 'country-1' },
    project: null,
    opportunity: null,
    owner: { id: 'user-1', displayName: 'Asesora' },
    scheduledAt: null,
    dueAt: null,
    durationMinutes: null,
    summary: null,
    resultNotes: null,
    nextAction: null,
    nextActionDate: null,
    completedAt: null,
    completedBy: null,
    completionComment: null,
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
