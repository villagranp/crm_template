import { Inject, Injectable } from '@nestjs/common';

import { PermissionDeniedError } from '@/common/errors/application-error';
import type { FieldIssue } from '@/common/errors/field-issue';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { SEQUENCE_GENERATOR, type SequenceGenerator } from '@/infrastructure/database/ports/sequence-generator.port';
import { TRANSACTION_RUNNER, type TransactionContext, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CatalogLookupService } from '@/modules/catalogs/catalog-lookup.service';
import { CatalogReferenceValidator } from '@/modules/catalogs/catalog-reference.validator';
import type { CatalogItemRecord } from '@/modules/catalogs/ports/catalogs.repository.port';
import { CustomerReferenceGuard } from '@/modules/customers/customer-reference.guard';
import { searchTerms } from '@/modules/customers/customer-normalization';
import { ParameterReader } from '@/modules/parameters/parameter-reader';
import { REQUIRED_FIELDS_WHITELIST } from '@/modules/parameters/parameter-rules.registry';

import {
  ACTIVITY_PERMISSIONS,
  type ActivityPolicySubject,
  administersActivity,
  allowedActivityActions,
  canAssignActivityOwner,
  isActivityActionPermitted,
  missingActivityPermission,
} from './activity-access-policy';
import { ACTIVITY_AUDIT_EVENTS, ACTIVITY_AUDIT_RESOURCE, ACTIVITY_MASKED_FIELDS, activityAuditState } from './activity-audit';
import { type ActivityDueBucket, activityDueBucket, dueSoonLimit, type PendingBucketFilter } from './activity-due-status';
import {
  type ActivityAction,
  activityStateViolation,
  activityStatusGroup,
  activityStatusSemantics,
  pickActivityStatus,
} from './activity-lifecycle';
import { type ActivitySpecificField, hasValue, isActivitySpecificField, notApplicableFields, typeSpecificFields } from './activity-type-fields';
import { activityAgendaGroup, type AgendaStatusGroup } from './agenda-status';
import { type CatalogMetadata, type CatalogStateItem, metadataFlag, metadataNumber } from './catalog-state';
import {
  type ActivityAccessScopes,
  type CommercialActor,
  CommercialActorResolver,
  commercialAccessFor,
  inScope,
  userScopeFrom,
} from './commercial-actor.resolver';
import { LinkedProjectsService } from './linked-projects.service';
import {
  assertProjectLink,
  calendarDate,
  instant,
  type NormalizedParticipant,
  normalizeParticipants,
  type ParticipantInput,
  sameInstant,
  sameParticipants,
  text,
  validateParticipants,
} from './commercial-input';
import {
  activityNotFound,
  COMMERCIAL_ERROR_CODES,
  commercialIssue,
  concurrentChangeConflict,
  issueError,
  issuesError,
  lifecycleConflict,
} from './commercial-activity-errors';
import {
  ACTIVITY_REPOSITORY,
  type ActivityFields,
  type ActivityListRecord,
  type ActivityPatch,
  type ActivityRecord,
  type ActivityRepository,
  type ActivitySortField,
  type ParticipantWrite,
  type PendingCounts,
  type PendingSortField,
} from './ports/activity.repository.port';
import { COMMERCIAL_LINK_READER, type CommercialLinkReader } from './ports/commercial-link.reader.port';
import { COMMERCIAL_USERS_READER, type CommercialUsersReader } from './ports/commercial-users.reader.port';
import type { CommercialAccess } from './ports/commercial-visibility';

// ---------------------------------------------------------------------------
// Contratos de entrada (los DTO del controlador encajan por estructura)
// ---------------------------------------------------------------------------

/** Campo omitido = sin cambio (edición) o valor por defecto (alta); `null` = quitar. */
export interface ActivityFieldsRequest {
  readonly subject?: string;
  readonly description?: string | null;
  readonly projectId?: string | null;
  readonly opportunityId?: string | null;
  readonly ownerId?: string;
  readonly priorityId?: string;
  readonly statusId?: string;
  readonly scheduledAt?: string | null;
  readonly dueAt?: string | null;
  readonly durationMinutes?: number | null;
  readonly participants?: readonly ParticipantInput[];
  readonly summary?: string | null;
  readonly resultId?: string | null;
  readonly resultNotes?: string | null;
  readonly nextAction?: string | null;
  readonly nextActionDate?: string | null;
}

export interface ActivityCompletionRequest {
  readonly completedAt?: string | null;
  readonly resultId?: string | null;
  readonly resultNotes?: string | null;
  readonly comment?: string | null;
}

export interface CreateActivityRequest extends ActivityFieldsRequest {
  readonly typeId: string;
  readonly subject: string;
  readonly customerId: string;
  /** Registrar una gestión ya realizada en un paso (RN-04.29, D-04.14). */
  readonly completion?: ActivityCompletionRequest | null;
}

export interface UpdateActivityRequest extends ActivityFieldsRequest {
  readonly typeId?: string;
  readonly customerId?: string;
}

export interface ActivityCancellationRequest {
  readonly comment?: string | null;
}

export interface ListActivitiesRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: ActivitySortField;
  readonly sortOrder: 'asc' | 'desc';
  readonly search?: string;
  readonly typeId?: readonly string[];
  readonly statusId?: readonly string[];
  readonly priorityId?: readonly string[];
  readonly ownerId?: readonly string[];
  readonly customerId?: string;
  readonly projectId?: string;
  readonly opportunityId?: string;
  readonly countryId?: string;
  readonly scheduledFrom?: string;
  readonly scheduledTo?: string;
  readonly dueFrom?: string;
  readonly dueTo?: string;
  readonly overdue?: boolean;
}

export interface ListPendingRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: PendingSortField;
  readonly sortOrder: 'asc' | 'desc';
  readonly bucket?: readonly PendingBucketFilter[];
  readonly ownerId?: readonly string[];
  readonly typeId?: readonly string[];
  readonly priorityId?: readonly string[];
  readonly customerId?: string;
}

