import { Inject, Injectable } from '@nestjs/common';

import type { DecimalString } from '@/common/decimal';
import { ResourceNotFoundError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { AuditService } from '@/modules/audit/audit.service';
import { CatalogReferenceValidator } from '@/modules/catalogs/catalog-reference.validator';
import { normalizeName } from '@/modules/customers/customer-normalization';
import type { ConversionScopeCode } from '@/modules/unit-conversions/ports/unit-conversion.reader.port';
import { UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

import {
  duplicateError,
  invalidScopeError,
  invalidTargetError,
  isIdentityRule,
  isTonnageIdentity,
  normalizeFactor,
  protectedRuleError,
  scopeIssues,
  scopeKeyFor,
  unknownReferenceError,
} from './master-data-rules';
import {
  type ConversionRuleDetailRecord,
  PRODUCT_MASTERS_REPOSITORY,
  type ProductMastersRepository,
  type RuleSortField,
  type UpdateRuleInput,
} from './ports/product-masters.repository.port';
import { MASTER_RESOURCE_TYPES, type MasterActor, type MasterListRequest } from './product-masters.service';

export const PROJECT_TYPE_CATALOG = 'crm.tipo_proyecto';

export interface RuleListRequest extends MasterListRequest<RuleSortField> {
  readonly scope?: ConversionScopeCode;
  readonly fromUnitId?: string;
}

export interface CreateRuleRequest {
  readonly fromUnitId: string;
  /** Opcional: por defecto, la unidad de tonelaje configurada (el único destino válido). */
  readonly toUnitId?: string;
  readonly factor: DecimalString;
  readonly scope: ConversionScopeCode;
  readonly productId?: string | null;
  readonly productFamilyId?: string | null;
  readonly projectTypeId?: string | null;
  readonly description?: string | null;
}

function ruleState(record: ConversionRuleDetailRecord): Record<string, unknown> {
  return {
    fromUnitId: record.fromUnit.id,
    toUnitId: record.toUnit.id,
    factor: record.factor,
    scope: record.scope,
    productId: record.product?.id ?? null,
    productFamilyId: record.productFamily?.id ?? null,
    projectTypeId: record.projectType?.id ?? null,
    description: record.description,
    isActive: record.isActive,
  };
}

/**
 * Mantenimiento de reglas de conversión (07 F.7, RN-07.36, D-07.9; 00 §2.3).
 *
 * - Única por (origen, destino, ámbito) → `409 RESOURCE_CONFLICT`.
 * - Destino = unidad de tonelaje configurada (`crm.forecast.unidad_tonelaje`); otro →
 *   `422 INVALID_CONVERSION_TARGET`.
 * - Ámbito coherente con su referencia (`ck_unit_conversion_rules_scope`) →
 *   `422 INVALID_CONVERSION_SCOPE`; referencias existentes y activas → `422 UNKNOWN_REFERENCE`.
 * - La identidad tiene factor 1 fijo y la identidad `GLOBAL` de la unidad de tonelaje
 *   no se desactiva → `409 CONVERSION_RULE_PROTECTED`.
 * - Origen, destino y ámbito son inmutables; se corrigen factor, descripción y estado.
 *   Cambiar un factor **no** reescribe líneas: cada línea copió su factor (00 §2.3).
 * - Reactivar o cambiar el factor exige que el destino siga siendo la unidad de
 *   tonelaje (`422 INVALID_CONVERSION_TARGET`) y el origen esté activo
 *   (`422 UNKNOWN_REFERENCE`, issue `inactive`).
 * - Auditoría `crm.unit_conversion_rule.created` / `.updated` (RN-07.40).
 */
@Injectable()
export class UnitConversionRulesService {
  constructor(
    @Inject(PRODUCT_MASTERS_REPOSITORY) private readonly repository: ProductMastersRepository,
    private readonly conversions: UnitConversionResolver,
    private readonly catalogReferences: CatalogReferenceValidator,
    private readonly audit: AuditService,
  ) {}

  search(request: RuleListRequest): Promise<Page<ConversionRuleDetailRecord>> {
    return this.repository.searchRules({
      page: request.page,
      pageSize: request.pageSize,
      search: normalizeName(request.search),
      isActive: request.isActive === undefined ? true : request.isActive,
      sortBy: request.sortBy,
      sortOrder: request.sortOrder,
      scope: request.scope ?? null,
      fromUnitId: request.fromUnitId ?? null,
    });
  }

  async findById(id: string): Promise<ConversionRuleDetailRecord> {
    const rule = await this.repository.findRule(id);
    if (!rule) throw new ResourceNotFoundError('UnitConversionRule', id);
    return rule;
  }

  async create(request: CreateRuleRequest, actor: MasterActor): Promise<ConversionRuleDetailRecord> {
    const references = {
      productId: request.productId ?? null,
      productFamilyId: request.productFamilyId ?? null,
      projectTypeId: request.projectTypeId ?? null,
    };
    const issues = scopeIssues(request.scope, references);
    if (issues.length > 0) throw invalidScopeError(issues);

    const tonnageUnit = await this.conversions.tonnageUnit();
    const toUnitId = request.toUnitId ?? tonnageUnit.id;
    if (toUnitId.toLowerCase() !== tonnageUnit.id.toLowerCase()) throw invalidTargetError(tonnageUnit.code);

    const fromUnit = await this.repository.findUnit(request.fromUnitId);
    if (!fromUnit) throw unknownReferenceError('fromUnitId', 'not_found');
    if (!fromUnit.isActive) throw unknownReferenceError('fromUnitId', 'inactive');
    await this.assertScopeReference(request.scope, references);

    const factor = normalizeFactor(request.factor);
    if (isIdentityRule({ fromUnitId: fromUnit.id, toUnitId }) && factor !== normalizeFactor('1')) {
      throw protectedRuleError('identity_factor');
    }

    const result = await this.repository.createRule(
      {
        fromUnitId: fromUnit.id,
        toUnitId: tonnageUnit.id,
        factor,
        scope: request.scope,
        ...references,
        scopeKey: scopeKeyFor(request.scope, references),
        description: request.description ?? null,
      },
      actor.userId,
    );
    if (!result.ok) {
      throw duplicateError(['fromUnitId', 'toUnitId', 'scope'], 'A conversion rule already exists for this origin, target and scope');
    }
    await this.audit.record(`${MASTER_RESOURCE_TYPES.rule}.created`, actor.audit, {
      resourceType: MASTER_RESOURCE_TYPES.rule,
      resourceId: result.record.id,
      before: null,
      after: ruleState(result.record),
    });
    return result.record;
  }

  async update(id: string, request: UpdateRuleInput, actor: MasterActor): Promise<ConversionRuleDetailRecord> {
    const current = await this.findById(id);
    const changes: { -readonly [K in keyof UpdateRuleInput]: UpdateRuleInput[K] } = {};
    if (request.factor !== undefined && normalizeFactor(request.factor) !== current.factor) changes.factor = normalizeFactor(request.factor);
    if (request.description !== undefined && request.description !== current.description) changes.description = request.description;
    if (request.isActive !== undefined && request.isActive !== current.isActive) changes.isActive = request.isActive;
    if (Object.keys(changes).length === 0) return current;

    const shape = { fromUnitId: current.fromUnit.id, toUnitId: current.toUnit.id, scope: current.scope };
    if (changes.factor !== undefined && isIdentityRule(shape)) {
      throw protectedRuleError('identity_factor');
    }
    if (changes.isActive === false) {
      const tonnageUnit = await this.conversions.tonnageUnit();
      if (isTonnageIdentity(shape, tonnageUnit.id)) throw protectedRuleError('tonnage_identity');
    }
    if (changes.isActive === true || changes.factor !== undefined) {
      await this.assertStillApplicable(current);
    }

    const updated = await this.repository.updateRule(id, changes, actor.userId);
    if (!updated) throw new ResourceNotFoundError('UnitConversionRule', id);
    await this.audit.record(`${MASTER_RESOURCE_TYPES.rule}.updated`, actor.audit, {
      resourceType: MASTER_RESOURCE_TYPES.rule,
      resourceId: id,
      before: ruleState(current),
      after: ruleState(updated),
    });
    return updated;
  }

  /**
   * Reactivar una regla o cambiar su factor la vuelve a poner en uso: debe seguir
   * cumpliendo lo que se exigió al crearla. La unidad de tonelaje
   * (`crm.forecast.unidad_tonelaje`) puede haber cambiado desde entonces
   * (`422 INVALID_CONVERSION_TARGET`) y la unidad de origen puede haberse
   * desactivado (`422 UNKNOWN_REFERENCE`, issue `inactive`).
   */
  private async assertStillApplicable(current: ConversionRuleDetailRecord): Promise<void> {
    const tonnageUnit = await this.conversions.tonnageUnit();
    if (current.toUnit.id.toLowerCase() !== tonnageUnit.id.toLowerCase()) throw invalidTargetError(tonnageUnit.code);
    const fromUnit = await this.repository.findUnit(current.fromUnit.id);
    if (!fromUnit) throw unknownReferenceError('fromUnitId', 'not_found');
    if (!fromUnit.isActive) throw unknownReferenceError('fromUnitId', 'inactive');
  }

  /** La referencia del ámbito existe y está activa (producto, familia o tipo de proyecto). */
  private async assertScopeReference(
    scope: ConversionScopeCode,
    references: { productId: string | null; productFamilyId: string | null; projectTypeId: string | null },
  ): Promise<void> {
    if (scope === 'PRODUCT' && references.productId) {
      const product = await this.repository.findProduct(references.productId);
      if (!product) throw unknownReferenceError('productId', 'not_found');
      if (!product.isActive) throw unknownReferenceError('productId', 'inactive');
    }
    if (scope === 'PRODUCT_FAMILY' && references.productFamilyId) {
      const family = await this.repository.findFamily(references.productFamilyId);
      if (!family) throw unknownReferenceError('productFamilyId', 'not_found');
      if (!family.isActive) throw unknownReferenceError('productFamilyId', 'inactive');
    }
    if (scope === 'PROJECT_TYPE' && references.projectTypeId) {
      const check = await this.catalogReferences.check(PROJECT_TYPE_CATALOG, references.projectTypeId, { field: 'projectTypeId' });
      if (!check.ok) throw unknownReferenceError('projectTypeId', check.issue.reason === 'INACTIVE' ? 'inactive' : 'not_found');
    }
  }
}
