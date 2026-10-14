import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';

import type { ActivityDueBucket } from '../activity-due-status';
import type { CatalogMetadata } from '../catalog-state';

import type { CommercialVisibility } from './commercial-visibility';

export const ACTIVITY_REPOSITORY = Symbol('ACTIVITY_REPOSITORY');

/** Orden del listado (lista blanca, 04 F.2). */
export const ACTIVITY_SORT_FIELDS = ['scheduledAt', 'dueAt', 'code', 'priority', 'customerName', 'ownerName', 'status'] as const;
export type ActivitySortField = (typeof ACTIVITY_SORT_FIELDS)[number];

/** Orden de la bandeja (04 F.2): `priority` = RN-04.32; `dueAt` = vencimiento. */
export const PENDING_SORT_FIELDS = ['priority', 'dueAt'] as const;
export type PendingSortField = (typeof PENDING_SORT_FIELDS)[number];

export type ParticipantRole = 'INVITED' | 'ATTENDED';
export type ParticipantKind = 'CONTACT' | 'USER' | 'EXTERNAL';

/** Elemento de catálogo con su `metadata`: la semántica la interpreta el dominio (RN-04.4). */
export interface CatalogValueRecord {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly isActive: boolean;
  readonly metadata: CatalogMetadata;
}

export interface UserRefRecord {
  readonly id: string;
  readonly displayName: string;
}

export interface ParticipantRecord {
  readonly id: string;
  readonly role: ParticipantRole;
  readonly kind: ParticipantKind;
  readonly contactId: string | null;
  readonly userId: string | null;
  readonly externalName: string | null;
  /** Nombre del contacto o del usuario, o el nombre externo. */
  readonly displayName: string;
}

/** Actividad completa para el detalle y las mutaciones. Nunca sale tal cual por la API. */
export interface ActivityRecord {
  readonly id: string;
  readonly code: string;
  readonly subject: string;
  readonly description: string | null;
  readonly type: CatalogValueRecord;
  readonly status: CatalogValueRecord;
  readonly priority: CatalogValueRecord;
  readonly result: CatalogValueRecord | null;
  readonly customer: { readonly id: string; readonly crmCode: string; readonly legalName: string; readonly countryId: string };
  readonly project: { readonly id: string; readonly code: string; readonly name: string; readonly isDeleted: boolean } | null;
  readonly opportunity: { readonly id: string; readonly code: string; readonly isDeleted: boolean } | null;
  readonly owner: UserRefRecord;
  readonly scheduledAt: Date | null;
  readonly dueAt: Date | null;
  readonly durationMinutes: number | null;
  readonly summary: string | null;
  readonly resultNotes: string | null;
  readonly nextAction: string | null;
  /** Fecha de calendario: medianoche UTC del día guardado. */
  readonly nextActionDate: Date | null;
  readonly completedAt: Date | null;
  readonly completedBy: UserRefRecord | null;
  readonly completionComment: string | null;
  readonly cancelledAt: Date | null;
  readonly participants: readonly ParticipantRecord[];
  /** Adjuntos activos (no eliminados). */
  readonly attachmentCount: number;
  readonly createdAt: Date;
  readonly createdBy: UserRefRecord | null;
  readonly updatedAt: Date;
  readonly updatedBy: UserRefRecord | null;
}

/** Fila de listado y de bandeja. */
export interface ActivityListRecord {
  readonly id: string;
  readonly code: string;
  readonly subject: string;
  readonly type: CatalogValueRecord;
  readonly status: CatalogValueRecord;
  readonly priority: CatalogValueRecord;
  readonly result: { readonly id: string; readonly code: string; readonly label: string } | null;
  readonly customer: { readonly id: string; readonly crmCode: string; readonly legalName: string; readonly countryId: string };
  readonly project: { readonly id: string; readonly code: string; readonly name: string } | null;
  readonly opportunity: { readonly id: string; readonly code: string } | null;
  readonly owner: UserRefRecord;
  readonly scheduledAt: Date | null;
  readonly dueAt: Date | null;
  readonly attachmentCount: number;
}

export interface PendingActivityRecord extends ActivityListRecord {
  readonly bucket: ActivityDueBucket;
}

