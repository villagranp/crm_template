import { Inject, Injectable } from '@nestjs/common';

import { RequestValidationError, ResourceNotFoundError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import { type AgendaItemView, AgendaService, commercialDetailPath, resolveKinds, VISIT_TYPE_LABEL } from './agenda.service';
import { type CommercialActor, CommercialActorResolver } from './commercial-actor.resolver';
import { instant } from './commercial-input';
import { businessToday } from './follow-up';
import {
  type FollowUpGroup,
  type FollowUpRecord,
  type FollowUpSortField,
  INTERACTION_READ_MODEL,
  type InteractionReadModel,
  type InteractionRecord,
  type InteractionSourceType,
  type TraceAttachmentRecord,
} from './ports/interaction-read-model.port';

/** Topes de la trazabilidad de una fila de seguimiento (04 F.3). */
export const TRACE_LIMITS = { interactions: 50, upcoming: 20, attachments: 50 } as const;

const TIME_ZONE_PARAMETER = 'crm.zona_horaria_negocio';

export interface ListInteractionsRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly sortOrder: 'asc' | 'desc';
  readonly from?: string;
  readonly to?: string;
  readonly customerId?: string;
  readonly projectId?: string;
  readonly opportunityId?: string;
  readonly userId?: readonly string[];
  readonly sourceType?: readonly InteractionSourceType[];
  readonly typeId?: readonly string[];
  readonly resultId?: readonly string[];
}

export interface ListFollowUpsRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: FollowUpSortField;
  readonly sortOrder: 'asc' | 'desc';
  readonly groupBy?: FollowUpGroup;
  readonly customerId?: string;
  readonly projectId?: string;
  readonly ownerId?: readonly string[];
  readonly countryId?: readonly string[];
  readonly withoutNextAction?: boolean;
  readonly lastInteractionFrom?: string;
  readonly lastInteractionTo?: string;
}

export interface InteractionView extends InteractionRecord {
  readonly typeLabel: string;
  /** Ruta del registro de origen en el frontend (F-24, "Ver visita"/"Ver actividad"). */
  readonly sourcePath: string;
}

export interface FollowUpView extends FollowUpRecord {
  readonly lastInteraction: (NonNullable<FollowUpRecord['lastInteraction']> & { readonly typeLabel: string }) | null;
}

export interface TraceAttachmentView extends TraceAttachmentRecord {
  /** Ruta de descarga por el dueño (F.4, DC-2). */
  readonly contentPath: string;
  readonly sourcePath: string;
}

export interface FollowUpTraceView {
  readonly row: FollowUpView;
  readonly interactions: readonly InteractionView[];
  readonly upcoming: readonly AgendaItemView[];
  readonly attachments: readonly TraceAttachmentView[];
}

/**
 * Historial de interacciones (F-24, RN-04.33) y seguimiento comercial (F-23,
 * RN-04.34, D-04.9). Derivados, sin tablas propias (00 §2.12): cada fuente con su
 * permiso de ver y su alcance, aplicados en SQL antes de paginar (H.3).
 */
@Injectable()
export class InteractionsService {
  constructor(
    @Inject(INTERACTION_READ_MODEL) private readonly interactions: InteractionReadModel,
    private readonly agenda: AgendaService,
    private readonly actors: CommercialActorResolver,
    private readonly parameters: ParameterReader,
  ) {}

  async list(actor: CommercialActor, request: ListInteractionsRequest): Promise<Page<InteractionView>> {
    const from = instant(request.from);
    const to = instant(request.to);
    assertRange(from, to, 'to');
    const scopes = await this.actors.readScopes(actor);
    const page = await this.interactions.list(
      {
        page: request.page,
        pageSize: request.pageSize,
        sortOrder: request.sortOrder,
        from,
        to,
        customerId: request.customerId ?? null,
        projectId: request.projectId ?? null,
        opportunityId: request.opportunityId ?? null,
        userIds: request.userId ?? [],
        sourceTypes: resolveKinds(request.sourceType, request.typeId),
        typeIds: request.typeId ?? [],
        resultIds: request.resultId ?? [],
      },
      scopes,
    );
    return { ...page, items: page.items.map(toInteractionView) };
  }

