import { participantAuditValue } from './activity-audit';
import type { VisitRecord } from './ports/visit.repository.port';

/** `resourceType` y eventos de auditoría de visitas (04 RN-04.10, H.5). */
export const VISIT_AUDIT_RESOURCE = 'crm.visit';

export const VISIT_AUDIT_EVENTS = {
  created: 'crm.visit.created',
  updated: 'crm.visit.updated',
  completed: 'crm.visit.completed',
  completionCorrected: 'crm.visit.completion_corrected',
  confirmed: 'crm.visit.confirmed',
  rescheduled: 'crm.visit.rescheduled',
  cancelled: 'crm.visit.cancelled',
} as const;

/**
 * Texto libre que puede contener datos personales (DM-29, AGENTS §9.4): la
 * auditoría registra que cambió, con el valor enmascarado. Incluye la ubicación
 * (puede ser un domicilio) y el motivo y comentario del evento de reprogramación o
 * cancelación (`eventReasonText`, `eventComment`).
 */
export const VISIT_MASKED_FIELDS = [
  'objective',
  'location',
  'topics',
  'agreements',
  'resultSummary',
  'comments',
  'nextAction',
  'confirmationSummary',
  'eventReasonText',
  'eventComment',
] as const;

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Estado auditable; la diferencia `{ campo: { before, after } }` se calcula sobre esto. */
export function visitAuditState(record: VisitRecord): Record<string, unknown> {
  return {
    code: record.code,
    customerId: record.customer.id,
    projectId: record.project?.id ?? null,
    ownerId: record.owner.id,
    statusId: record.status.id,
    scheduledStartAt: record.scheduledStartAt,
    scheduledEndAt: record.scheduledEndAt,
    originalScheduledAt: record.originalScheduledAt,
    rescheduleCount: record.rescheduleCount,
    objective: record.objective,
    location: record.location,
    reminderMinutesBefore: record.reminderMinutesBefore,
    actualStartAt: record.actualStartAt,
    actualEndAt: record.actualEndAt,
    topics: record.topics,
    agreements: record.agreements,
    resultId: record.result?.id ?? null,
    resultSummary: record.resultSummary,
    comments: record.comments,
    nextAction: record.nextAction,
    nextActionDate: dateOnly(record.nextActionDate),
    completionRecordedById: record.completionRecordedBy?.id ?? null,
    completionRecordedAt: record.completionRecordedAt,
    confirmedAt: record.confirmedAt,
    confirmedById: record.confirmedBy?.id ?? null,
    confirmationSummary: record.confirmationSummary,
    cancelledAt: record.cancelledAt,
    invitees: record.participants.filter((participant) => participant.role === 'INVITED').map(participantAuditValue),
    attendees: record.participants.filter((participant) => participant.role === 'ATTENDED').map(participantAuditValue),
  };
}
