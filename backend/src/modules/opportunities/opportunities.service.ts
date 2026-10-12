import { Inject, Injectable } from '@nestjs/common';

import { calendarDateIn } from '@/common/calendar-date';
import { compareDecimal } from '@/common/decimal';
import { PermissionDeniedError } from '@/common/errors/application-error';
import type { ApplicationWarning } from '@/common/warnings';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { SEQUENCE_GENERATOR, type SequenceGenerator } from '@/infrastructure/database/ports/sequence-generator.port';
import { TRANSACTION_RUNNER, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CatalogReferenceValidator } from '@/modules/catalogs/catalog-reference.validator';
import { closedStageIds, isClosedStage, isOpenStage, openStageIds, type OpportunityOutcomeCode } from '@/modules/commercial-metrics/metric-definitions';
import { normalizeName } from '@/modules/customers/customer-normalization';
import { type AllowedCurrencies, type BaseCurrencyConversion, CurrencyConversionService } from '@/modules/exchange-rates/currency-conversion.service';
import { ParameterReader } from '@/modules/parameters/parameter-reader';
import { PROJECTS_REPOSITORY, type ProjectsRepository } from '@/modules/projects/ports/projects.repository.port';
import { ProjectCatalogsService } from '@/modules/projects/project-catalogs.service';
import { projectNotFound } from '@/modules/projects/project-errors';

import {
  canAssignOpportunityOwner,
  canCloseOpportunity,
  canCreateOpportunityIn,
  canDeleteOpportunity,
  canReopenOpportunity,
  type OpportunityAccessScopes,
  type OpportunityCapabilities,
  opportunityCapabilities,
} from './opportunity-access-policy';
import { type OpportunityActor, OpportunityAccessService, toVisibleOpportunity, type VisibleOpportunity } from './opportunity-access.service';
import { OPPORTUNITY_AUDIT_EVENTS, OPPORTUNITY_AUDIT_RESOURCE, OPPORTUNITY_MASKED_FIELDS, opportunityAuditState } from './opportunity-audit';
import {
  DEFAULT_STAGE_KEY,
  OPPORTUNITY_CATALOGS,
  OPPORTUNITY_PARAMETERS,
  OPPORTUNITY_PERMISSIONS,
  OPPORTUNITY_SEQUENCE_KEY,
} from './opportunity-constants';
import {
  fieldNotEditableError,
  fieldValidationError,
  OPPORTUNITY_ERROR_CODES,
  opportunityClosedError,
  opportunityHasDependenciesError,
  type OpportunityIssue,
  opportunityIssue,
  opportunityIssuesError,
  opportunityNotFound,
} from './opportunity-errors';
import { applyEstimatePlan, EMPTY_ESTIMATE, type EstimatePlan, type EstimateSnapshot, planEstimate } from './opportunity-estimate';
import {
  OPPORTUNITIES_REPOSITORY,
  type OpportunitiesRepository,
  type OpportunityDateField,
  type OpportunityFilters,
  type OpportunityRecord,
  type OpportunitySortField,
  type ResultHistoryRecord,
  type StageHistoryRecord,
  type UpdateOpportunityInput,
} from './ports/opportunities.repository.port';
import { allowedTransitions, sortStages, type StageItem, type StageTransitionMap } from './stage-transition-policy';

export interface OpportunityView {
  readonly record: OpportunityRecord;
  readonly capabilities: OpportunityCapabilities;
}

export interface OpportunityDetailView extends OpportunityView {
  readonly allowedTransitions: readonly StageItem[];
}

export interface OpportunityMutationView extends OpportunityDetailView {
  readonly warnings: readonly ApplicationWarning[];
}

export interface OpportunityFilterRequest {
  readonly search?: string;
  readonly projectIds?: readonly string[];
  readonly customerIds?: readonly string[];
  readonly stageIds?: readonly string[];
  readonly ownerIds?: readonly string[];
  readonly status?: 'OPEN' | 'CLOSED';
  readonly outcomes?: readonly OpportunityOutcomeCode[];
  readonly decisionFrom?: string;
  readonly decisionTo?: string;
  readonly dateField?: OpportunityDateField;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

export interface SearchOpportunitiesRequest extends OpportunityFilterRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: OpportunitySortField;
  readonly sortOrder: 'asc' | 'desc';
}

