import type { ListQuery } from '@/lib/query-keys';
import { httpClient } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

import type {
  CatalogRef,
  CustomerRef,
  DueBucket,
  OpportunityRef,
  ParticipantDto,
  ParticipantInput,
  PriorityRef,
  ProjectRef,
  StatusRef,
  UserRef,
} from '../common/commercial-activity.api';

/**
 * Cliente HTTP de actividades (04 §F.2). Los tipos reflejan
 * `backend/src/modules/commercial-activity/dto/activity.dto.ts`.
 */

const ACTIVITIES_PATH = '/activities';

/** Campos específicos que puede admitir un tipo (`metadata.fields`, RN-04.24, D-04.8). */
export const ACTIVITY_SPECIFIC_FIELDS = [
  'scheduledAt',
  'durationMinutes',
  'participants',
  'summary',
  'resultId',
  'resultNotes',
  'nextAction',
  'nextActionDate',
] as const;
export type ActivitySpecificField = (typeof ACTIVITY_SPECIFIC_FIELDS)[number];

export type ActivityAction = 'EDIT' | 'COMPLETE' | 'CANCEL' | 'DELETE';

export interface ActivityTypeRef extends CatalogRef {
  fields: string[];
  isInteraction: boolean;
}

/** `ActivityListItemDto`. */
export interface ActivityListItem {
  id: string;
  code: string;
  type: ActivityTypeRef;
  subject: string;
  customer: CustomerRef;
  project: ProjectRef | null;
  opportunity: OpportunityRef | null;
  owner: UserRef;
  status: StatusRef;
  priority: PriorityRef;
  scheduledAt: string | null;
  dueAt: string | null;
  dueBucket: DueBucket | null;
  result: CatalogRef | null;
  attachmentCount: number;
  allowedActions: ActivityAction[];
}

/** `PendingActivityDto` (bandeja, F-22). */
export interface PendingActivity {
  id: string;
  code: string;
  type: ActivityTypeRef;
  subject: string;
  dueAt: string | null;
  scheduledAt: string | null;
  bucket: DueBucket;
  priority: PriorityRef;
  owner: UserRef;
  customer: CustomerRef;
  project: ProjectRef | null;
  status: StatusRef;
  allowedActions: ActivityAction[];
}

export interface PendingCounts {
  overdue: number;
  dueSoon: number;
  pending: number;
  total: number;
}

export interface PendingActivitiesResponse extends PaginatedResponse<PendingActivity> {
  /** Ignoran `bucket`; respetan los demás filtros y el alcance. */
  counts: PendingCounts;
}

/** `ActivityDetailDto`. */
export interface ActivityDetail {
  id: string;
  code: string;
  type: ActivityTypeRef;
  subject: string;
  description: string | null;
  customer: CustomerRef;
  project: (ProjectRef & { isDeleted: boolean }) | null;
  opportunity: (OpportunityRef & { isDeleted: boolean }) | null;
  owner: UserRef;
  status: StatusRef;
  priority: PriorityRef;
  scheduledAt: string | null;
  dueAt: string | null;
  dueBucket: DueBucket | null;
  durationMinutes: number | null;
  participants: ParticipantDto[];
  summary: string | null;
  result: CatalogRef | null;
  resultNotes: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  completion: { completedAt: string; completedBy: UserRef | null; comment: string | null } | null;
  cancelledAt: string | null;
  attachmentCount: number;
  /** `INHERITED`: visible sólo por su proyecto, de solo lectura (DM-13). */
  access: 'DIRECT' | 'INHERITED';
  allowedActions: ActivityAction[];
  createdAt: string;
  createdBy: UserRef | null;
  updatedAt: string;
  updatedBy: UserRef | null;
}

export interface ActivityTypeOption extends ActivityTypeRef {
  sortOrder: number;
}

export interface ActivityStatusOption extends CatalogRef {
  sortOrder: number;
  /** El formulario sólo ofrece `OPEN`. */
  group: 'OPEN' | 'COMPLETED' | 'CANCELLED';
}

export interface ActivityPriorityOption extends CatalogRef {
  sortOrder: number;
  weight: number;
}

export interface CatalogOption extends CatalogRef {
  sortOrder: number;
}

