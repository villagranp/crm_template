import { Inject, Injectable } from '@nestjs/common';

import { ResourceConflictError, ResourceNotFoundError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { type AuditContext, AuditService } from '@/modules/audit/audit.service';

import {
  CATALOGS_REPOSITORY,
  type CatalogDetailRecord,
  type CatalogItemMetadata,
  type CatalogItemRecord,
  type CatalogRecord,
  type CatalogsRepository,
  type CreateCatalogInput,
  type ListCatalogsFilter,
  type UpdateCatalogInput,
  type UpdateCatalogItemInput,
} from './ports/catalogs.repository.port';

export const SYSTEM_RESOURCE_READ_ONLY = 'SYSTEM_RESOURCE_READ_ONLY';
export const CATALOG_NOT_EMPTY = 'CATALOG_NOT_EMPTY';
/** Separación entre elementos nuevos: deja hueco para intercalar sin renumerar. */
export const SORT_ORDER_STEP = 10;

export interface CreateItemCommand {
  code: string;
  label: string;
  metadata: CatalogItemMetadata | null;
  sortOrder?: number;
  isActive: boolean;
}

function catalogAuditState(catalog: CatalogRecord): Record<string, unknown> {
  return { key: catalog.key, name: catalog.name, description: catalog.description, isSystem: catalog.isSystem };
}

function itemAuditState(item: CatalogItemRecord): Record<string, unknown> {
  return {
    code: item.code,
    label: item.label,
    metadata: item.metadata,
    sortOrder: item.sortOrder,
    isActive: item.isActive,
  };
}

/**
 * Catálogos y sus elementos (PLAN-ADMIN, D9).
 *
 * - Los catálogos de sistema (`isSystem`) no cambian de `key` ni se eliminan
 *   (`409 SYSTEM_RESOURCE_READ_ONLY`): el código los busca por esa clave.
 * - Un catálogo solo se elimina si está vacío (`409 CATALOG_NOT_EMPTY`), contando
 *   los inactivos: no hay forma genérica de saber si un elemento está en uso.
 * - Los elementos se activan y desactivan; nunca se borran. Su `code` es único
 *   en el catálogo e inmutable.
 *
 * Toda mutación deja registro en la bitácora (D11).
 */
@Injectable()
export class CatalogsService {
  constructor(
    @Inject(CATALOGS_REPOSITORY) private readonly repository: CatalogsRepository,
    private readonly audit: AuditService,
  ) {}

  list(filter: ListCatalogsFilter): Promise<Page<CatalogRecord>> {
    return this.repository.list(filter);
  }

  async findById(catalogId: string): Promise<CatalogDetailRecord> {
    const catalog = await this.repository.findById(catalogId);
    if (!catalog) {
      throw new ResourceNotFoundError('Catalog', catalogId);
    }
    return catalog;
  }

  async create(input: CreateCatalogInput, context: AuditContext): Promise<CatalogDetailRecord> {
    await this.assertKeyAvailable(input.key);

    const catalogId = await this.repository.create(input);
    const created = await this.findById(catalogId);

    await this.audit.record('catalog.created', context, {
      resourceType: 'catalog',
      resourceId: catalogId,
      before: null,
      after: catalogAuditState(created),
    });
    return created;
  }

  async update(catalogId: string, input: UpdateCatalogInput, context: AuditContext): Promise<CatalogDetailRecord> {
    const current = await this.findById(catalogId);

    if (input.key !== undefined && input.key !== current.key) {
      if (current.isSystem) {
        throw new ResourceConflictError(
          'The key of a system catalog cannot change',
          [{ field: 'key', issue: 'read_only' }],
          SYSTEM_RESOURCE_READ_ONLY,
        );
      }
      await this.assertKeyAvailable(input.key);
    }

    await this.repository.update(catalogId, input);
    const updated = await this.findById(catalogId);

    await this.audit.record('catalog.updated', context, {
      resourceType: 'catalog',
      resourceId: catalogId,
      before: catalogAuditState(current),
      after: catalogAuditState(updated),
    });
    return updated;
  }

  async remove(catalogId: string, context: AuditContext): Promise<void> {
    const current = await this.findById(catalogId);

    if (current.isSystem) {
      throw new ResourceConflictError('A system catalog cannot be deleted', [], SYSTEM_RESOURCE_READ_ONLY);
    }
    if (current.itemCount > 0) {
      throw new ResourceConflictError(
        'The catalog still has items',
        [{ itemCount: current.itemCount }],
        CATALOG_NOT_EMPTY,
      );
    }

    await this.repository.delete(catalogId);
    await this.audit.record('catalog.deleted', context, {
      resourceType: 'catalog',
      resourceId: catalogId,
      before: catalogAuditState(current),
      after: null,
    });
  }

  async createItem(catalogId: string, command: CreateItemCommand, context: AuditContext): Promise<CatalogItemRecord> {
    await this.findById(catalogId);

    if (await this.repository.existsItemCode(catalogId, command.code)) {
      throw new ResourceConflictError('An item with this code already exists in the catalog', [
        { field: 'code', issue: 'duplicated' },
      ]);
    }

    const sortOrder = command.sortOrder ?? ((await this.repository.maxItemSortOrder(catalogId)) ?? 0) + SORT_ORDER_STEP;
    const item = await this.repository.createItem({
      catalogId,
      code: command.code,
      label: command.label,
      metadata: command.metadata,
      sortOrder,
      isActive: command.isActive,
    });

    await this.audit.record('catalog_item.created', context, {
      resourceType: 'catalog_item',
      resourceId: item.id,
      before: null,
      after: itemAuditState(item),
      metadata: { catalogId },
    });
    return item;
  }

  async updateItem(
    catalogId: string,
    itemId: string,
    input: UpdateCatalogItemInput,
    context: AuditContext,
  ): Promise<CatalogItemRecord> {
    const current = await this.repository.findItem(catalogId, itemId);
    if (!current) {
      throw new ResourceNotFoundError('CatalogItem', itemId);
    }

    const updated = await this.repository.updateItem(itemId, input);

    await this.audit.record('catalog_item.updated', context, {
      resourceType: 'catalog_item',
      resourceId: itemId,
      before: itemAuditState(current),
      after: itemAuditState(updated),
      metadata: { catalogId },
    });
    return updated;
  }

  private async assertKeyAvailable(key: string): Promise<void> {
    if (await this.repository.existsByKey(key)) {
      throw new ResourceConflictError('A catalog with this key already exists', [{ field: 'key', issue: 'duplicated' }]);
    }
  }
}