export interface CreateOpportunityRequest {
  readonly stageId?: string;
  readonly opportunityDate?: string;
  readonly ownerId?: string;
  readonly estimatedAmount?: string;
  readonly currencyCode?: string;
  readonly estimatedTonnage?: string;
  readonly description?: string | null;
  readonly nextAction?: string | null;
  readonly nextActionDate?: string;
}

export interface UpdateOpportunityRequest {
  readonly opportunityDate?: string;
  readonly ownerId?: string;
  readonly estimatedAmount?: string | null;
  readonly currencyCode?: string | null;
  readonly estimatedTonnage?: string | null;
  readonly description?: string | null;
  readonly nextAction?: string | null;
  readonly nextActionDate?: string | null;
}

export interface StageSummaryItem {
  readonly stage: StageItem;
  readonly count: number;
}

export interface OpportunityFormOptions {
  readonly stages: readonly StageItem[];
  readonly outcomes: readonly StageItem[];
  readonly reasons: readonly StageItem[];
  readonly baseCurrencyCode: string;
  readonly defaults: { readonly stageId: string; readonly opportunityDate: string };
  readonly currencies: AllowedCurrencies | null;
}

export interface OpportunityHistory {
  readonly stages: readonly StageHistoryRecord[];
  readonly results: readonly ResultHistoryRecord[];
}

const SUMMARY_FIELDS = ['opportunityDate', 'ownerId', 'estimatedTonnage', 'description', 'nextAction', 'nextActionDate'] as const;
const ESTIMATE_FIELDS = ['estimatedAmount', 'currencyCode', 'exchangeRate', 'exchangeRateDate', 'estimatedAmountUsd'] as const;

/**
 * Oportunidades comerciales (03 F-17, C.7, C.11): pipeline, alta, edición con la
 * estimación en USD o en la moneda del país del proyecto (foto del tipo de cambio),
 * eliminación lógica, historial y opciones de formulario. El cambio de etapa y el
 * resultado viven en `OpportunityStageService`.
 *
 * Concurrencia (03 "Precisiones" E2a): toda escritura toma primero la fila del proyecto
 * con `FOR UPDATE` y después la de la oportunidad, en la misma transacción en la que
 * actualiza `last_activity_at` (RN-03.9); así se serializa con la eliminación del
 * proyecto (que cuenta oportunidades abiertas) y con las demás escrituras, siempre en el
 * mismo orden (sin interbloqueos). Parámetros, catálogos y la tasa de cambio se leen
 * **antes** de abrir la transacción (sin conexiones extra del pool con bloqueos).
 */
