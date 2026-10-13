import { Inject, Injectable } from '@nestjs/common';

import { BusinessRuleViolationError, PermissionDeniedError } from '@/common/errors/application-error';
import { TRANSACTION_RUNNER, type TransactionContext, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CatalogReferenceValidator, INVALID_CATALOG_VALUE } from '@/modules/catalogs/catalog-reference.validator';
import { isClosedStage, type OpportunityOutcomeCode } from '@/modules/commercial-metrics/metric-definitions';
import { PROJECTS_REPOSITORY, type ProjectsRepository } from '@/modules/projects/ports/projects.repository.port';
import { ProjectCatalogsService } from '@/modules/projects/project-catalogs.service';

import { OpportunitiesService, type OpportunityDetailView } from './opportunities.service';
import { canCloseOpportunity, canEditOpportunity, canReopenOpportunity, type OpportunityAccessScopes, type OpportunityPolicySubject } from './opportunity-access-policy';
import { type OpportunityActor, OpportunityAccessService, toVisibleOpportunity, type VisibleOpportunity } from './opportunity-access.service';
import {
  OPPORTUNITY_AUDIT_EVENTS,
  OPPORTUNITY_AUDIT_RESOURCE,
  RESULT_MASKED_FIELDS,
  resultAuditState,
  STAGE_CHANGE_MASKED_FIELDS,
} from './opportunity-audit';
import { OPPORTUNITY_CATALOGS, OPPORTUNITY_PERMISSIONS } from './opportunity-constants';
import {
  OPPORTUNITY_ERROR_CODES,
  opportunityIssue,
  opportunityIssuesError,
  opportunityNotClosedError,
  opportunityNotFound,
} from './opportunity-errors';
import { type NormalizedResult, normalizeResult, reasonAppliesTo, type ResultInput, resultIssues, sameResult } from './opportunity-result-rules';
import { type LockedOpportunity, OPPORTUNITIES_REPOSITORY, type OpportunitiesRepository, type OpportunityResultRecord } from './ports/opportunities.repository.port';
import { planStageChange, type StageChangePlan, type StageChangeRejection, type StageItem } from './stage-transition-policy';

export interface StageChangeRequest {
  readonly toStageId: string;
  readonly comment?: string | null;
  readonly result?: ResultInput;
}

interface StageChangeOutcome {
  readonly plan: Exclude<StageChangePlan, { kind: 'REJECT' }>;
  readonly fromStageId: string;
  readonly previousResult: OpportunityResultRecord | null;
}

/** `PUT /result`: `oportunidades.cerrar` sobre una oportunidad que el actor puede editar (RN-03.52). */
function assertCanSetResult(actor: OpportunityActor, subject: OpportunityPolicySubject): void {
  if (canCloseOpportunity(actor, subject)) return;
  const missing = !canEditOpportunity(actor, subject)
    ? actor.permissions.has(OPPORTUNITY_PERMISSIONS.edit)
      ? OPPORTUNITY_PERMISSIONS.administer
      : OPPORTUNITY_PERMISSIONS.edit
    : OPPORTUNITY_PERMISSIONS.close;
  throw new PermissionDeniedError(missing);
}

function toNormalized(result: OpportunityResultRecord): NormalizedResult {
  return {
    outcome: result.outcome,
    reasonId: result.reason?.id ?? null,
    awardedPercent: result.awardedPercent,
    decisionDate: result.decisionDate,
    comments: result.comments,
  };
}

/**
 * Cambio de etapa y resultado comercial (03 F.2 `stage-changes` y `PUT /result`,
 * RN-03.40–RN-03.53, DM-6, DM-15). Todo en **una** transacción con la fila del proyecto
 * y luego la de la oportunidad tomadas con `FOR UPDATE` (mismo orden que el resto del
 * módulo): la decisión (también la política: editar, cerrar, reabrir) se toma sobre la
 * etapa, el resultado y el asesor **bloqueados**, no sobre una lectura previa (E2b, Revisión E5). Catálogos y parámetros se leen antes de abrirla.
 *
 * La etapa nunca toca la fase del proyecto (RN-03.36, RN-03.44): solo
 * `last_activity_at`.
 */
