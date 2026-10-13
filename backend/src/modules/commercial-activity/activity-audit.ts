import { maskAuditValue } from '@/modules/audit/audit-diff';

import type { ActivityRecord, ParticipantRecord } from './ports/activity.repository.port';

/** `resourceType` y eventos de auditoría de actividades (04 RN-04.10, H.5). */
export const ACTIVITY_AUDIT_RESOURCE = 'crm.activity';

export const ACTIVITY_AUDIT_EVENTS = {
  created: 'crm.activity.created',
  updated: 'crm.activity.updated',
  completed: 'crm.activity.completed',
  cancelled: 'crm.activity.cancelled',
  deleted: 'crm.activity.deleted',
} as const;

/**
 * Texto libre que puede contener datos personales: la auditoría registra que
 * cambió, con el valor enmascarado (DM-29, AGENTS §9.4). Incluye el comentario de
 * la cancelación (D-04.7), ver "Precisiones de implementación (2026-10-12)".
 */
export const ACTIVITY_MASKED_FIELDS = [
  'subject',
  'description',
  'summary',
  'resultNotes',
  'nextAction',
  'completionComment',
  'cancellationComment',
] as const;

/**
 * Participante como valor de auditoría: lista de ids (H.5); el nombre externo es
 * PII y se registra enmascarado (DM-29).
 */
export function participantAuditValue(participant: Pick<ParticipantRecord, 'contactId' | 'userId' | 'externalName'>): string {
  if (participant.contactId) return `contact:${participant.contactId}`;
  if (participant.userId) return `user:${participant.userId}`;
  return `external:${String(maskAuditValue(participant.externalName ?? ''))}`;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Estado auditable; la diferencia `{ campo: { before, after } }` se calcula sobre esto. */
export function activityAuditState(record: ActivityRecord): Record<string, unknown> {
  return {
    code: record.code,
    typeId: record.type.id,
    subject: record.subject,
    description: record.description,
    customerId: record.customer.id,
    projectId: record.project?.id ?? null,
    opportunityId: record.opportunity?.id ?? null,
    ownerId: record.owner.id,
    statusId: record.status.id,
    priorityId: record.priority.id,
    scheduledAt: record.scheduledAt,
    dueAt: record.dueAt,
    durationMinutes: record.durationMinutes,
    summary: record.summary,
    resultId: record.result?.id ?? null,
    resultNotes: record.resultNotes,
    nextAction: record.nextAction,
    nextActionDate: dateOnly(record.nextActionDate),
    completedAt: record.completedAt,
    completedById: record.completedBy?.id ?? null,
    completionComment: record.completionComment,
    cancelledAt: record.cancelledAt,
    participants: record.participants.map(participantAuditValue),
  };
}
