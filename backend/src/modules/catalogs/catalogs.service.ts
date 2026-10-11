import { Inject, Injectable } from '@nestjs/common';

import { BusinessRuleViolationError, ResourceConflictError, ResourceNotFoundError } from '@/common/errors/application-error';
import {
  PARAMETER_CATALOG_REFERENCES,
  type ParameterCatalogReferences,
} from '@/common/ports/parameter-catalog-references.port';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { type AuditContext, AuditService } from '@/modules/audit/audit.service';

import {
  type CatalogSemantics,
  invariantViolations,
  itemRuleViolations,
  type SemanticItem,
  semanticsFor,
  validateMetadata,
} from './catalog-semantics.registry';
import {
  CATALOGS_REPOSITORY,
  type CatalogDetailRecord,
  type CatalogItemMetadata,
  type CatalogItemRecord,
  type CatalogRecord,
  type CatalogsRepository,
  type CreateCatalogInput,
  type ListCatalogsFilter,
  type LockedCatalogScope,
  type UpdateCatalogInput,
  type UpdateCatalogItemInput,
} from './ports/catalogs.repository.port';

export const SYSTEM_RESOURCE_READ_ONLY = 'SYSTEM_RESOURCE_READ_ONLY';
export const CATALOG_NOT_EMPTY = 'CATALOG_NOT_EMPTY';
export const INVALID_CATALOG_METADATA = 'INVALID_CATALOG_METADATA';
export const CATALOG_INVARIANT = 'CATALOG_INVARIANT';
/** Separación entre elementos nuevos: deja hueco para intercalar sin renumerar. */
export const SORT_ORDER_STEP = 10;

export interface CreateItemCommand {
  code: string;
  label: string;
  metadata: CatalogItemMetadata | null;
  sortOrder?: number;
  isActive: boolean;
}

/**
 * Etiqueta normalizada (RN-07.21, D-07.5): sin acentos, recortada, con los espacios
 * colapsados y en minúsculas. Dos etiquetas con la misma forma son duplicadas.
 */
export function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
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
 * - Duplicado (D-07.5, RN-07.21): mismo `code` o misma etiqueta normalizada,
 *   contando los inactivos (`409 RESOURCE_CONFLICT`, `field = code | label`).
 * - Catálogos `crm.*` con semántica registrada (`catalog-semantics.registry.ts`,
 *   D-07.6): `metadata` según su esquema (`422 INVALID_CATALOG_METADATA`); reglas
 *   por elemento, invariantes y conjunto cerrado (`409 CATALOG_INVARIANT`,
 *   `reason = invariant | closed_set`); no se desactiva un código que usa un
 *   parámetro del CRM (`reason = referenced_by_parameter`, RN-07.26). El resto de
 *   catálogos no tiene esquema ni invariantes (RN-07.28).
 * - Atomicidad: alta y edición de elementos corren en
 *   `repository.withLockedCatalog`, que bloquea la fila del catálogo y relee sus
 *   elementos. Las comprobaciones (duplicados, invariantes) y la escritura no
 *   tienen carrera: dos desactivaciones simultáneas de las dos únicas etapas WON
 *   se serializan y la segunda recibe `409 CATALOG_INVARIANT`.
 *
 * Toda mutación deja registro en la bitácora (D11).
 */
@Injectable()
export class CatalogsService {
  constructor(
    @Inject(CATALOGS_REPOSITORY) private readonly repository: CatalogsRepository,
    private readonly audit: AuditService,
    @Inject(PARAMETER_CATALOG_REFERENCES) private readonly parameterReferences: ParameterCatalogReferences,
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
    const item = await this.repository.withLockedCatalog(catalogId, (scope) => this.createItemLocked(scope, command));
    if (!item) {
      throw new ResourceNotFoundError('Catalog', catalogId);
    }

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
    const result = await this.repository.withLockedCatalog(catalogId, (scope) => this.updateItemLocked(scope, itemId, input));
    // Catálogo inexistente: el elemento tampoco pertenece a él (mismo 404 que antes).
    if (!result) {
      throw new ResourceNotFoundError('CatalogItem', itemId);
    }

    await this.audit.record('catalog_item.updated', context, {
      resourceType: 'catalog_item',
      resourceId: itemId,
      before: itemAuditState(result.before),
      after: itemAuditState(result.after),
      metadata: { catalogId },
    });
    return result.after;
  }

  /** Dentro del bloqueo: `scope.catalog` es el estado confirmado más reciente. */
  private async createItemLocked(scope: LockedCatalogScope, command: CreateItemCommand): Promise<CatalogItemRecord> {
    const { catalog } = scope;
    const semantics = semanticsFor(catalog.key);

    if (semantics?.closedSet) {
      throw this.invariantError(catalog.key, 'closed_set', [
        `Conjunto cerrado (${(semantics.closedCodes ?? []).join(', ')}): no se crean elementos`,
      ]);
    }
    if (catalog.items.some((existing) => existing.code === command.code)) {
      throw new ResourceConflictError('An item with this code already exists in the catalog', [
        { field: 'code', issue: 'duplicated' },
      ]);
    }
    this.assertLabelAvailable(catalog, command.label);

    if (semantics) {
      this.assertMetadata(semantics, command.metadata);
      this.assertSemanticChange(semantics, catalog.items, null, {
        code: command.code,
        isActive: command.isActive,
        metadata: command.metadata,
      });
    }

    const maxSortOrder = catalog.items.reduce<number | null>(
      (max, existing) => (max === null || existing.sortOrder > max ? existing.sortOrder : max),
      null,
    );
    return scope.createItem({
      code: command.code,
      label: command.label,
      metadata: command.metadata,
      sortOrder: command.sortOrder ?? (maxSortOrder ?? 0) + SORT_ORDER_STEP,
      isActive: command.isActive,
    });
  }