@Injectable()
export class OpportunitiesService {
  constructor(
    @Inject(OPPORTUNITIES_REPOSITORY) private readonly opportunities: OpportunitiesRepository,
    @Inject(PROJECTS_REPOSITORY) private readonly projects: ProjectsRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(SEQUENCE_GENERATOR) private readonly sequences: SequenceGenerator,
    private readonly access: OpportunityAccessService,
    private readonly catalogs: ProjectCatalogsService,
    private readonly catalogValidator: CatalogReferenceValidator,
    private readonly currencies: CurrencyConversionService,
    private readonly parameters: ParameterReader,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  // -------------------------------------------------------------------------
  // Lectura
  // -------------------------------------------------------------------------

  async search(actor: OpportunityActor, request: SearchOpportunitiesRequest): Promise<Page<OpportunityView>> {
    const [scopes, stages, timeZone] = await Promise.all([this.access.scopes(actor), this.stages(), this.timeZone()]);
    const filters = this.filters(request, stages, timeZone);
    const sortBy = request.sortBy ?? 'updatedAt';
    const page = await this.opportunities.search(
      {
        ...filters,
        page: request.page,
        pageSize: request.pageSize,
        sortBy,
        sortOrder: request.sortBy ? request.sortOrder : 'desc',
        stageRanking: sortStages(stages).map((stage) => stage.id),
      },
      scopes.view,
    );
    return { ...page, items: page.items.map((record) => this.view(actor, record, scopes)) };
  }

  /** Oportunidades de un proyecto visible con el alcance de `oportunidades.ver` (sección 4, selector del Módulo 4). */
  async searchInProject(actor: OpportunityActor, projectId: string, request: SearchOpportunitiesRequest): Promise<Page<OpportunityView>> {
    await this.access.findProject(actor, projectId);
    return this.search(actor, { ...request, projectIds: [projectId] });
  }

  /** Conteo por etapa con los mismos filtros (tablero, AC-03.46): activas (también con 0) e inactivas con oportunidades. */
  async stageSummary(actor: OpportunityActor, request: OpportunityFilterRequest): Promise<StageSummaryItem[]> {
    const [scopes, stages, timeZone] = await Promise.all([this.access.scopes(actor), this.stages(), this.timeZone()]);
    const counts = new Map((await this.opportunities.stageCounts(this.filters(request, stages, timeZone), scopes.view)).map((row) => [row.stageId, row.count]));
    return sortStages(stages)
      .filter((stage) => stage.isActive || (counts.get(stage.id) ?? 0) > 0)
      .map((stage) => ({ stage, count: counts.get(stage.id) ?? 0 }));
  }

  async findOne(actor: OpportunityActor, opportunityId: string): Promise<OpportunityDetailView> {
    const visible = await this.access.findVisible(actor, opportunityId);
    return this.detail(actor, visible);
  }

  async history(actor: OpportunityActor, opportunityId: string): Promise<OpportunityHistory> {
    await this.access.findVisible(actor, opportunityId);
    const [stages, results] = await Promise.all([this.opportunities.listStageHistory(opportunityId), this.opportunities.listResultHistory(opportunityId)]);
    return { stages, results };
  }

  async formOptions(actor: OpportunityActor, projectId?: string): Promise<OpportunityFormOptions> {
    const project = projectId ? await this.access.findProject(actor, projectId) : null;
    const [stages, outcomes, reasons, baseCurrencyCode, timeZone, initial] = await Promise.all([
      this.stages(),
      this.catalogs.activeItems(OPPORTUNITY_CATALOGS.outcome),
      this.catalogs.activeItems(OPPORTUNITY_CATALOGS.reason),
      this.currencies.baseCurrencyCode(),
      this.timeZone(),
      this.defaultStage(),
    ]);
    const bySortOrder = (a: { sortOrder: number; code: string }, b: { sortOrder: number; code: string }) =>
      a.sortOrder - b.sortOrder || (a.code < b.code ? -1 : 1);
    return {
      stages: sortStages(stages.filter((stage) => stage.isActive)),
      outcomes: [...outcomes].sort(bySortOrder),
      reasons: [...reasons].sort(bySortOrder),
      baseCurrencyCode,
      defaults: { stageId: initial.id, opportunityDate: calendarDateIn(new Date(), timeZone) },
      currencies: project ? await this.currencies.allowedCurrencies(project.country.id) : null,
    };
  }

  // -------------------------------------------------------------------------
  // Alta (RN-03.37–RN-03.39, C.11)
  // -------------------------------------------------------------------------

  async create(actor: OpportunityActor, projectId: string, request: CreateOpportunityRequest): Promise<OpportunityMutationView> {
    const actorId = actor.userId;
    if (!actorId) throw new PermissionDeniedError(OPPORTUNITY_PERMISSIONS.create);
    const scopes = await this.access.scopes(actor);
    const project = await this.access.findProject(actor, projectId, scopes);
    const projectRef = { ownerId: project.owner.id, countryId: project.country.id };
    if (!canCreateOpportunityIn(actor, projectRef, scopes.administer)) {
      throw new PermissionDeniedError(actor.permissions.has(OPPORTUNITY_PERMISSIONS.create) ? OPPORTUNITY_PERMISSIONS.administer : OPPORTUNITY_PERMISSIONS.create);
    }
    const ownerId = request.ownerId ?? actorId;
    if (ownerId !== actorId && !actor.permissions.has(OPPORTUNITY_PERMISSIONS.administer)) {
      throw fieldNotEditableError('ownerId', OPPORTUNITY_PERMISSIONS.administer);
    }

    const [timeZone, stages] = await Promise.all([this.timeZone(), this.stages()]);
    const stage = await this.initialStage(request.stageId, stages);
    const at = new Date();
    const opportunityDate = request.opportunityDate ?? calendarDateIn(at, timeZone);
    const { plan, issues } = planEstimate(null, request, { before: null, after: opportunityDate });
    if (issues.length > 0) throw opportunityIssuesError(issues);
    const conversion = await this.convert(plan, project.country.id);
    const estimate = applyEstimatePlan(EMPTY_ESTIMATE, plan, conversion);
    const assignable = this.access.assignableOwners(actor, scopes);

    const opportunityId = await this.transactions.run(async (tx) => {
      if (!(await this.projects.lockProject(projectId, 'UPDATE', tx))) throw projectNotFound(projectId);
      // La etapa se revalida dentro (00 §3.5).
      await this.catalogValidator.assertItem(OPPORTUNITY_CATALOGS.stage, stage.id, { field: 'stageId', requireActive: true, tx });
      if (ownerId !== actorId && !(await this.projects.findEligibleOwner(ownerId, assignable, OPPORTUNITY_PERMISSIONS.view, tx))) {
        throw opportunityIssuesError([opportunityIssue('ownerId', OPPORTUNITY_ERROR_CODES.invalidOwner)]);
      }
      const code = await this.sequences.next(OPPORTUNITY_SEQUENCE_KEY, tx, { at, timeZone });
      const id = await this.opportunities.create(
        {
          ...estimate,
          code,
          projectId,
          stageId: stage.id,
          opportunityDate,
          ownerId,
          estimatedTonnage: request.estimatedTonnage ?? null,
          description: request.description ?? null,
          nextAction: request.nextAction ?? null,
          nextActionDate: request.nextActionDate ?? null,
          createdById: actorId,
          at,
        },
        tx,
      );
      // RN-03.39: primera fila del historial de etapas con origen nulo.
      await this.opportunities.insertStageHistory({ opportunityId: id, fromStageId: null, toStageId: stage.id, comment: null, changedById: actorId, at }, tx);
      await this.projects.touchLastActivity([projectId], at, tx);
      return id;
    });

    const created = await this.mustFind(opportunityId);
    this.logger.info('opportunity_created', { correlationId: actor.audit.correlationId, projectId, opportunityId });
    await this.audit.record(OPPORTUNITY_AUDIT_EVENTS.created, actor.audit, {
      resourceType: OPPORTUNITY_AUDIT_RESOURCE,
      resourceId: opportunityId,
      before: null,
      after: opportunityAuditState(created),
      maskedFields: OPPORTUNITY_MASKED_FIELDS,
      metadata: { projectId },
    });
    return { ...(await this.detail(actor, toVisibleOpportunity(created, scopes))), warnings: conversion?.warnings ?? [] };
  }

  // -------------------------------------------------------------------------
  // Edición (RN-03.38, RN-03.82)
  // -------------------------------------------------------------------------

  async update(actor: OpportunityActor, opportunityId: string, request: UpdateOpportunityRequest): Promise<OpportunityMutationView> {
    const visible = await this.access.findEditable(actor, opportunityId);
    const before = visible.record;
    const ownerChanges = request.ownerId !== undefined && request.ownerId !== before.owner.id;
    if (ownerChanges && !canAssignOpportunityOwner(actor, visible.subject)) {
      throw fieldNotEditableError('ownerId', OPPORTUNITY_PERMISSIONS.administer);
    }
    const opportunityDate = request.opportunityDate ?? before.opportunityDate;
    const { plan, issues } = planEstimate(before, request, { before: before.opportunityDate, after: opportunityDate });
    if (issues.length > 0) throw opportunityIssuesError(issues);
    const conversion = await this.convert(plan, before.project.countryId);
    const estimate = applyEstimatePlan(before, plan, conversion);
    const changes = this.changedFields(before, request, estimate);
    if (Object.keys(changes).length === 0) {
      // Edición sin cambios: no se escribe ni se audita (RN-03.13).
      return { ...(await this.detail(actor, visible)), warnings: [] };
    }
    const assignable = this.access.assignableOwners(actor, visible.scopes);

    await this.transactions.run(async (tx) => {
      if (!(await this.projects.lockProject(before.project.id, 'UPDATE', tx))) throw opportunityNotFound(opportunityId);
      if (!(await this.opportunities.lock(opportunityId, before.project.id, tx))) throw opportunityNotFound(opportunityId);
      if (changes.ownerId !== undefined && !(await this.projects.findEligibleOwner(changes.ownerId, assignable, OPPORTUNITY_PERMISSIONS.view, tx))) {
        throw opportunityIssuesError([opportunityIssue('ownerId', OPPORTUNITY_ERROR_CODES.invalidOwner)]);
      }
      await this.opportunities.update(opportunityId, changes, actor.userId, tx);
      await this.projects.touchLastActivity([before.project.id], new Date(), tx);
    });

    const after = await this.mustFind(opportunityId);
    this.logger.info('opportunity_updated', { correlationId: actor.audit.correlationId, opportunityId, fields: Object.keys(changes) });
    await this.audit.record(OPPORTUNITY_AUDIT_EVENTS.updated, actor.audit, {
      resourceType: OPPORTUNITY_AUDIT_RESOURCE,
      resourceId: opportunityId,
      before: opportunityAuditState(before),
      after: opportunityAuditState(after),
      maskedFields: OPPORTUNITY_MASKED_FIELDS,
      metadata: { projectId: before.project.id },
    });
    return { ...(await this.detail(actor, toVisibleOpportunity(after, visible.scopes))), warnings: conversion?.warnings ?? [] };
  }

  // -------------------------------------------------------------------------
  // Eliminación lógica (RN-03.45, DM-33, D-03.12)
  // -------------------------------------------------------------------------

  async remove(actor: OpportunityActor, opportunityId: string): Promise<void> {
    const visible = await this.access.findVisible(actor, opportunityId);
    if (!canDeleteOpportunity(actor, visible.subject)) throw new PermissionDeniedError(OPPORTUNITY_PERMISSIONS.delete);
    const stages = await this.stages();
    const projectId = visible.record.project.id;
    const at = new Date();

    await this.transactions.run(async (tx) => {
      if (!(await this.projects.lockProject(projectId, 'UPDATE', tx))) throw opportunityNotFound(opportunityId);
      const locked = await this.opportunities.lock(opportunityId, projectId, tx);
      if (!locked) throw opportunityNotFound(opportunityId);
      const stage = stages.find((item) => item.id === locked.stageId);
      if (stage && isClosedStage(stage)) throw opportunityClosedError(stage);
      // Bajo el bloqueo: asociar un producto a la oportunidad también bloquea el proyecto (sin TOCTOU).
      const dependencies = await this.opportunities.countDependencies(opportunityId, tx);
      if (dependencies.activeProducts > 0 || dependencies.openActivities > 0) throw opportunityHasDependenciesError(dependencies);
      await this.opportunities.softDelete(opportunityId, actor.userId, at, tx);
      await this.projects.touchLastActivity([projectId], at, tx);
    });

    this.logger.info('opportunity_deleted', { correlationId: actor.audit.correlationId, projectId, opportunityId });
    await this.audit.record(OPPORTUNITY_AUDIT_EVENTS.deleted, actor.audit, {
      resourceType: OPPORTUNITY_AUDIT_RESOURCE,
      resourceId: opportunityId,
      before: opportunityAuditState(visible.record),
      after: null,
      maskedFields: OPPORTUNITY_MASKED_FIELDS,
      metadata: { projectId },
    });
  }

  // -------------------------------------------------------------------------
  // Piezas compartidas con OpportunityStageService
  // -------------------------------------------------------------------------

  /** Etiquetas vigentes de `crm.resultado_oportunidad` (`outcomeLabel` del resultado). */
  async outcomeLabels(): Promise<Map<string, string>> {
    return new Map((await this.catalogs.items(OPPORTUNITY_CATALOGS.outcome)).map((item) => [item.code, item.label]));
  }

  /** Todas las etapas (activas o no) con su semántica. */
  async stages(): Promise<StageItem[]> {
    return this.catalogs.items(OPPORTUNITY_CATALOGS.stage);
  }

  async transitionMap(): Promise<StageTransitionMap> {
    return this.parameters.get<StageTransitionMap>(OPPORTUNITY_PARAMETERS.transitions);
  }

  /** Detalle con `capabilities` y `allowedTransitions` de la misma política que autoriza. */
  async detail(actor: OpportunityActor, visible: VisibleOpportunity): Promise<OpportunityDetailView> {
    const [stages, map] = await Promise.all([this.stages(), this.transitionMap()]);
    const capabilities = opportunityCapabilities(actor, visible.subject);
    const current = stages.find((stage) => stage.id === visible.record.stage.id) ?? visible.record.stage;
    return {
      record: visible.record,
      capabilities,
      allowedTransitions: allowedTransitions(current, stages, map, {
        canEdit: capabilities.canEdit,
        canClose: canCloseOpportunity(actor, visible.subject),
        canReopen: canReopenOpportunity(actor, visible.subject),
      }),
    };
  }

  async mustFind(opportunityId: string): Promise<OpportunityRecord> {
    const record = await this.opportunities.findById(opportunityId, null);
    if (!record) throw new Error('Opportunity not found after write');
    return record;
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private view(actor: OpportunityActor, record: OpportunityRecord, scopes: OpportunityAccessScopes): OpportunityView {
    return { record, capabilities: opportunityCapabilities(actor, toVisibleOpportunity(record, scopes).subject) };
  }

  private timeZone(): Promise<string> {
    return this.parameters.get<string>(OPPORTUNITY_PARAMETERS.timeZone);
  }

  /** Filtros comunes de lista y tablero: rangos de fechas coherentes y DEF-A resuelto a ids. */
  private filters(request: OpportunityFilterRequest, stages: readonly StageItem[], timeZone: string): OpportunityFilters {
    if ((request.dateFrom || request.dateTo) && !request.dateField) {
      throw fieldValidationError('dateField', 'dateField is required with dateFrom or dateTo');
    }
    const issues: OpportunityIssue[] = [];
    if (request.dateFrom && request.dateTo && request.dateFrom > request.dateTo) {
      issues.push(opportunityIssue('dateTo', OPPORTUNITY_ERROR_CODES.invalidDateRange, { startField: 'dateFrom' }));
    }
    if (request.decisionFrom && request.decisionTo && request.decisionFrom > request.decisionTo) {
      issues.push(opportunityIssue('decisionTo', OPPORTUNITY_ERROR_CODES.invalidDateRange, { startField: 'decisionFrom' }));
    }
    if (issues.length > 0) throw opportunityIssuesError(issues);
    const search = normalizeName(request.search);
    return {
      ...(search ? { search } : {}),
      projectIds: request.projectIds ?? [],
      customerIds: request.customerIds ?? [],
      stageIds: request.stageIds ?? [],
      ownerIds: request.ownerIds ?? [],
      statusStageIds: request.status === 'OPEN' ? openStageIds(stages) : request.status === 'CLOSED' ? closedStageIds(stages) : null,
      outcomes: request.outcomes ?? [],
      decisionRange:
        request.decisionFrom || request.decisionTo
          ? { ...(request.decisionFrom ? { from: request.decisionFrom } : {}), ...(request.decisionTo ? { to: request.decisionTo } : {}) }
          : null,
      dateRange: request.dateField
        ? { field: request.dateField, ...(request.dateFrom ? { from: request.dateFrom } : {}), ...(request.dateTo ? { to: request.dateTo } : {}) }
        : null,
      timeZone,
    };
  }

  /** Etapa por defecto (RN-03.39): la del parámetro si es activa y abierta; si no, la primera abierta activa. */
  private async defaultStage(): Promise<StageItem> {
    const [stages, defaults] = await Promise.all([
      this.stages(),
      this.parameters.get<Record<string, string | undefined>>(OPPORTUNITY_PARAMETERS.defaultValues),
    ]);
    const code = defaults[DEFAULT_STAGE_KEY];
    const candidates = sortStages(stages.filter((stage) => stage.isActive && isOpenStage(stage)));
    const stage = candidates.find((item) => item.code === code) ?? candidates[0];
    if (!stage) throw new Error('No active open stage in crm.etapa_oportunidad');
    return stage;
  }

  /** RN-03.39: la elegida debe ser activa (`INVALID_CATALOG_VALUE`) y abierta (`INVALID_INITIAL_STAGE`, D-03.7). */
  private async initialStage(stageId: string | undefined, stages: readonly StageItem[]): Promise<StageItem> {
    if (stageId === undefined) return this.defaultStage();
    await this.catalogValidator.assertItem(OPPORTUNITY_CATALOGS.stage, stageId, { field: 'stageId', requireActive: true });
    const stage = stages.find((item) => item.id === stageId);
    if (!stage) throw new Error('Validated stage missing from the catalog read');
    if (!isOpenStage(stage)) {
      throw opportunityIssuesError([opportunityIssue('stageId', OPPORTUNITY_ERROR_CODES.invalidInitialStage, { stageCode: stage.code })]);
    }
    return stage;
  }

  /** Resuelve la tasa (y el aviso) antes de la transacción; `422 CURRENCY_NOT_ALLOWED` / `EXCHANGE_RATE_NOT_FOUND` sin efectos. */
  private async convert(plan: EstimatePlan, countryId: string): Promise<BaseCurrencyConversion | null> {
    if (plan.kind !== 'CONVERT') return null;
    return this.currencies.convertToBase({ amount: plan.amount, currencyCode: plan.currencyCode, referenceDate: plan.referenceDate, countryId });
  }

  /** Solo lo que cambia (valores normalizados); la estimación entra completa si cambia algún campo de la foto. */
  private changedFields(before: OpportunityRecord, request: UpdateOpportunityRequest, estimate: EstimateSnapshot): UpdateOpportunityInput {
    const sent: Record<(typeof SUMMARY_FIELDS)[number], unknown> = {
      opportunityDate: request.opportunityDate,
      ownerId: request.ownerId,
      estimatedTonnage: request.estimatedTonnage,
      description: request.description,
      nextAction: request.nextAction,
      nextActionDate: request.nextActionDate,
    };
    const current: Record<(typeof SUMMARY_FIELDS)[number], unknown> = {
      opportunityDate: before.opportunityDate,
      ownerId: before.owner.id,
      estimatedTonnage: before.estimatedTonnage,
      description: before.description,
      nextAction: before.nextAction,
      nextActionDate: before.nextActionDate,
    };
    const changes: Record<string, unknown> = {};
    for (const field of SUMMARY_FIELDS) {
      const value = sent[field];
      if (value === undefined) continue;
      const same = field === 'estimatedTonnage' ? sameDecimal(value as string | null, current[field] as string | null) : value === current[field];
      if (!same) changes[field] = value;
    }
    if (ESTIMATE_FIELDS.some((field) => estimate[field] !== before[field])) {
      for (const field of ESTIMATE_FIELDS) changes[field] = estimate[field];
    }
    return changes as UpdateOpportunityInput;
  }
}

function sameDecimal(a: string | null, b: string | null): boolean {
  return a === null || b === null ? a === b : compareDecimal(a, b) === 0;
}
