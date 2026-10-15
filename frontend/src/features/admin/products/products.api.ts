import type { ListQuery, Paginated } from '@/features/admin/common';
import { httpClient } from '@/services/api';

/**
 * Clientes de los maestros comerciales (07 F.7): familias, productos y
 * unidades de medida. Lista paginada (`page`, `pageSize`, `search`, `sortBy`,
 * `sortOrder`, `isActive`), alta y edición; **sin `DELETE`** (se desactiva con
 * `PATCH { isActive: false }`).
 *
 * Los tipos reflejan los DTO de lectura existentes
 * (`backend/src/modules/products/dto/product.dto.ts`) ampliados con los campos
 * del modelo (`sortOrder`, `isActive`, fechas). Los campos opcionales son
 * supuestos de contrato que la pantalla no necesita para funcionar.
 */

export const UNIT_DIMENSIONS = ['MASS', 'LENGTH', 'AREA', 'VOLUME', 'COUNT', 'OTHER'] as const;
export type UnitDimension = (typeof UNIT_DIMENSIONS)[number];

export interface ProductFamily {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder?: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UnitOfMeasure {
  id: string;
  code: string;
  name: string;
  symbol: string;
  dimension: UnitDimension;
  sortOrder?: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  sku: string;
  description: string;
  family: { id: string; code: string; name: string };
  baseUnit: { id: string; code: string; symbol: string; dimension: UnitDimension };
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateProductFamilyRequest {
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
}

/** `code` es inmutable: no viaja en la edición. */
export interface UpdateProductFamilyRequest {
  name?: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreateProductRequest {
  sku: string;
  description: string;
  familyId: string;
  baseUnitId: string;
}

/** El SKU se puede corregir (`409 RESOURCE_CONFLICT` con `field: 'sku'` si ya existe). */
export interface UpdateProductRequest {
  sku?: string;
  description?: string;
  familyId?: string;
  baseUnitId?: string;
  isActive?: boolean;
}

export interface CreateUnitRequest {
  code: string;
  name: string;
  symbol: string;
  dimension: UnitDimension;
  sortOrder?: number;
}

/** `code` es inmutable (RN-07.37); `dimension`, mientras no esté referenciada (`409 UNIT_DIMENSION_LOCKED`). */
export interface UpdateUnitRequest {
  name?: string;
  symbol?: string;
  dimension?: UnitDimension;
  sortOrder?: number;
  isActive?: boolean;
}

const FAMILIES_PATH = '/product-families';
const PRODUCTS_PATH = '/products';
const UNITS_PATH = '/units-of-measure';

export function listProductFamilies(query: ListQuery): Promise<Paginated<ProductFamily>> {
  return httpClient.get<Paginated<ProductFamily>>(FAMILIES_PATH, { query });
}

export function createProductFamily(body: CreateProductFamilyRequest): Promise<ProductFamily> {
  return httpClient.post<ProductFamily>(FAMILIES_PATH, { body });
}

export function updateProductFamily(
  id: string,
  body: UpdateProductFamilyRequest,
): Promise<ProductFamily> {
  return httpClient.patch<ProductFamily>(`${FAMILIES_PATH}/${id}`, { body });
}

export function listProducts(query: ListQuery): Promise<Paginated<Product>> {
  return httpClient.get<Paginated<Product>>(PRODUCTS_PATH, { query });
}

export function createProduct(body: CreateProductRequest): Promise<Product> {
  return httpClient.post<Product>(PRODUCTS_PATH, { body });
}

export function updateProduct(id: string, body: UpdateProductRequest): Promise<Product> {
  return httpClient.patch<Product>(`${PRODUCTS_PATH}/${id}`, { body });
}

export function listUnits(query: ListQuery): Promise<Paginated<UnitOfMeasure>> {
  return httpClient.get<Paginated<UnitOfMeasure>>(UNITS_PATH, { query });
}

export function createUnit(body: CreateUnitRequest): Promise<UnitOfMeasure> {
  return httpClient.post<UnitOfMeasure>(UNITS_PATH, { body });
}

export function updateUnit(id: string, body: UpdateUnitRequest): Promise<UnitOfMeasure> {
  return httpClient.patch<UnitOfMeasure>(`${UNITS_PATH}/${id}`, { body });
}
