import { Inject, Injectable } from '@nestjs/common';

import { compareDecimal, type DecimalString, isDecimalString, roundDecimal } from '@/common/decimal';
import { TRANSACTION_RUNNER, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CatalogReferenceValidator } from '@/modules/catalogs/catalog-reference.validator';
import { ParameterReader } from '@/modules/parameters/parameter-reader';
import { ProductsService } from '@/modules/products/products.service';
import { type ResolvedConversion, UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

import type { TonnageMode } from './duplication-plan';
import { QUANTITY_SCALE } from './product-totals';
import { type ProjectActor, ProjectAccessService } from './project-access.service';
import { classificationAuditState, PROJECT_AUDIT_EVENTS, PROJECT_AUDIT_RESOURCE } from './project-audit';
import { PROJECT_CATALOGS, PROJECT_PARAMETERS } from './project-constants';
import { fieldValidationError, PROJECT_ERROR_CODES, type ProjectIssue, projectIssue, projectIssuesError } from './project-errors';
import { missingRequiredFieldIssues, projectRequiredFields } from './project-rules';
import { type ProjectClassificationInput, type ProjectRecord, PROJECTS_REPOSITORY, type ProjectsRepository } from './ports/projects.repository.port';

/** PUT (03 F.1 `UpdateClassificationDto`): reemplaza la clasificación; omitido = `null`. */
export interface ClassificationRequest {
  readonly projectTypeId?: string | null;
  readonly sectorId?: string | null;
  readonly measureUnitId?: string | null;
  readonly estimatedQuantity?: string | null;
  readonly tonnageMode: TonnageMode;
  readonly manualTonnage?: string | null;
}

/** Modo de estimación de una clasificación guardada (RN-03.26): no tiene columna, se deriva. */
export function tonnageModeOf(record: Pick<ProjectRecord, 'conversion' | 'estimatedTonnage'>): TonnageMode {
  if (record.conversion) return 'RULE';
  return record.estimatedTonnage !== null ? 'MANUAL' : 'NONE';
}

/** Cantidad o tonelaje no negativo con 4 decimales (RN-03.26, RN-03.30); si no, `422 INVALID_QUANTITY`. */
export function quantityIssue(value: string, field: string): ProjectIssue | null {
  const valid = isDecimalString(value, { maxScale: QUANTITY_SCALE, maxIntegerDigits: 15, allowNegative: true }) && compareDecimal(value, '0') >= 0;
  return valid ? null : projectIssue(field, PROJECT_ERROR_CODES.invalidQuantity);
}

/**
 * Clasificación del proyecto (03 F-15, C.5). Sin factores fijos: con `RULE` el backend
 * resuelve la regla vigente con `UnitConversionResolver` (PROJECT_TYPE > GLOBAL hacia
 * `crm.forecast.unidad_tonelaje`) y guarda la **foto** de regla y factor (RN-03.29);
 * `MANUAL` solo existe en el proyecto (DM-24).
 */
@Injectable()
export class ProjectClassificationService {
  constructor(
    @Inject(PROJECTS_REPOSITORY) private readonly projects: ProjectsRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    private readonly access: ProjectAccessService,
    private readonly catalogValidator: CatalogReferenceValidator,
    private readonly products: ProductsService,
    private readonly conversions: UnitConversionResolver,
    private readonly parameters: ParameterReader,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  async update(actor: ProjectActor, projectId: string, request: ClassificationRequest): Promise<ProjectRecord> {
    const visible = await this.access.findEditable(actor, projectId);
    const mode = request.tonnageMode;
    const values = {
      projectTypeId: request.projectTypeId ?? null,
      sectorId: request.sectorId ?? null,
      measureUnitId: request.measureUnitId ?? null,
      estimatedQuantity: request.estimatedQuantity ?? null,
    };
    const manualTonnage = request.manualTonnage ?? null;
    if (mode !== 'MANUAL' && manualTonnage !== null) throw fieldValidationError('manualTonnage', 'manualTonnage is only allowed with tonnageMode MANUAL');

    const requiredParameter = await this.parameters.get<Record<string, string[] | undefined>>(PROJECT_PARAMETERS.requiredFields);
    const issues: ProjectIssue[] = missingRequiredFieldIssues(projectRequiredFields(requiredParameter).classification, values, 'create');
    if (mode === 'RULE') {
      // RN-03.26: con regla se exigen unidad y cantidad.
      for (const field of ['measureUnitId', 'estimatedQuantity'] as const) {
        if (values[field] === null && !issues.some((issue) => issue.field === field)) {
          issues.push(projectIssue(field, PROJECT_ERROR_CODES.requiredFieldMissing, { tonnageMode: 'RULE' }));
        }
      }
    }
    if (mode === 'MANUAL' && manualTonnage === null) issues.push(projectIssue('manualTonnage', PROJECT_ERROR_CODES.requiredFieldMissing));
    if (values.estimatedQuantity !== null) {
      const issue = quantityIssue(values.estimatedQuantity, 'estimatedQuantity');
      if (issue) issues.push(issue);
    }
    if (manualTonnage !== null) {
      const issue = quantityIssue(manualTonnage, 'manualTonnage');
      if (issue) issues.push(issue);
    }
    if (issues.length > 0) throw projectIssuesError(issues);

    const quantity: DecimalString | null = values.estimatedQuantity === null ? null : roundDecimal(values.estimatedQuantity, QUANTITY_SCALE);
    // La regla se resuelve antes de abrir la transacción (lee parámetros); su error se
    // lanza después de validar catálogos, para respetar el orden de las incidencias.
    let conversion: ResolvedConversion | null = null;
    let conversionError: unknown = null;
    if (mode === 'RULE' && values.measureUnitId !== null) {
      try {
        conversion = await this.conversions.require(
          { fromUnitId: values.measureUnitId, projectTypeId: values.projectTypeId },
          { field: 'measureUnitId' },
        );
      } catch (error) {
        conversionError = error;
      }
    }
    const at = new Date();

    const before = await this.transactions.run(async (tx) => {
      // Visibilidad, política y valores actuales sobre el proyecto bloqueado (Revisión E5, M4).
      const current = (await this.access.lockEditable(actor, projectId, visible.scopes, tx)).record;
      if (values.projectTypeId !== null) {
        await this.catalogValidator.assertItem(PROJECT_CATALOGS.projectType, values.projectTypeId, {
          field: 'projectTypeId',
          requireActive: true,
          currentId: current.projectType?.id ?? null,
          tx,
        });
      }
      if (values.sectorId !== null) {
        await this.catalogValidator.assertItem(PROJECT_CATALOGS.sector, values.sectorId, {
          field: 'sectorId',
          requireActive: true,
          currentId: current.sector?.id ?? null,
          tx,
        });
      }
      if (values.measureUnitId !== null) {
        const unit = await this.products.findUnit(values.measureUnitId, tx);
        // Una unidad desactivada se conserva solo si no cambia (00 §3.5, aplicado a unidades).
        if (!unit || (!unit.isActive && unit.id !== current.measureUnit?.id)) {
          throw projectIssuesError([projectIssue('measureUnitId', PROJECT_ERROR_CODES.unknownReference)]);
        }
      }
      if (conversionError) throw conversionError;
      const input: ProjectClassificationInput = {
        ...values,
        estimatedQuantity: quantity,
        conversionRuleId: conversion?.ruleId ?? null,
        conversionFactor: conversion?.factor ?? null,
        estimatedTonnage:
          mode === 'RULE' && conversion && quantity !== null
            ? this.conversions.tonnageFor(quantity, conversion)
            : mode === 'MANUAL' && manualTonnage !== null
              ? roundDecimal(manualTonnage, QUANTITY_SCALE)
              : null,
      };
      await this.projects.updateClassification(projectId, input, actor.userId, at, tx);
      return current;
    });

    const after = await this.projects.findById(projectId, null);
    if (!after) throw new Error('Classified project not found');
    this.logger.info('project_classified', { correlationId: actor.audit.correlationId, projectId, tonnageMode: mode });
    await this.audit.record(PROJECT_AUDIT_EVENTS.classified, actor.audit, {
      resourceType: PROJECT_AUDIT_RESOURCE,
      resourceId: projectId,
      before: classificationAuditState(before),
      after: classificationAuditState(after),
    });
    return after;
  }
}
