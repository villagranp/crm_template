import type { ListQuery } from '@/lib/query-keys';
import { httpClient } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

import type { CatalogRef, CustomerRef, ParticipantDto, ParticipantInput, ProjectRef, StatusRef, UserRef } from '../common/commercial-activity.api';

/**
 * Cliente HTTP de visitas (04 §F.1). Los tipos reflejan
 * `backend/src/modules/commercial-activity/dto/visit.dto.ts`, nunca el modelo
 * de datos.
 */

const VISITS_PATH = '/visits';

/** Operaciones de `allowedActions` (estado + permisos + propiedad, calculadas por el backend). */
export type VisitAction = 'EDIT' | 'COMPLETE' | 'CORRECT_COMPLETION' | 'CONFIRM' | 'RESCHEDULE' | 'CANCEL';

export type VisitEventType = 'PLANNED' | 'RESCHEDULED' | 'COMPLETED' | 'CONFIRMED' | 'CANCELLED';

/** Grupos de estado filtrables de una visita (RN-04.35; una visita nunca está "vencida"). */
export type VisitStatusGroup = 'PENDING' | 'DONE' | 'CONFIRMED' | 'CANCELLED';

/** `crm.visitas.validar_conflicto_horario` (RN-04.14). */
export type ScheduleConflictMode = 'NO' | 'AVISAR' | 'BLOQUEAR';

export interface VisitStatusRef extends StatusRef {
  /** `metadata.isRescheduled` (D-04.3): la interfaz muestra "Reprogramada". */
  isRescheduled: boolean;
}

/** `ScheduleConflictDto`: una visita fuera del alcance llega sin id, código ni cliente. */
export interface ScheduleConflict {
  visitId: string | null;
  code: string | null;
  scheduledStartAt: string;
  effectiveEndAt: string;
  customerName: string | null;
  isVisible: boolean;
}

export interface ScheduleConflictsResponse {
  mode: ScheduleConflictMode;
  conflicts: ScheduleConflict[];
}

/** `VisitListItemDto`. */
export interface VisitListItem {
  id: string;
  code: string;
  customer: CustomerRef;
  project: ProjectRef | null;
  owner: UserRef;
  status: VisitStatusRef;
  scheduledStartAt: string;
  scheduledEndAt: string | null;
  effectiveEndAt: string;
  actualStartAt: string | null;
  rescheduleCount: number;
  objective: string;
  result: CatalogRef | null;
  isUnregistered: boolean;
  hasReminder: boolean;
  attachmentCount: number;
  allowedActions: VisitAction[];
}

export interface VisitCompletionInfo {
  actualStartAt: string;
  actualEndAt: string | null;
  topics: string | null;
  agreements: string | null;
  result: CatalogRef | null;
  resultSummary: string | null;
  comments: string | null;
  nextAction: string | null;
  /** `YYYY-MM-DD`. */
  nextActionDate: string | null;
  recordedBy: UserRef | null;
  recordedAt: string | null;
}

export interface VisitConfirmationInfo {
  confirmedAt: string;
  confirmedBy: UserRef | null;
  summary: string | null;
}

/** `VisitDetailDto`. */
export interface VisitDetail {
  id: string;
  code: string;
  customer: CustomerRef;
  project: (ProjectRef & { isDeleted: boolean }) | null;
  owner: UserRef;
  status: VisitStatusRef;
  scheduledStartAt: string;
  scheduledEndAt: string | null;
  /** Calculado: fin o inicio + duración por defecto. */
  effectiveEndAt: string;
  originalScheduledAt: string;
  rescheduleCount: number;
  objective: string;
  location: string | null;
  reminderMinutesBefore: number | null;
  /** Calculado: inicio − minutos. No se envía ninguna notificación (DM-27). */
  reminderAt: string | null;
  /** Invitados (`INVITED`) y asistentes (`ATTENDED`). */
  participants: ParticipantDto[];
  completion: VisitCompletionInfo | null;
  confirmation: VisitConfirmationInfo | null;
  cancelledAt: string | null;
  isUnregistered: boolean;
  /** Adjuntos de la visita (sin los de sus eventos). */
  attachmentCount: number;
  /** `INHERITED`: visible sólo por su proyecto, de solo lectura (DM-13). */
  access: 'DIRECT' | 'INHERITED';
  allowedActions: VisitAction[];
  /** Sólo tras planificar, reprogramar o cambiar responsable/fin con el modo `AVISAR`. */
  scheduleConflicts?: ScheduleConflict[];
  createdAt: string;
  createdBy: UserRef | null;
  updatedAt: string;
  updatedBy: UserRef | null;
}

/** `VisitEventDto` (historial, orden cronológico). */
export interface VisitEvent {
  id: string;
  eventType: VisitEventType;
  fromStatus: CatalogRef | null;
  toStatus: CatalogRef;
  previousScheduledStartAt: string | null;
  newScheduledStartAt: string | null;
  reason: CatalogRef | null;
  reasonText: string | null;
  comment: string | null;
  performedBy: UserRef;
  occurredAt: string;
  attachmentCount: number;
}

export interface VisitStatusOption extends CatalogRef {
  sortOrder: number;
  group: VisitStatusGroup;
  isRescheduled: boolean;
}

export interface VisitCatalogOption extends CatalogRef {
  sortOrder: number;
}

