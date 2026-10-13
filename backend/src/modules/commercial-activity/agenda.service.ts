import { Inject, Injectable } from '@nestjs/common';

import { RequestValidationError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import type { AgendaStatusGroup } from './agenda-status';
import { type CommercialActor, CommercialActorResolver } from './commercial-actor.resolver';
import { CALENDAR_MAX_DAYS, RangeTooWideError } from './commercial-activity-errors';
import { instant } from './commercial-input';
import {
  AGENDA_KINDS,
  AGENDA_READ_MODEL,
  type AgendaFilter,
  type AgendaItemRecord,
  type AgendaKind,
  type AgendaReadModel,
  type AgendaSortField,
} from './ports/agenda-read-model.port';

/** Tope de eventos del calendario (D-04.12). */
export const CALENDAR_MAX_EVENTS = 500;

export const VISIT_TYPE_LABEL = 'Visita';

const DAY_MS = 86_400_000;
const DEFAULT_DURATION_PARAMETER = 'crm.visitas.duracion_por_defecto_minutos';

export interface AgendaFilterRequest {
  readonly from?: string;
  readonly to?: string;
  readonly ownerId?: readonly string[];
  readonly countryId?: readonly string[];
  readonly kind?: readonly AgendaKind[];
  readonly activityTypeId?: readonly string[];
  readonly statusGroup?: readonly AgendaStatusGroup[];
  readonly statusId?: readonly string[];
  readonly customerId?: string;
  readonly projectId?: string;
}

export interface AgendaListRequest extends AgendaFilterRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: AgendaSortField;
  readonly sortOrder: 'asc' | 'desc';
}

export interface AgendaItemView extends AgendaItemRecord {
  /** "Visita" o la etiqueta del tipo de actividad. */
  readonly typeLabel: string;
  /** Ruta del detalle en el frontend (E.1). */
  readonly detailPath: string;
}

/** Ruta del detalle de una visita o actividad (04 E.1). */
export function commercialDetailPath(kind: AgendaKind, id: string): string {
  return kind === 'VISIT' ? `/actividad/visitas/${id}` : `/actividad/actividades/${id}`;
}

/**
 * Fuentes pedidas: las de `kind`; sin `kind`, filtrar por tipo de actividad deja solo
 * actividades (el filtro "tipo" de la agenda mezcla "Visita" y los tipos de actividad,
 * E.2); sin ninguno de los dos, ambas.
 */
export function resolveKinds(kind: readonly AgendaKind[] | undefined, activityTypeIds: readonly string[] | undefined): AgendaKind[] {
  if (kind && kind.length > 0) return [...new Set(kind)];
  if (activityTypeIds && activityTypeIds.length > 0) return ['ACTIVITY'];
  return [...AGENDA_KINDS];
}

/**
 * Agenda general (04 F-21, F.3, RN-04.35, RN-04.36, D-04.12). Cada fuente se filtra
 * por **su** permiso de ver y su alcance (sin `visitas.ver` no hay visitas, AC-04.5).
 */
@Injectable()
export class AgendaService {
  constructor(
    @Inject(AGENDA_READ_MODEL) private readonly agenda: AgendaReadModel,
    private readonly actors: CommercialActorResolver,
    private readonly parameters: ParameterReader,
  ) {}

  async list(actor: CommercialActor, request: AgendaListRequest): Promise<Page<AgendaItemView>> {
    const [scopes, filter] = await Promise.all([this.actors.readScopes(actor), this.filter(request)]);
    const page = await this.agenda.list(
      { ...filter, page: request.page, pageSize: request.pageSize, sortBy: request.sortBy ?? 'date', sortOrder: request.sortOrder },
      scopes,
    );
    return { ...page, items: page.items.map(toView) };
  }

  /** Calendario sin paginar: rango obligatorio de hasta 42 días y como mucho 500 eventos (`truncated`). */
  async calendar(actor: CommercialActor, request: AgendaFilterRequest): Promise<{ items: AgendaItemView[]; truncated: boolean }> {
    const filter = await this.filter(request);
    if (filter.from && filter.to && filter.to.getTime() - filter.from.getTime() > CALENDAR_MAX_DAYS * DAY_MS) {
      throw new RangeTooWideError(CALENDAR_MAX_DAYS);
    }
    const scopes = await this.actors.readScopes(actor);
    const result = await this.agenda.calendar(filter, scopes, CALENDAR_MAX_EVENTS);
    return { items: result.items.map(toView), truncated: result.truncated };
  }

  /** Próximas visitas pendientes y actividades abiertas de un cliente o proyecto (traza del seguimiento). */
  async upcoming(actor: CommercialActor, scope: { customerId: string | null; projectId: string | null }, limit: number): Promise<AgendaItemView[]> {
    const [scopes, filter] = await Promise.all([
      this.actors.readScopes(actor),
      this.filter({ statusGroup: ['PENDING', 'OVERDUE'], customerId: scope.customerId ?? undefined, projectId: scope.projectId ?? undefined }),
    ]);
    const result = await this.agenda.calendar({ ...filter, from: filter.now }, scopes, limit);
    return result.items.map(toView);
  }

  private async filter(request: AgendaFilterRequest): Promise<AgendaFilter> {
    const from = instant(request.from);
    const to = instant(request.to);
    if (from && to && to.getTime() < from.getTime()) {
      throw new RequestValidationError('Request validation failed', [{ field: 'to', issue: 'to must not be earlier than from' }]);
    }
    return {
      from,
      to,
      kinds: resolveKinds(request.kind, request.activityTypeId),
      ownerIds: request.ownerId ?? [],
      countryIds: request.countryId ?? [],
      activityTypeIds: request.activityTypeId ?? [],
      statusGroups: request.statusGroup ?? [],
      statusIds: request.statusId ?? [],
      customerId: request.customerId ?? null,
      projectId: request.projectId ?? null,
      now: new Date(),
      defaultDurationMinutes: await this.parameters.get<number>(DEFAULT_DURATION_PARAMETER),
    };
  }
}

function toView(record: AgendaItemRecord): AgendaItemView {
  return {
    ...record,
    typeLabel: record.kind === 'VISIT' ? VISIT_TYPE_LABEL : (record.typeLabel ?? ''),
    detailPath: commercialDetailPath(record.kind, record.id),
  };
}
