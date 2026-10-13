import type { ListQuery } from '@/lib/query-keys';
import { httpClient } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

import { projectPath, type CatalogRef, type ConversionScope, type UnitRef, type UserRef } from '../projects.api';

/**
 * Productos asociados al proyecto (F-19) y lectura del catálogo local de
 * productos (03 §F.4, `productos.ver`). El maestro vive en `products`; la
 * asociación sólo guarda cantidades, unidad, estado y la foto de la regla
 * (RN-03.54).
 */

export interface ProductFamilyRef {
  id: string;
  code: string;
  name: string;
}

/** `ProductDto` (`GET /products`). */
export interface Product {
  id: string;
  sku: string;
  description: string;
  family: ProductFamilyRef;
  baseUnit: UnitRef;
  isActive: boolean;
}

export interface LineConversion {
  ruleId: string;
  scope: ConversionScope;
  factor: string;
}

/** `ProjectProductDto`. */
export interface ProjectProduct {
  id: string;
  /** Descripción y familia se leen del maestro al consultar; `isActive = false` = producto desactivado (RN-03.55). */
  product: { id: string; sku: string; description: string; family: ProductFamilyRef; isActive: boolean };
  opportunity: { id: string; code: string } | null;
  quantity: string;
  unit: UnitRef;
  /** `null` = "sin conversión" (no suma en el total de toneladas). */
  conversion: LineConversion | null;
  tonnage: string | null;
  /** `isActive` = la línea suma en los totales (RN-03.60). */
  status: CatalogRef & { isActive: boolean };
  notes: string | null;
  updatedAt: string;
  updatedBy: UserRef | null;
}

export interface ProjectProductTotals {
  /** Toneladas de las líneas con estado activo y conversión. */
  tonnage: string;
  /** Cantidades de las líneas con estado activo, por unidad (nunca mezcladas). */
  quantitiesByUnit: { unit: UnitRef; quantity: string }[];
  linesWithoutConversion: number;
}

/** `ProjectProductsDto`: colección + `totals` sobre todas las líneas del proyecto. */
export interface ProjectProductsResponse extends PaginatedResponse<ProjectProduct> {
  totals: ProjectProductTotals;
}

export interface CreateProjectProductInput {
  productId: string;
  opportunityId?: string | null;
  quantity: string;
  unitId?: string;
  statusId?: string;
  notes?: string | null;
}

/** El producto no cambia: se quita la asociación y se asocia otro. */
export type UpdateProjectProductInput = Partial<Omit<CreateProjectProductInput, 'productId'>>;

export const PROJECT_PRODUCT_SORT_FIELDS = ['sku', 'createdAt', 'updatedAt'] as const;

function productsPath(projectId: string): string {
  return `${projectPath(projectId)}/products`;
}

function productPath(projectId: string, projectProductId: string): string {
  return `${productsPath(projectId)}/${encodeURIComponent(projectProductId)}`;
}

export function listProjectProducts(projectId: string, query: ListQuery): Promise<ProjectProductsResponse> {
  return httpClient.get<ProjectProductsResponse>(productsPath(projectId), { query });
}

export function createProjectProduct(projectId: string, input: CreateProjectProductInput): Promise<ProjectProduct> {
  return httpClient.post<ProjectProduct>(productsPath(projectId), { body: input });
}

export function updateProjectProduct(
  projectId: string,
  projectProductId: string,
  input: UpdateProjectProductInput,
): Promise<ProjectProduct> {
  return httpClient.patch<ProjectProduct>(productPath(projectId, projectProductId), { body: input });
}

export function deleteProjectProduct(projectId: string, projectProductId: string): Promise<void> {
  return httpClient.delete<void>(productPath(projectId, projectProductId));
}

/** Catálogo local: sólo activos por defecto (`isActive=true`), búsqueda por SKU o descripción. */
export function listProducts(query: ListQuery): Promise<PaginatedResponse<Product>> {
  return httpClient.get<PaginatedResponse<Product>>('/products', { query });
}
