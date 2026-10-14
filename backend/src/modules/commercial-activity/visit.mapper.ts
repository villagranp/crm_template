import type { CommercialFormContextDto } from './dto/commercial-refs.dto';
import type { CommercialCatalogRefDto, CommercialUserRefDto } from './dto/commercial-refs.dto';
import type { ParticipantDto } from './dto/participant.dto';
import type {
  ScheduleConflictDto,
  VisitDetailDto,
  VisitEventDto,
  VisitFormOptionsDto,
  VisitListItemDto,
  VisitStatusRefDto,
} from './dto/visit.dto';
import type { ParticipantRecord, UserRefRecord } from './ports/activity.repository.port';
import type { ScheduleConflictView, VisitDerived, VisitEventView, VisitFormOptions, VisitListItemView, VisitView } from './visits.service';

/**
 * Registro → DTO de visitas (04 F.1). Los modelos de base y los registros de los
 * puertos nunca salen tal cual (CLAUDE.md §8.9): fechas ISO 8601 UTC, `date` como
 * `YYYY-MM-DD` y solo los campos del contrato.
 */

const MINUTE_MS = 60_000;

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function userRef(user: UserRefRecord): CommercialUserRefDto {
  return { id: user.id, displayName: user.displayName };
}

function catalogRef(item: { id: string; code: string; label: string } | null): CommercialCatalogRefDto | null {
  return item ? { id: item.id, code: item.code, label: item.label } : null;
}

function statusRef(status: { id: string; code: string; label: string }, derived: VisitDerived): VisitStatusRefDto {
  return { id: status.id, code: status.code, label: status.label, group: derived.group, isRescheduled: derived.isRescheduled };
}

/** Sin `contactos.ver` no se revela el nombre de un contacto participante (02 H.5). */
function participantDto(participant: ParticipantRecord, canSeeContacts: boolean): ParticipantDto {
  return {
    id: participant.id,
    role: participant.role,
    kind: participant.kind,
    contactId: participant.contactId,
    userId: participant.userId,
    displayName: participant.kind === 'CONTACT' && !canSeeContacts ? null : participant.displayName,
  };
}

export function toScheduleConflictDto(conflict: ScheduleConflictView): ScheduleConflictDto {
  return {
    visitId: conflict.visitId,
    code: conflict.code,
    scheduledStartAt: conflict.scheduledStartAt.toISOString(),
    effectiveEndAt: conflict.effectiveEndAt.toISOString(),
    customerName: conflict.customerName,
    isVisible: conflict.isVisible,
  };
}

export function toVisitDetailDto(view: VisitView): VisitDetailDto {
  const { record } = view;
  const dto: VisitDetailDto = {
    id: record.id,
    code: record.code,
    customer: { id: record.customer.id, crmCode: record.customer.crmCode, legalName: record.customer.legalName },
    project: record.project,
    owner: userRef(record.owner),
    status: statusRef(record.status, view),
    scheduledStartAt: record.scheduledStartAt.toISOString(),
    scheduledEndAt: iso(record.scheduledEndAt),
    effectiveEndAt: view.effectiveEndAt.toISOString(),
    originalScheduledAt: record.originalScheduledAt.toISOString(),
    rescheduleCount: record.rescheduleCount,
    objective: record.objective,
    location: record.location,
    reminderMinutesBefore: record.reminderMinutesBefore,
    reminderAt:
      record.reminderMinutesBefore === null ? null : new Date(record.scheduledStartAt.getTime() - record.reminderMinutesBefore * MINUTE_MS).toISOString(),
    participants: record.participants.map((participant) => participantDto(participant, view.canSeeContacts)),
    completion: record.actualStartAt
      ? {
          actualStartAt: record.actualStartAt.toISOString(),
          actualEndAt: iso(record.actualEndAt),
          topics: record.topics,
          agreements: record.agreements,
          result: catalogRef(record.result),
          resultSummary: record.resultSummary,
          comments: record.comments,
          nextAction: record.nextAction,
          nextActionDate: dateOnly(record.nextActionDate),
          recordedBy: record.completionRecordedBy,
          recordedAt: iso(record.completionRecordedAt),
        }
      : null,
    confirmation: record.confirmedAt
      ? { confirmedAt: record.confirmedAt.toISOString(), confirmedBy: record.confirmedBy, summary: record.confirmationSummary }
      : null,
    cancelledAt: iso(record.cancelledAt),
    isUnregistered: view.isUnregistered,
    attachmentCount: record.attachmentCount,
    access: view.access,
    allowedActions: [...view.allowedActions],
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy,
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy,
  };
  if (view.scheduleConflicts !== null) dto.scheduleConflicts = view.scheduleConflicts.map(toScheduleConflictDto);
  return dto;
}

export function toVisitListItemDto(view: VisitListItemView): VisitListItemDto {
  const { record } = view;
  return {
    id: record.id,
    code: record.code,
    customer: { id: record.customer.id, crmCode: record.customer.crmCode, legalName: record.customer.legalName },
    project: record.project,
    owner: userRef(record.owner),
    status: statusRef(record.status, view),
    scheduledStartAt: record.scheduledStartAt.toISOString(),
    scheduledEndAt: iso(record.scheduledEndAt),
    effectiveEndAt: view.effectiveEndAt.toISOString(),
    actualStartAt: iso(record.actualStartAt),
    rescheduleCount: record.rescheduleCount,
    objective: record.objective,
    result: record.result,
    isUnregistered: view.isUnregistered,
    hasReminder: record.reminderMinutesBefore !== null,
    attachmentCount: record.attachmentCount,
    allowedActions: [...view.allowedActions],
  };
}

export function toVisitEventDto(event: VisitEventView): VisitEventDto {
  return {
    id: event.id,
    eventType: event.eventType,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    previousScheduledStartAt: iso(event.previousScheduledStartAt),
    newScheduledStartAt: iso(event.newScheduledStartAt),
    reason: event.reason,
    reasonText: event.reasonText,
    comment: event.comment,
    performedBy: userRef(event.performedBy),
    occurredAt: event.occurredAt.toISOString(),
    attachmentCount: event.attachmentCount,
    canAttachFiles: event.canAttachFiles,
  };
}

/** Opciones propias de visitas; el contexto común (zonas y adjuntos) lo añade el controlador. */
export function toVisitFormOptionsDto(options: VisitFormOptions): Omit<VisitFormOptionsDto, keyof CommercialFormContextDto> {
  return {
    statuses: options.statuses.map((status) => ({ ...status })),
    rescheduleReasons: options.rescheduleReasons.map((reason) => ({ ...reason })),
    cancellationReasons: options.cancellationReasons.map((reason) => ({ ...reason })),
    results: options.results.map((result) => ({ ...result })),
    conflictMode: options.conflictMode,
    defaultDurationMinutes: options.defaultDurationMinutes,
    requiredFields: [...options.requiredFields],
    completionRequiredFields: [...options.completionRequiredFields],
  };
}
