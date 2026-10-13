import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';

import type { UserRefRecord } from './activity.repository.port';
import type { AgendaKind, SourceVisibility } from './agenda-read-model.port';

export const INTERACTION_READ_MODEL = Symbol('INTERACTION_READ_MODEL');

export type InteractionSourceType = AgendaKind;

export const FOLLOW_UP_GROUPS = ['CUSTOMER', 'PROJECT'] as const;
export type FollowUpGroup = (typeof FOLLOW_UP_GROUPS)[number];

export const FOLLOW_UP_SORT_FIELDS = ['lastInteractionAt', 'nextActionDate', 'customerName'] as const;
export type FollowUpSortField = (typeof FOLLOW_UP_SORT_FIELDS)[number];

export interface InteractionCriteria extends PageRequest {
  readonly sortOrder: 'asc' | 'desc';
  readonly from: Date | null;
  readonly to: Date | null;
  readonly customerId: string | null;
  readonly projectId: string | null;
  readonly opportunityId: string | null;
  readonly userIds: readonly string[];
  /** Fuentes pedidas (nunca vacía). */
  readonly sourceTypes: readonly InteractionSourceType[];
  /** Solo actividades de estos tipos. */
  readonly typeIds: readonly string[];
  readonly resultIds: readonly string[];
}

/** Interacción (RN-04.33): visita realizada/confirmada o actividad completada de un tipo interacción. */
export interface InteractionRecord {
  readonly sourceType: InteractionSourceType;
  readonly sourceId: string;
  readonly sourceCode: string;
  readonly occurredAt: Date;
  readonly typeId: string | null;
  /** Etiqueta del tipo de actividad; `null` en visitas. */
  readonly typeLabel: string | null;
  readonly user: UserRefRecord;
  readonly customer: { readonly id: string; readonly crmCode: string; readonly legalName: string };
  readonly project: { readonly id: string; readonly code: string; readonly name: string } | null;
  readonly opportunity: { readonly id: string; readonly code: string } | null;
  readonly subject: string;
  readonly summary: string | null;
  readonly result: { readonly id: string; readonly code: string; readonly label: string } | null;
  readonly nextAction: string | null;
  readonly nextActionDate: Date | null;
}

export interface FollowUpCriteria extends PageRequest {
  readonly groupBy: FollowUpGroup;
  readonly sortBy: FollowUpSortField;
  readonly sortOrder: 'asc' | 'desc';
  readonly customerId: string | null;
  readonly projectId: string | null;
  /** Responsable de la fila (RN-04.34). */
  readonly responsibleIds: readonly string[];
  /** País del cliente. */
  readonly countryIds: readonly string[];
  readonly withoutNextAction: boolean;
  readonly lastInteractionFrom: Date | null;
  readonly lastInteractionTo: Date | null;
  /** "Hoy" en `crm.zona_horaria_negocio` (`YYYY-MM-DD`, RN-04.9). */
  readonly today: string;
}

export interface FollowUpSourceRef {
  readonly sourceType: InteractionSourceType;
  readonly sourceId: string;
  readonly sourceCode: string;
}

/** Fila de seguimiento por cliente o por proyecto (RN-04.34, misma regla que `follow-up.selectFollowUp`). */
export interface FollowUpRecord {
  readonly customer: { readonly id: string; readonly crmCode: string; readonly legalName: string };
  readonly project: { readonly id: string; readonly code: string; readonly name: string } | null;
  readonly lastInteraction:
    | (FollowUpSourceRef & { readonly occurredAt: Date; readonly typeLabel: string | null; readonly summary: string | null })
    | null;
  readonly nextAction: string | null;
  readonly nextActionDate: Date | null;
  readonly nextActionSource: FollowUpSourceRef | null;
  readonly responsible: UserRefRecord | null;
  /** Resumen de la última interacción. */
  readonly notes: string | null;
  /** Adjuntos activos de las visitas, eventos y actividades visibles del cliente/proyecto. */
  readonly attachmentCount: number;
}

export interface TraceAttachmentRecord {
  readonly id: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly createdBy: UserRefRecord | null;
  readonly ownerType: 'VISIT' | 'VISIT_EVENT' | 'ACTIVITY';
  /** Visita (también para un adjunto de evento) o actividad. */
  readonly sourceId: string;
  readonly sourceCode: string;
  /** Evento de la visita, si el adjunto es de un evento. */
  readonly eventId: string | null;
}

/**
 * Historial de interacciones y seguimiento (04 F.3, F.6) sobre la vista
 * `crm_interactions_v` y las tablas de visitas y actividades, con `$queryRaw`
 * parametrizado y el **mismo** predicado de visibilidad (H.3).
 */
export interface InteractionReadModel {
  list(criteria: InteractionCriteria, visibility: SourceVisibility): Promise<Page<InteractionRecord>>;
  followUps(criteria: FollowUpCriteria, visibility: SourceVisibility): Promise<Page<FollowUpRecord>>;
  /** Adjuntos activos de las visitas, eventos y actividades visibles del cliente o del proyecto (más recientes primero). */
  listAttachments(
    filter: { readonly customerId: string | null; readonly projectId: string | null },
    visibility: SourceVisibility,
    limit: number,
  ): Promise<TraceAttachmentRecord[]>;
}
