import { ResourceConflictError, ResourceNotFoundError } from '@/common/errors/application-error';
import type { AuditContext, AuditService } from '@/modules/audit/audit.service';
import type { ParameterCatalogReferences } from '@/common/ports/parameter-catalog-references.port';

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
import type {
  CatalogDetailRecord,
  CatalogItemRecord,
  CatalogsRepository,
  LockedCatalogScope,
} from './ports/catalogs.repository.port';

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
  let scope: { createItem: jest.Mock; updateItem: jest.Mock };
  let audit: { record: jest.Mock };
  let parameterReferences: jest.Mocked<ParameterCatalogReferences>;
  let service: CatalogsService;

  beforeEach(() => {
    scope = {
      createItem: jest.fn(async (input) => item({ ...input, id: 'item-new' })),
      updateItem: jest.fn(async (_id, input) => item(input)),
    };
    repository = {
      list: jest.fn(),
      findById: jest.fn().mockResolvedValue(catalog({ items: [item()] })),
      findByKey: jest.fn(),
      existsByKey: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue('cat-1'),
      update: jest.fn(),
      delete: jest.fn(),
      // Simula el adaptador: relee el catálogo "tras el bloqueo" y ejecuta la unidad de trabajo.
      withLockedCatalog: jest.fn(async (catalogId: string, work: (locked: LockedCatalogScope) => Promise<unknown>) => {
        const locked = await repository.findById(catalogId);
        return locked ? work({ catalog: locked, ...scope }) : null;
      }) as unknown as jest.Mocked<CatalogsRepository>['withLockedCatalog'],
    };
    audit = { record: jest.fn() };
    parameterReferences = { parameterKeysUsing: jest.fn().mockResolvedValue([]) };
    service = new CatalogsService(repository, audit as unknown as AuditService, parameterReferences);
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

  it('rechaza un código de elemento repetido en el catálogo, también si está inactivo', async () => {
    repository.findById.mockResolvedValue(catalog({ items: [item({ code: 'A', label: 'Otra', isActive: false })] }));

    await expect(
      service.createItem('cat-1', { code: 'A', label: 'A', metadata: null, isActive: true }, CONTEXT),
    ).rejects.toBeInstanceOf(ResourceConflictError);
  });

  it('coloca un elemento nuevo al final si no se indica orden', async () => {
    repository.findById.mockResolvedValue(catalog({ items: [item({ sortOrder: 30 }), item({ id: 'item-2', code: 'C', label: 'C', sortOrder: 20 })] }));

    await service.createItem('cat-1', { code: 'B', label: 'B', metadata: null, isActive: true }, CONTEXT);

    expect(scope.createItem).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 30 + SORT_ORDER_STEP }));
    expect(audit.record).toHaveBeenCalledWith(
      'catalog_item.created',
      CONTEXT,
      expect.objectContaining({ resourceType: 'catalog_item', metadata: { catalogId: 'cat-1' } }),
    );
  });

  it('devuelve 404 si el elemento no pertenece al catálogo', async () => {
    await expect(service.updateItem('cat-1', 'otro', { isActive: false }, CONTEXT)).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });

  it('desactiva un elemento y audita catalog_item.updated', async () => {
    await service.updateItem('cat-1', 'item-1', { isActive: false }, CONTEXT);

    expect(scope.updateItem).toHaveBeenCalledWith('item-1', { isActive: false });
    expect(audit.record).toHaveBeenCalledWith(
      'catalog_item.updated',
      CONTEXT,
      expect.objectContaining({ before: expect.objectContaining({ isActive: true }), after: expect.objectContaining({ isActive: false }) }),
    );
  });

  describe('atomicidad: comprobación y escritura bajo el bloqueo del catálogo', () => {
    it('alta y edición pasan por withLockedCatalog y escriben con el scope bloqueado', async () => {
      await service.createItem('cat-1', { code: 'B', label: 'B', metadata: null, isActive: true }, CONTEXT);
      await service.updateItem('cat-1', 'item-1', { label: 'Nueva' }, CONTEXT);

      expect(repository.withLockedCatalog).toHaveBeenCalledTimes(2);
      expect(repository.withLockedCatalog).toHaveBeenNthCalledWith(1, 'cat-1', expect.any(Function));
      expect(repository.withLockedCatalog).toHaveBeenNthCalledWith(2, 'cat-1', expect.any(Function));
      expect(scope.createItem).toHaveBeenCalledWith(expect.objectContaining({ code: 'B' }));
      expect(scope.updateItem).toHaveBeenCalledWith('item-1', { label: 'Nueva' });
    });

    it('valida contra el catálogo releído tras el bloqueo (lo que confirmó otra escritura)', async () => {
      const metadata = (outcome: string | null, isClosed: boolean) => ({ order: 1, isClosed, outcome, inFunnel: !isClosed });
      const wonA = item({ id: 'won-a', code: 'GANADO', label: 'Ganado', metadata: metadata('WON', true) });
      // Otra transacción ya desactivó la segunda etapa WON: el snapshot bloqueado lo refleja.
      const wonB = item({ id: 'won-b', code: 'GANADO_2', label: 'Ganado 2', metadata: metadata('WON', true), isActive: false });
      const open = item({ id: 'open', code: 'CONTACTADO', label: 'Contactado', metadata: metadata(null, false) });
      repository.findById.mockResolvedValue(
        catalog({ key: 'crm.etapa_oportunidad', isSystem: true, items: [open, wonA, wonB] }),
      );

      await expect(service.updateItem('cat-1', 'won-a', { isActive: false }, CONTEXT)).rejects.toMatchObject({
        code: CATALOG_INVARIANT,
      });
      expect(scope.updateItem).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('404 sin auditar si el catálogo no existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.createItem('cat-x', { code: 'B', label: 'B', metadata: null, isActive: true }, CONTEXT),
      ).rejects.toBeInstanceOf(ResourceNotFoundError);
      await expect(service.updateItem('cat-x', 'item-1', { label: 'X' }, CONTEXT)).rejects.toBeInstanceOf(
        ResourceNotFoundError,
      );
      expect(scope.createItem).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
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
      expect(scope.createItem).not.toHaveBeenCalled();
    });

    it('al editar, la propia etiqueta no cuenta como duplicada', async () => {
      repository.findById.mockResolvedValue(catalog({ items: [item({ id: 'item-1', label: 'A' })] }));

      await service.updateItem('cat-1', 'item-1', { label: ' a ' }, CONTEXT);

      expect(scope.updateItem).toHaveBeenCalled();
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
      expect(scope.createItem).toHaveBeenCalled();
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

      await expect(service.updateItem('cat-1', 'id-GANADO', { isActive: false }, CONTEXT)).rejects.toMatchObject({
        code: CATALOG_INVARIANT,
      });
      expect(scope.updateItem).not.toHaveBeenCalled();
    });

    it('no bloquea si el invariante ya estaba roto antes (catálogo en construcción)', async () => {
      repository.findById.mockResolvedValue(catalog({ key: STAGE, isSystem: true, items: [] }));

      await service.createItem(
        'cat-1',
        { code: 'CONTACTADO', label: 'Contactado', metadata: { order: 1, isClosed: false, inFunnel: true }, isActive: true },
        CONTEXT,
      );
      expect(scope.createItem).toHaveBeenCalled();
    });

    it('desactivar un código usado por un parámetro es 409 referenced_by_parameter con las claves', async () => {
      const extra = stage('COTIZANDO', { order: 2, isClosed: false, outcome: null, inFunnel: true });
      repository.findById.mockResolvedValue(catalog({ key: STAGE, isSystem: true, items: [...STAGES, extra] }));
      parameterReferences.parameterKeysUsing.mockResolvedValue(['crm.oportunidades.transiciones_etapa']);

      await expect(service.updateItem('cat-1', 'id-COTIZANDO', { isActive: false }, CONTEXT)).rejects.toMatchObject({
        code: CATALOG_INVARIANT,
        details: [
          expect.objectContaining({ reason: 'referenced_by_parameter', keys: ['crm.oportunidades.transiciones_etapa'] }),
        ],
      });
      expect(parameterReferences.parameterKeysUsing).toHaveBeenCalledWith(STAGE, 'COTIZANDO');
      expect(scope.updateItem).not.toHaveBeenCalled();
    });

    it('conjunto cerrado: no crea, no desactiva, no cambia metadata; sí cambia la etiqueta', async () => {
      const won = item({
        id: 'id-WON',
        code: 'WON',
        label: 'Ganado',
        metadata: { requiresReason: false, requiresAwardedPercent: false, stageOutcome: 'WON' },
      });
      repository.findById.mockResolvedValue(catalog({ key: 'crm.resultado_oportunidad', isSystem: true, items: [won] }));

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
      expect(scope.updateItem).toHaveBeenCalledWith('id-WON', { label: 'Ganada', sortOrder: 5 });
    });

    it('un catálogo que no es crm.* conserva metadata libre (RN-07.28)', async () => {
      repository.findById.mockResolvedValue(catalog({ key: 'tipos', items: [] }));

      await service.createItem('cat-1', { code: 'X', label: 'X', metadata: { cualquier: 'cosa' }, isActive: true }, CONTEXT);
      expect(scope.createItem).toHaveBeenCalled();
    });
  });
});
