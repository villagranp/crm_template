import { Inject, Injectable } from '@nestjs/common';

import { AccessDeniedError, PermissionDeniedError } from '@/common/errors/application-error';
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

import { isUnregisteredVisit } from './agenda-status';
import type { CatalogStateItem } from './catalog-state';
import {
  type CommercialActor,
  CommercialActorResolver,
  commercialAccessFor,
  inScope,
  userScopeFrom,
  type VisitAccessScopes,
} from './commercial-actor.resolver';
import { LinkedProjectsService } from './linked-projects.service';
import {
  COMMERCIAL_ERROR_CODES,
  commercialIssue,
  concurrentChangeConflict,
  issueError,
  issuesError,
  lifecycleConflict,
  readOnlyConflict,
  scheduleConflictError,
  visitConfirmationOwnerOnlyError,
  visitEventNotFound,
  visitNotFound,
} from './commercial-activity-errors';
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
import type { ParticipantRole, ParticipantWrite } from './ports/activity.repository.port';
import { COMMERCIAL_LINK_READER, type CommercialLinkReader } from './ports/commercial-link.reader.port';
import { COMMERCIAL_USERS_READER, type CommercialUsersReader } from './ports/commercial-users.reader.port';
import type { CommercialAccess } from './ports/commercial-visibility';
import {
  type ScheduleCandidateRecord,
  VISIT_REPOSITORY,
  type VisitEventRecord,
  type VisitEventRef,
  type VisitEventWrite,
  type VisitListRecord,
  type VisitPatch,
  type VisitRecord,
  type VisitRepository,
  type VisitSortField,
  type VisitWriteCondition,
} from './ports/visit.repository.port';
import {
  effectiveEnd,
  findScheduleConflicts,
  type ScheduleConflictMode,
  scheduleConflictDecision,
} from './schedule-conflict';
import {
  administersVisit,
  allowedVisitActions,
  canAssignVisitOwner,
  VISIT_PERMISSIONS,
  visitOperationDenial,
  type VisitPolicySubject,
} from './visit-access-policy';
import { VISIT_AUDIT_EVENTS, VISIT_AUDIT_RESOURCE, VISIT_MASKED_FIELDS, visitAuditState } from './visit-audit';
import {
  pickVisitStatus,
  type VisitOperation,
  type VisitStatusGroup,
  visitStateViolation,
  visitStatusGroup,
  visitStatusSemantics,
  type VisitStatusTarget,
} from './visit-lifecycle';

// ---------------------------------------------------------------------------
// Contratos de entrada (los DTO del controlador encajan por estructura)
// ---------------------------------------------------------------------------

export interface CreateVisitRequest {
  readonly customerId: string;
  readonly projectId?: string | null;
  readonly ownerId?: string;
  readonly scheduledStartAt: string;
  readonly scheduledEndAt?: string | null;
  readonly objective: string;
  readonly location?: string | null;
  readonly reminderMinutesBefore?: number | null;
  readonly participants?: readonly ParticipantInput[];
}

/** Campo omitido = sin cambio; `null` = quitar. `scheduledStartAt` → `422 USE_RESCHEDULE` (RN-04.15). */
export interface UpdateVisitRequest {
  readonly projectId?: string | null;
  readonly ownerId?: string;
  readonly scheduledStartAt?: string | null;
  readonly scheduledEndAt?: string | null;
  readonly objective?: string;
  readonly location?: string | null;
  readonly reminderMinutesBefore?: number | null;
  readonly participants?: readonly ParticipantInput[];
}

/** Datos de la realización (RN-04.16). En la corrección (`PUT`) sustituyen a los guardados. */
export interface VisitCompletionRequest {
  readonly actualStartAt: string;
  readonly actualEndAt?: string | null;
  readonly attendees?: readonly ParticipantInput[];
  readonly topics?: string | null;
  readonly agreements?: string | null;
  readonly resultId?: string | null;
  readonly resultSummary?: string | null;
  readonly comments?: string | null;
  readonly nextAction?: string | null;
  readonly nextActionDate?: string | null;
}

export interface VisitConfirmationRequest {
  readonly confirmationSummary?: string | null;
}

export interface VisitReschedulingRequest {
  readonly newScheduledStartAt: string;
  readonly newScheduledEndAt?: string | null;
  readonly reasonId?: string | null;
  readonly reasonText?: string | null;
  readonly comment?: string | null;
}

export interface VisitCancellationRequest {
  readonly reasonId?: string | null;
  readonly reasonText?: string | null;
  readonly comment?: string | null;
}

export interface ListVisitsRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: VisitSortField;
  readonly sortOrder: 'asc' | 'desc';
  readonly search?: string;
  readonly from?: string;
  readonly to?: string;
  readonly statusId?: readonly string[];
  readonly statusGroup?: readonly VisitStatusGroup[];
  readonly ownerId?: readonly string[];
  readonly customerId?: string;
  readonly projectId?: string;
  readonly countryId?: string;
  readonly unregistered?: boolean;
  readonly pendingConfirmation?: boolean;
}

export interface ScheduleConflictsRequest {
  readonly ownerId?: string;
  readonly start: string;
  readonly end?: string;
  readonly excludeVisitId?: string;
}

// ---------------------------------------------------------------------------
// Vistas que el controlador traduce a DTO
// ---------------------------------------------------------------------------

/** Solape (RN-04.14). Una visita que el actor no ve se informa sin identificador ni cliente (F.1). */
export interface ScheduleConflictView {
  readonly visitId: string | null;
  readonly code: string | null;
  readonly scheduledStartAt: Date;
  readonly effectiveEndAt: Date;
  readonly customerName: string | null;
  readonly isVisible: boolean;
}

export interface VisitDerived {
  readonly access: CommercialAccess;
  readonly allowedActions: readonly VisitOperation[];
  readonly group: VisitStatusGroup;
  /** Estado con `isRescheduled` (D-04.3). */
  readonly isRescheduled: boolean;
  /** Fin planificado o inicio + duración por defecto (RN-04.13; no se guarda). */
  readonly effectiveEndAt: Date;
  /** "Sin registrar" (RN-04.22, D-04.16). */
  readonly isUnregistered: boolean;
}

export interface VisitView extends VisitDerived {
  readonly record: VisitRecord;
  /** Nombres de contactos participantes solo con `contactos.ver` (02 H.5). */
  readonly canSeeContacts: boolean;
  readonly scheduleConflicts: readonly ScheduleConflictView[] | null;
}

export interface VisitListItemView extends VisitDerived {
  readonly record: VisitListRecord;
}

export interface CatalogOptionView {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly sortOrder: number;
}

