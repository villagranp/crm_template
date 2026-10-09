import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';

export const CATALOGS_REPOSITORY = Symbol('CATALOGS_REPOSITORY');

export const CATALOG_SORT_FIELDS = ['key', 'name', 'createdAt', 'updatedAt'] as const;
export type CatalogSortField = (typeof CATALOG_SORT_FIELDS)[number];

/** Objeto JSON plano: los datos extra de un elemento. */
export type CatalogItemMetadata = Record<string, unknown>;

export interface CatalogRecord {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** Todos los elementos, activos e inactivos. */
  itemCount: number;
  activeItemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CatalogItemRecord {
  id: string;
  catalogId: string;
  code: string;
  label: string;
  metadata: CatalogItemMetadata | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CatalogDetailRecord extends CatalogRecord {
  /** Ordenados por `sortOrder` y `label`. */
  items: CatalogItemRecord[];
}

export interface ListCatalogsFilter extends PageRequest {
  readonly sortBy?: CatalogSortField;
  /** Busca en clave y nombre. */
  readonly search?: string;
  readonly isSystem?: boolean;
}

export interface CreateCatalogInput {
  key: string;
  name: string;
  description: string | null;
}

export interface UpdateCatalogInput {
  key?: string;
  name?: string;
  description?: string | null;
}

export interface CreateCatalogItemInput {
  catalogId: string;
  code: string;
  label: string;
  metadata: CatalogItemMetadata | null;
  sortOrder: number;
  isActive: boolean;
}

export interface UpdateCatalogItemInput {
  label?: string;
  metadata?: CatalogItemMetadata | null;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * Puerto de persistencia de catálogos (ADR-004). Las reglas (catálogos de
 * sistema, borrado solo si está vacío, unicidad) viven en `CatalogsService`.
 * Los elementos nunca se borran físicamente: no hay método para ello.
 */
export interface CatalogsRepository {
  list(filter: ListCatalogsFilter): Promise<Page<CatalogRecord>>;
  findById(catalogId: string): Promise<CatalogDetailRecord | null>;
  existsByKey(key: string): Promise<boolean>;
  create(input: CreateCatalogInput): Promise<string>;
  update(catalogId: string, input: UpdateCatalogInput): Promise<void>;
  delete(catalogId: string): Promise<void>;
  findItem(catalogId: string, itemId: string): Promise<CatalogItemRecord | null>;
  existsItemCode(catalogId: string, code: string): Promise<boolean>;
  /** Mayor `sortOrder` del catálogo, o `null` si está vacío. */
  maxItemSortOrder(catalogId: string): Promise<number | null>;
  createItem(input: CreateCatalogItemInput): Promise<CatalogItemRecord>;
  updateItem(itemId: string, input: UpdateCatalogItemInput): Promise<CatalogItemRecord>;
}
