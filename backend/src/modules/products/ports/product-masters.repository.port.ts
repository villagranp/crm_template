import type { DecimalString } from '@/common/decimal';
import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { ConversionScopeCode, UnitDimensionCode } from '@/modules/unit-conversions/ports/unit-conversion.reader.port';

import type { ProductRecord } from './product-catalog.reader.port';

export const PRODUCT_MASTERS_REPOSITORY = Symbol('PRODUCT_MASTERS_REPOSITORY');

/** Listas blancas de orden (07 F.7). Sin `sortBy`, cada lista usa su orden natural. */
export const FAMILY_SORT_FIELDS = ['code', 'name', 'sortOrder', 'createdAt', 'updatedAt'] as const;
export const UNIT_SORT_FIELDS = ['code', 'name', 'sortOrder', 'dimension'] as const;
export const RULE_SORT_FIELDS = ['createdAt', 'updatedAt', 'scope', 'factor'] as const;
export type FamilySortField = (typeof FAMILY_SORT_FIELDS)[number];
export type UnitSortField = (typeof UNIT_SORT_FIELDS)[number];
export type RuleSortField = (typeof RULE_SORT_FIELDS)[number];

/** Búsqueda común de los maestros: texto normalizado y estado (`null` = activos e inactivos). */
export interface MasterSearch<TSort extends string> extends PageRequest {
  readonly search: string | null;
  readonly isActive: boolean | null;
  readonly sortBy?: TSort;
  readonly sortOrder?: 'asc' | 'desc';
}

export interface RuleSearch extends MasterSearch<RuleSortField> {
  readonly scope: ConversionScopeCode | null;
  readonly fromUnitId: string | null;
}

export interface ProductFamilyDetailRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UnitOfMeasureDetailRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  readonly dimension: UnitDimensionCode;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProductDetailRecord extends ProductRecord {
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RuleUnitRef {
  readonly id: string;
  readonly code: string;
  readonly symbol: string;
  readonly dimension: UnitDimensionCode;
}

export interface ConversionRuleDetailRecord {
  readonly id: string;
  readonly fromUnit: RuleUnitRef;
  readonly toUnit: RuleUnitRef;
  /** `Decimal(19, 8)` con 8 decimales. */
  readonly factor: DecimalString;
  readonly scope: ConversionScopeCode;
  readonly product: { readonly id: string; readonly sku: string; readonly description: string } | null;
  readonly productFamily: { readonly id: string; readonly code: string; readonly name: string } | null;
  /** Elemento de `crm.tipo_proyecto`. */
  readonly projectType: { readonly id: string; readonly code: string; readonly label: string } | null;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateFamilyInput {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
}

export interface UpdateFamilyInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export interface CreateUnitInput {
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  readonly dimension: UnitDimensionCode;
  readonly sortOrder: number;
}

export interface UpdateUnitInput {
  readonly name?: string;
  readonly symbol?: string;
  readonly dimension?: UnitDimensionCode;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export interface CreateProductInput {
  readonly sku: string;
  readonly description: string;
  readonly familyId: string;
  readonly baseUnitId: string;
}

export interface UpdateProductInput {
  readonly sku?: string;
  readonly description?: string;
  readonly familyId?: string;
  readonly baseUnitId?: string;
  readonly isActive?: boolean;
}

export interface CreateRuleInput {
  readonly fromUnitId: string;
  readonly toUnitId: string;
  readonly factor: DecimalString;
  readonly scope: ConversionScopeCode;
  readonly productId: string | null;
  readonly productFamilyId: string | null;
  readonly projectTypeId: string | null;
  /** `'GLOBAL'` o el UUID de la referencia (`ck_unit_conversion_rules_scope`). */
  readonly scopeKey: string;
  readonly description: string | null;
}

/** Origen, destino y ámbito son inmutables: son la identidad de la regla y la FK compuesta de las líneas. */
export interface UpdateRuleInput {
  readonly factor?: DecimalString;
  readonly description?: string | null;
  readonly isActive?: boolean;
}

/** Escritura que puede chocar con un único (`code`, `sku`, origen/destino/ámbito). */
export type MasterWriteResult<T> = { readonly ok: true; readonly record: T } | { readonly ok: false; readonly reason: 'DUPLICATE' };

/**
 * Mantenimiento de los maestros comerciales (07 F.7, D-07.9; 00 §2.3): familias,
 * productos, unidades y reglas de conversión. Las lecturas del Módulo 3
 * (`ProductCatalogReader`, `UnitConversionReader`) se conservan; este puerto añade las
 * listas administrativas (con inactivos y orden), los detalles y las escrituras. Sin
 * borrado: se desactiva con `isActive`. Los únicos de la base son la última barrera
 * contra el duplicado concurrente (`DUPLICATE`). Sin tipos del ORM (ADR-004).
 */
export interface ProductMastersRepository {
  searchFamilies(search: MasterSearch<FamilySortField>): Promise<Page<ProductFamilyDetailRecord>>;
  findFamily(id: string, tx?: TransactionContext): Promise<ProductFamilyDetailRecord | null>;
  createFamily(input: CreateFamilyInput, actorId: string | null): Promise<MasterWriteResult<ProductFamilyDetailRecord>>;
  updateFamily(id: string, input: UpdateFamilyInput, actorId: string | null): Promise<ProductFamilyDetailRecord | null>;

  searchUnits(search: MasterSearch<UnitSortField>): Promise<Page<UnitOfMeasureDetailRecord>>;
  findUnit(id: string, tx?: TransactionContext): Promise<UnitOfMeasureDetailRecord | null>;
  createUnit(input: CreateUnitInput): Promise<MasterWriteResult<UnitOfMeasureDetailRecord>>;
  updateUnit(id: string, input: UpdateUnitInput): Promise<UnitOfMeasureDetailRecord | null>;
  /** ¿La usa algún producto (unidad base), regla (origen o destino), proyecto, producto asociado o línea de forecast? (RN-07.37) */
  isUnitReferenced(id: string): Promise<boolean>;

  findProduct(id: string): Promise<ProductDetailRecord | null>;
  createProduct(input: CreateProductInput, actorId: string | null): Promise<MasterWriteResult<ProductDetailRecord>>;
  /** `null` si no existe; `DUPLICATE` si el nuevo `sku` ya lo tiene otro producto. */
  updateProduct(id: string, input: UpdateProductInput, actorId: string | null): Promise<MasterWriteResult<ProductDetailRecord> | null>;

  searchRules(search: RuleSearch): Promise<Page<ConversionRuleDetailRecord>>;
  findRule(id: string): Promise<ConversionRuleDetailRecord | null>;
  createRule(input: CreateRuleInput, actorId: string | null): Promise<MasterWriteResult<ConversionRuleDetailRecord>>;
  updateRule(id: string, input: UpdateRuleInput, actorId: string | null): Promise<ConversionRuleDetailRecord | null>;
}
