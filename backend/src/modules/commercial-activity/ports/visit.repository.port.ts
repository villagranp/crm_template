import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';

import type { VisitStatusGroup } from '../visit-lifecycle';

import type { CatalogValueRecord, ParticipantRecord, ParticipantRole, ParticipantWrite, UserRefRecord } from './activity.repository.port';
import type { CommercialVisibility } from './commercial-visibility';

export const VISIT_REPOSITORY = Symbol('VISIT_REPOSITORY');

/** Orden del listado (lista blanca, 04 F.1). */
export const VISIT_SORT_FIELDS = ['scheduledStartAt', 'code', 'customerName', 'ownerName', 'status'] as const;
export type VisitSortField = (typeof VISIT_SORT_FIELDS)[number];

export type VisitEventType = 'PLANNED' | 'RESCHEDULED' | 'COMPLETED' | 'CONFIRMED' | 'CANCELLED';

export interface VisitCustomerRef {
  readonly id: string;
  readonly crmCode: string;
  readonly legalName: string;
  readonly countryId: string;
}

/** Visita completa para el detalle y las mutaciones. Nunca sale tal cual por la API. */
export interface VisitRecord {
  readonly id: string;
  readonly code: string;
  readonly customer: VisitCustomerRef;
  readonly project: { readonly id: string; readonly code: string; readonly name: string; readonly isDeleted: boolean } | null;
  readonly owner: UserRefRecord;
  readonly status: CatalogValueRecord;
  readonly scheduledStartAt: Date;
  readonly scheduledEndAt: Date | null;
  readonly originalScheduledAt: Date;
  readonly rescheduleCount: number;
  readonly objective: string;
  readonly location: string | null;
  readonly reminderMinutesBefore: number | null;
  readonly actualStartAt: Date | null;
  readonly actualEndAt: Date | null;
  readonly topics: string | null;
  readonly agreements: string | null;
  readonly result: CatalogValueRecord | null;
  readonly resultSummary: string | null;
  readonly comments: string | null;
  readonly nextAction: string | null;
  /** Fecha de calendario: medianoche UTC del día guardado. */
  readonly nextActionDate: Date | null;
  readonly completionRecordedBy: UserRefRecord | null;
  readonly completionRecordedAt: Date | null;
  readonly confirmedAt: Date | null;
  readonly confirmedBy: UserRefRecord | null;
  readonly confirmationSummary: string | null;
  readonly cancelledAt: Date | null;
  /** Invitados (`INVITED`) y asistentes (`ATTENDED`). */
  readonly participants: readonly ParticipantRecord[];
  /** Adjuntos activos de la visita (sin los de sus eventos). */
  readonly attachmentCount: number;
  readonly createdAt: Date;
  readonly createdBy: UserRefRecord | null;
  readonly updatedAt: Date;
  readonly updatedBy: UserRefRecord | null;
}

/** Fila del listado. */
export interface VisitListRecord {
  readonly id: string;
  readonly code: string;
  readonly customer: VisitCustomerRef;
  readonly project: { readonly id: string; readonly code: string; readonly name: string } | null;
  readonly owner: UserRefRecord;
  readonly status: CatalogValueRecord;
  readonly scheduledStartAt: Date;
  readonly scheduledEndAt: Date | null;
  readonly actualStartAt: Date | null;
  readonly rescheduleCount: number;
  readonly objective: string;
  readonly reminderMinutesBefore: number | null;
  readonly result: { readonly id: string; readonly code: string; readonly label: string } | null;
  readonly attachmentCount: number;
}

export interface VisitEventRecord {
  readonly id: string;
  readonly eventType: VisitEventType;
  readonly fromStatus: { readonly id: string; readonly code: string; readonly label: string } | null;
  readonly toStatus: { readonly id: string; readonly code: string; readonly label: string };
  readonly previousScheduledStartAt: Date | null;
  readonly newScheduledStartAt: Date | null;
  readonly reason: { readonly id: string; readonly code: string; readonly label: string } | null;
  readonly reasonText: string | null;
  readonly comment: string | null;
  readonly performedBy: UserRefRecord;
  readonly occurredAt: Date;
  readonly attachmentCount: number;
}