export interface VisitFormOptions {
  readonly statuses: readonly (CatalogOptionView & { readonly group: VisitStatusGroup; readonly isRescheduled: boolean })[];
  readonly rescheduleReasons: readonly CatalogOptionView[];
  readonly cancellationReasons: readonly CatalogOptionView[];
  readonly results: readonly CatalogOptionView[];
  readonly conflictMode: ScheduleConflictMode;
  readonly defaultDurationMinutes: number;
  readonly requiredFields: readonly string[];
  readonly completionRequiredFields: readonly string[];
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const VISIT_CATALOGS = {
  status: 'crm.estado_visita',
  rescheduleReason: 'crm.motivo_reprogramacion',
  cancellationReason: 'crm.motivo_cancelacion',
  result: 'crm.resultado_interaccion',
} as const;

const PARAMETERS = {
  requiredFields: 'crm.campos_obligatorios',
  timeZone: 'crm.zona_horaria_negocio',
  conflictMode: 'crm.visitas.validar_conflicto_horario',
  defaultDuration: 'crm.visitas.duracion_por_defecto_minutos',
} as const;

const CONTACT_VIEW_PERMISSION = 'contactos.ver';
const VISIT_SEQUENCE = 'crm.visita';
const BASE_REQUIRED = REQUIRED_FIELDS_WHITELIST['visit']?.base ?? ['customerId', 'scheduledStartAt', 'ownerId', 'objective'];
const COMPLETION_BASE_REQUIRED = REQUIRED_FIELDS_WHITELIST['visitCompletion']?.base ?? ['actualStartAt'];
const MINUTE_MS = 60_000;
/** Ventana para adjuntar a un evento ya ocurrido (D-04.18). */
export const EVENT_ATTACHMENT_WINDOW_MS = 15 * MINUTE_MS;

/** Permisos con los que se ejecutan los eventos: abren la subida a un evento (`@RequireAnyPermission`). */
export const EVENT_ATTACHMENT_PERMISSIONS = [VISIT_PERMISSIONS.edit, VISIT_PERMISSIONS.close] as const;

/**
 * D-04.18: ¿el actor puede adjuntar archivos al evento ahora? Quien lo ejecutó, con
 * uno de los permisos de la subida y dentro de la ventana. La misma regla autoriza la
 * subida (`assertCanAttachToEvent`) y calcula `canAttachFiles` del historial.
 */
export function canAttachToVisitEvent(
  actor: { readonly userId: string | null; readonly permissions: ReadonlySet<string> },
  event: { readonly performedById: string; readonly occurredAt: Date },
  now: Date,
): boolean {
  return (
    actor.userId !== null &&
    event.performedById === actor.userId &&
    EVENT_ATTACHMENT_PERMISSIONS.some((permission) => actor.permissions.has(permission)) &&
    now.getTime() - event.occurredAt.getTime() <= EVENT_ATTACHMENT_WINDOW_MS
  );
}

/** Evento del historial con lo que el actor puede hacer con él. */
export interface VisitEventView extends VisitEventRecord {
  readonly canAttachFiles: boolean;
}

// ---------------------------------------------------------------------------
// Normalización (pura)
// ---------------------------------------------------------------------------

/** Planificación tras aplicar la petición (alta: sobre vacío; edición: sobre lo guardado). */
interface PlanningDraft {
  readonly customerId: string;
  readonly projectId: string | null;
  readonly ownerId: string;
  readonly scheduledStartAt: Date;
  readonly scheduledEndAt: Date | null;
  readonly objective: string;
  readonly location: string | null;
  readonly reminderMinutesBefore: number | null;
  readonly participants: readonly NormalizedParticipant[];
}

/** Realización normalizada (POST y PUT de `…/completion`). */
interface CompletionDraft {
  readonly actualStartAt: Date;
  readonly actualEndAt: Date | null;
  readonly topics: string | null;
  readonly agreements: string | null;
  readonly resultId: string | null;
  readonly resultSummary: string | null;
  readonly comments: string | null;
  readonly nextAction: string | null;
  readonly nextActionDate: Date | null;
  readonly attendees: readonly NormalizedParticipant[];
}

interface VisitSettings {
  readonly requiredFields: string[];
  readonly completionRequiredFields: string[];
  readonly timeZone: string;
  readonly conflictMode: ScheduleConflictMode;
  readonly defaultDurationMinutes: number;
}

function participantsOf(record: VisitRecord, role: ParticipantRole): NormalizedParticipant[] {
  return record.participants
    .filter((participant) => participant.role === role)
    .map((participant) => ({ contactId: participant.contactId, userId: participant.userId, externalName: participant.externalName }));
}

function planningFromRecord(record: VisitRecord): PlanningDraft {
  return {
    customerId: record.customer.id,
    projectId: record.project?.id ?? null,
    ownerId: record.owner.id,
    scheduledStartAt: record.scheduledStartAt,
    scheduledEndAt: record.scheduledEndAt,
    objective: record.objective,
    location: record.location,
    reminderMinutesBefore: record.reminderMinutesBefore,
    participants: participantsOf(record, 'INVITED'),
  };
}

function completionFromRecord(record: VisitRecord): CompletionDraft {
  return {
    actualStartAt: record.actualStartAt ?? record.scheduledStartAt,
    actualEndAt: record.actualEndAt,
    topics: record.topics,
    agreements: record.agreements,
    resultId: record.result?.id ?? null,
    resultSummary: record.resultSummary,
    comments: record.comments,
    nextAction: record.nextAction,
    nextActionDate: record.nextActionDate,
    attendees: participantsOf(record, 'ATTENDED'),
  };
}

function completionFromRequest(request: VisitCompletionRequest): CompletionDraft {
  return {
    actualStartAt: new Date(request.actualStartAt),
    actualEndAt: instant(request.actualEndAt),
    topics: text(request.topics),
    agreements: text(request.agreements),
    resultId: request.resultId ?? null,
    resultSummary: text(request.resultSummary),
    comments: text(request.comments),
    nextAction: text(request.nextAction),
    nextActionDate: calendarDate(request.nextActionDate),
    attendees: normalizeParticipants(request.attendees ?? []),
  };
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function toStateItem(item: CatalogItemRecord): CatalogStateItem {
  return { id: item.id, code: item.code, isActive: item.isActive, sortOrder: item.sortOrder, metadata: item.metadata };
}

/**
 * Casos de uso de visitas (04 F.1, RN-04.1–RN-04.22, DM-20): listado, detalle,
 * historial, conflictos, planificar, editar la planificación, registrar y corregir
 * la realización, confirmar, reprogramar y cancelar. No hay eliminación (RN-04.20).
 *
 * Orden de las comprobaciones: visibilidad (`404`) → permisos y propiedad (`403`) →
 * estado (`409`) → reglas de negocio (`422`). Alcances, parámetros y catálogos se leen
 * **antes** de abrir la transacción; dentro van las guardas de referencia, el bloqueo
 * de la agenda del responsable y la evaluación de conflictos (RN-04.14), el folio y
 * las escrituras, condicionadas al estado leído (RN-04.12). La auditoría se escribe
 * después (patrón vigente, AuditService).
 */
@Injectable()
export class VisitsService {
  constructor(
    @Inject(VISIT_REPOSITORY) private readonly visits: VisitRepository,
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

  async list(actor: CommercialActor, request: ListVisitsRequest): Promise<Page<VisitListItemView>> {
    const [scopes, settings] = await Promise.all([this.actors.visitScopes(actor), this.settings()]);
    const now = new Date();
    const search = request.search?.trim() || null;
    const page = await this.visits.search(
      {
        page: request.page,
        pageSize: request.pageSize,
        sortBy: request.sortBy ?? 'scheduledStartAt',
        sortOrder: request.sortOrder,
        from: instant(request.from),
        to: instant(request.to),
        statusIds: request.statusId ?? [],
        statusGroups: request.statusGroup ?? [],
        ownerIds: request.ownerId ?? [],
        customerId: request.customerId ?? null,
        projectId: request.projectId ?? null,
        countryId: request.countryId ?? null,
        unregisteredAt: request.unregistered ? now : null,
        pendingConfirmation: request.pendingConfirmation === true,
        searchCodePrefix: search,
        searchTerms: searchTerms(search),
      },
      scopes.visibility,
    );
    return {
      ...page,
      items: page.items.map((record) => ({ record, ...this.derived(actor, scopes, record, settings.defaultDurationMinutes, now) })),
    };
  }

  async findById(actor: CommercialActor, visitId: string): Promise<VisitView> {
    const [scopes, settings] = await Promise.all([this.actors.visitScopes(actor), this.settings()]);
    const record = await this.findVisible(visitId, scopes);
    return this.view(actor, scopes, record, settings, null);
  }

  /** Historial de la visita en orden cronológico (AC-04.20); hereda su visibilidad. */
  async listEvents(actor: CommercialActor, visitId: string, now: Date = new Date()): Promise<VisitEventView[]> {
    const scopes = await this.actors.visitScopes(actor);
    await this.findVisible(visitId, scopes);
    const events = await this.visits.listEvents(visitId);
    return events.map((event) => ({
      ...event,
      canAttachFiles: canAttachToVisitEvent(actor, { performedById: event.performedBy.id, occurredAt: event.occurredAt }, now),
    }));
  }

  async formOptions(): Promise<VisitFormOptions> {
    const [statuses, rescheduleReasons, cancellationReasons, results, settings] = await Promise.all([
      this.catalogItems(VISIT_CATALOGS.status),
      this.catalogItems(VISIT_CATALOGS.rescheduleReason),
      this.catalogItems(VISIT_CATALOGS.cancellationReason),
      this.catalogItems(VISIT_CATALOGS.result),
      this.settings(),
    ]);
    const active = (items: readonly CatalogItemRecord[]): CatalogItemRecord[] => items.filter((item) => item.isActive);
    const option = (item: CatalogItemRecord): CatalogOptionView => ({ id: item.id, code: item.code, label: item.label, sortOrder: item.sortOrder });
    return {
      statuses: active(statuses).map((item) => {
        const semantics = visitStatusSemantics(item.metadata);
        return { ...option(item), group: visitStatusGroup(semantics), isRescheduled: semantics.isRescheduled };
      }),
      rescheduleReasons: active(rescheduleReasons).map(option),
      cancellationReasons: active(cancellationReasons).map(option),
      results: active(results).map(option),
      conflictMode: settings.conflictMode,
      defaultDurationMinutes: settings.defaultDurationMinutes,
      requiredFields: settings.requiredFields,
      completionRequiredFields: settings.completionRequiredFields,
    };
  }

  /**
   * `GET /visits/schedule-conflicts` (RN-04.14, F.1). Otro responsable exige
   * `visitas.administrar` (`403`) y que sea asignable por el actor (`422
   * OWNER_NOT_ELIGIBLE`, como al planificar): no se consulta la agenda de quien no se
   * podría asignar. Las visitas que el actor no ve se devuelven sin datos.
   */
  async scheduleConflicts(
    actor: CommercialActor,
    request: ScheduleConflictsRequest,
  ): Promise<{ mode: ScheduleConflictMode; conflicts: ScheduleConflictView[] }> {
    const actorId = actor.userId;
    if (!actorId) throw new PermissionDeniedError(VISIT_PERMISSIONS.view);
    const ownerId = request.ownerId ?? actorId;
    if (!canAssignVisitOwner(actor, ownerId)) throw new PermissionDeniedError(VISIT_PERMISSIONS.administer);
    const start = new Date(request.start);
    const end = instant(request.end);
    if (end && end.getTime() < start.getTime()) throw issueError('end', COMMERCIAL_ERROR_CODES.invalidDateRange);

    const [scopes, settings] = await Promise.all([this.actors.visitScopes(actor), this.settings()]);
    if (ownerId !== actorId) await this.assertEligibleOwner(ownerId, scopes);
    const conflicts = await this.findConflicts(
      settings,
      { ownerId, start, end, excludeVisitId: request.excludeVisitId ?? null },
      scopes,
    );
    return { mode: settings.conflictMode, conflicts };
  }

  // -------------------------------------------------------------------------
  // Planificar (RN-04.13, RN-04.14)
  // -------------------------------------------------------------------------

  async create(actor: CommercialActor, request: CreateVisitRequest): Promise<VisitView> {
    const actorId = actor.userId;
    if (!actorId) throw new PermissionDeniedError(VISIT_PERMISSIONS.create);
    const ownerId = request.ownerId ?? actorId;
    if (!canAssignVisitOwner(actor, ownerId)) throw new PermissionDeniedError(VISIT_PERMISSIONS.administer);

    const draft: PlanningDraft = {
      customerId: request.customerId,
      projectId: request.projectId ?? null,
      ownerId,
      scheduledStartAt: new Date(request.scheduledStartAt),
      scheduledEndAt: instant(request.scheduledEndAt),
      objective: request.objective.trim(),
      location: text(request.location),
      reminderMinutesBefore: request.reminderMinutesBefore ?? null,
      participants: normalizeParticipants(request.participants ?? []),
    };
    this.assertScheduledRange(draft.scheduledStartAt, draft.scheduledEndAt, 'scheduledEndAt');

    // Alcances sobre clientes antes de la transacción (la guarda de 02 no abre otra conexión, AGENTS §9.4).
    const [scopes, customerScopes, settings, statuses] = await Promise.all([
      this.actors.visitScopes(actor),
      this.customers.accessScopes(actor),
      this.settings(),
      this.catalogItems(VISIT_CATALOGS.status),
    ]);
    this.assertRequiredFields(settings.requiredFields, draft as unknown as Record<string, unknown>, null);
    const statusId = this.requireStatus(statuses, 'INITIAL');
    const now = new Date();

    const { visitId, conflicts } = await this.transactions.run(async (tx) => {
      await this.customers.assertUsableCustomer(draft.customerId, actor, { requireActive: true, tx, scopes: customerScopes });
      if (ownerId !== actorId) await this.assertEligibleOwner(ownerId, scopes, tx);
      // Bloqueo del proyecto ANTES de validarlo: una eliminación concurrente espera o ya se ve (RN-04.2).
      await this.linkedProjects.lock(draft.projectId ? [draft.projectId] : [], tx);
      await assertProjectLink(this.links, draft, null, scopes.projects, tx);
      const invitees = await this.validateParticipantList(draft.participants, draft.customerId, null, 'INVITED', 'participants', tx);
      const found = await this.guardSchedule(settings, { ownerId, start: draft.scheduledStartAt, end: draft.scheduledEndAt, excludeVisitId: null }, scopes, tx);

      const code = await this.sequences.next(VISIT_SEQUENCE, tx, { timeZone: settings.timeZone });
      const id = await this.visits.create(
        {
          code,
          fields: {
            customerId: draft.customerId,
            projectId: draft.projectId,
            ownerId,
            statusId,
            scheduledStartAt: draft.scheduledStartAt,
            scheduledEndAt: draft.scheduledEndAt,
            objective: draft.objective,
            location: draft.location,
            reminderMinutesBefore: draft.reminderMinutesBefore,
          },
          createdById: actorId,
          participants: invitees,
          plannedEvent: this.event('PLANNED', null, statusId, actorId, now),
        },
        tx,
      );
      if (draft.projectId) await this.linkedProjects.touch([draft.projectId], now, tx);
      return { visitId: id, conflicts: found };
    });

    const created = await this.requireRecord(visitId);
    this.logger.info('visit.planned', { correlationId: actor.audit.correlationId, visitId, actorId });
    this.logConflictWarning(actor, visitId, conflicts);
    await this.audit.record(VISIT_AUDIT_EVENTS.created, actor.audit, {
      resourceType: VISIT_AUDIT_RESOURCE,
      resourceId: visitId,
      before: null,
      after: visitAuditState(created),
      maskedFields: VISIT_MASKED_FIELDS,
      metadata: { code: created.code, scheduleConflicts: conflicts.length },
    });
    return this.view(actor, scopes, created, settings, conflicts);
  }

  // -------------------------------------------------------------------------
  // Editar la planificación (RN-04.15)
  // -------------------------------------------------------------------------

  async update(actor: CommercialActor, visitId: string, request: UpdateVisitRequest): Promise<VisitView> {
    const [scopes, settings] = await Promise.all([this.actors.visitScopes(actor), this.settings()]);
    const before = await this.findVisible(visitId, scopes);
    const subject = this.subject(before, scopes);
    this.assertPermitted(actor, subject, 'EDIT');
    this.assertState(before, subject, 'EDIT');
    if (request.scheduledStartAt !== undefined) throw issueError('scheduledStartAt', COMMERCIAL_ERROR_CODES.useReschedule);

    const current = planningFromRecord(before);
    const final: PlanningDraft = {
      ...current,
      projectId: request.projectId === undefined ? current.projectId : request.projectId,
      ownerId: request.ownerId ?? current.ownerId,
      scheduledEndAt: request.scheduledEndAt === undefined ? current.scheduledEndAt : instant(request.scheduledEndAt),
      objective: request.objective === undefined ? current.objective : request.objective.trim(),
      location: request.location === undefined ? current.location : text(request.location),
      reminderMinutesBefore: request.reminderMinutesBefore === undefined ? current.reminderMinutesBefore : request.reminderMinutesBefore,
      participants: request.participants === undefined ? current.participants : normalizeParticipants(request.participants),
    };
    const ownerChanged = final.ownerId !== current.ownerId;
    if (ownerChanged && !administersVisit(actor, subject)) throw new PermissionDeniedError(VISIT_PERMISSIONS.administer);
    this.assertScheduledRange(final.scheduledStartAt, final.scheduledEndAt, 'scheduledEndAt');
    const sentFields = new Set(Object.keys(request).filter((key) => (request as Record<string, unknown>)[key] !== undefined));
    this.assertRequiredFields(settings.requiredFields, final as unknown as Record<string, unknown>, sentFields);

    const patch = this.changedPlanning(current, final);
    const participantsChanged = request.participants !== undefined && !sameParticipants(current.participants, final.participants);
    if (Object.keys(patch).length === 0 && !participantsChanged) {
      // Edición sin cambios: no se escribe ni se audita (como RN-02.31).
      return this.view(actor, scopes, before, settings, null);
    }
    // RN-04.14: reasignar responsable o cambiar el fin cambia el intervalo ocupado.
    const scheduleChanged = ownerChanged || !sameInstant(final.scheduledEndAt, current.scheduledEndAt);

    const now = new Date();
    const projectIds = [current.projectId, final.projectId].filter((id): id is string => id !== null);
    const conflicts = await this.transactions.run(async (tx) => {
      if (ownerChanged) await this.assertEligibleOwner(final.ownerId, scopes, tx);
      // Bloqueo de los proyectos ANTES de validar el vínculo (RN-04.2, AGENTS §9.4).
      await this.linkedProjects.lock(projectIds, tx);
      await assertProjectLink(this.links, final, current, scopes.projects, tx);
      const invitees = participantsChanged
        ? await this.validateParticipantList(final.participants, final.customerId, current, 'INVITED', 'participants', tx)
        : [];
      const found = scheduleChanged
        ? await this.guardSchedule(settings, { ownerId: final.ownerId, start: final.scheduledStartAt, end: final.scheduledEndAt, excludeVisitId: visitId }, scopes, tx)
        : [];
      await this.write(before, { ...patch, updatedById: actor.userId }, tx);
      if (participantsChanged) await this.visits.replaceParticipants(visitId, final.customerId, 'INVITED', invitees, actor.userId, tx);
      await this.linkedProjects.touch(projectIds, now, tx);
      return found;
    });

    const after = await this.requireRecord(visitId);
    this.logger.info('visit.updated', {
      correlationId: actor.audit.correlationId,
      visitId,
      actorId: actor.userId,
      fields: [...Object.keys(patch), ...(participantsChanged ? ['participants'] : [])],
    });
    this.logConflictWarning(actor, visitId, conflicts);
    await this.audit.record(VISIT_AUDIT_EVENTS.updated, actor.audit, {
      resourceType: VISIT_AUDIT_RESOURCE,
      resourceId: visitId,
      before: visitAuditState(before),
      after: visitAuditState(after),
      maskedFields: VISIT_MASKED_FIELDS,
    });
    return this.view(actor, scopes, after, settings, scheduleChanged ? conflicts : null);
  }

  // -------------------------------------------------------------------------
  // Registrar y corregir la realización (RN-04.16, RN-04.17)
  // -------------------------------------------------------------------------

  async complete(actor: CommercialActor, visitId: string, request: VisitCompletionRequest): Promise<VisitView> {
    return this.recordCompletion(actor, visitId, request, 'COMPLETE');
  }

  async correctCompletion(actor: CommercialActor, visitId: string, request: VisitCompletionRequest): Promise<VisitView> {
    return this.recordCompletion(actor, visitId, request, 'CORRECT_COMPLETION');
  }

  private async recordCompletion(
    actor: CommercialActor,
    visitId: string,
    request: VisitCompletionRequest,
    operation: 'COMPLETE' | 'CORRECT_COMPLETION',
  ): Promise<VisitView> {
    const [scopes, settings] = await Promise.all([this.actors.visitScopes(actor), this.settings()]);
    const before = await this.findVisible(visitId, scopes);
    const subject = this.subject(before, scopes);
    this.assertPermitted(actor, subject, operation);
    this.assertState(before, subject, operation);

    const now = new Date();
    const draft = completionFromRequest(request);
    this.assertCompletionDates(draft, now);
    this.assertRequiredFields(settings.completionRequiredFields, this.completionValues(draft), null);

    const isCorrection = operation === 'CORRECT_COMPLETION';
    const current = isCorrection ? completionFromRecord(before) : null;
    const patch = this.changedCompletion(current, draft);
    const attendeesChanged = !sameParticipants(participantsOf(before, 'ATTENDED'), draft.attendees);
    if (isCorrection && Object.keys(patch).length === 0 && !attendeesChanged) {
      return this.view(actor, scopes, before, settings, null);
    }

    const doneStatusId = isCorrection ? before.status.id : this.requireStatus(await this.catalogItems(VISIT_CATALOGS.status), 'DONE');
    const projectIds = before.project ? [before.project.id] : [];
    await this.transactions.run(async (tx) => {
      if (draft.resultId && draft.resultId !== (current?.resultId ?? null)) {
        await this.catalogReferences.assertItem(VISIT_CATALOGS.result, draft.resultId, {
          field: 'resultId',
          requireActive: true,
          currentId: current?.resultId ?? null,
          tx,
        });
      }
      const attendees = attendeesChanged
        ? await this.validateParticipantList(draft.attendees, before.customer.id, { customerId: before.customer.id, participants: participantsOf(before, 'ATTENDED') }, 'ATTENDED', 'attendees', tx)
        : [];
      await this.linkedProjects.lock(projectIds, tx);
      const statusPatch: VisitPatch = isCorrection
        ? { updatedById: actor.userId }
        : { statusId: doneStatusId, completionRecordedById: actor.userId, completionRecordedAt: now, updatedById: actor.userId };
      await this.write(before, { ...patch, ...statusPatch }, tx);
      if (attendeesChanged) await this.visits.replaceParticipants(visitId, before.customer.id, 'ATTENDED', attendees, actor.userId, tx);
      if (!isCorrection) {
        await this.visits.insertEvent(visitId, this.event('COMPLETED', before.status.id, doneStatusId, actor.userId ?? '', now), tx);
      }
      await this.linkedProjects.touch(projectIds, now, tx);
    });

    const after = await this.requireRecord(visitId);
    this.logger.info(isCorrection ? 'visit.completion_corrected' : 'visit.completed', { correlationId: actor.audit.correlationId, visitId, actorId: actor.userId });
    await this.audit.record(isCorrection ? VISIT_AUDIT_EVENTS.completionCorrected : VISIT_AUDIT_EVENTS.completed, actor.audit, {
      resourceType: VISIT_AUDIT_RESOURCE,
      resourceId: visitId,
      before: visitAuditState(before),
      after: visitAuditState(after),
      maskedFields: VISIT_MASKED_FIELDS,
    });
    return this.view(actor, scopes, after, settings, null);
  }

  // -------------------------------------------------------------------------
  // Confirmar (RN-04.18, DM-20)
  // -------------------------------------------------------------------------

  /**
   * Orden de RN-04.18: fuera del alcance → `404`; sin `visitas.cerrar` → `403
   * PERMISSION_DENIED`; no dueño → `403 VISIT_CONFIRMATION_OWNER_ONLY`; estado → `409`;
   * sin resumen → `422 CONFIRMATION_SUMMARY_REQUIRED`.
   */
  async confirm(actor: CommercialActor, visitId: string, request: VisitConfirmationRequest): Promise<VisitView> {
    const [scopes, settings] = await Promise.all([this.actors.visitScopes(actor), this.settings()]);
    const before = await this.findVisible(visitId, scopes);
    const subject = this.subject(before, scopes);
    this.assertPermitted(actor, subject, 'CONFIRM');
    this.assertState(before, subject, 'CONFIRM');
    const summary = text(request.confirmationSummary);
    if (!summary && !before.resultSummary && !before.comments) {
      throw issueError('confirmationSummary', COMMERCIAL_ERROR_CODES.confirmationSummaryRequired);
    }
    const ownerId = before.owner.id;
    const confirmedStatusId = this.requireStatus(await this.catalogItems(VISIT_CATALOGS.status), 'CONFIRMED');
    const now = new Date();
    const projectIds = before.project ? [before.project.id] : [];

    await this.transactions.run(async (tx) => {
      await this.linkedProjects.lock(projectIds, tx);
      await this.write(
        before,
        { statusId: confirmedStatusId, confirmedAt: now, confirmedById: ownerId, confirmationSummary: summary, updatedById: actor.userId },
        tx,
        { requiresSummary: summary === null },
      );
      await this.visits.insertEvent(visitId, this.event('CONFIRMED', before.status.id, confirmedStatusId, ownerId, now), tx);
      await this.linkedProjects.touch(projectIds, now, tx);
    });

    const after = await this.requireRecord(visitId);
    this.logger.info('visit.confirmed', { correlationId: actor.audit.correlationId, visitId, actorId: actor.userId });
    await this.audit.record(VISIT_AUDIT_EVENTS.confirmed, actor.audit, {
      resourceType: VISIT_AUDIT_RESOURCE,
      resourceId: visitId,
      before: visitAuditState(before),
      after: visitAuditState(after),
      maskedFields: VISIT_MASKED_FIELDS,
    });
    return this.view(actor, scopes, after, settings, null);
  }

  // -------------------------------------------------------------------------
  // Reprogramar y cancelar (RN-04.19, RN-04.20)
  // -------------------------------------------------------------------------

  async reschedule(actor: CommercialActor, visitId: string, request: VisitReschedulingRequest): Promise<VisitView> {
    const [scopes, settings] = await Promise.all([this.actors.visitScopes(actor), this.settings()]);
    const before = await this.findVisible(visitId, scopes);
    const subject = this.subject(before, scopes);
    this.assertPermitted(actor, subject, 'RESCHEDULE');
    this.assertState(before, subject, 'RESCHEDULE');

    const now = new Date();
    const newStart = new Date(request.newScheduledStartAt);
    const issues: (FieldIssue & Record<string, unknown>)[] = [];
    if (newStart.getTime() === before.scheduledStartAt.getTime()) {
      issues.push(commercialIssue('newScheduledStartAt', COMMERCIAL_ERROR_CODES.rescheduleSameDate));
    } else if (newStart.getTime() < now.getTime()) {
      issues.push(commercialIssue('newScheduledStartAt', COMMERCIAL_ERROR_CODES.dateInPast));
    }
    if (issues.length > 0) throw issuesError(issues);
    // Sin fin nuevo, se desplaza conservando la duración planificada.
    const newEnd =
      request.newScheduledEndAt !== undefined && request.newScheduledEndAt !== null
        ? new Date(request.newScheduledEndAt)
        : before.scheduledEndAt
          ? new Date(newStart.getTime() + (before.scheduledEndAt.getTime() - before.scheduledStartAt.getTime()))
          : null;
    this.assertScheduledRange(newStart, newEnd, 'newScheduledEndAt');
    const reason = this.reason(request);

    const rescheduledStatusId = this.requireStatus(await this.catalogItems(VISIT_CATALOGS.status), 'RESCHEDULED');
    const projectIds = before.project ? [before.project.id] : [];
    const { conflicts, eventId } = await this.transactions.run(async (tx) => {
      if (reason.reasonId) {
        await this.catalogReferences.assertItem(VISIT_CATALOGS.rescheduleReason, reason.reasonId, { field: 'reasonId', requireActive: true, tx });
      }
      await this.linkedProjects.lock(projectIds, tx);
      const found = await this.guardSchedule(settings, { ownerId: before.owner.id, start: newStart, end: newEnd, excludeVisitId: visitId }, scopes, tx);
      await this.write(
        before,
        {
          statusId: rescheduledStatusId,
          scheduledStartAt: newStart,
          scheduledEndAt: newEnd,
          rescheduleCount: before.rescheduleCount + 1,
          updatedById: actor.userId,
        },
        tx,
      );
      const id = await this.visits.insertEvent(
        visitId,
        {
          ...this.event('RESCHEDULED', before.status.id, rescheduledStatusId, actor.userId ?? '', now),
          previousScheduledStartAt: before.scheduledStartAt,
          newScheduledStartAt: newStart,
          ...reason,
          comment: text(request.comment),
        },
        tx,
      );
      await this.linkedProjects.touch(projectIds, now, tx);
      return { conflicts: found, eventId: id };
    });

    const after = await this.requireRecord(visitId);
    this.logger.info('visit.rescheduled', { correlationId: actor.audit.correlationId, visitId, eventId, actorId: actor.userId });
    this.logConflictWarning(actor, visitId, conflicts);
    await this.audit.record(VISIT_AUDIT_EVENTS.rescheduled, actor.audit, {
      resourceType: VISIT_AUDIT_RESOURCE,
      resourceId: visitId,
      before: { ...visitAuditState(before), eventReasonText: null, eventComment: null },
      after: { ...visitAuditState(after), eventReasonText: reason.reasonText, eventComment: text(request.comment) },
      maskedFields: VISIT_MASKED_FIELDS,
      metadata: { eventId, reasonId: reason.reasonId },
    });
    return this.view(actor, scopes, after, settings, conflicts);
  }

  async cancel(actor: CommercialActor, visitId: string, request: VisitCancellationRequest): Promise<VisitView> {
    const [scopes, settings] = await Promise.all([this.actors.visitScopes(actor), this.settings()]);
    const before = await this.findVisible(visitId, scopes);
    const subject = this.subject(before, scopes);
    this.assertPermitted(actor, subject, 'CANCEL');
    this.assertState(before, subject, 'CANCEL');
    const reason = this.reason(request);
    const cancelledStatusId = this.requireStatus(await this.catalogItems(VISIT_CATALOGS.status), 'CANCELLED');
    const now = new Date();
    const projectIds = before.project ? [before.project.id] : [];

    const eventId = await this.transactions.run(async (tx) => {
      if (reason.reasonId) {
        await this.catalogReferences.assertItem(VISIT_CATALOGS.cancellationReason, reason.reasonId, { field: 'reasonId', requireActive: true, tx });
      }
      await this.linkedProjects.lock(projectIds, tx);
      await this.write(before, { statusId: cancelledStatusId, cancelledAt: now, updatedById: actor.userId }, tx);
      const id = await this.visits.insertEvent(
        visitId,
        { ...this.event('CANCELLED', before.status.id, cancelledStatusId, actor.userId ?? '', now), ...reason, comment: text(request.comment) },
        tx,
      );
      await this.linkedProjects.touch(projectIds, now, tx);
      return id;
    });

    const after = await this.requireRecord(visitId);
    this.logger.info('visit.cancelled', { correlationId: actor.audit.correlationId, visitId, eventId, actorId: actor.userId });
    await this.audit.record(VISIT_AUDIT_EVENTS.cancelled, actor.audit, {
      resourceType: VISIT_AUDIT_RESOURCE,
      resourceId: visitId,
      before: { ...visitAuditState(before), eventReasonText: null, eventComment: null },
      after: { ...visitAuditState(after), eventReasonText: reason.reasonText, eventComment: text(request.comment) },
      maskedFields: VISIT_MASKED_FIELDS,
      metadata: { eventId, reasonId: reason.reasonId },
    });
    return this.view(actor, scopes, after, settings, null);
  }

  // -------------------------------------------------------------------------
  // Adjuntos (04 F.4, DC-2, D-04.18): la autorización es del dueño
  // -------------------------------------------------------------------------

  /** Listar y descargar los de la visita: debe ser visible (`404`). */
  async assertCanViewAttachments(actor: CommercialActor, visitId: string): Promise<void> {
    const scopes = await this.actors.visitScopes(actor);
    await this.findVisible(visitId, scopes);
  }

  /**
   * Subir y eliminar en la visita: poder editarla (`403`) y que no sea terminal: una
   * confirmada o cancelada es de solo lectura (`409 RECORD_READ_ONLY`, RN-04.21, 00 §2.11).
   */
  async assertCanManageAttachments(actor: CommercialActor, visitId: string): Promise<void> {
    const scopes = await this.actors.visitScopes(actor);
    const record = await this.findVisible(visitId, scopes);
    const subject = this.subject(record, scopes);
    this.assertPermitted(actor, subject, 'EDIT');
    if (subject.group === 'CONFIRMED' || subject.group === 'CANCELLED') throw lifecycleConflict('RECORD_READ_ONLY', record.status.code);
  }

  /** Listar y descargar los de un evento: visita visible y evento **de esa visita** (`404`). */
  async findVisibleEvent(actor: CommercialActor, visitId: string, eventId: string): Promise<VisitEventRef> {
    const scopes = await this.actors.visitScopes(actor);
    await this.findVisible(visitId, scopes);
    const event = await this.visits.findEvent(visitId, eventId);
    if (!event) throw visitEventNotFound(eventId);
    return event;
  }

  /**
   * Subir al evento (D-04.18): solo quien lo ejecutó (`403 PERMISSION_DENIED`) y en
   * los 15 minutos siguientes a `occurred_at` (después, `409 RECORD_READ_ONLY`).
   */
  async assertCanAttachToEvent(actor: CommercialActor, visitId: string, eventId: string, now: Date = new Date()): Promise<void> {
    const event = await this.findVisibleEvent(actor, visitId, eventId);
    if (actor.userId === null || event.performedById !== actor.userId) {
      throw new AccessDeniedError('PERMISSION_DENIED', 'Only the user who performed the event can attach files to it', [
        { field: 'eventId', reason: 'NOT_EVENT_PERFORMER' },
      ]);
    }
    if (now.getTime() - event.occurredAt.getTime() > EVENT_ATTACHMENT_WINDOW_MS) throw readOnlyConflict('EVENT_ATTACHMENT_WINDOW_EXPIRED');
  }

  // -------------------------------------------------------------------------
  // Piezas internas
  // -------------------------------------------------------------------------

  /** Escritura condicionada a lo leído (RN-04.12); si otro usuario cambió la visita → `409`. */
  private async write(before: VisitRecord, patch: VisitPatch, tx: TransactionContext, extra: Partial<VisitWriteCondition> = {}): Promise<void> {
    const condition: VisitWriteCondition = { statusId: before.status.id, rescheduleCount: before.rescheduleCount, ...extra };
    if (!(await this.visits.update(before.id, condition, patch, tx))) throw concurrentChangeConflict();
  }

  private event(type: VisitEventWrite['eventType'], fromStatusId: string | null, toStatusId: string, performedById: string, at: Date): VisitEventWrite {
    return {
      eventType: type,
      fromStatusId,
      toStatusId,
      previousScheduledStartAt: null,
      newScheduledStartAt: null,
      reasonId: null,
      reasonText: null,
      comment: null,
      performedById,
      occurredAt: at,
    };
  }

  /** Motivo de catálogo o texto (al menos uno, `422 REASON_REQUIRED`, `ck_visit_events_reason`). */
  private reason(request: { reasonId?: string | null; reasonText?: string | null }): { reasonId: string | null; reasonText: string | null } {
    const reasonId = request.reasonId ?? null;
    const reasonText = text(request.reasonText);
    if (!reasonId && !reasonText) throw issueError('reasonId', COMMERCIAL_ERROR_CODES.reasonRequired);
    return { reasonId, reasonText };
  }

  /**
   * RN-04.14: evalúa los solapes del responsable. Dentro de una transacción toma
   * antes el bloqueo de su agenda para que dos planificaciones simultáneas no se
   * ignoren entre sí. Con `BLOQUEAR` y algún solape → `409 SCHEDULE_CONFLICT`.
   */
  private async guardSchedule(
    settings: VisitSettings,
    candidate: { ownerId: string; start: Date; end: Date | null; excludeVisitId: string | null },
    scopes: VisitAccessScopes,
    tx: TransactionContext,
  ): Promise<ScheduleConflictView[]> {
    if (!scheduleConflictDecision(settings.conflictMode, 0).evaluate) return [];
    await this.visits.lockOwnerSchedules([candidate.ownerId], tx);
    const conflicts = await this.findConflicts(settings, candidate, scopes, tx);
    if (scheduleConflictDecision(settings.conflictMode, conflicts.length).block) {
      throw scheduleConflictError(
        conflicts.map((conflict) => ({
          visitId: conflict.visitId,
          code: conflict.code,
          scheduledStartAt: conflict.scheduledStartAt.toISOString(),
          effectiveEndAt: conflict.effectiveEndAt.toISOString(),
        })),
      );
    }
    return conflicts;
  }

  private async findConflicts(
    settings: VisitSettings,
    candidate: { ownerId: string; start: Date; end: Date | null; excludeVisitId: string | null },
    scopes: VisitAccessScopes,
    tx?: TransactionContext,
  ): Promise<ScheduleConflictView[]> {
    if (!scheduleConflictDecision(settings.conflictMode, 0).evaluate) return [];
    const duration = settings.defaultDurationMinutes;
    const rows = await this.visits.findScheduleCandidates(
      {
        ownerId: candidate.ownerId,
        start: candidate.start,
        end: effectiveEnd(candidate.start, candidate.end, duration),
        excludeVisitId: candidate.excludeVisitId,
        defaultDurationMinutes: duration,
      },
      scopes.visibility,
      tx,
    );
    const toView = (row: ScheduleCandidateRecord): ScheduleConflictView => ({
      visitId: row.isVisible ? row.id : null,
      code: row.isVisible ? row.code : null,
      scheduledStartAt: row.scheduledStartAt,
      effectiveEndAt: effectiveEnd(row.scheduledStartAt, row.scheduledEndAt, duration),
      customerName: row.isVisible ? row.customerName : null,
      isVisible: row.isVisible,
    });
    return findScheduleConflicts(candidate, rows, duration).map(toView);
  }

  private logConflictWarning(actor: CommercialActor, visitId: string, conflicts: readonly ScheduleConflictView[]): void {
    if (conflicts.length === 0) return;
    this.logger.info('visit.schedule_conflict_warned', {
      correlationId: actor.audit.correlationId,
      visitId,
      conflictingVisitIds: conflicts.map((conflict) => conflict.visitId).filter((id): id is string => id !== null),
      hiddenConflicts: conflicts.filter((conflict) => !conflict.isVisible).length,
    });
  }

  private async findVisible(visitId: string, scopes: VisitAccessScopes): Promise<VisitRecord> {
    const record = await this.visits.findById(visitId, scopes.visibility);
    if (!record) throw visitNotFound(visitId);
    return record;
  }

  private async requireRecord(visitId: string): Promise<VisitRecord> {
    const record = await this.visits.findById(visitId, null);
    if (!record) throw visitNotFound(visitId);
    return record;
  }

  private subject(record: { owner: { id: string }; customer: { countryId: string }; status: VisitRecord['status'] }, scopes: VisitAccessScopes): VisitPolicySubject {
    const ref = { ownerId: record.owner.id, customerCountryId: record.customer.countryId };
    return {
      ownerId: record.owner.id,
      access: commercialAccessFor(scopes.visibility, ref),
      group: visitStatusGroup(visitStatusSemantics(record.status.metadata)),
      inAdministerScope: inScope(scopes.administer, ref),
    };
  }

  private assertPermitted(actor: CommercialActor, subject: VisitPolicySubject, operation: VisitOperation): void {
    const denial = visitOperationDenial(actor, subject, operation);
    if (!denial) return;
    if (denial.kind === 'OWNER_ONLY') throw visitConfirmationOwnerOnlyError();
    throw new PermissionDeniedError(denial.permission);
  }

  private assertState(record: VisitRecord, subject: VisitPolicySubject, operation: VisitOperation): void {
    const violation = visitStateViolation(subject.group, operation);
    if (violation) throw lifecycleConflict(violation, record.status.code);
  }

  private derived(
    actor: CommercialActor,
    scopes: VisitAccessScopes,
    record: VisitRecord | VisitListRecord,
    defaultDurationMinutes: number,
    now: Date,
  ): VisitDerived {
    const subject = this.subject(record, scopes);
    return {
      access: subject.access,
      allowedActions: allowedVisitActions(actor, subject),
      group: subject.group,
      isRescheduled: visitStatusSemantics(record.status.metadata).isRescheduled,
      effectiveEndAt: effectiveEnd(record.scheduledStartAt, record.scheduledEndAt, defaultDurationMinutes),
      isUnregistered: isUnregisteredVisit(subject.group, record.scheduledStartAt, now),
    };
  }

  private view(
    actor: CommercialActor,
    scopes: VisitAccessScopes,
    record: VisitRecord,
    settings: VisitSettings,
    scheduleConflicts: readonly ScheduleConflictView[] | null,
  ): VisitView {
    return {
      record,
      ...this.derived(actor, scopes, record, settings.defaultDurationMinutes, new Date()),
      canSeeContacts: actor.permissions.has(CONTACT_VIEW_PERMISSION),
      scheduleConflicts,
    };
  }

  private async catalogItems(catalogKey: string): Promise<CatalogItemRecord[]> {
    return (await this.catalogs.findByKey(catalogKey))?.items ?? [];
  }

  private async settings(): Promise<VisitSettings> {
    const [required, timeZone, conflictMode, defaultDurationMinutes] = await Promise.all([
      this.parameters.get<Record<string, string[] | undefined>>(PARAMETERS.requiredFields),
      this.parameters.get<string>(PARAMETERS.timeZone),
      this.parameters.get<ScheduleConflictMode>(PARAMETERS.conflictMode),
      this.parameters.get<number>(PARAMETERS.defaultDuration),
    ]);
    return {
      requiredFields: [...new Set([...BASE_REQUIRED, ...(required['visit'] ?? [])])],
      completionRequiredFields: [...new Set([...COMPLETION_BASE_REQUIRED, ...(required['visitCompletion'] ?? [])])],
      timeZone,
      conflictMode,
      defaultDurationMinutes,
    };
  }

  private requireStatus(statuses: readonly CatalogItemRecord[], target: VisitStatusTarget): string {
    const status = pickVisitStatus(statuses.map(toStateItem), target);
    // El registro de semántica exige al menos un elemento activo por indicador (00 §3.3).
    if (!status) throw new Error(`crm.estado_visita has no active status for ${target}`);
    return status.id;
  }

  private assertScheduledRange(start: Date, end: Date | null, field: string): void {
    if (end && end.getTime() < start.getTime()) throw issueError(field, COMMERCIAL_ERROR_CODES.invalidDateRange);
  }

  /** RN-04.16: fecha real (y fin real) no futuras; fin real ≥ inicio real (`ck_visits_actual_range`). */
  private assertCompletionDates(draft: CompletionDraft, now: Date): void {
    const issues: (FieldIssue & Record<string, unknown>)[] = [];
    if (draft.actualStartAt.getTime() > now.getTime()) issues.push(commercialIssue('actualStartAt', COMMERCIAL_ERROR_CODES.actualDateInFuture));
    if (draft.actualEndAt && draft.actualEndAt.getTime() > now.getTime()) {
      issues.push(commercialIssue('actualEndAt', COMMERCIAL_ERROR_CODES.actualDateInFuture));
    }
    if (issues.length > 0) throw issuesError(issues);
    if (draft.actualEndAt && draft.actualEndAt.getTime() < draft.actualStartAt.getTime()) {
      throw issueError('actualEndAt', COMMERCIAL_ERROR_CODES.invalidDateRange);
    }
  }

  /** Valores de la realización con los nombres de `crm.campos_obligatorios.visitCompletion`. */
  private completionValues(draft: CompletionDraft): Record<string, unknown> {
    return { ...draft, participants: draft.attendees };
  }

  /**
   * RN-04.7: obligatorios de base + parámetro. Con `sentFields` (edición) solo se
   * comprueban los enviados (vaciar un obligatorio → `422`).
   */
  private assertRequiredFields(required: readonly string[], values: Record<string, unknown>, sentFields: ReadonlySet<string> | null): void {
    const issues: (FieldIssue & Record<string, unknown>)[] = [];
    for (const field of required) {
      if (sentFields && !sentFields.has(field)) continue;
      if (!hasValue(values[field])) issues.push(commercialIssue(field, COMMERCIAL_ERROR_CODES.requiredFieldMissing));
    }
    if (issues.length > 0) throw issuesError(issues);
  }

  /** RN-04.5: responsable distinto del actor, activo, en el alcance de `visitas.administrar` y con `visitas.ver`. */
  private async assertEligibleOwner(ownerId: string, scopes: VisitAccessScopes, tx?: TransactionContext): Promise<void> {
    const eligible = await this.users.isEligibleOwner(
      ownerId,
      { scope: userScopeFrom([scopes.administer]), anyOfPermissions: [VISIT_PERMISSIONS.view] },
      tx,
    );
    if (!eligible) throw issueError('ownerId', COMMERCIAL_ERROR_CODES.ownerNotEligible);
  }

  private validateParticipantList(
    list: readonly NormalizedParticipant[],
    customerId: string,
    kept: { readonly customerId: string; readonly participants: readonly NormalizedParticipant[] } | null,
    role: ParticipantRole,
    field: string,
    tx: TransactionContext,
  ): Promise<ParticipantWrite[]> {
    return validateParticipants({ customers: this.customers, users: this.users }, list, customerId, kept, role, field, tx);
  }

  /** Columnas de la planificación que cambian (la edición sin cambios no escribe). */
  private changedPlanning(current: PlanningDraft, final: PlanningDraft): Partial<VisitPatch> {
    const patch: Record<string, unknown> = {};
    for (const field of ['projectId', 'ownerId', 'objective', 'location', 'reminderMinutesBefore'] as const) {
      if (final[field] !== current[field]) patch[field] = final[field];
    }
    if (!sameInstant(final.scheduledEndAt, current.scheduledEndAt)) patch['scheduledEndAt'] = final.scheduledEndAt;
    return patch as Partial<VisitPatch>;
  }

  /** Columnas de la realización a escribir: todas al registrar; las que cambian al corregir. */
  private changedCompletion(current: CompletionDraft | null, draft: CompletionDraft): Partial<VisitPatch> {
    const patch: Record<string, unknown> = {};
    for (const field of ['topics', 'agreements', 'resultId', 'resultSummary', 'comments', 'nextAction'] as const) {
      if (!current || draft[field] !== current[field]) patch[field] = draft[field];
    }
    for (const field of ['actualStartAt', 'actualEndAt', 'nextActionDate'] as const) {
      if (!current || !sameInstant(draft[field], current[field])) patch[field] = draft[field];
    }
    return patch as Partial<VisitPatch>;
  }
}
