import type { ActivityFormOptions, ActivityListItemView, ActivityView } from './activities.service';
import type { ActivityDueBucket } from './activity-due-status';
import { typeSpecificFields } from './activity-type-fields';
import { type CatalogMetadata, metadataFlag, metadataNumber } from './catalog-state';
import type { AgendaStatusGroup } from './agenda-status';
import type {
  ActivityDetailDto,
  ActivityFormOptionsDto,
  ActivityListItemDto,
  ActivityTypeRefDto,
  PendingActivityDto,
} from './dto/activity.dto';
import type { CommercialPriorityRefDto, CommercialStatusRefDto, CommercialUserRefDto } from './dto/commercial-refs.dto';
import type { ParticipantDto } from './dto/participant.dto';
import type { CatalogValueRecord, ParticipantRecord, UserRefRecord } from './ports/activity.repository.port';

/**
 * Registro → DTO de la API (04 F.2). Los modelos de base y los registros de los
 * puertos nunca salen tal cual (CLAUDE.md §8.9): fechas ISO 8601 UTC, `date` como
 * `YYYY-MM-DD` y solo los campos del contrato.
 */

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function typeRef(type: { id: string; code: string; label: string; metadata: CatalogMetadata }): ActivityTypeRefDto {
  return {
    id: type.id,
    code: type.code,
    label: type.label,
    fields: [...typeSpecificFields(type.metadata)],
    isInteraction: metadataFlag(type.metadata, 'isInteraction'),
  };
}

function statusRef(status: CatalogValueRecord, group: AgendaStatusGroup): CommercialStatusRefDto {
  return { id: status.id, code: status.code, label: status.label, group };
}

function priorityRef(priority: CatalogValueRecord): CommercialPriorityRefDto {
  return { id: priority.id, code: priority.code, label: priority.label, weight: metadataNumber(priority.metadata, 'weight') };
}

function userRef(user: UserRefRecord): CommercialUserRefDto {
  return { id: user.id, displayName: user.displayName };
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

export function toActivityDetailDto(view: ActivityView): ActivityDetailDto {
  const { record } = view;
  return {
    id: record.id,
    code: record.code,
    type: typeRef(record.type),
    subject: record.subject,
    description: record.description,
    customer: { id: record.customer.id, crmCode: record.customer.crmCode, legalName: record.customer.legalName },
    project: record.project,
    opportunity: record.opportunity,
    owner: userRef(record.owner),
    status: statusRef(record.status, view.statusGroup),
    priority: priorityRef(record.priority),
    scheduledAt: iso(record.scheduledAt),
    dueAt: iso(record.dueAt),
    dueBucket: view.dueBucket,
    durationMinutes: record.durationMinutes,
    participants: record.participants.map((participant) => participantDto(participant, view.canSeeContacts)),
    summary: record.summary,
    result: record.result ? { id: record.result.id, code: record.result.code, label: record.result.label } : null,
    resultNotes: record.resultNotes,
    nextAction: record.nextAction,
    nextActionDate: dateOnly(record.nextActionDate),
    completion: record.completedAt
      ? { completedAt: record.completedAt.toISOString(), completedBy: record.completedBy, comment: record.completionComment }
      : null,
    cancelledAt: iso(record.cancelledAt),
    attachmentCount: record.attachmentCount,
    access: view.access,
    allowedActions: [...view.allowedActions],
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy,
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy,
  };
}

export function toActivityListItemDto(view: ActivityListItemView): ActivityListItemDto {
  const { record } = view;
  return {
    id: record.id,
    code: record.code,
    type: typeRef(record.type),
    subject: record.subject,
    customer: { id: record.customer.id, crmCode: record.customer.crmCode, legalName: record.customer.legalName },
    project: record.project,
    opportunity: record.opportunity,
    owner: userRef(record.owner),
    status: statusRef(record.status, view.statusGroup),
    priority: priorityRef(record.priority),
    scheduledAt: iso(record.scheduledAt),
    dueAt: iso(record.dueAt),
    dueBucket: view.dueBucket,
    result: record.result,
    attachmentCount: record.attachmentCount,
    allowedActions: [...view.allowedActions],
  };
}

export function toPendingActivityDto(view: ActivityListItemView & { readonly dueBucket: ActivityDueBucket }): PendingActivityDto {
  const { record } = view;
  return {
    id: record.id,
    code: record.code,
    type: typeRef(record.type),
    subject: record.subject,
    dueAt: iso(record.dueAt),
    scheduledAt: iso(record.scheduledAt),
    bucket: view.dueBucket,
    priority: priorityRef(record.priority),
    owner: userRef(record.owner),
    customer: { id: record.customer.id, crmCode: record.customer.crmCode, legalName: record.customer.legalName },
    project: record.project,
    status: statusRef(record.status, view.statusGroup),
    allowedActions: [...view.allowedActions],
  };
}

export function toActivityFormOptionsDto(options: ActivityFormOptions): ActivityFormOptionsDto {
  return {
    types: options.types.map((type) => ({ ...type, fields: [...type.fields] })),
    statuses: options.statuses.map((status) => ({ ...status })),
    priorities: options.priorities.map((priority) => ({ ...priority })),
    results: options.results.map((result) => ({ ...result })),
    defaults: { ...options.defaults },
    requiredFields: [...options.requiredFields],
    dueSoonHours: options.dueSoonHours,
  };
}
