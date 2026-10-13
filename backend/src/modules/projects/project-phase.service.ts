import { Inject, Injectable } from '@nestjs/common';

import { roundDecimal } from '@/common/decimal';
import { PermissionDeniedError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { TRANSACTION_RUNNER, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CatalogReferenceValidator } from '@/modules/catalogs/catalog-reference.validator';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import {
  defaultProgressOf,
  isPhaseUnchanged,
  PROGRESS_SCALE,
  type ProgressRules,
  progressIssue,
  progressRuleIssue,
  resolveTargetProgress,
} from './phase-rules';
import { type ProjectActor, ProjectAccessService } from './project-access.service';
import { PHASE_MASKED_FIELDS, PROJECT_AUDIT_EVENTS, PROJECT_AUDIT_RESOURCE } from './project-audit';
import { PROJECT_CATALOGS, PROJECT_PARAMETERS, PROJECT_PERMISSIONS } from './project-constants';
import { PROJECT_ERROR_CODES, projectIssuesError } from './project-errors';
import { type PhaseHistoryRecord, type ProjectRecord, PROJECTS_REPOSITORY, type ProjectsRepository } from './ports/projects.repository.port';

export interface PhaseChangeRequest {
  readonly phaseId: string;
  /** Cadena decimal; se valida aquí (`422 INVALID_PROGRESS`). */
  readonly progress?: string;
  readonly comment?: string | null;
}

/**
 * Fase del cliente (03 F-16, C.6). Independiente de las oportunidades (RN-03.36):
 * este servicio nunca escribe etapas.
 *
 * El cambio se valida y escribe con la fila del proyecto bloqueada (`FOR UPDATE`): la
 * fase "actual" con la que se compara es la de dentro de la transacción, así dos
 * cambios simultáneos se serializan y cada uno deja su fila de historial coherente.
 */
@Injectable()
export class ProjectPhaseService {
  constructor(
    @Inject(PROJECTS_REPOSITORY) private readonly projects: ProjectsRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    private readonly access: ProjectAccessService,
    private readonly catalogValidator: CatalogReferenceValidator,
    private readonly parameters: ParameterReader,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  async history(actor: ProjectActor, projectId: string, page: { page: number; pageSize: number; sortOrder: 'asc' | 'desc' }): Promise<Page<PhaseHistoryRecord>> {
    await this.access.findVisible(actor, projectId);
    return this.projects.listPhaseHistory(projectId, page);
  }

  async change(actor: ProjectActor, projectId: string, request: PhaseChangeRequest): Promise<ProjectRecord> {
    const visible = await this.access.findEditable(actor, projectId);
    const actorId = actor.userId;
    if (!actorId) throw new PermissionDeniedError(PROJECT_PERMISSIONS.edit);
    if (request.progress !== undefined) {
      const issue = progressIssue(request.progress);
      if (issue) throw projectIssuesError([issue]);
    }
    const rules = await this.parameters.get<ProgressRules>(PROJECT_PARAMETERS.progressRules);
    const comment = request.comment?.trim() || null;
    const at = new Date();

    const change = await this.transactions.run(async (tx) => {
      // Visibilidad y política sobre el proyecto bloqueado (Revisión E5, M4).
      const current = (await this.access.lockEditable(actor, projectId, visible.scopes, tx)).record;
      // RN-03.11: una fase desactivada se conserva solo si no cambia.
      const phase = await this.catalogValidator.assertItem(PROJECT_CATALOGS.phase, request.phaseId, {
        field: 'phaseId',
        requireActive: true,
        currentId: current.phase.id,
        tx,
      });
      const progress = roundDecimal(
        resolveTargetProgress(
          { phaseId: current.phase.id, progress: current.phaseProgress },
          { phaseId: phase.id, defaultProgress: defaultProgressOf(phase.metadata as Record<string, unknown> | null) },
          request.progress,
        ),
        PROGRESS_SCALE,
      );
      if (isPhaseUnchanged({ phaseId: current.phase.id, progress: current.phaseProgress }, { phaseId: phase.id, progress })) {
        throw projectIssuesError([
          { field: 'phaseId', code: PROJECT_ERROR_CODES.phaseUnchanged, message: 'The phase and progress are already the current ones' },
        ]);
      }
      const ruleIssue = progressRuleIssue(phase.code, progress, rules);
      if (ruleIssue) throw projectIssuesError([ruleIssue]);
      const fromProgress = current.phaseProgress;
      await this.projects.changePhase(
        projectId,
        { fromPhaseId: current.phase.id, toPhaseId: phase.id, fromProgress, toProgress: progress, comment, changedById: actorId, at },
        tx,
      );
      return { fromPhaseId: current.phase.id, fromProgress, fromComment: current.phaseComment, toPhaseId: phase.id, toProgress: progress };
    });

    const after = await this.projects.findById(projectId, null);
    if (!after) throw new Error('Updated project not found');
    this.logger.info('project_phase_changed', { correlationId: actor.audit.correlationId, projectId, toPhaseId: change.toPhaseId });
    await this.audit.record(PROJECT_AUDIT_EVENTS.phaseChanged, actor.audit, {
      resourceType: PROJECT_AUDIT_RESOURCE,
      resourceId: projectId,
      before: { phaseId: change.fromPhaseId, phaseProgress: change.fromProgress, comment: change.fromComment },
      after: { phaseId: change.toPhaseId, phaseProgress: change.toProgress, comment },
      maskedFields: PHASE_MASKED_FIELDS,
    });
    return after;
  }
}
