import { ResourceConflictError, ResourceNotFoundError } from '@/common/errors/application-error';
import type { AuditContext, AuditService } from '@/modules/audit/audit.service';
import type { ParametersRepository, SystemParameterRecord } from '@/modules/parameters/ports/parameters.repository.port';

import {
  CATALOG_INVARIANT,
  CATALOG_NOT_EMPTY,
  CatalogsService,
  INVALID_CATALOG_METADATA,
  normalizeLabel,
  SORT_ORDER_STEP,
  SYSTEM_RESOURCE_READ_ONLY,
} from './catalogs.service';
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
  let parameters: jest.Mocked<ParametersRepository>;
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
    parameters = { listAll: jest.fn(), findByKey: jest.fn().mockResolvedValue(null), updateValue: jest.fn() };
    service = new CatalogsService(repository, audit as unknown as AuditService, parameters);
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

  describe('duplicados por etiqueta (D-07.5)', () => {
    it('normaliza acentos, mayúsculas y espacios', () => {
      expect(normalizeLabel('  Constructóra   Grande ')).toBe('constructora grande');
    });

    it('rechaza una etiqueta igual normalizada, también si el existente está inactivo', async () => {
      repository.findById.mockResolvedValue(
        catalog({ items: [item({ id: 'i-1', code: 'CONSTRUCTORA', label: 'Constructora', isActive: false })] }),
      );

      const error = await service
        .createItem('cat-1', { code: 'NUEVO', label: 'constructóra ', metadata: null, isActive: true }, CONTEXT)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ResourceConflictError);
      expect(error).toMatchObject({
        code: 'RESOURCE_CONFLICT',
        details: [expect.objectContaining({ field: 'label', existingItemId: 'i-1', existingIsActive: false })],
      });
      expect(repository.createItem).not.toHaveBeenCalled();
    });

    it('al editar, la propia etiqueta no cuenta como duplicada', async () => {
      repository.findById.mockResolvedValue(catalog({ items: [item({ id: 'item-1', label: 'A' })] }));

      await service.updateItem('cat-1', 'item-1', { label: ' a ' }, CONTEXT);

      expect(repository.updateItem).toHaveBeenCalled();
    });
  });

  describe('catálogos crm.* (registro de semántica, D-07.6)', () => {
    const STAGE = 'crm.etapa_oportunidad';

    function stage(code: string, metadata: Record<string, unknown>, isActive = true): CatalogItemRecord {
      return item({ id: `id-${code}`, code, label: code, metadata, isActive });
    }

    const STAGES = [
      stage('CONTACTADO', { order: 1, isClosed: false, outcome: null, inFunnel: true }),
      stage('GANADO', { order: 2, isClosed: true, outcome: 'WON', inFunnel: false }),
      stage('PERDIDO', { order: 3, isClosed: true, outcome: 'LOST', inFunnel: false }),
    ];

    beforeEach(() => {
      repository.findById.mockResolvedValue(catalog({ key: STAGE, isSystem: true, items: STAGES }));
    });

    it('metadata con un tipo incorrecto es 422 INVALID_CATALOG_METADATA con el campo', async () => {
      await expect(
        service.createItem(
          'cat-1',
          { code: 'NEGOCIANDO', label: 'Negociando', metadata: { order: 4, isClosed: 'sí', inFunnel: true }, isActive: true },
          CONTEXT,
        ),
      ).rejects.toMatchObject({ code: INVALID_CATALOG_METADATA, details: [expect.objectContaining({ field: 'metadata.isClosed' })] });
    });

    it('acepta una etapa abierta nueva válida', async () => {
      await service.createItem(
        'cat-1',
        { code: 'NEGOCIANDO', label: 'Negociando', metadata: { order: 4, isClosed: false, inFunnel: true }, isActive: true },
        CONTEXT,
      );
      expect(repository.createItem).toHaveBeenCalled();
    });

    it('outcome en una etapa abierta es 409 CATALOG_INVARIANT', async () => {
      await expect(
        service.createItem(
          'cat-1',
          { code: 'RARA', label: 'Rara', metadata: { order: 4, isClosed: false, outcome: 'WON', inFunnel: true }, isActive: true },
          CONTEXT,
        ),
      ).rejects.toMatchObject({ code: CATALOG_INVARIANT, details: [expect.objectContaining({ reason: 'invariant' })] });
    });

    it('desactivar la única etapa WON es 409 CATALOG_INVARIANT', async () => {
      repository.findItem.mockResolvedValue(STAGES[1]!);

      await expect(service.updateItem('cat-1', 'id-GANADO', { isActive: false }, CONTEXT)).rejects.toMatchObject({
        code: CATALOG_INVARIANT,
      });
      expect(repository.updateItem).not.toHaveBeenCalled();
    });

    it('no bloquea si el invariante ya estaba roto antes (catálogo en construcción)', async () => {
      repository.findById.mockResolvedValue(catalog({ key: STAGE, isSystem: true, items: [] }));

      await service.createItem(
        'cat-1',
        { code: 'CONTACTADO', label: 'Contactado', metadata: { order: 1, isClosed: false, inFunnel: true }, isActive: true },
        CONTEXT,
      );
      expect(repository.createItem).toHaveBeenCalled();
    });

    it('desactivar un código usado por un parámetro es 409 referenced_by_parameter con las claves', async () => {
      const extra = stage('COTIZANDO', { order: 2, isClosed: false, outcome: null, inFunnel: true });
      repository.findById.mockResolvedValue(catalog({ key: STAGE, isSystem: true, items: [...STAGES, extra] }));
      repository.findItem.mockResolvedValue(extra);
      parameters.findByKey.mockImplementation(async (key: string) =>
        key === 'crm.oportunidades.transiciones_etapa'
          ? ({ key, type: 'JSON', value: '{"CONTACTADO":["COTIZANDO"]}' } as SystemParameterRecord)
          : null,
      );

      await expect(service.updateItem('cat-1', 'id-COTIZANDO', { isActive: false }, CONTEXT)).rejects.toMatchObject({
        code: CATALOG_INVARIANT,
        details: [
          expect.objectContaining({ reason: 'referenced_by_parameter', keys: ['crm.oportunidades.transiciones_etapa'] }),
        ],
      });
    });

    it('conjunto cerrado: no crea, no desactiva, no cambia metadata; sí cambia la etiqueta', async () => {
      const won = item({
        id: 'id-WON',
        code: 'WON',
        label: 'Ganado',
        metadata: { requiresReason: false, requiresAwardedPercent: false, stageOutcome: 'WON' },
      });
      repository.findById.mockResolvedValue(catalog({ key: 'crm.resultado_oportunidad', isSystem: true, items: [won] }));
      repository.findItem.mockResolvedValue(won);

      await expect(
        service.createItem('cat-1', { code: 'OTRO', label: 'Otro', metadata: null, isActive: true }, CONTEXT),
      ).rejects.toMatchObject({ code: CATALOG_INVARIANT, details: [expect.objectContaining({ reason: 'closed_set' })] });
      await expect(service.updateItem('cat-1', 'id-WON', { isActive: false }, CONTEXT)).rejects.toMatchObject({
        details: [expect.objectContaining({ reason: 'closed_set' })],
      });
      await expect(
        service.updateItem('cat-1', 'id-WON', { metadata: { requiresReason: true, requiresAwardedPercent: false, stageOutcome: 'WON' } }, CONTEXT),
      ).rejects.toMatchObject({ details: [expect.objectContaining({ reason: 'closed_set' })] });

      await service.updateItem('cat-1', 'id-WON', { label: 'Ganada', sortOrder: 5 }, CONTEXT);
      expect(repository.updateItem).toHaveBeenCalledWith('id-WON', { label: 'Ganada', sortOrder: 5 });
    });

    it('un catálogo que no es crm.* conserva metadata libre (RN-07.28)', async () => {
      repository.findById.mockResolvedValue(catalog({ key: 'tipos', items: [] }));

      await service.createItem('cat-1', { code: 'X', label: 'X', metadata: { cualquier: 'cosa' }, isActive: true }, CONTEXT);
      expect(repository.createItem).toHaveBeenCalled();
    });
  });
});