/** `ActivityFormOptionsDto` (D-04.10): toda lista de valores del formulario y de los filtros sale de aquí. */
export interface ActivityFormOptions {
  types: ActivityTypeOption[];
  statuses: ActivityStatusOption[];
  priorities: ActivityPriorityOption[];
  results: CatalogOption[];
  defaults: { priorityId: string | null; statusId: string | null };
  /** Base + `crm.campos_obligatorios.activity` (nombres de campo del DTO). */
  requiredFields: string[];
  /** `crm.alertas.actividad_por_vencer_horas`. */
  dueSoonHours: number;
}

export interface ActivityCompletionInput {
  completedAt?: string | null;
  resultId?: string | null;
  resultNotes?: string | null;
  comment?: string | null;
}

/** Cuerpo de `POST /activities`. Omitido = valor por defecto del backend. */
export interface CreateActivityInput {
  typeId: string;
  subject: string;
  customerId: string;
  description?: string | null;
  projectId?: string | null;
  opportunityId?: string | null;
  ownerId?: string;
  priorityId?: string;
  statusId?: string;
  scheduledAt?: string | null;
  dueAt?: string | null;
  durationMinutes?: number | null;
  participants?: ParticipantInput[];
  summary?: string | null;
  resultId?: string | null;
  resultNotes?: string | null;
  nextAction?: string | null;
  nextActionDate?: string | null;
  completion?: ActivityCompletionInput | null;
}

/** Cuerpo de `PATCH /activities/{id}`: omitido = sin cambio; `null` = quitar. */
export type UpdateActivityInput = Partial<Omit<CreateActivityInput, 'completion'>>;

export const ACTIVITY_SORT_FIELDS = ['scheduledAt', 'dueAt', 'code', 'priority', 'customerName', 'ownerName', 'status'] as const;

export const ACTIVITY_FILTER_KEYS = [
  'typeId',
  'statusId',
  'priorityId',
  'ownerId',
  'customerId',
  'projectId',
  'opportunityId',
  'scheduledFrom',
  'scheduledTo',
  'dueFrom',
  'dueTo',
  'overdue',
] as const;
export type ActivityFilterKey = (typeof ACTIVITY_FILTER_KEYS)[number];

export const PENDING_SORT_FIELDS = ['priority', 'dueAt'] as const;
export const PENDING_FILTER_KEYS = ['bucket', 'ownerId', 'typeId', 'priorityId', 'customerId'] as const;
export type PendingFilterKey = (typeof PENDING_FILTER_KEYS)[number];
export type PendingBucketFilter = 'ALL' | DueBucket;

function activityPath(activityId: string): string {
  return `${ACTIVITIES_PATH}/${encodeURIComponent(activityId)}`;
}

export function listActivities(query: ListQuery): Promise<PaginatedResponse<ActivityListItem>> {
  return httpClient.get<PaginatedResponse<ActivityListItem>>(ACTIVITIES_PATH, { query });
}

export function listPendingActivities(query: ListQuery): Promise<PendingActivitiesResponse> {
  return httpClient.get<PendingActivitiesResponse>(`${ACTIVITIES_PATH}/pending`, { query });
}

export function getActivityFormOptions(): Promise<ActivityFormOptions> {
  return httpClient.get<ActivityFormOptions>(`${ACTIVITIES_PATH}/form-options`);
}

export function getActivity(activityId: string): Promise<ActivityDetail> {
  return httpClient.get<ActivityDetail>(activityPath(activityId));
}

export function createActivity(input: CreateActivityInput): Promise<ActivityDetail> {
  return httpClient.post<ActivityDetail>(ACTIVITIES_PATH, { body: input });
}

export function updateActivity(activityId: string, input: UpdateActivityInput): Promise<ActivityDetail> {
  return httpClient.patch<ActivityDetail>(activityPath(activityId), { body: input });
}

export function completeActivity(activityId: string, input: ActivityCompletionInput): Promise<ActivityDetail> {
  return httpClient.post<ActivityDetail>(`${activityPath(activityId)}/completion`, { body: input });
}

export function cancelActivity(activityId: string, comment: string | null): Promise<ActivityDetail> {
  return httpClient.post<ActivityDetail>(`${activityPath(activityId)}/cancellation`, { body: { comment } });
}

export function deleteActivity(activityId: string): Promise<void> {
  return httpClient.delete<void>(activityPath(activityId));
}