/** Criterios del listado ya normalizados por el servicio; el adaptador solo los traduce. */
export interface ActivitySearchCriteria extends PageRequest {
  readonly sortBy: ActivitySortField;
  readonly sortOrder: 'asc' | 'desc';
  readonly typeIds: readonly string[];
  readonly statusIds: readonly string[];
  readonly priorityIds: readonly string[];
  readonly ownerIds: readonly string[];
  readonly customerId: string | null;
  readonly projectId: string | null;
  readonly opportunityId: string | null;
  /** País del cliente. */
  readonly countryId: string | null;
  readonly scheduledFrom: Date | null;
  readonly scheduledTo: Date | null;
  readonly dueFrom: Date | null;
  readonly dueTo: Date | null;
  /** Solo abiertas con `due_at` anterior a este instante (filtro "vencidas"). */
  readonly overdueAt: Date | null;
  /** Búsqueda: prefijo del código… */
  readonly searchCodePrefix: string | null;
  /** …o cada término (normalizado) contenido en el asunto o en la razón social. */
  readonly searchTerms: readonly string[];
}

export interface PendingCriteria extends PageRequest {
  readonly sortBy: PendingSortField;
  readonly sortOrder: 'asc' | 'desc';
  /** Grupos pedidos; vacío = todos (`ALL`). Los contadores los ignoran. */
  readonly buckets: readonly ActivityDueBucket[];
  readonly ownerIds: readonly string[];
  readonly typeIds: readonly string[];
  readonly priorityIds: readonly string[];
  readonly customerId: string | null;
  readonly now: Date;
  /** `now + crm.alertas.actividad_por_vencer_horas` (RN-04.31). */
  readonly dueSoonUntil: Date;
}

export interface PendingCounts {
  readonly overdue: number;
  readonly dueSoon: number;
  readonly pending: number;
  readonly total: number;
}

export interface ParticipantWrite {
  readonly contactId: string | null;
  readonly userId: string | null;
  readonly externalName: string | null;
  readonly role: ParticipantRole;
}

/** Columnas escribibles de `activities` (sin trazabilidad). */
export interface ActivityFields {
  readonly typeId: string;
  readonly subject: string;
  readonly description: string | null;
  readonly customerId: string;
  readonly projectId: string | null;
  readonly opportunityId: string | null;
  readonly ownerId: string;
  readonly statusId: string;
  readonly priorityId: string;
  readonly scheduledAt: Date | null;
  readonly dueAt: Date | null;
  readonly durationMinutes: number | null;
  readonly summary: string | null;
  readonly resultId: string | null;
  readonly resultNotes: string | null;
  readonly nextAction: string | null;
  readonly nextActionDate: Date | null;
  readonly completedAt: Date | null;
  readonly completedById: string | null;
  readonly completionComment: string | null;
  readonly cancelledAt: Date | null;
}

export interface CreateActivityInput extends ActivityFields {
  readonly code: string;
  readonly createdById: string | null;
  readonly participants: readonly ParticipantWrite[];
}

/** Cambios de una mutación: solo los campos presentes se escriben. */
export type ActivityPatch = Partial<ActivityFields> & {
  readonly deletedAt?: Date;
  readonly updatedById: string | null;
};

/**
 * Persistencia de actividades (04 F.6, L.1). Sin reglas de negocio: la visibilidad
 * llega resuelta y los valores validados. Las mutaciones son **condicionales al
 * estado leído** (RN-04.12): si otro usuario cambió el estado o eliminó la
 * actividad entretanto, devuelven `false` y no escriben.
 */
export interface ActivityRepository {
  /**
   * Actividad no eliminada por id. Con `visibility`, `null` si el actor no la ve
   * (H.3); sin ella, sin filtro (lectura interna tras una mutación).
   */
  findById(activityId: string, visibility: CommercialVisibility | null, tx?: TransactionContext): Promise<ActivityRecord | null>;
  search(criteria: ActivitySearchCriteria, visibility: CommercialVisibility): Promise<Page<ActivityListRecord>>;
  /** Bandeja: solo abiertas no eliminadas y visibles (RN-04.31/32). Contadores con los mismos filtros salvo `buckets`. */
  listPending(criteria: PendingCriteria, visibility: CommercialVisibility): Promise<{ page: Page<PendingActivityRecord>; counts: PendingCounts }>;
  /** Inserta la actividad y sus participantes; devuelve el id. */
  create(input: CreateActivityInput, tx: TransactionContext): Promise<string>;
  /** `UPDATE … WHERE id = $1 AND status_id = $expected AND deleted_at IS NULL`. `false` si no escribió. */
  update(activityId: string, expectedStatusId: string, patch: ActivityPatch, tx: TransactionContext): Promise<boolean>;
  /** Borra los participantes (antes de cambiar el cliente o reemplazar la lista). */
  deleteParticipants(activityId: string, tx: TransactionContext): Promise<void>;
  insertParticipants(
    activityId: string,
    customerId: string,
    participants: readonly ParticipantWrite[],
    createdById: string | null,
    tx: TransactionContext,
  ): Promise<void>;
}