// ---------------------------------------------------------------------------
// Vistas que el controlador traduce a DTO
// ---------------------------------------------------------------------------

export interface ActivityView {
  readonly record: ActivityRecord;
  readonly access: CommercialAccess;
  readonly allowedActions: readonly ActivityAction[];
  readonly statusGroup: AgendaStatusGroup;
  readonly dueBucket: ActivityDueBucket | null;
  /** Nombres de contactos participantes solo con `contactos.ver` (02 H.5). */
  readonly canSeeContacts: boolean;
}

export interface ActivityListItemView {
  readonly record: ActivityListRecord;
  readonly access: CommercialAccess;
  readonly allowedActions: readonly ActivityAction[];
  readonly statusGroup: AgendaStatusGroup;
  readonly dueBucket: ActivityDueBucket | null;
}

export interface PendingActivitiesView {
  readonly page: Page<ActivityListItemView & { readonly dueBucket: ActivityDueBucket }>;
  readonly counts: PendingCounts;
}

export interface CatalogOptionView {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly sortOrder: number;
}

export interface ActivityFormOptions {
  readonly types: readonly (CatalogOptionView & { readonly fields: readonly ActivitySpecificField[]; readonly isInteraction: boolean })[];
  readonly statuses: readonly (CatalogOptionView & { readonly group: 'OPEN' | 'COMPLETED' | 'CANCELLED' })[];
  readonly priorities: readonly (CatalogOptionView & { readonly weight: number })[];
  readonly results: readonly CatalogOptionView[];
  readonly defaults: { readonly priorityId: string | null; readonly statusId: string | null };
  readonly requiredFields: readonly string[];
  readonly dueSoonHours: number;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const ACTIVITY_CATALOGS = {
  type: 'crm.tipo_actividad',
  status: 'crm.estado_actividad',
  priority: 'crm.prioridad',
  result: 'crm.resultado_interaccion',
} as const;

const PARAMETERS = {
  requiredFields: 'crm.campos_obligatorios',
  defaults: 'crm.valores_por_defecto',
  timeZone: 'crm.zona_horaria_negocio',
  dueSoonHours: 'crm.alertas.actividad_por_vencer_horas',
} as const;

const CONTACT_VIEW_PERMISSION = 'contactos.ver';
const ACTIVITY_SEQUENCE = 'crm.actividad';
const BASE_REQUIRED = REQUIRED_FIELDS_WHITELIST['activity']?.base ?? ['typeId', 'subject', 'customerId', 'ownerId', 'priorityId'];

// ---------------------------------------------------------------------------
// Normalización (pura)
// ---------------------------------------------------------------------------

/** Estado final de la actividad tras aplicar la petición (alta: sobre vacío; edición: sobre lo guardado). */
interface ActivityDraft {
  readonly typeId: string;
  readonly subject: string;
  readonly description: string | null;
  readonly customerId: string;
  readonly projectId: string | null;
  readonly opportunityId: string | null;
  readonly ownerId: string;
  readonly priorityId: string | null;
  readonly scheduledAt: Date | null;
  readonly dueAt: Date | null;
  readonly durationMinutes: number | null;
  readonly summary: string | null;
  readonly resultId: string | null;
  readonly resultNotes: string | null;
  readonly nextAction: string | null;
  readonly nextActionDate: Date | null;
  readonly participants: readonly NormalizedParticipant[];
}

function draftFromRecord(record: ActivityRecord): ActivityDraft {
  return {
    typeId: record.type.id,
    subject: record.subject,
    description: record.description,
    customerId: record.customer.id,
    projectId: record.project?.id ?? null,
    opportunityId: record.opportunity?.id ?? null,
    ownerId: record.owner.id,
    priorityId: record.priority.id,
    scheduledAt: record.scheduledAt,
    dueAt: record.dueAt,
    durationMinutes: record.durationMinutes,
    summary: record.summary,
    resultId: record.result?.id ?? null,
    resultNotes: record.resultNotes,
    nextAction: record.nextAction,
    nextActionDate: record.nextActionDate,
    participants: record.participants.map((participant) => ({
      contactId: participant.contactId,
      userId: participant.userId,
      externalName: participant.externalName,
    })),
  };
}

/** Aplica la petición sobre `base`: campo omitido = se conserva; `null` = se quita. */
function applyRequest(base: ActivityDraft, request: ActivityFieldsRequest & { typeId?: string; customerId?: string }): ActivityDraft {
  const pick = <T, R>(sent: T | undefined, current: R, map: (value: T) => R): R => (sent === undefined ? current : map(sent));
  return {
    typeId: request.typeId ?? base.typeId,
    subject: request.subject === undefined ? base.subject : request.subject.trim(),
    description: pick(request.description, base.description, text),
    customerId: request.customerId ?? base.customerId,
    projectId: pick(request.projectId, base.projectId, (value) => value ?? null),
    opportunityId: pick(request.opportunityId, base.opportunityId, (value) => value ?? null),
    ownerId: request.ownerId ?? base.ownerId,
    priorityId: request.priorityId ?? base.priorityId,
    scheduledAt: pick(request.scheduledAt, base.scheduledAt, instant),
    dueAt: pick(request.dueAt, base.dueAt, instant),
    durationMinutes: pick(request.durationMinutes, base.durationMinutes, (value) => value ?? null),
    summary: pick(request.summary, base.summary, text),
    resultId: pick(request.resultId, base.resultId, (value) => value ?? null),
    resultNotes: pick(request.resultNotes, base.resultNotes, text),
    nextAction: pick(request.nextAction, base.nextAction, text),
    nextActionDate: pick(request.nextActionDate, base.nextActionDate, calendarDate),
    participants: request.participants === undefined ? base.participants : normalizeParticipants(request.participants),
  };
}

const EMPTY_DRAFT: ActivityDraft = {
  typeId: '',
  subject: '',
  description: null,
  customerId: '',
  projectId: null,
  opportunityId: null,
  ownerId: '',
  priorityId: null,
  scheduledAt: null,
  dueAt: null,
  durationMinutes: null,
  summary: null,
  resultId: null,
  resultNotes: null,
  nextAction: null,
  nextActionDate: null,
  participants: [],
};

/** Valores de los campos específicos del borrador (RN-04.24). */
function specificValues(draft: ActivityDraft): Partial<Record<ActivitySpecificField, unknown>> {
  return {
    scheduledAt: draft.scheduledAt,
    durationMinutes: draft.durationMinutes,
    participants: draft.participants,
    summary: draft.summary,
    resultId: draft.resultId,
    resultNotes: draft.resultNotes,
    nextAction: draft.nextAction,
    nextActionDate: draft.nextActionDate,
  };
}

function draftValue(draft: ActivityDraft, field: string): unknown {
  return (draft as unknown as Record<string, unknown>)[field];
}

function toStateItem(item: CatalogItemRecord): CatalogStateItem {
  return { id: item.id, code: item.code, isActive: item.isActive, sortOrder: item.sortOrder, metadata: item.metadata };
}

function metadataOf(items: readonly CatalogItemRecord[], id: string | null | undefined): CatalogMetadata | undefined {
  const item = id ? items.find((candidate) => candidate.id === id) : undefined;
  return item ? item.metadata : undefined;
}

/**
 * Casos de uso de actividades (04 F.2, RN-04.1–RN-04.12, RN-04.23–RN-04.32): listado,
 * bandeja, detalle, alta (incluida la gestión ya realizada, D-04.14), edición,
 * completar, cancelar y eliminar.
 *
 * Orden de las comprobaciones: visibilidad (`404`) → permisos y propiedad (`403`) →
 * estado (`409`) → reglas de negocio (`422`). Alcances, parámetros y catálogos se leen
 * **antes** de abrir la transacción; dentro solo van las validaciones que deben ser
 * coherentes con la escritura (guardas de referencia con su bloqueo, catálogos), el
 * folio y las escrituras. La auditoría se escribe después (patrón vigente, AuditService).
 */
@Injectable()
export class ActivitiesService {
  constructor(
    @Inject(ACTIVITY_REPOSITORY) private readonly activities: ActivityRepository,
    @Inject(COMMERCIAL_LINK_READER) private readonly links: CommercialLinkReader,
    private readonly linkedProjects: LinkedProjectsService,
    @Inject(COMMERCIAL_USERS_READER) private readonly users: CommercialUsersReader,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(SEQUENCE_GENERATOR) private readonly sequences: SequenceGenerator,
    private readonly actors: CommercialActorResolver,
    private readonly customers: CustomerReferenceGuard,
    private readonly catalogReferences: CatalogReferenceValidator,
    private readonly catalogs: CatalogLookupService,
    private readonly parameters: ParameterReader,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  // -------------------------------------------------------------------------
  // Lecturas
  // -------------------------------------------------------------------------

  async list(actor: CommercialActor, request: ListActivitiesRequest): Promise<Page<ActivityListItemView>> {
    const [scopes, dueSoonHours] = await Promise.all([this.actors.activityScopes(actor), this.dueSoonHours()]);
    const now = new Date();
    const search = request.search?.trim() || null;
    const page = await this.activities.search(
      {
        page: request.page,
        pageSize: request.pageSize,
        sortBy: request.sortBy ?? 'dueAt',
        sortOrder: request.sortOrder,
        typeIds: request.typeId ?? [],
        statusIds: request.statusId ?? [],
        priorityIds: request.priorityId ?? [],
        ownerIds: request.ownerId ?? [],
        customerId: request.customerId ?? null,
        projectId: request.projectId ?? null,
        opportunityId: request.opportunityId ?? null,
        countryId: request.countryId ?? null,
        scheduledFrom: instant(request.scheduledFrom),
        scheduledTo: instant(request.scheduledTo),
        dueFrom: instant(request.dueFrom),
        dueTo: instant(request.dueTo),
        overdueAt: request.overdue ? now : null,
        searchCodePrefix: search,
        searchTerms: searchTerms(search),
      },
      scopes.visibility,
    );
    return { ...page, items: page.items.map((record) => this.listItemView(actor, scopes, record, now, dueSoonHours)) };
  }

  async listPending(actor: CommercialActor, request: ListPendingRequest): Promise<PendingActivitiesView> {
    const [scopes, dueSoonHours] = await Promise.all([this.actors.activityScopes(actor), this.dueSoonHours()]);
    const now = new Date();
    const buckets = (request.bucket ?? []).includes('ALL') ? [] : [...new Set(request.bucket ?? [])].filter((item) => item !== 'ALL');
    const { page, counts } = await this.activities.listPending(
      {
        page: request.page,
        pageSize: request.pageSize,
        sortBy: request.sortBy ?? 'priority',
        sortOrder: request.sortOrder,
        buckets: buckets as ActivityDueBucket[],
        ownerIds: request.ownerId ?? [],
        typeIds: request.typeId ?? [],
        priorityIds: request.priorityId ?? [],
        customerId: request.customerId ?? null,
        now,
        dueSoonUntil: dueSoonLimit(now, dueSoonHours),
      },
      scopes.visibility,
    );
    return {
      page: {
        ...page,
        items: page.items.map((record) => ({ ...this.listItemView(actor, scopes, record, now, dueSoonHours), dueBucket: record.bucket })),
      },
      counts,
    };
  }

  async findById(actor: CommercialActor, activityId: string): Promise<ActivityView> {
    const [scopes, dueSoonHours] = await Promise.all([this.actors.activityScopes(actor), this.dueSoonHours()]);
    const record = await this.activities.findById(activityId, scopes.visibility);
    if (!record) throw activityNotFound(activityId);
    return this.view(actor, scopes, record, dueSoonHours);
  }

  async formOptions(): Promise<ActivityFormOptions> {
    const [types, statuses, priorities, results, settings, dueSoonHours] = await Promise.all([
      this.catalogItems(ACTIVITY_CATALOGS.type),
      this.catalogItems(ACTIVITY_CATALOGS.status),
      this.catalogItems(ACTIVITY_CATALOGS.priority),
      this.catalogItems(ACTIVITY_CATALOGS.result),
      this.settings(),
      this.dueSoonHours(),
    ]);
    const active = (items: readonly CatalogItemRecord[]): CatalogItemRecord[] => items.filter((item) => item.isActive);
    const option = (item: CatalogItemRecord): CatalogOptionView => ({ id: item.id, code: item.code, label: item.label, sortOrder: item.sortOrder });
    return {
      types: active(types).map((item) => ({
        ...option(item),
        fields: typeSpecificFields(item.metadata),
        isInteraction: metadataFlag(item.metadata, 'isInteraction'),
      })),
      statuses: active(statuses).map((item) => ({ ...option(item), group: activityStatusGroup(activityStatusSemantics(item.metadata)) })),
      priorities: active(priorities).map((item) => ({ ...option(item), weight: metadataNumber(item.metadata, 'weight') })),
      results: active(results).map(option),
      defaults: {
        priorityId: this.defaultPriorityId(priorities, settings.defaults),
        statusId: pickActivityStatus(statuses.map(toStateItem), 'isOpen')?.id ?? null,
      },
      requiredFields: settings.requiredFields,
      dueSoonHours,
    };
  }

  // -------------------------------------------------------------------------
  // Alta (RN-04.23, RN-04.29)
  // -------------------------------------------------------------------------

  async create(actor: CommercialActor, request: CreateActivityRequest): Promise<ActivityView> {
    const actorId = actor.userId;
    if (!actorId) throw new PermissionDeniedError(ACTIVITY_PERMISSIONS.create);
    const completion = request.completion ?? null;
    if (completion && !actor.permissions.has(ACTIVITY_PERMISSIONS.close)) {
      throw new PermissionDeniedError(ACTIVITY_PERMISSIONS.close);
    }
    const ownerId = request.ownerId ?? actorId;
    if (!canAssignActivityOwner(actor, ownerId)) {
      throw new PermissionDeniedError(ACTIVITY_PERMISSIONS.administer);
    }

    const now = new Date();
    const draft = applyRequest({ ...EMPTY_DRAFT, ownerId }, request);
    this.assertOpportunityHasProject(draft);
    const completed = completion ? this.completionValues(completion, now) : null;
    if (completion && request.statusId !== undefined) {
      throw issueError('statusId', COMMERCIAL_ERROR_CODES.useLifecycleOperation);
    }

    // Los alcances sobre clientes se resuelven antes de la transacción: la guarda de 02
    // no abre otra conexión del pool mientras la transacción sostiene bloqueos (AGENTS §9.4).
    const [scopes, customerScopes, settings, types, statuses, priorities, dueSoonHours] = await Promise.all([
      this.actors.activityScopes(actor),
      this.customers.accessScopes(actor),
      this.settings(),
      this.catalogItems(ACTIVITY_CATALOGS.type),
      this.catalogItems(ACTIVITY_CATALOGS.status),
      this.catalogItems(ACTIVITY_CATALOGS.priority),
      this.dueSoonHours(),
    ]);

    // Estado: el pedido debe ser abierto (los demás, por sus operaciones); por defecto, el inicial.
    if (request.statusId !== undefined) this.assertOpenStatus(statuses, request.statusId);
    const statusId = completed
      ? this.requireStatus(statuses, 'isCompleted')
      : (request.statusId ?? this.requireStatus(statuses, 'isOpen'));

    // Prioridad: la pedida o la de `crm.valores_por_defecto` (RN-04.8).
    const priorityId = draft.priorityId ?? this.defaultPriorityId(priorities, settings.defaults);
    const final: ActivityDraft = { ...draft, priorityId };

    this.assertRequiredFields(settings.requiredFields, final, metadataOf(types, final.typeId), null);
    this.assertFieldsApplicable(metadataOf(types, final.typeId), final, null);

    const resultId = completed?.resultId ?? final.resultId;
    const resultNotes = completed?.resultNotes ?? final.resultNotes;

    const activityId = await this.transactions.run(async (tx) => {
      await this.customers.assertUsableCustomer(final.customerId, actor, { requireActive: true, tx, scopes: customerScopes });
      await this.assertCatalogs(final, { statusId: request.statusId ?? null, resultId }, null, tx);
      if (ownerId !== actorId) await this.assertEligibleOwner(ownerId, scopes, tx);
      // Bloqueo del proyecto ANTES de validarlo: una eliminación concurrente espera o ya se ve (RN-04.2).
      await this.linkedProjects.lock(final.projectId ? [final.projectId] : [], tx);
      await this.assertLinks(final, null, scopes, tx);
      const participants = await this.validateParticipants(final.participants, final.customerId, null, tx);

      const code = await this.sequences.next(ACTIVITY_SEQUENCE, tx, { timeZone: settings.timeZone });
      const id = await this.activities.create(
        {
          ...this.fieldsOf(final, statusId, final.priorityId ?? ''),
          resultId,
          resultNotes,
          completedAt: completed?.completedAt ?? null,
          completedById: completed ? actorId : null,
          completionComment: completed?.comment ?? null,
          code,
          createdById: actorId,
          participants,
        },
        tx,
      );
      if (final.projectId) await this.linkedProjects.touch([final.projectId], now, tx);
      return id;
    });

    const created = await this.requireRecord(activityId);
    this.logger.info(completed ? 'activity.created_completed' : 'activity.created', {
      correlationId: actor.audit.correlationId,
      activityId,
      actorId,
    });
    await this.audit.record(ACTIVITY_AUDIT_EVENTS.created, actor.audit, {
      resourceType: ACTIVITY_AUDIT_RESOURCE,
      resourceId: activityId,
      before: null,
      after: activityAuditState(created),
      maskedFields: ACTIVITY_MASKED_FIELDS,
      metadata: { code: created.code, completedOnCreation: completed !== null },
    });
    return this.view(actor, scopes, created, dueSoonHours);
  }

  // -------------------------------------------------------------------------
  // Edición (RN-04.27)
  // -------------------------------------------------------------------------

  async update(actor: CommercialActor, activityId: string, request: UpdateActivityRequest): Promise<ActivityView> {
    const [scopes, dueSoonHours] = await Promise.all([this.actors.activityScopes(actor), this.dueSoonHours()]);
    const before = await this.findVisible(activityId, scopes);
    const subject = this.subject(before, scopes);
    this.assertPermitted(actor, subject, 'EDIT');
    this.assertState(before, subject, 'EDIT');

    const current = draftFromRecord(before);
    const final = applyRequest(current, request);
    if (final.ownerId !== current.ownerId && !administersActivity(actor, subject)) {
      throw new PermissionDeniedError(ACTIVITY_PERMISSIONS.administer);
    }
    this.assertOpportunityHasProject(final);

    const [settings, types, statuses] = await Promise.all([
      this.settings(),
      this.catalogItems(ACTIVITY_CATALOGS.type),
      this.catalogItems(ACTIVITY_CATALOGS.status),
    ]);
    const statusChanged = request.statusId !== undefined && request.statusId !== before.status.id;
    if (statusChanged && request.statusId !== undefined) this.assertOpenStatus(statuses, request.statusId);

    const sentFields = new Set(Object.keys(request).filter((key) => (request as Record<string, unknown>)[key] !== undefined));
    this.assertRequiredFields(settings.requiredFields, final, metadataOf(types, final.typeId), sentFields);
    // RN-04.27: cambiar el tipo revalida todo lo guardado; si no, solo lo que se envía.
    const typeChanged = final.typeId !== current.typeId;
    this.assertFieldsApplicable(metadataOf(types, final.typeId), final, typeChanged ? null : sentFields);

    const customerChanged = final.customerId !== current.customerId;
    if (customerChanged && request.participants === undefined && current.participants.some((participant) => participant.contactId)) {
      // 04 F.2: cambiar el cliente con contactos del anterior como participantes.
      throw issueError('participants', COMMERCIAL_ERROR_CODES.invalidContact);
    }

    const statusId = request.statusId ?? before.status.id;
    const patch = this.changedFields(before, final, statusId);
    const participantsChanged = request.participants !== undefined && !sameParticipants(current.participants, final.participants);
    if (Object.keys(patch).length === 0 && !participantsChanged) {
      // Edición sin cambios: no se escribe ni se audita (como RN-02.31).
      return this.view(actor, scopes, before, dueSoonHours);
    }

    const now = new Date();
    const projectIds = [current.projectId, final.projectId].filter((id): id is string => id !== null);
    const customerScopes = customerChanged ? await this.customers.accessScopes(actor) : null;
    await this.transactions.run(async (tx) => {
      if (customerScopes) await this.customers.assertUsableCustomer(final.customerId, actor, { requireActive: true, tx, scopes: customerScopes });
      await this.assertCatalogs(final, { statusId: statusChanged ? statusId : null, resultId: final.resultId }, current, tx);
      if (final.ownerId !== current.ownerId) await this.assertEligibleOwner(final.ownerId, scopes, tx);
      // Bloqueo de los proyectos ANTES de validar el vínculo (RN-04.2, AGENTS §9.4).
      await this.linkedProjects.lock(projectIds, tx);
      await this.assertLinks(final, current, scopes, tx);
      const participants = participantsChanged || customerChanged ? await this.validateParticipants(final.participants, final.customerId, current, tx) : [];

      if (participantsChanged || customerChanged) await this.activities.deleteParticipants(activityId, tx);
      if (!(await this.activities.update(activityId, before.status.id, { ...patch, updatedById: actor.userId }, tx))) {
        throw concurrentChangeConflict();
      }
      if (participantsChanged || customerChanged) {
        await this.activities.insertParticipants(activityId, final.customerId, participants, actor.userId, tx);
      }
      await this.linkedProjects.touch(projectIds, now, tx);
    });

    const after = await this.requireRecord(activityId);
    this.logger.info('activity.updated', {
      correlationId: actor.audit.correlationId,
      activityId,
      actorId: actor.userId,
      fields: [...Object.keys(patch), ...(participantsChanged ? ['participants'] : [])],
    });
    await this.audit.record(ACTIVITY_AUDIT_EVENTS.updated, actor.audit, {
      resourceType: ACTIVITY_AUDIT_RESOURCE,
      resourceId: activityId,
      before: activityAuditState(before),
      after: activityAuditState(after),
      maskedFields: ACTIVITY_MASKED_FIELDS,
    });
    return this.view(actor, scopes, after, dueSoonHours);
  }

  // -------------------------------------------------------------------------
  // Ciclo de vida (RN-04.28, RN-04.30)
  // -------------------------------------------------------------------------

  async complete(actor: CommercialActor, activityId: string, request: ActivityCompletionRequest): Promise<ActivityView> {
    const [scopes, dueSoonHours] = await Promise.all([this.actors.activityScopes(actor), this.dueSoonHours()]);
    const before = await this.findVisible(activityId, scopes);
    const subject = this.subject(before, scopes);
    this.assertPermitted(actor, subject, 'COMPLETE');
    this.assertState(before, subject, 'COMPLETE');
    const now = new Date();
    const completed = this.completionValues(request, now);
    const statusId = this.requireStatus(await this.catalogItems(ACTIVITY_CATALOGS.status), 'isCompleted');

    const patch: ActivityPatch = {
      statusId,
      completedAt: completed.completedAt,
      completedById: actor.userId,
      completionComment: completed.comment,
      ...(request.resultId !== undefined ? { resultId: completed.resultId } : {}),
      ...(request.resultNotes !== undefined ? { resultNotes: completed.resultNotes } : {}),
      updatedById: actor.userId,
    };
    await this.transition(before, patch, completed.resultId, now);

    const after = await this.requireRecord(activityId);
    this.logger.info('activity.completed', { correlationId: actor.audit.correlationId, activityId, actorId: actor.userId });
    await this.audit.record(ACTIVITY_AUDIT_EVENTS.completed, actor.audit, {
      resourceType: ACTIVITY_AUDIT_RESOURCE,
      resourceId: activityId,
      before: activityAuditState(before),
      after: activityAuditState(after),
      maskedFields: ACTIVITY_MASKED_FIELDS,
    });
    return this.view(actor, scopes, after, dueSoonHours);
  }

  async cancel(actor: CommercialActor, activityId: string, request: ActivityCancellationRequest): Promise<ActivityView> {
    const [scopes, dueSoonHours] = await Promise.all([this.actors.activityScopes(actor), this.dueSoonHours()]);
    const before = await this.findVisible(activityId, scopes);
    const subject = this.subject(before, scopes);
    this.assertPermitted(actor, subject, 'CANCEL');
    this.assertState(before, subject, 'CANCEL');
    const now = new Date();
    const statusId = this.requireStatus(await this.catalogItems(ACTIVITY_CATALOGS.status), 'isCancelled');
    await this.transition(before, { statusId, cancelledAt: now, updatedById: actor.userId }, null, now);

    const after = await this.requireRecord(activityId);
    this.logger.info('activity.cancelled', { correlationId: actor.audit.correlationId, activityId, actorId: actor.userId });
    // D-04.7: sin columna de motivo; el comentario queda en la auditoría (enmascarado, DM-29).
    await this.audit.record(ACTIVITY_AUDIT_EVENTS.cancelled, actor.audit, {
      resourceType: ACTIVITY_AUDIT_RESOURCE,
      resourceId: activityId,
      before: { ...activityAuditState(before), cancellationComment: null },
      after: { ...activityAuditState(after), cancellationComment: text(request.comment) },
      maskedFields: ACTIVITY_MASKED_FIELDS,
    });
    return this.view(actor, scopes, after, dueSoonHours);
  }

  /** Eliminación lógica (RN-04.30, DM-33): solo abiertas o canceladas; una completada es historia. */
  async remove(actor: CommercialActor, activityId: string): Promise<void> {
    const scopes = await this.actors.activityScopes(actor);
    const before = await this.findVisible(activityId, scopes);
    const subject = this.subject(before, scopes);
    this.assertPermitted(actor, subject, 'DELETE');
    this.assertState(before, subject, 'DELETE');
    const now = new Date();
    await this.transition(before, { deletedAt: now, updatedById: actor.userId }, null, now);

    this.logger.info('activity.deleted', { correlationId: actor.audit.correlationId, activityId, actorId: actor.userId });
    await this.audit.record(ACTIVITY_AUDIT_EVENTS.deleted, actor.audit, {
      resourceType: ACTIVITY_AUDIT_RESOURCE,
      resourceId: activityId,
      metadata: { code: before.code, statusId: before.status.id },
    });
  }

  // -------------------------------------------------------------------------
  // Adjuntos (04 F.4, DC-2): la autorización es del dueño
  // -------------------------------------------------------------------------

  /** Listar y descargar: la actividad debe ser visible (`404` si no). */
  async assertCanViewAttachments(actor: CommercialActor, activityId: string): Promise<void> {
    const scopes = await this.actors.activityScopes(actor);
    await this.findVisible(activityId, scopes);
  }

  /**
   * Subir y eliminar: poder editarla (propia con `actividades.editar`, ajena con
   * `actividades.administrar`, acceso directo → `403`) y que siga abierta: una
   * completada o cancelada es de solo lectura (`409 RECORD_READ_ONLY`, RN-04.27, D-04.6).
   */
  async assertCanManageAttachments(actor: CommercialActor, activityId: string): Promise<void> {
    const scopes = await this.actors.activityScopes(actor);
    const record = await this.findVisible(activityId, scopes);
    const subject = this.subject(record, scopes);
    this.assertPermitted(actor, subject, 'EDIT');
    this.assertState(record, subject, 'EDIT');
  }

  // -------------------------------------------------------------------------
  // Piezas internas
  // -------------------------------------------------------------------------

  /** Escritura condicionada al estado leído + `last_activity_at` en la misma transacción (RN-04.11, RN-04.12). */
  private async transition(before: ActivityRecord, patch: ActivityPatch, resultId: string | null, now: Date): Promise<void> {
    const projectIds = before.project ? [before.project.id] : [];
    await this.transactions.run(async (tx) => {
      if (resultId) {
        await this.catalogReferences.assertItem(ACTIVITY_CATALOGS.result, resultId, { field: 'resultId', tx });
      }
      await this.linkedProjects.lock(projectIds, tx);
      if (!(await this.activities.update(before.id, before.status.id, patch, tx))) {
        throw concurrentChangeConflict();
      }
      await this.linkedProjects.touch(projectIds, now, tx);
    });
  }

  private async findVisible(activityId: string, scopes: ActivityAccessScopes): Promise<ActivityRecord> {
    const record = await this.activities.findById(activityId, scopes.visibility);
    if (!record) throw activityNotFound(activityId);
    return record;
  }

  private async requireRecord(activityId: string): Promise<ActivityRecord> {
    const record = await this.activities.findById(activityId, null);
    if (!record) throw activityNotFound(activityId);
    return record;
  }

  private subject(record: { owner: { id: string }; customer: { countryId: string }; status: { metadata: CatalogMetadata } }, scopes: ActivityAccessScopes): ActivityPolicySubject {
    const ref = { ownerId: record.owner.id, customerCountryId: record.customer.countryId };
    return {
      ownerId: record.owner.id,
      access: commercialAccessFor(scopes.visibility, ref),
      group: activityStatusGroup(activityStatusSemantics(record.status.metadata)),
      inAdministerScope: inScope(scopes.administer, ref),
      inDeleteScope: inScope(scopes.delete, ref),
    };
  }

  private assertPermitted(actor: CommercialActor, subject: ActivityPolicySubject, action: ActivityAction): void {
    if (!isActivityActionPermitted(actor, subject, action)) {
      throw new PermissionDeniedError(missingActivityPermission(actor, subject, action));
    }
  }

  private assertState(record: ActivityRecord, subject: ActivityPolicySubject, action: ActivityAction): void {
    const violation = activityStateViolation(subject.group, action);
    if (violation) throw lifecycleConflict(violation, record.status.code);
  }

  private view(actor: CommercialActor, scopes: ActivityAccessScopes, record: ActivityRecord, dueSoonHours: number): ActivityView {
    const subject = this.subject(record, scopes);
    const now = new Date();
    return {
      record,
      access: subject.access,
      allowedActions: allowedActivityActions(actor, subject),
      statusGroup: activityAgendaGroup(subject.group, record.dueAt, now),
      dueBucket: activityDueBucket({ isOpen: subject.group === 'OPEN', dueAt: record.dueAt }, now, dueSoonHours),
      canSeeContacts: actor.permissions.has(CONTACT_VIEW_PERMISSION),
    };
  }

  private listItemView(
    actor: CommercialActor,
    scopes: ActivityAccessScopes,
    record: ActivityListRecord,
    now: Date,
    dueSoonHours: number,
  ): ActivityListItemView {
    const subject = this.subject(record, scopes);
    return {
      record,
      access: subject.access,
      allowedActions: allowedActivityActions(actor, subject),
      statusGroup: activityAgendaGroup(subject.group, record.dueAt, now),
      dueBucket: activityDueBucket({ isOpen: subject.group === 'OPEN', dueAt: record.dueAt }, now, dueSoonHours),
    };
  }

  private async catalogItems(catalogKey: string): Promise<CatalogItemRecord[]> {
    return (await this.catalogs.findByKey(catalogKey))?.items ?? [];
  }

  private async dueSoonHours(): Promise<number> {
    return this.parameters.get<number>(PARAMETERS.dueSoonHours);
  }

  /** Parámetros del alta y la edición, leídos antes de la transacción. */
  private async settings(): Promise<{ requiredFields: string[]; defaults: Readonly<Record<string, string | undefined>>; timeZone: string }> {
    const [required, defaults, timeZone] = await Promise.all([
      this.parameters.get<Record<string, string[] | undefined>>(PARAMETERS.requiredFields),
      this.parameters.get<Record<string, string | undefined>>(PARAMETERS.defaults),
      this.parameters.get<string>(PARAMETERS.timeZone),
    ]);
    return { requiredFields: [...new Set([...BASE_REQUIRED, ...(required['activity'] ?? [])])], defaults, timeZone };
  }

  /** `crm.valores_por_defecto["activity.priorityId"]` (código) → id del elemento activo; `null` si no hay. */
  private defaultPriorityId(priorities: readonly CatalogItemRecord[], defaults: Readonly<Record<string, string | undefined>>): string | null {
    const code = defaults['activity.priorityId'];
    const item = code ? priorities.find((candidate) => candidate.code === code && candidate.isActive) : undefined;
    if (code && !item) this.logger.warn('activity_default_priority_ignored', { parameter: PARAMETERS.defaults });
    return item?.id ?? null;
  }

  private requireStatus(statuses: readonly CatalogItemRecord[], flag: 'isOpen' | 'isCompleted' | 'isCancelled'): string {
    const status = pickActivityStatus(statuses.map(toStateItem), flag);
    // El registro de semántica exige al menos un elemento activo por indicador (00 §3.3).
    if (!status) throw new Error(`crm.estado_actividad has no active status with ${flag}`);
    return status.id;
  }

  /** Un estado pedido explícitamente debe ser abierto: completar y cancelar tienen su operación (RN-04.27). */
  private assertOpenStatus(statuses: readonly CatalogItemRecord[], statusId: string): void {
    const item = statuses.find((candidate) => candidate.id === statusId);
    // Si no pertenece al catálogo lo rechaza `CatalogReferenceValidator` dentro de la transacción.
    if (item && !activityStatusSemantics(item.metadata).isOpen) {
      throw issueError('statusId', COMMERCIAL_ERROR_CODES.useLifecycleOperation);
    }
  }

  private assertOpportunityHasProject(draft: ActivityDraft): void {
    if (draft.opportunityId && !draft.projectId) {
      throw issueError('opportunityId', COMMERCIAL_ERROR_CODES.opportunityRequiresProject);
    }
  }

  /**
   * RN-04.7: obligatorios de base + `crm.campos_obligatorios.activity`. En el alta se
   * comprueban todos; en la edición, solo los enviados (vaciar un obligatorio → `422`).
   * Un campo específico que el tipo no admite no se exige (RN-04.24).
   */
  private assertRequiredFields(
    required: readonly string[],
    draft: ActivityDraft,
    typeMetadata: CatalogMetadata | undefined,
    sentFields: ReadonlySet<string> | null,
  ): void {
    const applicable = typeMetadata === undefined ? null : typeSpecificFields(typeMetadata);
    const issues: (FieldIssue & Record<string, unknown>)[] = [];
    for (const field of required) {
      if (sentFields && !sentFields.has(field)) continue;
      if (isActivitySpecificField(field) && applicable && !applicable.includes(field)) continue;
      if (!hasValue(draftValue(draft, field))) issues.push(commercialIssue(field, COMMERCIAL_ERROR_CODES.requiredFieldMissing));
    }
    if (issues.length > 0) throw issuesError(issues);
  }

  /** RN-04.24: campos específicos informados que el tipo no admite → `422 FIELD_NOT_APPLICABLE` (todos). */
  private assertFieldsApplicable(typeMetadata: CatalogMetadata | undefined, draft: ActivityDraft, onlyFields: ReadonlySet<string> | null): void {
    // Tipo desconocido: lo rechaza `CatalogReferenceValidator` dentro de la transacción.
    if (typeMetadata === undefined) return;
    const values = specificValues(draft);
    const checked = onlyFields
      ? (Object.fromEntries(Object.entries(values).filter(([field]) => onlyFields.has(field))) as typeof values)
      : values;
    const fields = notApplicableFields(typeSpecificFields(typeMetadata), checked);
    if (fields.length > 0) {
      throw issuesError(fields.map((field) => commercialIssue(field, COMMERCIAL_ERROR_CODES.fieldNotApplicable)));
    }
  }

  /** RN-04.28: resultado obligatorio y fecha de finalización no futura (por defecto, ahora). */
  private completionValues(
    request: ActivityCompletionRequest,
    now: Date,
  ): { completedAt: Date; resultId: string | null; resultNotes: string | null; comment: string | null } {
    const resultId = request.resultId ?? null;
    const resultNotes = text(request.resultNotes);
    if (!resultId && !resultNotes) throw issueError('resultId', COMMERCIAL_ERROR_CODES.resultRequired);
    const completedAt = instant(request.completedAt) ?? now;
    if (completedAt.getTime() > now.getTime()) throw issueError('completedAt', COMMERCIAL_ERROR_CODES.actualDateInFuture);
    return { completedAt, resultId, resultNotes, comment: text(request.comment) };
  }

  /**
   * 00 §3.5: cada columna hacia `catalog_items` pertenece a su catálogo. En el alta se
   * exige activo; en la edición se conserva el valor actual aunque esté desactivado.
   */
  private async assertCatalogs(
    draft: ActivityDraft,
    extra: { statusId: string | null; resultId: string | null },
    current: ActivityDraft | null,
    tx: TransactionContext,
  ): Promise<void> {
    const checks: [string, string, string | null, string | null][] = [
      [ACTIVITY_CATALOGS.type, 'typeId', draft.typeId, current?.typeId ?? null],
      [ACTIVITY_CATALOGS.priority, 'priorityId', draft.priorityId, current?.priorityId ?? null],
      [ACTIVITY_CATALOGS.status, 'statusId', extra.statusId, null],
      [ACTIVITY_CATALOGS.result, 'resultId', extra.resultId, current?.resultId ?? null],
    ];
    for (const [catalogKey, field, value, currentId] of checks) {
      if (!value) continue;
      if (current && value === currentId) continue;
      await this.catalogReferences.assertItem(catalogKey, value, { field, requireActive: true, currentId, tx });
    }
  }

  /** RN-04.5: responsable distinto del actor, activo, en el alcance de `actividades.administrar` y con `actividades.ver`. */
  private async assertEligibleOwner(ownerId: string, scopes: ActivityAccessScopes, tx: TransactionContext): Promise<void> {
    const eligible = await this.users.isEligibleOwner(
      ownerId,
      { scope: userScopeFrom([scopes.administer]), anyOfPermissions: [ACTIVITY_PERMISSIONS.view] },
      tx,
    );
    if (!eligible) throw issueError('ownerId', COMMERCIAL_ERROR_CODES.ownerNotEligible);
  }

  /**
   * RN-04.1, RN-04.2: proyecto del cliente y oportunidad del proyecto. Un vínculo
   * nuevo debe existir, ser visible y no estar eliminado; uno que se conserva solo
   * debe seguir siendo coherente con el cliente y el proyecto finales.
   */
  private async assertLinks(draft: ActivityDraft, current: ActivityDraft | null, scopes: ActivityAccessScopes, tx: TransactionContext): Promise<void> {
    await assertProjectLink(this.links, draft, current, scopes.projects, tx);
    if (draft.opportunityId) {
      const isNew = !current || current.opportunityId !== draft.opportunityId;
      if (isNew || draft.projectId !== current?.projectId) {
        const opportunity = await this.links.findOpportunity(
          draft.opportunityId,
          { projects: scopes.projects, opportunities: scopes.opportunities },
          tx,
        );
        if (!opportunity || (isNew && !opportunity.isVisible)) throw issueError('opportunityId', COMMERCIAL_ERROR_CODES.unknownReference);
        if (isNew && opportunity.isDeleted) throw issueError('opportunityId', COMMERCIAL_ERROR_CODES.inactiveReference);
        if (opportunity.projectId !== draft.projectId) throw issueError('opportunityId', COMMERCIAL_ERROR_CODES.opportunityProjectMismatch);
      }
    }
  }

  /** RN-04.6 (`commercial-input.validateParticipants`): las actividades guardan sus participantes como `INVITED`. */
  private async validateParticipants(
    list: readonly NormalizedParticipant[],
    customerId: string,
    current: ActivityDraft | null,
    tx: TransactionContext,
  ): Promise<ParticipantWrite[]> {
    return validateParticipants({ customers: this.customers, users: this.users }, list, customerId, current, 'INVITED', 'participants', tx);
  }

  private fieldsOf(draft: ActivityDraft, statusId: string, priorityId: string): Omit<ActivityFields, 'resultId' | 'resultNotes' | 'completedAt' | 'completedById' | 'completionComment'> {
    return {
      typeId: draft.typeId,
      subject: draft.subject,
      description: draft.description,
      customerId: draft.customerId,
      projectId: draft.projectId,
      opportunityId: draft.opportunityId,
      ownerId: draft.ownerId,
      statusId,
      priorityId,
      scheduledAt: draft.scheduledAt,
      dueAt: draft.dueAt,
      durationMinutes: draft.durationMinutes,
      summary: draft.summary,
      nextAction: draft.nextAction,
      nextActionDate: draft.nextActionDate,
      cancelledAt: null,
    };
  }

  /** Columnas que cambian respecto a lo guardado (la edición sin cambios no escribe). */
  private changedFields(before: ActivityRecord, final: ActivityDraft, statusId: string): Partial<ActivityFields> {
    const current = draftFromRecord(before);
    const patch: Record<string, unknown> = {};
    const scalar: (keyof ActivityDraft & keyof ActivityFields)[] = [
      'typeId',
      'subject',
      'description',
      'customerId',
      'projectId',
      'opportunityId',
      'ownerId',
      'priorityId',
      'durationMinutes',
      'summary',
      'resultId',
      'resultNotes',
      'nextAction',
    ];
    for (const field of scalar) {
      if (final[field] !== current[field]) patch[field] = final[field];
    }
    for (const field of ['scheduledAt', 'dueAt', 'nextActionDate'] as const) {
      if (!sameInstant(final[field], current[field])) patch[field] = final[field];
    }
    if (statusId !== before.status.id) patch['statusId'] = statusId;
    return patch as Partial<ActivityFields>;
  }
}

