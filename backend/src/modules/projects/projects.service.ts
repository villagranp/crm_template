import { Inject, Injectable } from '@nestjs/common';

import type { CalendarDate } from '@/common/calendar-date';
import { PermissionDeniedError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { TRANSACTION_RUNNER, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { isWithinScope } from '@/modules/access/visibility-scope';
import { AuditService } from '@/modules/audit/audit.service';
import {
  businessMonth,
  type CommercialStatus,
  commercialStatus,
  isClosedStage,
  isOpenStage,
} from '@/modules/commercial-metrics/metric-definitions';
import { normalizeName } from '@/modules/customers/customer-normalization';
import { CustomerReferenceGuard } from '@/modules/customers/customer-reference.guard';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import {
  canAdministerProject,
  canAssignOwner,
  canDeleteProject,
  type ProjectAccessScopes,
  type ProjectCapabilities,
  projectCapabilities,
  projectPolicySubject,
} from './project-access-policy';
import { type ProjectActor, ProjectAccessService, toVisibleProject, type VisibleProject } from './project-access.service';
import { PROJECT_AUDIT_EVENTS, PROJECT_AUDIT_RESOURCE, PROJECT_MASKED_FIELDS, projectAuditState } from './project-audit';
import { ProjectCatalogsService } from './project-catalogs.service';
import { type CommercialStatusFilter, commercialStatusFromAggregate } from './project-commercial-status';
import { PROJECT_PARAMETERS, PROJECT_PERMISSIONS } from './project-constants';
import { ProjectCreationService } from './project-creation.service';
import { compareCalendarDates } from './project-dates';
import {
  fieldNotEditableError,
  PROJECT_ERROR_CODES,
  projectCodeTakenError,
  projectCustomerLockedError,
  projectHasActiveChildrenError,
  type ProjectIssue,
  projectIssue,
  projectIssuesError,
  projectNotFound,
} from './project-errors';
import { dateRangeIssue, missingRequiredFieldIssues, normalizeProjectCode, projectRequiredFields, trimOptional } from './project-rules';
import {
  ProjectCodeConflictError,
  type ProjectDateField,
  type ProjectListRecord,
  type ProjectListSortField,
  type ProjectRecord,
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
  type UpdateProjectInput,
} from './ports/projects.repository.port';

/** Fila de la búsqueda o de la vista de equipo con lo que la API necesita. */
export interface ProjectListItemView {
  readonly record: ProjectListRecord;
  readonly commercialStatus: CommercialStatus;
  readonly capabilities: ProjectCapabilities;
}

export interface ProjectSummary {
  readonly openOpportunities: number;
  readonly wonOpportunities: number;
  readonly partialOpportunities: number;
  readonly lostOpportunities: number;
  readonly productLines: number;
  readonly attachments: number;
}

/** Ficha (03 F.1 `ProjectDetailDto`). */
export interface ProjectDetailView {
  readonly record: ProjectRecord;
  readonly commercialStatus: CommercialStatus;
  readonly capabilities: ProjectCapabilities;
  /** Origen del duplicado, solo si el actor lo ve (03 F.1). */
  readonly duplicatedFrom: { readonly id: string; readonly code: string; readonly name: string } | null;
  readonly summary: ProjectSummary;
}

interface CommonListFilters {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: ProjectListSortField;
  readonly sortOrder: 'asc' | 'desc';
  readonly search?: string;
  readonly ownerIds?: readonly string[];
  readonly phaseIds?: readonly string[];
  readonly countryIds?: readonly string[];
}

export interface SearchProjectsRequest extends CommonListFilters {
  readonly code?: string;
  readonly customerIds?: readonly string[];
  readonly city?: string;
  readonly projectTypeIds?: readonly string[];
  readonly stageIds?: readonly string[];
  readonly commercialStatus?: readonly CommercialStatusFilter[];
  readonly active?: boolean;
  readonly dateField?: ProjectDateField;
  readonly dateFrom?: CalendarDate;
  readonly dateTo?: CalendarDate;
}

export interface TeamViewRequest extends CommonListFilters {
  readonly teamIds?: readonly string[];
  readonly lastActivityFrom?: CalendarDate;
  readonly lastActivityTo?: CalendarDate;
}

/** PATCH (03 F.1 `UpdateProjectDto`): omitido = sin cambio; `null` = borrar un opcional. */
export interface UpdateProjectRequest {
  readonly name?: string;
  readonly customerId?: string;
  readonly countryId?: string;
  readonly city?: string | null;
  readonly address?: string | null;
  readonly description?: string | null;
  readonly estimatedStartDate?: CalendarDate | null;
  readonly estimatedEndDate?: CalendarDate | null;
  readonly estimatedDecisionDate?: CalendarDate | null;
  readonly ownerId?: string;
  readonly code?: string;
}

export interface CreateProjectRequest {
  readonly name: string;
  readonly customerId: string;
  readonly countryId?: string;
  readonly city?: string | null;
  readonly address?: string | null;
  readonly description?: string | null;
  readonly estimatedStartDate?: CalendarDate | null;
  readonly estimatedEndDate?: CalendarDate | null;
  readonly estimatedDecisionDate?: CalendarDate | null;
  readonly ownerId?: string;
  readonly code?: string;
}

function invalidDateRange(field: string): ReturnType<typeof projectIssuesError> {
  return projectIssuesError([projectIssue(field, PROJECT_ERROR_CODES.invalidDateRange)]);
}

/**
 * Casos de uso del proyecto (03 F-10, F-11, F-13, F-14): búsqueda, vista de equipo,
 * ficha, alta (delegada en `ProjectCreationService`), edición y eliminación lógica.
 *
 * Orden de las comprobaciones: visibilidad (`404`) → política (`403`) → validación
 * (`422`) → unicidad y dependencias (`409`).
 */
@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PROJECTS_REPOSITORY) private readonly projects: ProjectsRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    private readonly access: ProjectAccessService,
    private readonly creation: ProjectCreationService,
    private readonly catalogs: ProjectCatalogsService,
    private readonly customerGuard: CustomerReferenceGuard,
    private readonly parameters: ParameterReader,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  // --- Lecturas ---------------------------------------------------------------

  async search(actor: ProjectActor, request: SearchProjectsRequest): Promise<Page<ProjectListItemView>> {
    if (request.dateFrom && request.dateTo && compareCalendarDates(request.dateFrom, request.dateTo) > 0) {
      throw invalidDateRange('dateTo');
    }
    const [scopes, semantics, timeZone] = await Promise.all([
      this.access.scopes(actor),
      this.catalogs.phaseAndStageSemantics(),
      this.parameters.get<string>(PROJECT_PARAMETERS.timeZone),
    ]);
    const page = await this.projects.search(
      {
        page: request.page,
        pageSize: request.pageSize,
        sortBy: request.sortBy ?? 'lastActivityAt',
        sortOrder: request.sortOrder,
        search: normalizeName(request.search),
        code: request.code?.trim() || null,
        customerIds: request.customerIds ?? [],
        countryIds: request.countryIds ?? [],
        city: normalizeName(request.city),
        ownerIds: request.ownerIds ?? [],
        projectTypeIds: request.projectTypeIds ?? [],
        phaseIds: request.phaseIds ?? [],
        stageIds: request.stageIds ?? [],
        teamIds: [],
        commercialStatus: request.commercialStatus ?? [],
        activePhaseIds: request.active === undefined ? null : request.active ? semantics.nonFinalPhaseIds : semantics.finalPhaseIds,
        dateRange: request.dateField ? { field: request.dateField, from: request.dateFrom ?? null, to: request.dateTo ?? null } : null,
        timeZone,
        openStageRanking: semantics.openStageRanking,
        phaseRanking: semantics.phaseRanking,
      },
      scopes.view,
    );
    return { ...page, items: page.items.map((record) => this.toListItem(actor, record, scopes)) };
  }

  async teamView(actor: ProjectActor, request: TeamViewRequest): Promise<Page<ProjectListItemView>> {
    if (request.lastActivityFrom && request.lastActivityTo && compareCalendarDates(request.lastActivityFrom, request.lastActivityTo) > 0) {
      throw invalidDateRange('lastActivityTo');
    }
    const [scopes, semantics, timeZone] = await Promise.all([
      this.access.scopes(actor),
      this.catalogs.phaseAndStageSemantics(),
      this.parameters.get<string>(PROJECT_PARAMETERS.timeZone),
    ]);
    const hasRange = request.lastActivityFrom !== undefined || request.lastActivityTo !== undefined;
    const page = await this.projects.search(
      {
        page: request.page,
        pageSize: request.pageSize,
        sortBy: request.sortBy ?? 'lastActivityAt',
        sortOrder: request.sortOrder,
        search: normalizeName(request.search),
        code: null,
        customerIds: [],
        countryIds: request.countryIds ?? [],
        city: null,
        ownerIds: request.ownerIds ?? [],
        projectTypeIds: [],
        phaseIds: request.phaseIds ?? [],
        stageIds: [],
        teamIds: request.teamIds ?? [],
        commercialStatus: [],
        activePhaseIds: null,
        dateRange: hasRange ? { field: 'lastActivityAt', from: request.lastActivityFrom ?? null, to: request.lastActivityTo ?? null } : null,
        timeZone,
        openStageRanking: semantics.openStageRanking,
        phaseRanking: semantics.phaseRanking,
      },
      scopes.view,
    );
    return { ...page, items: page.items.map((record) => this.toListItem(actor, record, scopes)) };
  }

  async findById(actor: ProjectActor, projectId: string): Promise<ProjectDetailView> {
    return this.toDetail(actor, await this.access.findVisible(actor, projectId));
  }

  // --- Alta ------------------------------------------------------------------

  async create(actor: ProjectActor, request: CreateProjectRequest): Promise<ProjectDetailView> {
    if (!actor.userId) throw new PermissionDeniedError(PROJECT_PERMISSIONS.create);
    const ownerId = request.ownerId ?? actor.userId;
    const code = normalizeProjectCode(request.code);
    const reserved: string[] = [];
    if (request.ownerId !== undefined && !canAssignOwner(actor, ownerId)) reserved.push('ownerId');
    if (code !== null && !actor.permissions.has(PROJECT_PERMISSIONS.administer)) reserved.push('code');
    if (reserved.length > 0) throw fieldNotEditableError(reserved, PROJECT_PERMISSIONS.administer);

    const created = await this.creation.create(
      actor,
      {
        name: request.name.trim(),
        customerId: request.customerId,
        countryId: request.countryId ?? null,
        city: trimOptional(request.city) ?? null,
        address: trimOptional(request.address) ?? null,
        description: trimOptional(request.description) ?? null,
        estimatedStartDate: request.estimatedStartDate ?? null,
        estimatedEndDate: request.estimatedEndDate ?? null,
        estimatedDecisionDate: request.estimatedDecisionDate ?? null,
        ownerId,
        code,
        classification: null,
        products: [],
      },
      { event: PROJECT_AUDIT_EVENTS.created, duplicatedFromId: null },
    );
    return this.toDetail(actor, toVisibleProject(created, await this.access.scopes(actor)));
  }

  // --- Edición ---------------------------------------------------------------

  async update(actor: ProjectActor, projectId: string, sent: UpdateProjectRequest): Promise<ProjectDetailView> {
    const visible = await this.access.findEditable(actor, projectId);
    const before = visible.record;
    const changes = this.changedFields(before, sent);
    const reserved = (['ownerId', 'code'] as const).filter((field) => changes[field] !== undefined);
    if (reserved.length > 0 && !canAdministerProject(actor, visible.subject)) {
      throw fieldNotEditableError(reserved, PROJECT_PERMISSIONS.administer);
    }
    if (Object.keys(changes).length === 0) {
      // Edición sin cambios: no se escribe ni se audita (RN-03.13).
      return this.toDetail(actor, visible);
    }

    const requiredParameter = await this.parameters.get<Record<string, string[] | undefined>>(PROJECT_PARAMETERS.requiredFields);
    const issues: ProjectIssue[] = missingRequiredFieldIssues(projectRequiredFields(requiredParameter).general, { ...changes }, 'edit');
    const start = changes.estimatedStartDate !== undefined ? changes.estimatedStartDate : before.estimatedStartDate;
    const end = changes.estimatedEndDate !== undefined ? changes.estimatedEndDate : before.estimatedEndDate;
    const dates = dateRangeIssue(start, end);
    if (dates) issues.push(dates);
    if (issues.length > 0) throw projectIssuesError(issues);
    const assignable = this.access.assignableOwners(actor, visible.scopes);
    const at = new Date();

    try {
      await this.transactions.run(async (tx) => {
        if (!(await this.projects.lockProject(projectId, 'UPDATE', tx))) throw projectNotFound(projectId);
        const txIssues: ProjectIssue[] = [];
        if (changes.customerId !== undefined) {
          // RN-03.10 bajo el bloqueo del proyecto: la FK compuesta lo impediría igualmente.
          const linked = await this.projects.countLinkedInteractions(projectId, tx);
          if (linked.visits + linked.activities > 0) throw projectCustomerLockedError(linked);
          await this.customerGuard.assertUsableCustomer(changes.customerId, actor, { requireActive: true, tx });
        }
        if (changes.countryId !== undefined) {
          const country = await this.projects.findCountry(changes.countryId, tx);
          if (!country || !country.isActive) txIssues.push(projectIssue('countryId', PROJECT_ERROR_CODES.unknownReference));
        }
        if (changes.ownerId !== undefined && changes.ownerId !== actor.userId) {
          const eligible = await this.projects.findEligibleOwner(changes.ownerId, assignable, PROJECT_PERMISSIONS.view, tx);
          if (!eligible) txIssues.push(projectIssue('ownerId', PROJECT_ERROR_CODES.invalidOwner));
        }
        if (txIssues.length > 0) throw projectIssuesError(txIssues);
        if (changes.code !== undefined && (await this.projects.codeExists(changes.code, projectId, tx))) {
          throw projectCodeTakenError(changes.code);
        }
        await this.projects.update(projectId, changes, actor.userId, at, tx);
      });
    } catch (error) {
      if (error instanceof ProjectCodeConflictError) throw projectCodeTakenError(changes.code ?? '');
      throw error;
    }

    const after = await this.projects.findById(projectId, null);
    if (!after) throw new Error('Updated project not found');
    this.logger.info('project_updated', { correlationId: actor.audit.correlationId, projectId, fields: Object.keys(changes) });
    await this.audit.record(PROJECT_AUDIT_EVENTS.updated, actor.audit, {
      resourceType: PROJECT_AUDIT_RESOURCE,
      resourceId: projectId,
      before: projectAuditState(before),
      after: projectAuditState(after),
      maskedFields: PROJECT_MASKED_FIELDS,
    });
    // Tras reasignar el asesor, el actor puede dejar de verlo o de editarlo: se recalcula.
    return this.toDetail(actor, toVisibleProject(after, visible.scopes));
  }

  // --- Eliminación -----------------------------------------------------------

  /**
   * RN-03.12 sin TOCTOU: conteo de bloqueos y borrado lógico en una transacción con la
   * fila del proyecto bloqueada (`FOR UPDATE`). Quien crea un hijo dentro del módulo
   * toma también `FOR UPDATE` sobre esa fila (va a actualizar `last_activity_at`): o espera al borrado
   * y ve el proyecto eliminado (`404`), o el borrado espera y lo cuenta.
   */
  async remove(actor: ProjectActor, projectId: string): Promise<void> {
    const visible = await this.access.findVisible(actor, projectId);
    if (!canDeleteProject(actor, visible.subject)) throw new PermissionDeniedError(PROJECT_PERMISSIONS.delete);
    const [semantics, timeZone] = await Promise.all([
      this.catalogs.phaseAndStageSemantics(),
      this.parameters.get<string>(PROJECT_PARAMETERS.timeZone),
    ]);
    const at = new Date();
    const currentMonth = businessMonth({ now: at, businessTimeZone: timeZone });

    await this.transactions.run(async (tx) => {
      if (!(await this.projects.lockProject(projectId, 'UPDATE', tx))) throw projectNotFound(projectId);
      const children = await this.projects.countBlockingChildren(projectId, { openStageIds: semantics.openStageIds, currentMonth }, tx);
      if (Object.values(children).some((count) => count > 0)) throw projectHasActiveChildrenError(children);
      await this.projects.softDelete(projectId, actor.userId, at, tx);
    });
    this.logger.info('project_deleted', { correlationId: actor.audit.correlationId, projectId });
    await this.audit.record(PROJECT_AUDIT_EVENTS.deleted, actor.audit, {
      resourceType: PROJECT_AUDIT_RESOURCE,
      resourceId: projectId,
      metadata: { code: visible.record.code },
    });
  }

  // --- Adjuntos (autorización sobre el proyecto; ADR-021) -----------------------

  async assertCanManageAttachments(actor: ProjectActor, projectId: string): Promise<void> {
    await this.access.findEditable(actor, projectId);
  }

  async assertCanViewAttachments(actor: ProjectActor, projectId: string): Promise<void> {
    await this.access.findVisible(actor, projectId);
  }

  /** RN-03.9 tras subir o eliminar un adjunto (la escritura del adjunto es su propia transacción). */
  async touchAfterAttachmentChange(projectId: string): Promise<void> {
    await this.transactions.run((tx) => this.projects.touchLastActivity([projectId], new Date(), tx));
  }

  // --- Vistas ------------------------------------------------------------------

  toListItem(actor: ProjectActor, record: ProjectListRecord, scopes: ProjectAccessScopes): ProjectListItemView {
    return {
      record,
      commercialStatus: commercialStatusFromAggregate(record.commercial),
      capabilities: projectCapabilities(actor, projectPolicySubject({ ownerId: record.owner.id, countryId: record.country.id }, scopes)),
    };
  }

  toDetail(actor: ProjectActor, visible: VisibleProject): ProjectDetailView {
    const { record, scopes } = visible;
    const origin = record.duplicatedFrom;
    const originVisible = origin !== null && !origin.isDeleted && isWithinScope(scopes.view, { ownerId: origin.ownerId, countryId: origin.countryId });
    const closed = record.opportunities.filter((opportunity) => isClosedStage(opportunity.stage));
    return {
      record,
      commercialStatus: commercialStatus(record.opportunities),
      capabilities: projectCapabilities(actor, visible.subject),
      duplicatedFrom: originVisible && origin ? { id: origin.id, code: origin.code, name: origin.name } : null,
      summary: {
        openOpportunities: record.opportunities.filter((opportunity) => isOpenStage(opportunity.stage)).length,
        wonOpportunities: closed.filter((opportunity) => opportunity.outcome === 'WON').length,
        partialOpportunities: closed.filter((opportunity) => opportunity.outcome === 'PARTIAL').length,
        lostOpportunities: closed.filter((opportunity) => opportunity.outcome === 'LOST').length,
        productLines: record.productLines,
        attachments: record.attachments,
      },
    };
  }

  /**
   * Campos enviados con un valor distinto del actual (texto recortado, código
   * normalizado): un cambio "cosmético" no cuenta como cambio ni exige permisos (AGENTS §9.12).
   */
  private changedFields(record: ProjectRecord, sent: UpdateProjectRequest): UpdateProjectInput {
    const changes: { -readonly [K in keyof UpdateProjectInput]: UpdateProjectInput[K] } = {};
    const name = sent.name?.trim();
    if (name !== undefined && name !== record.name) changes.name = name;
    if (sent.customerId !== undefined && sent.customerId !== record.customer.id) changes.customerId = sent.customerId;
    if (sent.countryId !== undefined && sent.countryId !== record.country.id) changes.countryId = sent.countryId;
    for (const field of ['city', 'address', 'description'] as const) {
      const value = trimOptional(sent[field]);
      if (value !== undefined && value !== record[field]) changes[field] = value;
    }
    for (const field of ['estimatedStartDate', 'estimatedEndDate', 'estimatedDecisionDate'] as const) {
      const value = sent[field];
      if (value !== undefined && value !== record[field]) changes[field] = value;
    }
    if (sent.ownerId !== undefined && sent.ownerId !== record.owner.id) changes.ownerId = sent.ownerId;
    const code = normalizeProjectCode(sent.code);
    if (sent.code !== undefined && code !== null && code !== record.code) changes.code = code;
    return changes;
  }
}
