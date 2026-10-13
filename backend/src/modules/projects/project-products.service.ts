import { Inject, Injectable } from '@nestjs/common';

import { compareDecimal, type DecimalString, roundDecimal } from '@/common/decimal';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { TRANSACTION_RUNNER, type TransactionContext, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CatalogReferenceValidator } from '@/modules/catalogs/catalog-reference.validator';
import { BUSINESS_CLOCK, type BusinessClock } from '@/modules/commercial-metrics/business-clock';
import { forecastWindowMonths } from '@/modules/commercial-metrics/metric-definitions';
import { ParameterReader } from '@/modules/parameters/parameter-reader';
import { ProductsService } from '@/modules/products/products.service';
import { type ResolvedConversion, UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

import { type ProductTotals, productTotals, QUANTITY_SCALE } from './product-totals';
import { type ProjectActor, ProjectAccessService } from './project-access.service';
import {
  PROJECT_PRODUCT_AUDIT_EVENTS,
  PROJECT_PRODUCT_AUDIT_RESOURCE,
  PROJECT_PRODUCT_MASKED_FIELDS,
  projectProductAuditState,
} from './project-audit';
import { ProjectCatalogsService } from './project-catalogs.service';
import { quantityIssue } from './project-classification.service';
import { PROJECT_CATALOGS, PROJECT_PARAMETERS } from './project-constants';
import { formatYearMonth } from './project-dates';
import {
  PROJECT_ERROR_CODES,
  productHasForecastError,
  type ProjectIssue,
  projectIssue,
  projectIssuesError,
  projectProductDuplicateError,
  projectProductNotFound,
} from './project-errors';
import {
  PROJECT_PRODUCTS_REPOSITORY,
  type ProjectProductListRequest,
  type ProjectProductRecord,
  type ProjectProductsRepository,
  type ProjectProductWrite,
} from './ports/project-products.repository.port';
import { PROJECTS_REPOSITORY, type ProjectsRepository } from './ports/projects.repository.port';

export interface CreateProjectProductRequest {
  readonly productId: string;
  readonly opportunityId?: string | null;
  readonly quantity: string;
  readonly unitId?: string;
  readonly statusId?: string;
  readonly notes?: string | null;
}

export type UpdateProjectProductRequest = Partial<Omit<CreateProjectProductRequest, 'productId'>>;

export interface ProjectProductsView {
  readonly page: Page<ProjectProductRecord>;
  readonly totals: ProductTotals;
}

/** Línea ya resuelta: lo que se escribe y su regla (foto, RN-03.29). */
interface ResolvedLine {
  readonly write: ProjectProductWrite;
  readonly conversion: ResolvedConversion | null;
}

/** Columnas de `write` distintas del estado actual (decimales por valor). */
function changedColumns(current: ProjectProductRecord, write: ProjectProductWrite): Partial<ProjectProductWrite> {
  const changes: { -readonly [K in keyof ProjectProductWrite]?: ProjectProductWrite[K] } = {};
  if (write.opportunityId !== (current.opportunity?.id ?? null)) changes.opportunityId = write.opportunityId;
  if (compareDecimal(write.quantity, current.quantity) !== 0) changes.quantity = write.quantity;
  if (write.unitId !== current.unit.id) changes.unitId = write.unitId;
  if (write.conversionRuleId !== (current.conversion?.ruleId ?? null)) changes.conversionRuleId = write.conversionRuleId;
  if (!sameDecimal(write.conversionFactor, current.conversion?.factor ?? null)) changes.conversionFactor = write.conversionFactor;
  if (!sameDecimal(write.tonnage, current.tonnage)) changes.tonnage = write.tonnage;
  if (write.statusId !== current.status.id) changes.statusId = write.statusId;
  if (write.notes !== current.notes) changes.notes = write.notes;
  return changes;
}

function sameDecimal(a: DecimalString | null, b: DecimalString | null): boolean {
  return a === null || b === null ? a === b : compareDecimal(a, b) === 0;
}

/**
 * Productos asociados al proyecto (03 F-19, C.9). El maestro no se copia (RN-03.54).
 * Asociar, editar y quitar exigen poder editar el proyecto (RN-03.62).
 *
 * Concurrencia: cada escritura toma primero la fila del proyecto con `FOR UPDATE` (no
 * `FOR SHARE`: la misma transacción actualiza después `last_activity_at`, y dos
 * `FOR SHARE` que suben a `UPDATE` se bloquean mutuamente), lo que la serializa con la
 * eliminación del proyecto y con las demás escrituras; la unicidad "un producto activo
 * por (proyecto, oportunidad)" (RN-03.59) se comprueba y escribe bajo ese mismo bloqueo
 * (el bloqueo consultivo por clave era redundante y se quitó en la Revisión E5).
 */
@Injectable()
export class ProjectProductsService {
  constructor(
    @Inject(PROJECT_PRODUCTS_REPOSITORY) private readonly repository: ProjectProductsRepository,
    @Inject(PROJECTS_REPOSITORY) private readonly projects: ProjectsRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    private readonly access: ProjectAccessService,
    private readonly catalogValidator: CatalogReferenceValidator,
    private readonly catalogs: ProjectCatalogsService,
    private readonly products: ProductsService,
    private readonly conversions: UnitConversionResolver,
    private readonly parameters: ParameterReader,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
    @Inject(BUSINESS_CLOCK) private readonly clock: BusinessClock,
  ) {}

  async list(actor: ProjectActor, projectId: string, request: ProjectProductListRequest): Promise<ProjectProductsView> {
    await this.access.findVisible(actor, projectId);
    const [page, rows] = await Promise.all([this.repository.listByProject(projectId, request), this.repository.totalsRows(projectId)]);
    return {
      page,
      totals: productTotals(rows.map((row) => ({ quantity: row.quantity, unit: row.unit, tonnage: row.tonnage, statusIsActive: row.statusCountsInTotals }))),
    };
  }

  async create(actor: ProjectActor, projectId: string, request: CreateProjectProductRequest): Promise<ProjectProductRecord> {
    const visible = await this.access.findEditable(actor, projectId);
    const quantity = this.assertQuantity(request.quantity);
    const product = await this.products.findProduct(request.productId);
    if (!product) throw projectIssuesError([projectIssue('productId', PROJECT_ERROR_CODES.unknownReference)]);
    if (!product.isActive) throw projectIssuesError([projectIssue('productId', PROJECT_ERROR_CODES.productInactive)]);
    const unitId = (request.unitId ?? product.baseUnit.id).toLowerCase();
    const opportunityId = request.opportunityId?.toLowerCase() ?? null;
    const statusId = (request.statusId ?? (await this.initialStatusId())).toLowerCase();
    // Antes de la transacción solo el parámetro de la unidad de tonelaje (pool); la regla se
    // resuelve dentro, con la conexión de la transacción y el tipo del proyecto bloqueado.
    const tonnageUnit = await this.conversions.tonnageUnit();

    const projectProductId = await this.transactions.run(async (tx) => {
      // Visibilidad y política sobre el proyecto bloqueado (Revisión E5, M4).
      const locked = await this.access.lockEditable(actor, projectId, visible.scopes, tx);
      const conversion = await this.conversions.resolve(
        { fromUnitId: unitId, productId: product.id, projectTypeId: locked.record.projectType?.id ?? null },
        tx,
        tonnageUnit,
      );
      const line = await this.resolveLine(projectId, { opportunityId, quantity, unitId, statusId, notes: request.notes ?? null }, conversion, null, tx);
      // RN-03.59: la fila del proyecto (`FOR UPDATE`) serializa toda escritura de asociaciones.
      const duplicate = await this.repository.findActiveDuplicate({ projectId, opportunityId, productId: product.id, excludeId: null }, tx);
      if (duplicate) throw projectProductDuplicateError(duplicate);
      const id = await this.repository.create({ ...line.write, projectId, productId: product.id, createdById: actor.userId }, tx);
      await this.projects.touchLastActivity([projectId], new Date(), tx);
      return id;
    });

    const created = await this.mustFind(projectId, projectProductId);
    this.logger.info('project_product_created', { correlationId: actor.audit.correlationId, projectId, projectProductId });
    await this.audit.record(PROJECT_PRODUCT_AUDIT_EVENTS.created, actor.audit, {
      resourceType: PROJECT_PRODUCT_AUDIT_RESOURCE,
      resourceId: projectProductId,
      before: null,
      after: projectProductAuditState(created),
      maskedFields: PROJECT_PRODUCT_MASKED_FIELDS,
      metadata: { projectId },
    });
    return created;
  }

  /**
   * Edición (RN-03.62, AC-03.65). Todo se decide **dentro** de la transacción, con el
   * proyecto bloqueado (Revisión E5, M3/M4): la asociación se vuelve a leer (`404` si otra
   * petición la quitó entre tanto), la petición se combina con el estado fresco (un campo
   * omitido conserva el valor actual, no el de una lectura previa), la regla vigente se
   * resuelve con el tipo del proyecto bloqueado y solo se escriben las columnas que
   * cambian. Sin cambios efectivos no se escribe ni se audita (RN-03.13).
   */
  async update(actor: ProjectActor, projectId: string, projectProductId: string, request: UpdateProjectProductRequest): Promise<ProjectProductRecord> {
    const visible = await this.access.findEditable(actor, projectId);
    if (!(await this.repository.findById(projectId, projectProductId))) throw projectProductNotFound(projectProductId);
    const requestedQuantity = request.quantity === undefined ? undefined : this.assertQuantity(request.quantity);
    const tonnageUnit = await this.conversions.tonnageUnit();

    const outcome = await this.transactions.run(async (tx) => {
      const locked = await this.access.lockEditable(actor, projectId, visible.scopes, tx);
      const before = await this.repository.findById(projectId, projectProductId, tx);
      if (!before) throw projectProductNotFound(projectProductId);
      const quantity = requestedQuantity ?? before.quantity;
      const unitId = request.unitId?.toLowerCase() ?? before.unit.id;
      const opportunityId = request.opportunityId === undefined ? (before.opportunity?.id ?? null) : (request.opportunityId?.toLowerCase() ?? null);
      const statusId = request.statusId?.toLowerCase() ?? before.status.id;
      const notes = request.notes === undefined ? before.notes : request.notes;
      // AC-03.65: al guardar se recalcula con la regla vigente (RN-03.29).
      const conversion = await this.conversions.resolve(
        { fromUnitId: unitId, productId: before.product.id, projectTypeId: locked.record.projectType?.id ?? null },
        tx,
        tonnageUnit,
      );
      const line = await this.resolveLine(projectId, { opportunityId, quantity, unitId, statusId, notes }, conversion, before, tx);
      const changes = changedColumns(before, line.write);
      if (changes.opportunityId !== undefined) {
        const duplicate = await this.repository.findActiveDuplicate(
          { projectId, opportunityId, productId: before.product.id, excludeId: projectProductId },
          tx,
        );
        if (duplicate) throw projectProductDuplicateError(duplicate);
      }
      if (Object.keys(changes).length === 0) return { before, changed: false };
      await this.repository.update(projectId, projectProductId, changes, actor.userId, tx);
      await this.projects.touchLastActivity([projectId], new Date(), tx);
      return { before, changed: true };
    });

    if (!outcome.changed) return outcome.before;
    const after = await this.mustFind(projectId, projectProductId);
    this.logger.info('project_product_updated', { correlationId: actor.audit.correlationId, projectId, projectProductId });
    await this.audit.record(PROJECT_PRODUCT_AUDIT_EVENTS.updated, actor.audit, {
      resourceType: PROJECT_PRODUCT_AUDIT_RESOURCE,
      resourceId: projectProductId,
      before: projectProductAuditState(outcome.before),
      after: projectProductAuditState(after),
      maskedFields: PROJECT_PRODUCT_MASKED_FIELDS,
      metadata: { projectId },
    });
    return after;
  }

  /**
   * RN-03.61: borrado lógico, bloqueado si el producto tiene forecast > 0 en la ventana
   * vigente para el proyecto y no queda otra asociación activa suya. Con la fila del
   * proyecto bloqueada (`FOR UPDATE`): quien guarde forecast del proyecto se serializa
   * con esta comprobación. La ventana sale del reloj del negocio (Revisión E5, m2).
   */
  async remove(actor: ProjectActor, projectId: string, projectProductId: string): Promise<void> {
    const visible = await this.access.findEditable(actor, projectId);
    const [horizon, timeZone] = await Promise.all([
      this.parameters.get<number>(PROJECT_PARAMETERS.forecastHorizon),
      this.parameters.get<string>(PROJECT_PARAMETERS.timeZone),
    ]);
    const window = forecastWindowMonths({ now: this.clock.now(), businessTimeZone: timeZone }, horizon);
    let removed: ProjectProductRecord | null = null;

    await this.transactions.run(async (tx) => {
      await this.access.lockEditable(actor, projectId, visible.scopes, tx);
      const line = await this.repository.findById(projectId, projectProductId, tx);
      if (!line) throw projectProductNotFound(projectProductId);
      const others = await this.repository.countOtherActive(projectId, line.product.id, projectProductId, tx);
      if (others === 0) {
        const periods = await this.repository.forecastPeriodsWithQuantity(projectId, line.product.id, window, tx);
        if (periods.length > 0) throw productHasForecastError(line.product.id, periods.map(formatYearMonth));
      }
      await this.repository.softDelete(projectId, projectProductId, actor.userId, tx);
      await this.projects.touchLastActivity([projectId], new Date(), tx);
      removed = line;
    });

    const line = removed as ProjectProductRecord | null;
    this.logger.info('project_product_deleted', { correlationId: actor.audit.correlationId, projectId, projectProductId });
    await this.audit.record(PROJECT_PRODUCT_AUDIT_EVENTS.deleted, actor.audit, {
      resourceType: PROJECT_PRODUCT_AUDIT_RESOURCE,
      resourceId: projectProductId,
      metadata: { projectId, productId: line?.product.id ?? null },
    });
  }

  /** Estado inicial (RN-03.22): primer elemento activo de `crm.estado_producto_asociado` por `sortOrder`. */
  async initialStatusId(): Promise<string> {
    const statuses = await this.catalogs.activeItems(PROJECT_CATALOGS.productStatus);
    const first = [...statuses].sort((a, b) => a.sortOrder - b.sortOrder || (a.code < b.code ? -1 : 1))[0];
    if (!first) throw new Error('No active item in crm.estado_producto_asociado');
    return first.id;
  }

  /**
   * Valida oportunidad, unidad y estado dentro de la transacción y calcula el tonelaje con
   * la regla ya resuelta (sin regla → sin tonelaje; nunca manual en líneas, DM-24).
   * `existing` permite conservar una unidad o un estado desactivados que no cambian.
   */
  private async resolveLine(
    projectId: string,
    input: { opportunityId: string | null; quantity: DecimalString; unitId: string; statusId: string; notes: string | null },
    conversion: ResolvedConversion | null,
    existing: ProjectProductRecord | null,
    tx: TransactionContext,
  ): Promise<ResolvedLine> {
    const issues: ProjectIssue[] = [];
    if (input.opportunityId !== null && !(await this.repository.opportunityBelongsToProject(projectId, input.opportunityId, tx))) {
      issues.push(projectIssue('opportunityId', PROJECT_ERROR_CODES.opportunityNotInProject));
    }
    const unit = await this.products.findUnit(input.unitId, tx);
    if (!unit || (!unit.isActive && unit.id !== existing?.unit.id)) issues.push(projectIssue('unitId', PROJECT_ERROR_CODES.unknownReference));
    if (issues.length > 0) throw projectIssuesError(issues);
    await this.catalogValidator.assertItem(PROJECT_CATALOGS.productStatus, input.statusId, {
      field: 'statusId',
      requireActive: true,
      currentId: existing?.status.id ?? null,
      tx,
    });
    return {
      conversion,
      write: {
        opportunityId: input.opportunityId,
        quantity: input.quantity,
        unitId: input.unitId,
        conversionRuleId: conversion?.ruleId ?? null,
        conversionFactor: conversion?.factor ?? null,
        tonnage: conversion ? this.conversions.tonnageFor(input.quantity, conversion) : null,
        statusId: input.statusId,
        notes: input.notes,
      },
    };
  }

  private assertQuantity(value: string): DecimalString {
    const issue = quantityIssue(value, 'quantity');
    if (issue) throw projectIssuesError([issue]);
    return roundDecimal(value, QUANTITY_SCALE);
  }

  private async mustFind(projectId: string, projectProductId: string): Promise<ProjectProductRecord> {
    const record = await this.repository.findById(projectId, projectProductId);
    if (!record) throw new Error('Project product not found after write');
    return record;
  }
}
