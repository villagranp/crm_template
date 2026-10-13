import type { DecimalString } from '@/common/decimal';
import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { YearMonth } from '@/modules/commercial-metrics/metric-definitions';
import type { ConversionScopeCode, UnitDimensionCode } from '@/modules/unit-conversions/ports/unit-conversion.reader.port';

export const PROJECT_PRODUCTS_REPOSITORY = Symbol('PROJECT_PRODUCTS_REPOSITORY');

export const PROJECT_PRODUCT_SORT_FIELDS = ['sku', 'createdAt', 'updatedAt'] as const;
export type ProjectProductSortField = (typeof PROJECT_PRODUCT_SORT_FIELDS)[number];

export interface ProjectProductUnit {
  readonly id: string;
  readonly code: string;
  readonly symbol: string;
  readonly dimension: UnitDimensionCode;
}

/** Asociación con lo que muestra la ficha; descripción y familia se leen del maestro (RN-03.54). */
export interface ProjectProductRecord {
  readonly id: string;
  readonly projectId: string;
  readonly product: {
    readonly id: string;
    readonly sku: string;
    readonly description: string;
    readonly family: { readonly id: string; readonly code: string; readonly name: string };
    readonly isActive: boolean;
  };
  readonly opportunity: { readonly id: string; readonly code: string } | null;
  readonly quantity: DecimalString;
  readonly unit: ProjectProductUnit & { readonly isActive: boolean };
  readonly conversion: { readonly ruleId: string; readonly scope: ConversionScopeCode; readonly factor: DecimalString } | null;
  readonly tonnage: DecimalString | null;
  readonly status: { readonly id: string; readonly code: string; readonly label: string; readonly isActive: boolean; readonly countsInTotals: boolean };
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly updatedBy: { readonly id: string; readonly displayName: string } | null;
}

export interface ProjectProductListRequest extends PageRequest {
  readonly sortBy: ProjectProductSortField;
  readonly sortOrder: 'asc' | 'desc';
}

/** Línea para los totales (todas las asociaciones no eliminadas del proyecto). */
export interface ProjectProductTotalsRow {
  readonly quantity: DecimalString;
  readonly unit: ProjectProductUnit;
  readonly tonnage: DecimalString | null;
  readonly statusCountsInTotals: boolean;
}

export interface ProjectProductWrite {
  readonly opportunityId: string | null;
  readonly quantity: DecimalString;
  readonly unitId: string;
  readonly conversionRuleId: string | null;
  readonly conversionFactor: DecimalString | null;
  readonly tonnage: DecimalString | null;
  readonly statusId: string;
  readonly notes: string | null;
}

export interface CreateProjectProductInput extends ProjectProductWrite {
  readonly projectId: string;
  readonly productId: string;
  readonly createdById: string | null;
}

/** Asociación del origen que se puede duplicar (RN-03.22), en orden de alta. */
export interface DuplicableProjectProduct {
  readonly productId: string;
  readonly productActive: boolean;
  readonly unitId: string;
  readonly unitActive: boolean;
  readonly quantity: DecimalString;
}

/**
 * Persistencia de productos asociados (03 F.5, §L.1). Toda lectura y escritura se
 * acota al proyecto (`WHERE project_id = :id AND id = :childId`, sin IDOR).
 */
export interface ProjectProductsRepository {
  listByProject(projectId: string, request: ProjectProductListRequest): Promise<Page<ProjectProductRecord>>;
  totalsRows(projectId: string): Promise<ProjectProductTotalsRow[]>;
  /** Asociación no eliminada del proyecto, o `null`. */
  findById(projectId: string, projectProductId: string, tx?: TransactionContext): Promise<ProjectProductRecord | null>;
  /**
   * Asociación activa con la misma clave (excluyendo `excludeId`), o `null`. RN-03.59 se
   * protege con la fila del proyecto bloqueada (`FOR UPDATE`) por toda escritura de
   * asociaciones: no hace falta otro bloqueo (Revisión E5).
   */
  findActiveDuplicate(
    key: { readonly projectId: string; readonly opportunityId: string | null; readonly productId: string; readonly excludeId: string | null },
    tx: TransactionContext,
  ): Promise<{ id: string; productId: string; opportunityId: string | null } | null>;
  /** ¿La oportunidad existe, no está eliminada y es de este proyecto? (RN-03.56). */
  opportunityBelongsToProject(projectId: string, opportunityId: string, tx?: TransactionContext): Promise<boolean>;
  create(input: CreateProjectProductInput, tx: TransactionContext): Promise<string>;
  /** Escribe **solo** las columnas presentes en `input` (Revisión E5, M3). */
  update(projectId: string, projectProductId: string, input: Partial<ProjectProductWrite>, actorId: string | null, tx: TransactionContext): Promise<void>;
  softDelete(projectId: string, projectProductId: string, actorId: string | null, tx: TransactionContext): Promise<void>;
  /** Otras asociaciones activas del mismo producto en el proyecto (RN-03.61). */
  countOtherActive(projectId: string, productId: string, excludeId: string, tx: TransactionContext): Promise<number>;
  /** Períodos de `periods` con forecast de cantidad > 0 para el par (RN-03.61). */
  forecastPeriodsWithQuantity(projectId: string, productId: string, periods: readonly YearMonth[], tx: TransactionContext): Promise<YearMonth[]>;
  listDuplicable(projectId: string): Promise<DuplicableProjectProduct[]>;
}
