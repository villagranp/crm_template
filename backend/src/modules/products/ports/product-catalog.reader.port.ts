import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { UnitDimensionCode } from '@/modules/unit-conversions/ports/unit-conversion.reader.port';

export const PRODUCT_CATALOG_READER = Symbol('PRODUCT_CATALOG_READER');

/** Unidad de medida (00 §2.3). */
export interface UnitOfMeasureRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  readonly dimension: UnitDimensionCode;
  readonly isActive: boolean;
}

/** Maestro de producto (00 §2.3): nunca guarda cantidades (ALCANCE §5.10). */
export interface ProductRecord {
  readonly id: string;
  readonly sku: string;
  readonly description: string;
  readonly family: { readonly id: string; readonly code: string; readonly name: string };
  readonly baseUnit: { readonly id: string; readonly code: string; readonly symbol: string; readonly dimension: UnitDimensionCode };
  readonly isActive: boolean;
}

/** Campos ordenables de `GET /products` (07 F.7; `description` no, 03 F.4). */
export type ProductSortField = 'sku' | 'createdAt' | 'updatedAt';

export interface ProductSearch extends PageRequest {
  /** Contenido en el SKU o en la descripción (sin distinguir mayúsculas ni acentos). */
  readonly search: string | null;
  readonly familyId: string | null;
  /** `null` = activos e inactivos. */
  readonly isActive: boolean | null;
  /** Sin él, por `sku` ascendente. */
  readonly sortBy?: ProductSortField;
}

/**
 * Lectura del maestro de productos, familias y unidades (03 F.4, F.5). Las escrituras
 * llegan con el Módulo 7 (`productos.configurar`, DM-23). Sin tipos del ORM (ADR-004).
 */
export interface ProductCatalogReader {
  searchProducts(search: ProductSearch): Promise<Page<ProductRecord>>;
  /** Unidades activas, por `sortOrder` y código. */
  listUnits(): Promise<UnitOfMeasureRecord[]>;
  findProduct(productId: string, tx?: TransactionContext): Promise<ProductRecord | null>;
  findUnit(unitId: string, tx?: TransactionContext): Promise<UnitOfMeasureRecord | null>;
}
