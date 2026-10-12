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
 * Elementos de UN catálogo dentro de una transacción que tiene la fila del
 * catálogo bloqueada (ver `CatalogsRepository.withLockedCatalog`).
 */
export interface LockedCatalogScope {
  /** Catálogo con TODOS sus elementos (activos e inactivos), releído tras tomar el bloqueo. */
  readonly catalog: CatalogDetailRecord;
  createItem(input: Omit<CreateCatalogItemInput, 'catalogId'>): Promise<CatalogItemRecord>;
  updateItem(itemId: string, input: UpdateCatalogItemInput): Promise<CatalogItemRecord>;
}

/**
 * Puerto de persistencia de catálogos (ADR-004). Las reglas (catálogos de
 * sistema, borrado solo si está vacío, unicidad) viven en `CatalogsService`.
 * Los elementos nunca se borran físicamente: no hay método para ello.
 */
export interface CatalogsRepository {
  list(filter: ListCatalogsFilter): Promise<Page<CatalogRecord>>;
  findById(catalogId: string): Promise<CatalogDetailRecord | null>;
  /** Búsqueda exacta por `key` (no por subcadena). */
  findByKey(key: string): Promise<CatalogDetailRecord | null>;
  existsByKey(key: string): Promise<boolean>;
  create(input: CreateCatalogInput): Promise<string>;
  update(catalogId: string, input: UpdateCatalogInput): Promise<void>;
  delete(catalogId: string): Promise<void>;
  /**
   * Única vía para crear o modificar elementos. Abre una transacción, bloquea la
   * fila del catálogo (`SELECT … FOR UPDATE`) y relee el catálogo con sus
   * elementos antes de llamar a `work`. Dos escrituras concurrentes sobre el
   * mismo catálogo se serializan, así que las comprobaciones del servicio
   * (código y etiqueta duplicados, invariantes, conjunto cerrado) y la escritura
   * son atómicas: la segunda ve lo que confirmó la primera.
   *
   * Devuelve `null` sin ejecutar `work` si el catálogo no existe. Si `work`
   * lanza, la transacción se revierte.
   */
  withLockedCatalog<T>(catalogId: string, work: (scope: LockedCatalogScope) => Promise<T>): Promise<T | null>;
}
