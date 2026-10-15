import type { ListQuery, Paginated } from '@/features/admin/common';
import { httpClient } from '@/services/api';

export type CatalogItemMetadata = Record<string, unknown>;

/** `CatalogResponseDto`. */
export interface Catalog {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  itemCount: number;
  activeItemCount: number;
  createdAt: string;
  updatedAt: string;
}

/** `CatalogItemResponseDto`. */
export interface CatalogItem {
  id: string;
  catalogId: string;
  code: string;
  label: string;
  metadata: CatalogItemMetadata | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Clave de `metadata` declarada por el registro de semántica (`CatalogMetadataFieldDto`, 07 F.4). */
export interface CatalogMetadataField {
  key: string;
  type: 'boolean' | 'number' | 'string' | 'enum' | 'enum[]' | 'string[]';
  required: boolean;
  /** Admite `null`. */
  nullable?: boolean;
  /** Valores admitidos (`enum`, `enum[]`). */
  values?: string[];
  min?: number;
  max?: number;
  /** Sólo enteros. */
  integer?: boolean;
}

/** `GET /catalogs/{id}`: el catálogo con todos sus elementos, por `sortOrder`. */
export interface CatalogDetail extends Catalog {
  /**
   * Esquema de `metadata` (catálogos `crm.*`). `null` = metadata libre (se
   * edita como JSON); `[]` = el catálogo no lleva metadata.
   */
  metadataSchema: CatalogMetadataField[] | null;
  /** Conjunto cerrado (07 RN-07.25): no se crean ni desactivan elementos; sólo cambian etiqueta y orden. */
  closedSet: boolean;
  items: CatalogItem[];
}

export interface CreateCatalogRequest {
  key: string;
  name: string;
  description: string | null;
}

export type UpdateCatalogRequest = Partial<CreateCatalogRequest>;

export interface CreateCatalogItemRequest {
  code: string;
  label: string;
  metadata?: CatalogItemMetadata | null;
  sortOrder?: number;
  isActive?: boolean;
}

/** `code` no viaja: es inmutable. */
export type UpdateCatalogItemRequest = Partial<Omit<CreateCatalogItemRequest, 'code'>>;

export function listCatalogs(query: ListQuery): Promise<Paginated<Catalog>> {
  return httpClient.get<Paginated<Catalog>>('/catalogs', { query });
}

export function getCatalog(catalogId: string): Promise<CatalogDetail> {
  return httpClient.get<CatalogDetail>(`/catalogs/${catalogId}`);
}

export function createCatalog(body: CreateCatalogRequest): Promise<CatalogDetail> {
  return httpClient.post<CatalogDetail>('/catalogs', { body });
}

export function updateCatalog(catalogId: string, body: UpdateCatalogRequest): Promise<CatalogDetail> {
  return httpClient.patch<CatalogDetail>(`/catalogs/${catalogId}`, { body });
}

export function deleteCatalog(catalogId: string): Promise<void> {
  return httpClient.delete<void>(`/catalogs/${catalogId}`);
}

export function createCatalogItem(catalogId: string, body: CreateCatalogItemRequest): Promise<CatalogItem> {
  return httpClient.post<CatalogItem>(`/catalogs/${catalogId}/items`, { body });
}

export function updateCatalogItem(catalogId: string, itemId: string, body: UpdateCatalogItemRequest): Promise<CatalogItem> {
  return httpClient.patch<CatalogItem>(`/catalogs/${catalogId}/items/${itemId}`, { body });
}