/** Lo necesario para autorizar un adjunto de evento (D-04.18). */
export interface VisitEventRef {
  readonly id: string;
  readonly visitId: string;
  readonly eventType: VisitEventType;
  readonly performedById: string;
  readonly occurredAt: Date;
}

/** Criterios del listado ya normalizados por el servicio. */
export interface VisitSearchCriteria extends PageRequest {
  readonly sortBy: VisitSortField;
  readonly sortOrder: 'asc' | 'desc';
  /** Sobre la fecha de agenda (RN-04.36): real si está realizada o confirmada, si no la planificada vigente. */
  readonly from: Date | null;
  readonly to: Date | null;
  readonly statusIds: readonly string[];
  readonly statusGroups: readonly VisitStatusGroup[];
  readonly ownerIds: readonly string[];
  readonly customerId: string | null;
  readonly projectId: string | null;
  /** País del cliente. */
  readonly countryId: string | null;
  /** "Sin registrar" (RN-04.22): pendientes con inicio planificado anterior a este instante. */
  readonly unregisteredAt: Date | null;
  /** Solo realizadas sin confirmar (`isDone`). */
  readonly pendingConfirmation: boolean;
  readonly searchCodePrefix: string | null;
  /** Cada término (normalizado) contenido en el objetivo o en la razón social. */
  readonly searchTerms: readonly string[];
}

/** Visita candidata a conflicto horario (RN-04.14), con la marca de si el actor la ve. */
export interface ScheduleCandidateRecord {
  readonly id: string;
  readonly code: string;
  readonly ownerId: string;
  readonly scheduledStartAt: Date;
  readonly scheduledEndAt: Date | null;
  readonly isCancelled: boolean;
  readonly customerName: string;
  /** Dentro de la visibilidad del actor (si no, la respuesta no revela sus datos, F.1). */
  readonly isVisible: boolean;
}

export interface ScheduleCandidateQuery {
  readonly ownerId: string;
  readonly start: Date;
  readonly end: Date;
  readonly excludeVisitId: string | null;
  /** `crm.visitas.duracion_por_defecto_minutos`: fin efectivo de las visitas sin fin. */
  readonly defaultDurationMinutes: number;
}

/** Columnas escribibles de `visits` (sin trazabilidad ni folio). */
export interface VisitFields {
  readonly customerId: string;
  readonly projectId: string | null;
  readonly ownerId: string;
  readonly statusId: string;
  readonly scheduledStartAt: Date;
  readonly scheduledEndAt: Date | null;
  readonly objective: string;
  readonly location: string | null;
  readonly reminderMinutesBefore: number | null;
  readonly originalScheduledAt: Date;
  readonly rescheduleCount: number;
  readonly actualStartAt: Date | null;
  readonly actualEndAt: Date | null;
  readonly topics: string | null;
  readonly agreements: string | null;
  readonly resultId: string | null;
  readonly resultSummary: string | null;
  readonly comments: string | null;
  readonly nextAction: string | null;
  readonly nextActionDate: Date | null;
  readonly completionRecordedById: string | null;
  readonly completionRecordedAt: Date | null;
  readonly confirmedAt: Date | null;
  readonly confirmedById: string | null;
  readonly confirmationSummary: string | null;
  readonly cancelledAt: Date | null;
}

export interface VisitEventWrite {
  readonly eventType: VisitEventType;
  readonly fromStatusId: string | null;
  readonly toStatusId: string;
  readonly previousScheduledStartAt: Date | null;
  readonly newScheduledStartAt: Date | null;
  readonly reasonId: string | null;
  readonly reasonText: string | null;
  readonly comment: string | null;
  readonly performedById: string;
  readonly occurredAt: Date;
}

