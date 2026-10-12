import { CatalogLookupService } from './catalog-lookup.service';
import type { CatalogDetailRecord, CatalogItemRecord, CatalogsRepository } from './ports/catalogs.repository.port';

const NOW = new Date('2026-01-01T00:00:00Z');

function item(code: string, isActive: boolean): CatalogItemRecord {
  return { id: `id-${code}`, catalogId: 'cat-1', code, label: code, metadata: null, sortOrder: 10, isActive, createdAt: NOW, updatedAt: NOW };
}

const CATALOG: CatalogDetailRecord = {
  id: 'cat-1',
  key: 'crm.prioridad',
  name: 'Prioridad',
  description: null,
  isSystem: true,
  itemCount: 2,
  activeItemCount: 1,
  createdAt: NOW,
  updatedAt: NOW,
  items: [item('ALTA', true), item('BAJA', false)],
};

describe('CatalogLookupService', () => {
  let repository: jest.Mocked<Pick<CatalogsRepository, 'findByKey' | 'list'>>;
  let service: CatalogLookupService;

  beforeEach(() => {
    repository = { findByKey: jest.fn().mockResolvedValue(CATALOG), list: jest.fn() };
    service = new CatalogLookupService(repository as unknown as CatalogsRepository);
  });

  it('busca por clave exacta en el puerto, sin búsqueda por subcadena', async () => {
    await expect(service.findByKey('crm.prioridad')).resolves.toBe(CATALOG);
    expect(repository.findByKey).toHaveBeenCalledWith('crm.prioridad');
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('itemStates: code → isActive, o null si el catálogo no existe', async () => {
    await expect(service.itemStates('crm.prioridad')).resolves.toEqual(
      new Map([
        ['ALTA', true],
        ['BAJA', false],
      ]),
    );
    repository.findByKey.mockResolvedValue(null);
    await expect(service.itemStates('crm.no_existe')).resolves.toBeNull();
  });
});
