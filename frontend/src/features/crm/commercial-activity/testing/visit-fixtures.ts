import type { VisitDetail, VisitEvent, VisitFormOptions, VisitListItem } from '../visits/visits.api';

import { CUSTOMER_REF, FORM_CONTEXT, ME, OTHER_USER, PROJECT_REF, RESULT_OK } from './fixtures';

/**
 * Datos de las pruebas de visitas (04 §E.6–E.8). Ficticios (dominios
 * `.example`), nunca de clientes reales.
 */

export const VISIT_STATUS_SCHEDULED = { id: 'vs-prog', code: 'PROGRAMADA', label: 'Programada', sortOrder: 1, group: 'PENDING' as const, isRescheduled: false };
export const VISIT_STATUS_RESCHEDULED = { id: 'vs-repro', code: 'REPROGRAMADA', label: 'Reprogramada', sortOrder: 2, group: 'PENDING' as const, isRescheduled: true };
export const VISIT_STATUS_DONE = { id: 'vs-real', code: 'REALIZADA', label: 'Realizada', sortOrder: 3, group: 'DONE' as const, isRescheduled: false };
export const VISIT_STATUS_CONFIRMED = { id: 'vs-conf', code: 'CONFIRMADA', label: 'Confirmada', sortOrder: 4, group: 'CONFIRMED' as const, isRescheduled: false };
export const VISIT_STATUS_CANCELLED = { id: 'vs-canc', code: 'CANCELADA', label: 'Cancelada', sortOrder: 5, group: 'CANCELLED' as const, isRescheduled: false };

export const RESCHEDULE_REASON = { id: 'mr-cliente', code: 'CLIENTE', label: 'Solicitud del cliente', sortOrder: 1 };
export const CANCEL_REASON = { id: 'mc-cliente', code: 'CLIENTE', label: 'El cliente canceló', sortOrder: 1 };

export const VISIT_FORM_OPTIONS: VisitFormOptions = {
  ...FORM_CONTEXT,
  statuses: [VISIT_STATUS_SCHEDULED, VISIT_STATUS_RESCHEDULED, VISIT_STATUS_DONE, VISIT_STATUS_CONFIRMED, VISIT_STATUS_CANCELLED],
  rescheduleReasons: [RESCHEDULE_REASON],
  cancellationReasons: [CANCEL_REASON],
  results: [RESULT_OK],
  conflictMode: 'AVISAR',
  defaultDurationMinutes: 60,
  requiredFields: ['customerId', 'scheduledStartAt', 'ownerId', 'objective'],
  completionRequiredFields: ['actualStartAt'],
};

function statusRef(status: typeof VISIT_STATUS_SCHEDULED | typeof VISIT_STATUS_DONE | typeof VISIT_STATUS_CANCELLED | typeof VISIT_STATUS_CONFIRMED) {
  return { id: status.id, code: status.code, label: status.label, group: status.group, isRescheduled: status.isRescheduled };
}

/** Visita pendiente propia, planificada en el futuro respecto del reloj de las pruebas (2026-10-12). */
export const PENDING_VISIT: VisitDetail = {
  id: 'v-1',
  code: 'VIS-2026-00001',
  customer: CUSTOMER_REF,
  project: { ...PROJECT_REF, isDeleted: false },
  owner: ME,
  status: statusRef(VISIT_STATUS_SCHEDULED),
  scheduledStartAt: '2026-10-20T15:00:00.000Z',
  scheduledEndAt: null,
  effectiveEndAt: '2026-10-20T16:00:00.000Z',
  originalScheduledAt: '2026-10-20T15:00:00.000Z',
  rescheduleCount: 0,
  objective: 'Presentar catálogo',
  location: 'Oficina del cliente',
  reminderMinutesBefore: 120,
  reminderAt: '2026-10-20T13:00:00.000Z',
  participants: [
    { id: 'pa-1', role: 'INVITED', kind: 'EXTERNAL', contactId: null, userId: null, displayName: 'Pedro Externo' },
    { id: 'pa-2', role: 'INVITED', kind: 'USER', contactId: null, userId: OTHER_USER.id, displayName: OTHER_USER.displayName },
  ],
  completion: null,
  confirmation: null,
  cancelledAt: null,
  isUnregistered: false,
  attachmentCount: 0,
  access: 'DIRECT',
  allowedActions: ['EDIT', 'COMPLETE', 'RESCHEDULE', 'CANCEL'],
  createdAt: '2026-10-01T15:00:00.000Z',
  createdBy: ME,
  updatedAt: '2026-10-01T15:00:00.000Z',
  updatedBy: ME,
};

/** Visita realizada propia, sin resumen ni comentarios (el resumen de confirmación es obligatorio). */
export const DONE_VISIT: VisitDetail = {
  ...PENDING_VISIT,
  status: statusRef(VISIT_STATUS_DONE),
  scheduledStartAt: '2026-10-05T15:00:00.000Z',
  originalScheduledAt: '2026-10-05T15:00:00.000Z',
  effectiveEndAt: '2026-10-05T16:00:00.000Z',
  participants: [
    ...PENDING_VISIT.participants,
    { id: 'pa-3', role: 'ATTENDED', kind: 'EXTERNAL', contactId: null, userId: null, displayName: 'Pedro Externo' },
  ],
  completion: {
    actualStartAt: '2026-10-05T15:10:00.000Z',
    actualEndAt: null,
    topics: 'Precios',
    agreements: null,
    result: { id: RESULT_OK.id, code: RESULT_OK.code, label: RESULT_OK.label },
    resultSummary: null,
    comments: null,
    nextAction: 'Enviar cotización',
    nextActionDate: '2026-10-20',
    recordedBy: ME,
    recordedAt: '2026-10-05T17:00:00.000Z',
  },
  allowedActions: ['CORRECT_COMPLETION', 'CONFIRM'],
};

export const VISIT_LIST_ITEM: VisitListItem = {
  id: PENDING_VISIT.id,
  code: PENDING_VISIT.code,
  customer: CUSTOMER_REF,
  project: PROJECT_REF,
  owner: ME,
  status: { ...statusRef(VISIT_STATUS_RESCHEDULED) },
  scheduledStartAt: PENDING_VISIT.scheduledStartAt,
  scheduledEndAt: null,
  effectiveEndAt: PENDING_VISIT.effectiveEndAt,
  actualStartAt: null,
  rescheduleCount: 2,
  objective: PENDING_VISIT.objective,
  result: null,
  isUnregistered: false,
  hasReminder: true,
  attachmentCount: 3,
  allowedActions: PENDING_VISIT.allowedActions,
};

export function visitEvent(overrides: Partial<VisitEvent> = {}): VisitEvent {
  return {
    id: 'ev-1',
    eventType: 'PLANNED',
    fromStatus: null,
    toStatus: { id: VISIT_STATUS_SCHEDULED.id, code: VISIT_STATUS_SCHEDULED.code, label: VISIT_STATUS_SCHEDULED.label },
    previousScheduledStartAt: null,
    newScheduledStartAt: null,
    reason: null,
    reasonText: null,
    comment: null,
    performedBy: ME,
    occurredAt: '2026-10-01T15:00:00.000Z',
    attachmentCount: 0,
    canAttachFiles: false,
    ...overrides,
  };
}