export interface CreateVisitInput {
  readonly code: string;
  readonly fields: Pick<
    VisitFields,
    | 'customerId'
    | 'projectId'
    | 'ownerId'
    | 'statusId'
    | 'scheduledStartAt'
    | 'scheduledEndAt'
    | 'objective'
    | 'location'
    | 'reminderMinutesBefore'
  >;
  readonly createdById: string;
  readonly participants: readonly ParticipantWrite[];
  /** Evento `PLANNED` (RN-04.13). */
  readonly plannedEvent: VisitEventWrite;
}

/** Cambios de una mutación: solo los campos presentes se escriben. */
export type VisitPatch = Partial<VisitFields> & { readonly updatedById: string | null };

/**
 * Condición de una escritura (RN-04.12): el estado y el número de reprogramaciones
 * leídos (una reprogramación cambia la fecha vigente sin cambiar siempre el estado).
 * `requiresSummary`: confirmar sin resumen nuevo exige que la realización siga teniendo
 * `result_summary` o `comments` (`ck_visits_confirm_requires`).
 */
export interface VisitWriteCondition {
  readonly statusId: string;
  readonly rescheduleCount: number;
  readonly requiresSummary?: boolean;
}

/**
 * Persistencia de visitas y su historial de eventos (04 F.6, L.1). Sin reglas de
 * negocio: la visibilidad llega resuelta y los valores validados. Las mutaciones son
 * **condicionales** (RN-04.12): si otro usuario cambió la visita entretanto,
 * `update` devuelve `false` y no escribe. No hay borrado (RN-04.20).
 */
export interface VisitRepository {
  /** Con `visibility`, `null` si el actor no la ve (H.3); sin ella, sin filtro. */
  findById(visitId: string, visibility: CommercialVisibility | null, tx?: TransactionContext): Promise<VisitRecord | null>;
  search(criteria: VisitSearchCriteria, visibility: CommercialVisibility): Promise<Page<VisitListRecord>>;
  /** Historial completo de la visita en orden cronológico (RN-04.19, AC-04.20). */
  listEvents(visitId: string): Promise<VisitEventRecord[]>;
  /** Evento **de esa visita** (IDOR: un evento de otra visita no existe). */
  findEvent(visitId: string, eventId: string): Promise<VisitEventRef | null>;
  /**
   * Serializa la agenda de los responsables hasta el fin de la transacción (bloqueo
   * consultivo por usuario, en orden): dos planificaciones simultáneas del mismo
   * responsable no pueden evitar el conflicto horario entre sí (RN-04.14, `BLOQUEAR`).
   */
  lockOwnerSchedules(ownerIds: readonly string[], tx: TransactionContext): Promise<void>;
  /** Visitas no canceladas del responsable cuyo intervalo efectivo se cruza con `[start, end)`. */
  findScheduleCandidates(query: ScheduleCandidateQuery, visibility: CommercialVisibility, tx?: TransactionContext): Promise<ScheduleCandidateRecord[]>;
  /** Inserta la visita, su evento `PLANNED` y sus invitados; devuelve el id. */
  create(input: CreateVisitInput, tx: TransactionContext): Promise<string>;
  /** `UPDATE … WHERE id AND status_id AND reschedule_count [AND resumen]`. `false` si no escribió. */
  update(visitId: string, condition: VisitWriteCondition, patch: VisitPatch, tx: TransactionContext): Promise<boolean>;
  insertEvent(visitId: string, event: VisitEventWrite, tx: TransactionContext): Promise<string>;
  /** Reemplaza los participantes de un rol (invitados al editar, asistentes al realizar). */
  replaceParticipants(
    visitId: string,
    customerId: string,
    role: ParticipantRole,
    participants: readonly ParticipantWrite[],
    createdById: string | null,
    tx: TransactionContext,
  ): Promise<void>;
}
