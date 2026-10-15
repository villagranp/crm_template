import { Inject, Injectable } from '@nestjs/common';

import type { Page } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import { normalizeName } from '@/modules/customers/customer-normalization';
import { type ResolvedConversion, UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

import {
  PRODUCT_CATALOG_READER,
  type ProductCatalogReader,
  type ProductRecord,
  type ProductSortField,
  type UnitOfMeasureRecord,
} from './ports/product-catalog.reader.port';

export interface SearchProductsRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly familyId?: string;
  /** Por defecto `true` (03 F.4); `null` = todos. */
  readonly isActive?: boolean | null;
  /** Lista blanca `ProductSortField`; sin él, por `sku` ascendente (03 F.4). */
  readonly sortBy?: ProductSortField;
  readonly sortOrder?: 'asc' | 'desc';
}

export interface ResolveConversionRequest {
  readonly fromUnitId: string;
  readonly productId?: string;
  readonly projectTypeId?: string;
}

/** Vista previa de la regla aplicable (03 F.4). `fromUnit` es la unidad pedida si existe. */
export interface ConversionPreview {
  readonly rule: (ResolvedConversion & { readonly fromUnit: UnitOfMeasureRecord | null }) | null;
}

/**
 * Lecturas del maestro de productos y de la conversión (03 F.4). Sin alcance de
 * datos: el maestro es configuración (H.1, `productos.ver`). Exportado para que
 * Proyectos valide productos y unidades sin conocer el adaptador.
 */
@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCT_CATALOG_READER) private readonly catalog: ProductCatalogReader,
    private readonly conversions: UnitConversionResolver,
  ) {}

  search(request: SearchProductsRequest): Promise<Page<ProductRecord>> {
    return this.catalog.searchProducts({
      page: request.page,
      pageSize: request.pageSize,
      search: normalizeName(request.search),
      familyId: request.familyId ?? null,
      isActive: request.isActive === undefined ? true : request.isActive,
      sortBy: request.sortBy,
      sortOrder: request.sortOrder,
    });
  }

  listUnits(): Promise<UnitOfMeasureRecord[]> {
    return this.catalog.listUnits();
  }

  findProduct(productId: string, tx?: TransactionContext): Promise<ProductRecord | null> {
    return this.catalog.findProduct(productId, tx);
  }

  findUnit(unitId: string, tx?: TransactionContext): Promise<UnitOfMeasureRecord | null> {
    return this.catalog.findUnit(unitId, tx);
  }

  /**
   * Misma precedencia que los casos de uso (`UnitConversionResolver`): con
   * `productId`, la de una línea; sin él, la de un proyecto. Nunca devuelve reglas inactivas.
   */
  async resolveConversion(request: ResolveConversionRequest): Promise<ConversionPreview> {
    const rule = await this.conversions.resolve({
      fromUnitId: request.fromUnitId,
      productId: request.productId ?? null,
      projectTypeId: request.projectTypeId ?? null,
    });
    if (!rule) return { rule: null };
    return { rule: { ...rule, fromUnit: await this.catalog.findUnit(rule.fromUnitId) } };
  }
}
