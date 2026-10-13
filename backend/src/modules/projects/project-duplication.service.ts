import { Inject, Injectable } from '@nestjs/common';

import type { CalendarDate } from '@/common/calendar-date';
import { PermissionDeniedError } from '@/common/errors/application-error';
import { UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

import { type DuplicationOptions, duplicationPlan, type DuplicationSource, type PlannedClassification } from './duplication-plan';
import { canAssignOwner } from './project-access-policy';
import { type ProjectActor, ProjectAccessService, toVisibleProject } from './project-access.service';
import { PROJECT_AUDIT_EVENTS } from './project-audit';
import { tonnageModeOf } from './project-classification.service';
import { PROJECT_PERMISSIONS } from './project-constants';
import { type NewProjectDraft, ProjectCreationService } from './project-creation.service';
import { fieldNotEditableError } from './project-errors';
import { ProjectProductsService } from './project-products.service';
import { normalizeProjectCode } from './project-rules';
import { type ProjectDetailView, ProjectsService } from './projects.service';
import { PROJECT_PRODUCTS_REPOSITORY, type ProjectProductsRepository } from './ports/project-products.repository.port';
import type { ProjectClassificationInput, ProjectRecord } from './ports/projects.repository.port';

export interface DuplicateProjectRequest {
  readonly name: string;
  readonly customerId?: string;
  readonly ownerId?: string;
  readonly code?: string;
  readonly estimatedStartDate?: CalendarDate | null;
  readonly estimatedEndDate?: CalendarDate | null;
  readonly estimatedDecisionDate?: CalendarDate | null;
  readonly copy: DuplicationOptions;
}

function sourceOf(record: ProjectRecord, products: DuplicationSource['products']): DuplicationSource {
  return {
    name: record.name,
    customerId: record.customer.id,
    countryId: record.country.id,
    city: record.city,
    address: record.address,
    description: record.description,
    estimatedStartDate: record.estimatedStartDate,
    estimatedEndDate: record.estimatedEndDate,
    estimatedDecisionDate: record.estimatedDecisionDate,
    classification: {
      projectTypeId: record.projectType?.id ?? null,
      projectTypeActive: record.projectType?.isActive ?? false,
      sectorId: record.sector?.id ?? null,
      sectorActive: record.sector?.isActive ?? false,
      measureUnitId: record.measureUnit?.id ?? null,
      measureUnitActive: record.measureUnit?.isActive ?? false,
      estimatedQuantity: record.estimatedQuantity,
      mode: tonnageModeOf(record),
      estimatedTonnage: record.estimatedTonnage,
    },
    products,
  };
}

/**
 * Duplicar proyecto (03 F-12, C.4). Exige `proyectos.crear` (controlador) y el origen
 * visible (`404`). Lo que se copia lo decide `duplication-plan.ts`; aquí se resuelven
 * el asesor (RN-03.6), el código (DM-17) y el tonelaje con las reglas **vigentes**
 * (RN-03.21, RN-03.22). El alta la hace `ProjectCreationService` en una transacción
 * con el proyecto, su historial de fase inicial y los productos copiados.
 */
@Injectable()
export class ProjectDuplicationService {
  constructor(
    @Inject(PROJECT_PRODUCTS_REPOSITORY) private readonly projectProducts: ProjectProductsRepository,
    private readonly access: ProjectAccessService,
    private readonly creation: ProjectCreationService,
    private readonly productsService: ProjectProductsService,
    private readonly projectsService: ProjectsService,
    private readonly conversions: UnitConversionResolver,
  ) {}

  async duplicate(actor: ProjectActor, sourceId: string, request: DuplicateProjectRequest): Promise<ProjectDetailView> {
    const actorId = actor.userId;
    if (!actorId) throw new PermissionDeniedError(PROJECT_PERMISSIONS.create);
    const source = await this.access.findVisible(actor, sourceId);
    const administers = actor.permissions.has(PROJECT_PERMISSIONS.administer);
    const code = normalizeProjectCode(request.code);
    const reserved: string[] = [];
    if (request.ownerId !== undefined && !canAssignOwner(actor, request.ownerId)) reserved.push('ownerId');
    if (code !== null && !administers) reserved.push('code');
    if (reserved.length > 0) throw fieldNotEditableError(reserved, PROJECT_PERMISSIONS.administer);
    // Asesor por defecto (RN-03.20): el del origen si el actor puede asignarlo (con
    // `administrar` y el asesor dentro de su alcance, ACTIVE y con rol del CRM); si no, él
    // mismo. Un administrador con alcance de administrar más estrecho que el de ver
    // duplica así sin `422 INVALID_OWNER` (Revisión E5, nit).
    const ownerId =
      request.ownerId?.toLowerCase() ??
      (administers && (await this.access.isAssignableOwner(actor, source.record.owner.id, source.scopes)) ? source.record.owner.id : actorId);

    const sourceProducts = request.copy.products ? await this.projectProducts.listDuplicable(sourceId) : [];
    const plan = duplicationPlan(sourceOf(source.record, sourceProducts), request.copy, {
      name: request.name,
      customerId: request.customerId,
      estimatedStartDate: request.estimatedStartDate,
      estimatedEndDate: request.estimatedEndDate,
      estimatedDecisionDate: request.estimatedDecisionDate,
    });
    const classification = plan.classification ? await this.classificationInput(plan.classification) : null;
    const projectTypeId = classification?.projectTypeId ?? null;
    const initialStatusId = plan.products.length > 0 ? await this.productsService.initialStatusId() : null;
    const products: NewProjectDraft['products'][number][] = [];
    for (const line of plan.products) {
      const conversion = await this.conversions.resolve({ fromUnitId: line.unitId, productId: line.productId, projectTypeId });
      products.push({
        productId: line.productId,
        opportunityId: null,
        quantity: line.quantity,
        unitId: line.unitId,
        conversionRuleId: conversion?.ruleId ?? null,
        conversionFactor: conversion?.factor ?? null,
        tonnage: conversion ? this.conversions.tonnageFor(line.quantity, conversion) : null,
        statusId: initialStatusId as string,
        notes: null,
      });
    }

    const created = await this.creation.create(
      actor,
      {
        name: plan.name,
        customerId: plan.customerId,
        countryId: plan.countryId,
        city: plan.city,
        address: plan.address,
        description: plan.description,
        estimatedStartDate: plan.estimatedStartDate,
        estimatedEndDate: plan.estimatedEndDate,
        estimatedDecisionDate: plan.estimatedDecisionDate,
        ownerId,
        code,
        classification,
        products,
      },
      { event: PROJECT_AUDIT_EVENTS.duplicated, duplicatedFromId: sourceId },
    );
    return this.projectsService.toDetail(actor, toVisibleProject(created, await this.access.scopes(actor)));
  }

  /** RN-03.21: con regla, la **vigente** al duplicar (sin regla aplicable, queda sin estimación); manual, se copia. */
  private async classificationInput(planned: PlannedClassification): Promise<ProjectClassificationInput> {
    const base = {
      projectTypeId: planned.projectTypeId,
      sectorId: planned.sectorId,
      measureUnitId: planned.measureUnitId,
      estimatedQuantity: planned.estimatedQuantity,
    };
    if (planned.mode === 'RULE' && planned.measureUnitId !== null && planned.estimatedQuantity !== null) {
      const conversion = await this.conversions.resolve({ fromUnitId: planned.measureUnitId, projectTypeId: planned.projectTypeId });
      if (conversion) {
        return {
          ...base,
          conversionRuleId: conversion.ruleId,
          conversionFactor: conversion.factor,
          estimatedTonnage: this.conversions.tonnageFor(planned.estimatedQuantity, conversion),
        };
      }
    }
    return {
      ...base,
      conversionRuleId: null,
      conversionFactor: null,
      estimatedTonnage: planned.mode === 'MANUAL' ? planned.manualTonnage : null,
    };
  }
}
