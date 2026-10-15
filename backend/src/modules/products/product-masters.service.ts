import { Inject, Injectable } from '@nestjs/common';

import { ResourceNotFoundError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { type AuditContext, AuditService } from '@/modules/audit/audit.service';
import { normalizeName } from '@/modules/customers/customer-normalization';
import { ParameterReader } from '@/modules/parameters/parameter-reader';
import type { UnitDimensionCode } from '@/modules/unit-conversions/ports/unit-conversion.reader.port';
import { TONNAGE_UNIT_PARAMETER } from '@/modules/unit-conversions/unit-conversion.resolver';

import { dimensionLockedError, duplicateError, normalizeCode, protectedRuleError, unknownReferenceError } from './master-data-rules';
import {
  type FamilySortField,
  PRODUCT_MASTERS_REPOSITORY,
  type ProductDetailRecord,
  type ProductFamilyDetailRecord,
  type ProductMastersRepository,
  type UnitOfMeasureDetailRecord,
  type UnitSortField,
  type UpdateFamilyInput,
  type UpdateProductInput,
  type UpdateUnitInput,
} from './ports/product-masters.repository.port';

export const MASTER_RESOURCE_TYPES = {
  family: 'crm.product_family',
  product: 'crm.product',
  unit: 'crm.unit_of_measure',
  rule: 'crm.unit_conversion_rule',
} as const;

/** Quién escribe: el usuario local (`created_by_id`/`updated_by_id`) y el contexto de auditoría. */
export interface MasterActor {
  readonly userId: string | null;
  readonly audit: AuditContext;
}

export interface MasterListRequest<TSort extends string> {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  /** Por defecto `true` (compatibilidad con las lecturas del Módulo 3); `null` = todos. */
  readonly isActive?: boolean | null;
  readonly sortBy?: TSort;
  readonly sortOrder?: 'asc' | 'desc';
}

export interface CreateFamilyRequest {
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly sortOrder?: number;
}

export interface CreateUnitRequest {
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  readonly dimension: UnitDimensionCode;
  readonly sortOrder?: number;
}

export interface CreateProductRequest {
  readonly sku: string;
  readonly description: string;
  readonly familyId: string;
  readonly baseUnitId: string;
}

function familyState(record: ProductFamilyDetailRecord): Record<string, unknown> {
  return { code: record.code, name: record.name, description: record.description, sortOrder: record.sortOrder, isActive: record.isActive };
}

function unitState(record: UnitOfMeasureDetailRecord): Record<string, unknown> {
  return {
    code: record.code,
    name: record.name,
    symbol: record.symbol,
    dimension: record.dimension,
    sortOrder: record.sortOrder,
    isActive: record.isActive,
  };
}

function productState(record: ProductDetailRecord): Record<string, unknown> {
  return {
    sku: record.sku,
    description: record.description,
    familyId: record.family.id,
    baseUnitId: record.baseUnit.id,
    isActive: record.isActive,
  };
}

/** Solo los campos enviados que cambian algo; vacío = nada que escribir. */
function changedFields<T extends object>(input: T, current: Record<string, unknown>): Partial<T> {
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== current[key]) changes[key] = value;
  }
  return changes as Partial<T>;
}

/**
 * Mantenimiento de familias, unidades y productos (07 F.7, D-07.9, DM-23; 00 §2.3).
 *
 * - Alta, edición y activación/desactivación; sin borrado (las FK son `Restrict`).
 * - Códigos y SKU recortados y en mayúsculas; únicos → `409 RESOURCE_CONFLICT` con el campo.
 *   El código de familia y el de unidad son inmutables (identificadores estables, RN-07.37).
 * - Referencias de un producto (familia, unidad base) existentes y activas en el alta o
 *   al cambiarlas (`422 UNKNOWN_REFERENCE`); una edición que no las cambia conserva una
 *   referencia ya desactivada (mismo criterio que los catálogos, 00 §3.5).
 * - Unidad: la dimensión no cambia si ya la usa un producto, una regla o una línea
 *   (`409 UNIT_DIMENSION_LOCKED`); la unidad de tonelaje no se desactiva
 *   (`409 CONVERSION_RULE_PROTECTED`, RN-07.33).
 * - Auditoría `crm.product_family.*`, `crm.unit_of_measure.*`, `crm.product.*` (RN-07.40).
 */
