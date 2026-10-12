import { Inject, Injectable } from '@nestjs/common';

import type { CalendarDate } from '@/common/calendar-date';
import { PermissionDeniedError } from '@/common/errors/application-error';
import { SEQUENCE_GENERATOR, type SequenceGenerator } from '@/infrastructure/database/ports/sequence-generator.port';
import { TRANSACTION_RUNNER, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CatalogReferenceValidator } from '@/modules/catalogs/catalog-reference.validator';
import { CustomerReferenceGuard } from '@/modules/customers/customer-reference.guard';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import { defaultProgressOf } from './phase-rules';
import { type ProjectActor, ProjectAccessService } from './project-access.service';
import { PROJECT_AUDIT_EVENTS, PROJECT_AUDIT_RESOURCE, PROJECT_MASKED_FIELDS, projectAuditState } from './project-audit';
import { ProjectCatalogsService } from './project-catalogs.service';
import { PROJECT_CATALOGS, PROJECT_DEFAULT_KEYS, PROJECT_PARAMETERS, PROJECT_PERMISSIONS, PROJECT_SEQUENCE_KEY } from './project-constants';
import { PROJECT_ERROR_CODES, projectCodeTakenError, type ProjectIssue, projectIssue, projectIssuesError } from './project-errors';
import { dateRangeIssue, missingRequiredFieldIssues, projectRequiredFields } from './project-rules';
import { PROJECT_PRODUCTS_REPOSITORY, type ProjectProductsRepository, type ProjectProductWrite } from './ports/project-products.repository.port';
import {
  type ProjectClassificationInput,
  ProjectCodeConflictError,
  type ProjectRecord,
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from './ports/projects.repository.port';

/** Proyecto a crear, ya autorizado (asesor y código revisados por el llamador, RN-03.6, DM-17). */
export interface NewProjectDraft {
  readonly name: string;
  readonly customerId: string;
  /** `null` = país del cliente (RN-03.5). */
  readonly countryId: string | null;
  readonly city: string | null;
  readonly address: string | null;
  readonly description: string | null;
  readonly estimatedStartDate: CalendarDate | null;
  readonly estimatedEndDate: CalendarDate | null;
  readonly estimatedDecisionDate: CalendarDate | null;
  readonly ownerId: string;
  /** Código manual normalizado, o `null` para generarlo con la secuencia. */
  readonly code: string | null;
  readonly classification: ProjectClassificationInput | null;
  /** Asociaciones a crear con el proyecto (duplicado, RN-03.22). */
  readonly products: readonly (ProjectProductWrite & { readonly productId: string })[];
}

export interface NewProjectContext {
  readonly event: typeof PROJECT_AUDIT_EVENTS.created | typeof PROJECT_AUDIT_EVENTS.duplicated;
  readonly duplicatedFromId: string | null;
}

/**
 * Alta de proyectos (03 C.1, RN-03.1–RN-03.8), compartida por `POST /projects` y el
 * duplicado. Lo que no depende de la transacción (parámetros, alcances, fase por
 * defecto) se lee **antes** de abrirla; dentro van, en orden: cliente utilizable
 * (`CustomerReferenceGuard` con `FOR SHARE`), país, asesor, código (manual o folio
 * de la secuencia, lo más tarde posible) e inserciones.
 */
@Injectable()
export class ProjectCreationService {
  constructor(
    @Inject(PROJECTS_REPOSITORY) private readonly projects: ProjectsRepository,
    @Inject(PROJECT_PRODUCTS_REPOSITORY) private readonly projectProducts: ProjectProductsRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(SEQUENCE_GENERATOR) private readonly sequences: SequenceGenerator,
    private readonly access: ProjectAccessService,
    private readonly customerGuard: CustomerReferenceGuard,
    private readonly catalogValidator: CatalogReferenceValidator,
    private readonly catalogs: ProjectCatalogsService,
    private readonly parameters: ParameterReader,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  async create(actor: ProjectActor, draft: NewProjectDraft, context: NewProjectContext): Promise<ProjectRecord> {
    const actorId = actor.userId;
    if (!actorId) throw new PermissionDeniedError(PROJECT_PERMISSIONS.create);

    const [scopes, requiredParameter, timeZone, phase] = await Promise.all([
      this.access.scopes(actor),
      this.parameters.get<Record<string, string[] | undefined>>(PROJECT_PARAMETERS.requiredFields),
      this.parameters.get<string>(PROJECT_PARAMETERS.timeZone),
      this.defaultPhase(),
    ]);
    const required = projectRequiredFields(requiredParameter);
    const issues: ProjectIssue[] = missingRequiredFieldIssues(
      required.general,
      // El país por defecto (el del cliente) y el asesor por defecto (el actor) siempre existen.
      { ...draft, countryId: draft.countryId ?? draft.customerId },
      'create',
    );
    const dates = dateRangeIssue(draft.estimatedStartDate, draft.estimatedEndDate);
    if (dates) issues.push(dates);
    if (issues.length > 0) throw projectIssuesError(issues);
    const assignable = this.access.assignableOwners(actor, scopes);
    const at = new Date();

    let projectId: string;
    try {
      projectId = await this.transactions.run(async (tx) => {
        const customer = await this.customerGuard.assertUsableCustomer(draft.customerId, actor, { requireActive: true, tx });
        const countryId = draft.countryId ?? customer.countryId;
        const txIssues: ProjectIssue[] = [];
        const country = await this.projects.findCountry(countryId, tx);
        if (!country || !country.isActive) txIssues.push(projectIssue('countryId', PROJECT_ERROR_CODES.unknownReference));
        if (draft.ownerId !== actorId) {
          const eligible = await this.projects.findEligibleOwner(draft.ownerId, assignable, PROJECT_PERMISSIONS.view, tx);
          if (!eligible) txIssues.push(projectIssue('ownerId', PROJECT_ERROR_CODES.invalidOwner));
        }
        // La fase por defecto se revalida dentro (00 §3.5).
        await this.catalogValidator.assertItem(PROJECT_CATALOGS.phase, phase.id, { field: 'phaseId', requireActive: true, tx });
        if (txIssues.length > 0) throw projectIssuesError(txIssues);

        if (draft.code && (await this.projects.codeExists(draft.code, null, tx))) throw projectCodeTakenError(draft.code);
        const code = draft.code ?? (await this.sequences.next(PROJECT_SEQUENCE_KEY, tx, { at, timeZone }));
        const id = await this.projects.create(
          {
            code,
            name: draft.name,
            customerId: draft.customerId,
            countryId,
            city: draft.city,
            address: draft.address,
            description: draft.description,
            estimatedStartDate: draft.estimatedStartDate,
            estimatedEndDate: draft.estimatedEndDate,
            estimatedDecisionDate: draft.estimatedDecisionDate,
            ownerId: draft.ownerId,
            phaseId: phase.id,
            phaseProgress: phase.progress,
            duplicatedFromId: context.duplicatedFromId,
            classification: draft.classification,
            createdById: actorId,
            at,
          },
          tx,
        );
        for (const line of draft.products) {
          await this.projectProducts.create({ ...line, projectId: id, createdById: actorId }, tx);
        }
        return id;
      });
    } catch (error) {
      // Carrera con el índice único (RN-03.1): mismo 409, nunca 500.
      if (error instanceof ProjectCodeConflictError) throw projectCodeTakenError(draft.code ?? '');
      throw error;
    }

    const created = await this.projects.findById(projectId, null);
    if (!created) throw new Error('Created project not found');
    this.logger.info(context.event === PROJECT_AUDIT_EVENTS.created ? 'project_created' : 'project_duplicated', {
      correlationId: actor.audit.correlationId,
      projectId,
      sourceProjectId: context.duplicatedFromId,
      productLines: draft.products.length,
    });
    await this.audit.record(context.event, actor.audit, {
      resourceType: PROJECT_AUDIT_RESOURCE,
      resourceId: projectId,
      before: null,
      after: projectAuditState(created),
      maskedFields: PROJECT_MASKED_FIELDS,
      metadata: {
        code: created.code,
        ...(context.duplicatedFromId ? { sourceProjectId: context.duplicatedFromId, productLinesCopied: draft.products.length } : {}),
      },
    });
    return created;
  }

  /**
   * Fase inicial (RN-03.7): `crm.valores_por_defecto["project.phaseId"]`; si falta o no
   * es un elemento activo, la primera fase activa por `metadata.order` (con aviso en el
   * log). Porcentaje = `metadata.defaultProgress` o 0.
   */
  async defaultPhase(): Promise<{ id: string; code: string; progress: string }> {
    const [defaults, semantics] = await Promise.all([
      this.parameters.get<Record<string, string | undefined>>(PROJECT_PARAMETERS.defaultValues),
      this.catalogs.phaseAndStageSemantics(),
    ]);
    const code = defaults[PROJECT_DEFAULT_KEYS.phase];
    const active = semantics.phases.filter((item) => item.isActive);
    let phase = active.find((item) => item.code === code);
    if (!phase) {
      this.logger.warn('project_default_phase_fallback', { parameter: PROJECT_PARAMETERS.defaultValues, key: PROJECT_DEFAULT_KEYS.phase });
      phase = active[0];
    }
    if (!phase) throw new Error('No active phase in crm.fase_cliente');
    return { id: phase.id, code: phase.code, progress: defaultProgressOf(phase.metadata) ?? '0.00' };
  }
}