@Injectable()
export class OpportunityStageService {
  constructor(
    @Inject(OPPORTUNITIES_REPOSITORY) private readonly opportunities: OpportunitiesRepository,
    @Inject(PROJECTS_REPOSITORY) private readonly projects: ProjectsRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    private readonly access: OpportunityAccessService,
    private readonly service: OpportunitiesService,
    private readonly catalogs: ProjectCatalogsService,
    private readonly catalogValidator: CatalogReferenceValidator,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  async changeStage(actor: OpportunityActor, opportunityId: string, request: StageChangeRequest): Promise<OpportunityDetailView> {
    const visible = await this.access.findEditable(actor, opportunityId);
    const actorId = actor.userId as string;
    const [stages, map, outcomes, reasons] = await Promise.all([
      this.service.stages(),
      this.service.transitionMap(),
      this.catalogs.items(OPPORTUNITY_CATALOGS.outcome),
      this.catalogs.items(OPPORTUNITY_CATALOGS.reason),
    ]);
    // F.2 paso 1: destino activo de `crm.etapa_oportunidad`.
    await this.catalogValidator.assertItem(OPPORTUNITY_CATALOGS.stage, request.toStageId, { field: 'toStageId', requireActive: true });
    const target = stages.find((stage) => stage.id === request.toStageId);
    if (!target) throw new Error('Validated stage missing from the catalog read');
    const comment = request.comment?.trim() ? request.comment.trim() : null;
    const result = request.result ? normalizeResult(request.result) : null;
    const projectId = visible.record.project.id;
    const at = new Date();

    const outcome = await this.transactions.run(async (tx): Promise<StageChangeOutcome> => {
      // Visibilidad, edición, `canClose` y `canReopen` sobre la fila bloqueada (Revisión E5, M4).
      const current = await this.service.lockForWrite(actor, opportunityId, projectId, visible.scopes, tx);
      const { locked } = current;
      const from = stages.find((stage) => stage.id === locked.stageId);
      if (!from) throw new Error('Current stage missing from the catalog read');
      const plan = planStageChange(
        {
          from,
          to: target,
          hasComment: comment !== null,
          hasResult: result !== null,
          currentResult: locked.hasResult,
          canClose: canCloseOpportunity(actor, current.subject),
          canReopen: canReopenOpportunity(actor, current.subject),
        },
        stages,
        map,
      );
      if (plan.kind === 'REJECT') throw this.rejection(plan.reason, from, target);

      const previous = locked.hasResult ? current.record.result : null;
      if (plan.kind === 'CLOSE') {
        const closing = result as NormalizedResult;
        await this.assertResult(closing, target, outcomes, reasons, 'result.', null, tx);
        await this.opportunities.upsertResult(opportunityId, closing, actorId, at, tx);
        await this.opportunities.insertResultHistory(
          { opportunityId, action: plan.replacesResult ? 'CHANGED' : 'RECORDED', result: closing, changedById: actorId, at },
          tx,
        );
      }
      if (plan.kind === 'REOPEN' && locked.hasResult) {
        // RN-03.42: la reapertura anula el resultado vigente.
        await this.opportunities.deleteResult(opportunityId, tx);
        await this.opportunities.insertResultHistory({ opportunityId, action: 'CLEARED', result: null, changedById: actorId, at }, tx);
      }
      const closedAt = plan.kind === 'REOPEN' ? null : plan.kind === 'CLOSE' && !isClosedStage(from) ? at : undefined;
      await this.opportunities.changeStage(opportunityId, { stageId: target.id, closedAt, at }, actorId, tx);
      await this.opportunities.insertStageHistory({ opportunityId, fromStageId: from.id, toStageId: target.id, comment, changedById: actorId, at }, tx);
      await this.projects.touchLastActivity([projectId], at, tx);
      return { plan, fromStageId: from.id, previousResult: previous };
    });

    const after = await this.service.mustFind(opportunityId);
    this.logger.info('opportunity_stage_changed', {
      correlationId: actor.audit.correlationId,
      projectId,
      opportunityId,
      fromStageId: outcome.fromStageId,
      toStageId: target.id,
    });
    await this.audit.record(OPPORTUNITY_AUDIT_EVENTS.stageChanged, actor.audit, {
      resourceType: OPPORTUNITY_AUDIT_RESOURCE,
      resourceId: opportunityId,
      before: { stageId: outcome.fromStageId },
      after: { stageId: target.id, comment },
      maskedFields: STAGE_CHANGE_MASKED_FIELDS,
      metadata: { projectId },
    });
    if (outcome.plan.kind === 'CLOSE') {
      await this.audit.record(outcome.plan.replacesResult ? OPPORTUNITY_AUDIT_EVENTS.resultChanged : OPPORTUNITY_AUDIT_EVENTS.resultRecorded, actor.audit, {
        resourceType: OPPORTUNITY_AUDIT_RESOURCE,
        resourceId: opportunityId,
        before: resultAuditState(outcome.previousResult),
        after: resultAuditState(after.result),
        maskedFields: RESULT_MASKED_FIELDS,
        metadata: { projectId },
      });
    }
    if (outcome.plan.kind === 'REOPEN' && outcome.previousResult) {
      await this.audit.record(OPPORTUNITY_AUDIT_EVENTS.resultCleared, actor.audit, {
        resourceType: OPPORTUNITY_AUDIT_RESOURCE,
        resourceId: opportunityId,
        before: resultAuditState(outcome.previousResult),
        after: null,
        maskedFields: RESULT_MASKED_FIELDS,
        metadata: { projectId },
      });
    }
    return this.service.detail(actor, toVisibleOpportunity(after, visible.scopes));
  }

  /**
   * RN-03.52: modificar el resultado vigente sin salir de la etapa cerrada
   * (`oportunidades.cerrar`, propia o `administrar`). Una abierta → `409
   * OPPORTUNITY_NOT_CLOSED`; un resultado de la otra etapa (`WON` ↔ `LOST`) →
   * `422 RESULT_STAGE_MISMATCH` (exige reabrir). Sin diferencias: no escribe ni audita.
   */
  async updateResult(actor: OpportunityActor, opportunityId: string, input: ResultInput): Promise<OpportunityResultRecord> {
    const visible = await this.access.findVisible(actor, opportunityId);
    assertCanSetResult(actor, visible.subject);
    const actorId = actor.userId as string;
    const [stages, outcomes, reasons] = await Promise.all([
      this.service.stages(),
      this.catalogs.items(OPPORTUNITY_CATALOGS.outcome),
      this.catalogs.items(OPPORTUNITY_CATALOGS.reason),
    ]);
    const result = normalizeResult(input);
    const projectId = visible.record.project.id;
    const at = new Date();

    const change = await this.transactions.run(async (tx) => {
      // Política sobre la fila bloqueada (Revisión E5, M4): el asesor pudo cambiar entre tanto.
      const locked = await this.lockedForResult(actor, opportunityId, projectId, visible.scopes, tx);
      const stage = stages.find((item) => item.id === locked.locked.stageId);
      if (!stage) throw new Error('Current stage missing from the catalog read');
      if (!isClosedStage(stage)) throw opportunityNotClosedError(stage);
      const current = locked.record.result;
      await this.assertResult(result, stage, outcomes, reasons, '', current?.reason?.id ?? null, tx);
      if (current && sameResult(toNormalized(current), result)) return { changed: false as const, previous: current };
      await this.opportunities.upsertResult(opportunityId, result, actorId, at, tx);
      await this.opportunities.insertResultHistory({ opportunityId, action: current ? 'CHANGED' : 'RECORDED', result, changedById: actorId, at }, tx);
      await this.projects.touchLastActivity([projectId], at, tx);
      return { changed: true as const, previous: current };
    });

    const after = await this.service.mustFind(opportunityId);
    if (change.changed) {
      this.logger.info('opportunity_result_changed', { correlationId: actor.audit.correlationId, projectId, opportunityId });
      await this.audit.record(change.previous ? OPPORTUNITY_AUDIT_EVENTS.resultChanged : OPPORTUNITY_AUDIT_EVENTS.resultRecorded, actor.audit, {
        resourceType: OPPORTUNITY_AUDIT_RESOURCE,
        resourceId: opportunityId,
        before: resultAuditState(change.previous),
        after: resultAuditState(after.result),
        maskedFields: RESULT_MASKED_FIELDS,
        metadata: { projectId },
      });
    }
    if (!after.result) throw new Error('Opportunity result missing after write');
    return after.result;
  }

  /** Bloqueos (proyecto y oportunidad) y política de `PUT /result` sobre la fila bloqueada. */
  private async lockedForResult(
    actor: OpportunityActor,
    opportunityId: string,
    projectId: string,
    scopes: OpportunityAccessScopes,
    tx: TransactionContext,
  ): Promise<VisibleOpportunity & { readonly locked: LockedOpportunity }> {
    if (!(await this.projects.lockProject(projectId, 'UPDATE', tx))) throw opportunityNotFound(opportunityId);
    const locked = await this.opportunities.lock(opportunityId, projectId, tx);
    if (!locked) throw opportunityNotFound(opportunityId);
    const record = await this.opportunities.findById(opportunityId, scopes.view, tx);
    if (!record) throw opportunityNotFound(opportunityId);
    const visible = toVisibleOpportunity(record, scopes);
    assertCanSetResult(actor, visible.subject);
    return { ...visible, locked };
  }

  /**
   * RN-03.47–RN-03.50 y el motivo: correspondencia con la etapa, motivo y porcentaje
   * (todas las incidencias), después la pertenencia del motivo a su catálogo (activo, o
   * el actual si no cambia) y su `appliesTo`, dentro de la transacción.
   */
  private async assertResult(
    result: NormalizedResult,
    stage: StageItem,
    outcomes: readonly StageItem[],
    reasons: readonly StageItem[],
    prefix: string,
    currentReasonId: string | null,
    tx: TransactionContext,
  ): Promise<void> {
    const issues = resultIssues(result, stage, outcomes, prefix);
    if (issues.length > 0) throw opportunityIssuesError(issues);
    if (result.reasonId === null) return;
    const field = `${prefix}reasonId`;
    await this.catalogValidator.assertItem(OPPORTUNITY_CATALOGS.reason, result.reasonId, { field, requireActive: true, currentId: currentReasonId, tx });
    const reason = reasons.find((item) => item.id === result.reasonId);
    if (!reason || !reasonAppliesTo(reason).includes(result.outcome as OpportunityOutcomeCode)) {
      throw new BusinessRuleViolationError(INVALID_CATALOG_VALUE, 'The reason does not apply to the result', [
        { field, catalogKey: OPPORTUNITY_CATALOGS.reason, reason: 'NOT_APPLICABLE' },
      ]);
    }
  }

  private rejection(reason: StageChangeRejection, from: StageItem, to: StageItem): Error {
    switch (reason) {
      case 'REOPEN_FORBIDDEN':
        return new PermissionDeniedError(OPPORTUNITY_PERMISSIONS.administer);
      case 'CLOSE_FORBIDDEN':
        return new PermissionDeniedError(OPPORTUNITY_PERMISSIONS.close);
      case 'STAGE_UNCHANGED':
        return opportunityIssuesError([opportunityIssue('toStageId', OPPORTUNITY_ERROR_CODES.stageUnchanged, { stageCode: from.code })]);
      case 'INVALID_STAGE_TRANSITION':
        return opportunityIssuesError([
          opportunityIssue('toStageId', OPPORTUNITY_ERROR_CODES.invalidStageTransition, { fromStageCode: from.code, toStageCode: to.code }),
        ]);
      case 'COMMENT_REQUIRED':
        return opportunityIssuesError([opportunityIssue('comment', OPPORTUNITY_ERROR_CODES.commentRequired)]);
      case 'RESULT_REQUIRED':
        return opportunityIssuesError([opportunityIssue('result', OPPORTUNITY_ERROR_CODES.resultRequired, { stageCode: to.code })]);
      case 'RESULT_NOT_ALLOWED':
      default:
        return opportunityIssuesError([opportunityIssue('result', OPPORTUNITY_ERROR_CODES.resultNotAllowed, { stageCode: to.code })]);
    }
  }
}