@Injectable()
export class ProductMastersService {
  constructor(
    @Inject(PRODUCT_MASTERS_REPOSITORY) private readonly repository: ProductMastersRepository,
    private readonly parameters: ParameterReader,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Familias
  // -------------------------------------------------------------------------

  searchFamilies(request: MasterListRequest<FamilySortField>): Promise<Page<ProductFamilyDetailRecord>> {
    return this.repository.searchFamilies(this.masterSearch(request));
  }

  async findFamily(id: string): Promise<ProductFamilyDetailRecord> {
    return this.found(await this.repository.findFamily(id), 'ProductFamily', id);
  }

  async createFamily(request: CreateFamilyRequest, actor: MasterActor): Promise<ProductFamilyDetailRecord> {
    const result = await this.repository.createFamily(
      { code: normalizeCode(request.code), name: request.name, description: request.description ?? null, sortOrder: request.sortOrder ?? 0 },
      actor.userId,
    );
    if (!result.ok) throw duplicateError(['code'], 'A product family with this code already exists');
    await this.audit.record(`${MASTER_RESOURCE_TYPES.family}.created`, actor.audit, {
      resourceType: MASTER_RESOURCE_TYPES.family,
      resourceId: result.record.id,
      before: null,
      after: familyState(result.record),
    });
    return result.record;
  }

  async updateFamily(id: string, request: UpdateFamilyInput, actor: MasterActor): Promise<ProductFamilyDetailRecord> {
    const current = await this.findFamily(id);
    const changes = changedFields(request, familyState(current));
    if (Object.keys(changes).length === 0) return current;
    const updated = this.found(await this.repository.updateFamily(id, changes, actor.userId), 'ProductFamily', id);
    await this.audit.record(`${MASTER_RESOURCE_TYPES.family}.updated`, actor.audit, {
      resourceType: MASTER_RESOURCE_TYPES.family,
      resourceId: id,
      before: familyState(current),
      after: familyState(updated),
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Unidades
  // -------------------------------------------------------------------------

  searchUnits(request: MasterListRequest<UnitSortField>): Promise<Page<UnitOfMeasureDetailRecord>> {
    return this.repository.searchUnits(this.masterSearch(request));
  }

  async findUnit(id: string): Promise<UnitOfMeasureDetailRecord> {
    return this.found(await this.repository.findUnit(id), 'UnitOfMeasure', id);
  }

  async createUnit(request: CreateUnitRequest, actor: MasterActor): Promise<UnitOfMeasureDetailRecord> {
    const result = await this.repository.createUnit({
      code: normalizeCode(request.code),
      name: request.name,
      symbol: request.symbol,
      dimension: request.dimension,
      sortOrder: request.sortOrder ?? 0,
    });
    if (!result.ok) throw duplicateError(['code'], 'A unit of measure with this code already exists');
    await this.audit.record(`${MASTER_RESOURCE_TYPES.unit}.created`, actor.audit, {
      resourceType: MASTER_RESOURCE_TYPES.unit,
      resourceId: result.record.id,
      before: null,
      after: unitState(result.record),
    });
    return result.record;
  }

  async updateUnit(id: string, request: UpdateUnitInput, actor: MasterActor): Promise<UnitOfMeasureDetailRecord> {
    const current = await this.findUnit(id);
    const changes = changedFields(request, unitState(current));
    if (Object.keys(changes).length === 0) return current;

    if (changes.dimension !== undefined && (await this.repository.isUnitReferenced(id))) {
      throw dimensionLockedError();
    }
    if (changes.isActive === false && current.code === (await this.parameters.get<string>(TONNAGE_UNIT_PARAMETER))) {
      throw protectedRuleError('tonnage_unit');
    }

    const updated = this.found(await this.repository.updateUnit(id, changes), 'UnitOfMeasure', id);
    await this.audit.record(`${MASTER_RESOURCE_TYPES.unit}.updated`, actor.audit, {
      resourceType: MASTER_RESOURCE_TYPES.unit,
      resourceId: id,
      before: unitState(current),
      after: unitState(updated),
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Productos (la lista paginada es la del Módulo 3: `ProductsService.search`)
  // -------------------------------------------------------------------------

  async findProduct(id: string): Promise<ProductDetailRecord> {
    return this.found(await this.repository.findProduct(id), 'Product', id);
  }

  async createProduct(request: CreateProductRequest, actor: MasterActor): Promise<ProductDetailRecord> {
    await this.assertFamily(request.familyId, null);
    await this.assertUnit(request.baseUnitId, null);
    const result = await this.repository.createProduct(
      { sku: normalizeCode(request.sku), description: request.description, familyId: request.familyId, baseUnitId: request.baseUnitId },
      actor.userId,
    );
    if (!result.ok) throw duplicateError(['sku'], 'A product with this SKU already exists');
    await this.audit.record(`${MASTER_RESOURCE_TYPES.product}.created`, actor.audit, {
      resourceType: MASTER_RESOURCE_TYPES.product,
      resourceId: result.record.id,
      before: null,
      after: productState(result.record),
    });
    return result.record;
  }

  async updateProduct(id: string, request: UpdateProductInput, actor: MasterActor): Promise<ProductDetailRecord> {
    const current = await this.findProduct(id);
    const normalized: UpdateProductInput = { ...request, ...(request.sku !== undefined ? { sku: normalizeCode(request.sku) } : {}) };
    const changes = changedFields(normalized, productState(current));
    if (Object.keys(changes).length === 0) return current;

    if (changes.familyId !== undefined) await this.assertFamily(changes.familyId, current.family.id);
    if (changes.baseUnitId !== undefined) await this.assertUnit(changes.baseUnitId, current.baseUnit.id);

    const result = await this.repository.updateProduct(id, changes, actor.userId);
    if (!result) throw new ResourceNotFoundError('Product', id);
    if (!result.ok) throw duplicateError(['sku'], 'A product with this SKU already exists');
    await this.audit.record(`${MASTER_RESOURCE_TYPES.product}.updated`, actor.audit, {
      resourceType: MASTER_RESOURCE_TYPES.product,
      resourceId: id,
      before: productState(current),
      after: productState(result.record),
    });
    return result.record;
  }

  // -------------------------------------------------------------------------

  private masterSearch<TSort extends string>(request: MasterListRequest<TSort>) {
    return {
      page: request.page,
      pageSize: request.pageSize,
      search: normalizeName(request.search),
      isActive: request.isActive === undefined ? true : request.isActive,
      sortBy: request.sortBy,
      sortOrder: request.sortOrder,
    };
  }

  private found<T>(record: T | null, resource: string, id: string): T {
    if (!record) throw new ResourceNotFoundError(resource, id);
    return record;
  }

  /** Familia existente y activa, salvo que sea la que el producto ya tiene (`currentId`). */
  private async assertFamily(familyId: string, currentId: string | null): Promise<void> {
    const family = await this.repository.findFamily(familyId);
    if (!family) throw unknownReferenceError('familyId', 'not_found');
    if (!family.isActive && family.id !== currentId) throw unknownReferenceError('familyId', 'inactive');
  }

  private async assertUnit(unitId: string, currentId: string | null): Promise<void> {
    const unit = await this.repository.findUnit(unitId);
    if (!unit) throw unknownReferenceError('baseUnitId', 'not_found');
    if (!unit.isActive && unit.id !== currentId) throw unknownReferenceError('baseUnitId', 'inactive');
  }
}