  async followUps(actor: CommercialActor, request: ListFollowUpsRequest): Promise<Page<FollowUpView>> {
    const from = instant(request.lastInteractionFrom);
    const to = instant(request.lastInteractionTo);
    assertRange(from, to, 'lastInteractionTo');
    const [scopes, today] = await Promise.all([this.actors.readScopes(actor), this.today()]);
    const page = await this.interactions.followUps(
      {
        page: request.page,
        pageSize: request.pageSize,
        groupBy: request.groupBy ?? 'CUSTOMER',
        sortBy: request.sortBy ?? 'lastInteractionAt',
        sortOrder: request.sortOrder,
        customerId: request.customerId ?? null,
        projectId: request.projectId ?? null,
        responsibleIds: request.ownerId ?? [],
        countryIds: request.countryId ?? [],
        withoutNextAction: request.withoutNextAction === true,
        lastInteractionFrom: from,
        lastInteractionTo: to,
        today,
      },
      scopes,
    );
    return { ...page, items: page.items.map(toFollowUpView) };
  }

  /**
   * Trazabilidad de un cliente o de un proyecto (AC-04.13): exactamente uno de los dos
   * (`400` si no). Sin ninguna visita ni actividad visible → `404` (no revela si existe).
   */
  async trace(actor: CommercialActor, request: { customerId?: string; projectId?: string }): Promise<FollowUpTraceView> {
    const customerId = request.customerId ?? null;
    const projectId = request.projectId ?? null;
    if ((customerId === null) === (projectId === null)) {
      throw new RequestValidationError('Request validation failed', [{ field: 'customerId', issue: 'exactly one of customerId or projectId is required' }]);
    }
    const scope = { customerId, projectId };
    const rows = await this.followUps(actor, {
      page: 1,
      pageSize: 1,
      sortOrder: 'desc',
      groupBy: projectId ? 'PROJECT' : 'CUSTOMER',
      customerId: customerId ?? undefined,
      projectId: projectId ?? undefined,
    });
    const row = rows.items[0];
    if (!row) throw new ResourceNotFoundError(projectId ? 'Project' : 'Customer', projectId ?? customerId ?? '');

    const scopes = await this.actors.readScopes(actor);
    const [interactions, upcoming, attachments] = await Promise.all([
      this.list(actor, {
        page: 1,
        pageSize: TRACE_LIMITS.interactions,
        sortOrder: 'desc',
        customerId: customerId ?? undefined,
        projectId: projectId ?? undefined,
      }),
      this.agenda.upcoming(actor, scope, TRACE_LIMITS.upcoming),
      this.interactions.listAttachments(scope, scopes, TRACE_LIMITS.attachments),
    ]);
    return { row, interactions: interactions.items, upcoming, attachments: attachments.map(toTraceAttachmentView) };
  }

  private async today(): Promise<string> {
    return businessToday(new Date(), await this.parameters.get<string>(TIME_ZONE_PARAMETER));
  }
}

function assertRange(from: Date | null, to: Date | null, field: string): void {
  if (from && to && to.getTime() < from.getTime()) {
    throw new RequestValidationError('Request validation failed', [{ field, issue: `${field} must not be earlier than the start of the range` }]);
  }
}

function typeLabelOf(sourceType: InteractionSourceType, label: string | null): string {
  return sourceType === 'VISIT' ? VISIT_TYPE_LABEL : (label ?? '');
}

function toInteractionView(record: InteractionRecord): InteractionView {
  return { ...record, typeLabel: typeLabelOf(record.sourceType, record.typeLabel), sourcePath: commercialDetailPath(record.sourceType, record.sourceId) };
}

function toFollowUpView(record: FollowUpRecord): FollowUpView {
  return {
    ...record,
    lastInteraction: record.lastInteraction
      ? { ...record.lastInteraction, typeLabel: typeLabelOf(record.lastInteraction.sourceType, record.lastInteraction.typeLabel) }
      : null,
  };
}

function toTraceAttachmentView(record: TraceAttachmentRecord): TraceAttachmentView {
  const contentPath =
    record.ownerType === 'ACTIVITY'
      ? `/api/v1/activities/${record.sourceId}/attachments/${record.id}/content`
      : record.ownerType === 'VISIT_EVENT'
        ? `/api/v1/visits/${record.sourceId}/events/${record.eventId ?? ''}/attachments/${record.id}/content`
        : `/api/v1/visits/${record.sourceId}/attachments/${record.id}/content`;
  return { ...record, contentPath, sourcePath: commercialDetailPath(record.ownerType === 'ACTIVITY' ? 'ACTIVITY' : 'VISIT', record.sourceId) };
}