/** `VisitFormOptionsDto` (D-04.10): toda lista de valores sale de aquí. */
export interface VisitFormOptions {
  statuses: VisitStatusOption[];
  rescheduleReasons: VisitCatalogOption[];
  cancellationReasons: VisitCatalogOption[];
  results: VisitCatalogOption[];
  conflictMode: ScheduleConflictMode;
  defaultDurationMinutes: number;
  /** Base + `crm.campos_obligatorios.visit` (nombres del DTO). */
  requiredFields: string[];
  /** Base (`actualStartAt`) + `crm.campos_obligatorios.visitCompletion` (`participants` = asistentes). */
  completionRequiredFields: string[];
}

/** Cuerpo de `POST /visits`. Omitido = valor por defecto del backend. */
export interface CreateVisitInput {
  customerId: string;
  projectId?: string | null;
  ownerId?: string;
  scheduledStartAt: string;
  scheduledEndAt?: string | null;
  objective: string;
  location?: string | null;
  reminderMinutesBefore?: number | null;
  participants?: ParticipantInput[];
}

/** Cuerpo de `PATCH /visits/{id}`: omitido = sin cambio; `null` = quitar. Sin cliente ni fecha de inicio. */
export type UpdateVisitInput = Partial<Omit<CreateVisitInput, 'customerId' | 'scheduledStartAt'>>;

export interface VisitCompletionInput {
  actualStartAt: string;
  actualEndAt?: string | null;
  attendees?: ParticipantInput[];
  topics?: string | null;
  agreements?: string | null;
  resultId?: string | null;
  resultSummary?: string | null;
  comments?: string | null;
  nextAction?: string | null;
  nextActionDate?: string | null;
}

export interface VisitConfirmationInput {
  confirmationSummary?: string | null;
}

export interface VisitReschedulingInput {
  newScheduledStartAt: string;
  newScheduledEndAt?: string | null;
  reasonId?: string | null;
  reasonText?: string | null;
  comment?: string | null;
}

export interface VisitCancellationInput {
  reasonId?: string | null;
  reasonText?: string | null;
  comment?: string | null;
}

export interface ScheduleConflictsQuery {
  /** Por defecto, el usuario. Uno ajeno exige `visitas.administrar`. */
  ownerId?: string;
  start: string;
  end?: string;
  excludeVisitId?: string;
}

export const VISIT_SORT_FIELDS = ['scheduledStartAt', 'code', 'customerName', 'ownerName', 'status'] as const;

/** Filtros de `GET /visits` que viajan en la URL (las fechas como `YYYY-MM-DD`). */
export const VISIT_FILTER_KEYS = [
  'from',
  'to',
  'statusId',
  'ownerId',
  'customerId',
  'projectId',
  'countryId',
  'statusGroup',
  'unregistered',
  'pendingConfirmation',
] as const;
export type VisitFilterKey = (typeof VISIT_FILTER_KEYS)[number];

function visitPath(visitId: string): string {
  return `${VISITS_PATH}/${encodeURIComponent(visitId)}`;
}

export function listVisits(query: ListQuery): Promise<PaginatedResponse<VisitListItem>> {
  return httpClient.get<PaginatedResponse<VisitListItem>>(VISITS_PATH, { query });
}

export function getVisitFormOptions(): Promise<VisitFormOptions> {
  return httpClient.get<VisitFormOptions>(`${VISITS_PATH}/form-options`);
}

export function getScheduleConflicts(query: ScheduleConflictsQuery): Promise<ScheduleConflictsResponse> {
  return httpClient.get<ScheduleConflictsResponse>(`${VISITS_PATH}/schedule-conflicts`, { query: { ...query } });
}

export function getVisit(visitId: string): Promise<VisitDetail> {
  return httpClient.get<VisitDetail>(visitPath(visitId));
}

export function listVisitEvents(visitId: string): Promise<VisitEvent[]> {
  return httpClient.get<VisitEvent[]>(`${visitPath(visitId)}/events`);
}

export function createVisit(input: CreateVisitInput): Promise<VisitDetail> {
  return httpClient.post<VisitDetail>(VISITS_PATH, { body: input });
}

export function updateVisit(visitId: string, input: UpdateVisitInput): Promise<VisitDetail> {
  return httpClient.patch<VisitDetail>(visitPath(visitId), { body: input });
}

export function completeVisit(visitId: string, input: VisitCompletionInput): Promise<VisitDetail> {
  return httpClient.post<VisitDetail>(`${visitPath(visitId)}/completion`, { body: input });
}

/** Corrige la realización (RN-04.17): sustituye la guardada; lo omitido queda vacío. */
export function correctVisitCompletion(visitId: string, input: VisitCompletionInput): Promise<VisitDetail> {
  return httpClient.put<VisitDetail>(`${visitPath(visitId)}/completion`, { body: input });
}

export function confirmVisit(visitId: string, input: VisitConfirmationInput): Promise<VisitDetail> {
  return httpClient.post<VisitDetail>(`${visitPath(visitId)}/confirmation`, { body: input });
}

export function rescheduleVisit(visitId: string, input: VisitReschedulingInput): Promise<VisitDetail> {
  return httpClient.post<VisitDetail>(`${visitPath(visitId)}/rescheduling`, { body: input });
}

export function cancelVisit(visitId: string, input: VisitCancellationInput): Promise<VisitDetail> {
  return httpClient.post<VisitDetail>(`${visitPath(visitId)}/cancellation`, { body: input });
}
