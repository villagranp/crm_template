import type { AgendaItemView } from './agenda.service';
import type { AgendaItemDto } from './dto/agenda.dto';
import type { FollowUpRowDto, FollowUpTraceDto, InteractionDto, TraceAttachmentDto } from './dto/interaction.dto';
import type { FollowUpTraceView, FollowUpView, InteractionView, TraceAttachmentView } from './interactions.service';

/** Vistas de los modelos de lectura → DTO (04 F.3): ISO 8601 UTC y `date` como `YYYY-MM-DD`. */

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function toAgendaItemDto(view: AgendaItemView): AgendaItemDto {
  return {
    kind: view.kind,
    id: view.id,
    code: view.code,
    date: view.date.toISOString(),
    endDate: iso(view.endDate),
    typeLabel: view.typeLabel,
    typeId: view.typeId,
    subject: view.subject,
    customer: view.customer,
    project: view.project,
    owner: view.owner,
    status: view.status,
    isRescheduled: view.isRescheduled,
    isUnregistered: view.isUnregistered,
    hasReminder: view.hasReminder,
    attachmentCount: view.attachmentCount,
    detailPath: view.detailPath,
  };
}

export function toInteractionDto(view: InteractionView): InteractionDto {
  return {
    sourceType: view.sourceType,
    sourceId: view.sourceId,
    sourceCode: view.sourceCode,
    occurredAt: view.occurredAt.toISOString(),
    typeLabel: view.typeLabel,
    typeId: view.typeId,
    user: view.user,
    customer: view.customer,
    project: view.project,
    opportunity: view.opportunity,
    subject: view.subject,
    summary: view.summary,
    result: view.result,
    nextAction: view.nextAction,
    nextActionDate: dateOnly(view.nextActionDate),
    sourcePath: view.sourcePath,
  };
}

export function toFollowUpRowDto(view: FollowUpView): FollowUpRowDto {
  return {
    customer: view.customer,
    project: view.project,
    lastInteraction: view.lastInteraction
      ? {
          sourceType: view.lastInteraction.sourceType,
          sourceId: view.lastInteraction.sourceId,
          sourceCode: view.lastInteraction.sourceCode,
          occurredAt: view.lastInteraction.occurredAt.toISOString(),
          typeLabel: view.lastInteraction.typeLabel,
          summary: view.lastInteraction.summary,
        }
      : null,
    nextAction: view.nextAction,
    nextActionDate: dateOnly(view.nextActionDate),
    nextActionSource: view.nextActionSource,
    responsible: view.responsible,
    notes: view.notes,
    attachmentCount: view.attachmentCount,
  };
}

function toTraceAttachmentDto(view: TraceAttachmentView): TraceAttachmentDto {
  return {
    id: view.id,
    fileName: view.fileName,
    contentType: view.contentType,
    sizeBytes: view.sizeBytes,
    description: view.description,
    createdAt: view.createdAt.toISOString(),
    createdBy: view.createdBy,
    ownerType: view.ownerType,
    sourceId: view.sourceId,
    sourceCode: view.sourceCode,
    eventId: view.eventId,
    contentPath: view.contentPath,
    sourcePath: view.sourcePath,
  };
}

export function toFollowUpTraceDto(view: FollowUpTraceView): FollowUpTraceDto {
  return {
    row: toFollowUpRowDto(view.row),
    interactions: view.interactions.map(toInteractionDto),
    upcoming: view.upcoming.map(toAgendaItemDto),
    attachments: view.attachments.map(toTraceAttachmentDto),
  };
}