  private async updateItemLocked(
    scope: LockedCatalogScope,
    itemId: string,
    input: UpdateCatalogItemInput,
  ): Promise<{ before: CatalogItemRecord; after: CatalogItemRecord }> {
    const { catalog } = scope;
    const current = catalog.items.find((existing) => existing.id === itemId);
    if (!current) {
      throw new ResourceNotFoundError('CatalogItem', itemId);
    }
    const semantics = semanticsFor(catalog.key);

    if (input.label !== undefined && normalizeLabel(input.label) !== normalizeLabel(current.label)) {
      this.assertLabelAvailable(catalog, input.label, itemId);
    }

    if (semantics) {
      await this.assertSemanticUpdate(semantics, catalog, current, input);
    }

    return { before: current, after: await scope.updateItem(itemId, input) };
  }

  private async assertSemanticUpdate(
    semantics: CatalogSemantics,
    catalog: CatalogDetailRecord,
    current: CatalogItemRecord,
    input: UpdateCatalogItemInput,
  ): Promise<void> {
    const deactivating = input.isActive === false && current.isActive;
    const metadataChanged = input.metadata !== undefined && !sameJson(input.metadata, current.metadata);

    if (semantics.closedSet) {
      if (deactivating) {
        throw this.invariantError(semantics.key, 'closed_set', ['Conjunto cerrado: no se desactivan elementos']);
      }
      if (metadataChanged) {
        throw this.invariantError(semantics.key, 'closed_set', ['Conjunto cerrado: solo cambian etiqueta y orden']);
      }
    }
    if (input.metadata !== undefined) {
      this.assertMetadata(semantics, input.metadata);
    }
    this.assertSemanticChange(semantics, catalog.items, current, {
      code: current.code,
      isActive: input.isActive ?? current.isActive,
      metadata: input.metadata !== undefined ? input.metadata : current.metadata,
    });
    if (deactivating) {
      await this.assertNotReferencedByParameters(semantics.key, current.code);
    }
  }

  /** D-07.5: la etiqueta normalizada es única en el catálogo, contando inactivos. */
  private assertLabelAvailable(catalog: CatalogDetailRecord, label: string, exceptItemId?: string): void {
    const normalized = normalizeLabel(label);
    const existing = catalog.items.find((item) => item.id !== exceptItemId && normalizeLabel(item.label) === normalized);
    if (existing) {
      throw new ResourceConflictError(
        existing.isActive
          ? 'An item with this label already exists in the catalog'
          : 'An inactive item with this label already exists in the catalog: reactivate it instead',
        [
          {
            field: 'label',
            issue: 'duplicated',
            existingItemId: existing.id,
            existingCode: existing.code,
            existingIsActive: existing.isActive,
          },
        ],
      );
    }
  }

  private assertMetadata(semantics: CatalogSemantics, metadata: CatalogItemMetadata | null): void {
    const issues = validateMetadata(semantics, metadata);
    if (issues.length > 0) {
      throw new BusinessRuleViolationError(
        INVALID_CATALOG_METADATA,
        'The item metadata does not match the catalog schema',
        issues.map((issue) => ({ ...issue, catalogKey: semantics.key })),
      );
    }
  }

  /**
   * Reglas del elemento resultante e invariantes del catálogo. Un invariante solo
   * bloquea si la operación lo **rompe**: si ya estaba roto antes (p. ej. un catálogo
   * que se está poblando), no impide seguir corrigiéndolo.
   */
  private assertSemanticChange(
    semantics: CatalogSemantics,
    items: readonly CatalogItemRecord[],
    current: CatalogItemRecord | null,
    next: SemanticItem,
  ): void {
    const metadataChanged = !current || !sameJson(current.metadata, next.metadata);
    const itemIssues = metadataChanged ? itemRuleViolations(semantics, next.metadata) : [];

    const before = invariantViolations(semantics, items);
    const after = invariantViolations(semantics, [...items.filter((item) => item.id !== current?.id), next]);
    const introduced = after.filter((issue) => !before.includes(issue));

    const issues = [...itemIssues, ...introduced];
    if (issues.length > 0) {
      throw this.invariantError(semantics.key, 'invariant', issues);
    }
  }

  /** RN-07.26: no se desactiva un código que usa un parámetro del CRM (D-07.6). */
  private async assertNotReferencedByParameters(catalogKey: string, code: string): Promise<void> {
    const keys = await this.parameterReferences.parameterKeysUsing(catalogKey, code);
    if (keys.length > 0) {
      throw new ResourceConflictError(
        'The item code is used by a system parameter: change the parameter first',
        [{ reason: 'referenced_by_parameter', catalogKey, code, keys }],
        CATALOG_INVARIANT,
      );
    }
  }

  private invariantError(catalogKey: string, reason: 'invariant' | 'closed_set', issues: string[]): ResourceConflictError {
    return new ResourceConflictError(
      reason === 'closed_set' ? 'The catalog is a closed set' : 'The operation breaks a catalog invariant',
      issues.map((issue) => ({ reason, catalogKey, issue })),
      CATALOG_INVARIANT,
    );
  }

  private async assertKeyAvailable(key: string): Promise<void> {
    if (await this.repository.existsByKey(key)) {
      throw new ResourceConflictError('A catalog with this key already exists', [{ field: 'key', issue: 'duplicated' }]);
    }
  }
}
