import { ResourceConflictError, ResourceNotFoundError } from '@/common/errors/application-error';
import type { AuditContext, AuditService } from '@/modules/audit/audit.service';

import { CATALOG_NOT_EMPTY, CatalogsService, SORT_ORDER_STEP, SYSTEM_RESOURCE_READ_ONLY } from './catalogs.service';
import { isCatalogMetadata, MAX_METADATA_BYTES } from './dto/catalog.dto';
import type { CatalogDetailRecord, CatalogItemRecord, CatalogsRepository } from './ports/catalogs.repository.port';

const CONTEXT: AuditContext = { correlationId: 'corr-1', actorId: 'actor-1', actorEmail: null, ipAddress: null };
const NOW = new Date('2026-01-01T00:00:00Z');

function catalog(overrides: Partial<CatalogDetailRecord> = {}): CatalogDetailRecord {
  return {
    id: 'cat-1',
    key: 'tipos',
    name: 'Tipos',
    description: null,
    isSystem: false,
    itemCount: 0,
    activeItemCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    items: [],
    ...overrides,
  };
}

function item(overrides: Partial<CatalogItemRecord> = {}): CatalogItemRecord {
  return {
    id: 'item-1',
    catalogId: 'cat-1',
    code: 'A',
    label: 'A',
    metadata: null,
    sortOrder: 10,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('isCatalogMetadata', () => {
  it('acepta objetos JSON planos', () => {
    expect(isCatalogMetadata({ color: 'azul', nivel: 2, tags: ['a'] })).toBe(true);
  });

  it.each([
    ['un array', [1, 2]],
    ['una cadena', 'texto'],
    ['un número', 3],
    ['una fecha', new Date()],
  ])('rechaza %s', (_label, value) => {
    expect(isCatalogMetadata(value)).toBe(false);
  });

  it('rechaza objetos demasiado grandes', () => {
    expect(isCatalogMetadata({ texto: 'x'.repeat(MAX_METADATA_BYTES) })).toBe(false);
  });

  it('rechaza objetos demasiado profundos', () => {
    expect(isCatalogMetadata({ a: { b: { c: { d: { e: { f: 1 } } } } } })).toBe(false);
  });
});

describe('CatalogsService', () => {
  let repository: jest.Mocked<CatalogsRepository>;
  let audit: { record: jest.Mock };
  let service: CatalogsService;

  beforeEach(() => {
    repository = {
      list: jest.fn(),
      findById: jest.fn().mockResolvedValue(catalog()),
      existsByKey: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue('cat-1'),
      update: jest.fn(),
      delete: jest.fn(),
      findItem: jest.fn().mockResolvedValue(item()),
      existsItemCode: jest.fn().mockResolvedValue(false),
      maxItemSortOrder: jest.fn().mockResolvedValue(null),
      createItem: jest.fn(async (input) => item({ ...input, id: 'item-new' })),
      updateItem: jest.fn(async (_id, input) => item(input)),
    };
    audit = { record: jest.fn() };
    service = new CatalogsService(repository, audit as unknown as AuditService);
  });

  it('rechaza crear con una clave existente', async () => {
    repository.existsByKey.mockResolvedValue(true);

    await expect(service.create({ key: 'tipos', name: 'T', description: null }, CONTEXT)).rejects.toBeInstanceOf(
      ResourceConflictError,
    );
  });

  it('crea y audita catalog.created', async () => {
    await service.create({ key: 'tipos', name: 'Tipos', description: null }, CONTEXT);

    expect(audit.record).toHaveBeenCalledWith('catalog.created', CONTEXT, expect.objectContaining({ resourceType: 'catalog' }));
  });

  it('no permite cambiar la clave de un catálogo de sistema', async () => {
    repository.findById.mockResolvedValue(catalog({ isSystem: true }));

    await expect(service.update('cat-1', { key: 'otra' }, CONTEXT)).rejects.toMatchObject({ code: SYSTEM_RESOURCE_READ_ONLY });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('permite editar el nombre de un catálogo de sistema', async () => {
    repository.findById.mockResolvedValue(catalog({ isSystem: true }));

    await service.update('cat-1', { key: 'tipos', name: 'Nuevo nombre' }, CONTEXT);

    expect(repository.update).toHaveBeenCalled();
  });

  it('no elimina un catálogo de sistema', async () => {
    repository.findById.mockResolvedValue(catalog({ isSystem: true }));

    await expect(service.remove('cat-1', CONTEXT)).rejects.toMatchObject({ code: SYSTEM_RESOURCE_READ_ONLY });
  });

  it('no elimina un catálogo con elementos, aunque estén inactivos', async () => {
    repository.findById.mockResolvedValue(catalog({ itemCount: 1, activeItemCount: 0 }));

    await expect(service.remove('cat-1', CONTEXT)).rejects.toMatchObject({ code: CATALOG_NOT_EMPTY });
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('elimina un catálogo vacío y audita catalog.deleted', async () => {
    await service.remove('cat-1', CONTEXT);

    expect(repository.delete).toHaveBeenCalledWith('cat-1');
    expect(audit.record).toHaveBeenCalledWith('catalog.deleted', CONTEXT, expect.objectContaining({ after: null }));
  });

  it('rechaza un código de elemento repetido en el catálogo', async () => {
    repository.existsItemCode.mockResolvedValue(true);

    await expect(
      service.createItem('cat-1', { code: 'A', label: 'A', metadata: null, isActive: true }, CONTEXT),
    ).rejects.toBeInstanceOf(ResourceConflictError);
  });

  it('coloca un elemento nuevo al final si no se indica orden', async () => {
    repository.maxItemSortOrder.mockResolvedValue(30);

    await service.createItem('cat-1', { code: 'B', label: 'B', metadata: null, isActive: true }, CONTEXT);

    expect(repository.createItem).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 30 + SORT_ORDER_STEP }));
    expect(audit.record).toHaveBeenCalledWith(
      'catalog_item.created',
      CONTEXT,
      expect.objectContaining({ resourceType: 'catalog_item', metadata: { catalogId: 'cat-1' } }),
    );
  });

  it('devuelve 404 si el elemento no pertenece al catálogo', async () => {
    repository.findItem.mockResolvedValue(null);

    await expect(service.updateItem('cat-1', 'otro', { isActive: false }, CONTEXT)).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });

  it('desactiva un elemento y audita catalog_item.updated', async () => {
    await service.updateItem('cat-1', 'item-1', { isActive: false }, CONTEXT);

    expect(repository.updateItem).toHaveBeenCalledWith('item-1', { isActive: false });
    expect(audit.record).toHaveBeenCalledWith(
      'catalog_item.updated',
      CONTEXT,
      expect.objectContaining({ before: expect.objectContaining({ isActive: true }), after: expect.objectContaining({ isActive: false }) }),
    );
  });
});
