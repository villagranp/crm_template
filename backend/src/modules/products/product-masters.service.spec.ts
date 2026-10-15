import { ResourceNotFoundError } from '@/common/errors/application-error';
import type { AuditContext, AuditService } from '@/modules/audit/audit.service';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import type {
  ProductDetailRecord,
  ProductFamilyDetailRecord,
  ProductMastersRepository,
  UnitOfMeasureDetailRecord,
} from './ports/product-masters.repository.port';
import { type MasterActor, ProductMastersService } from './product-masters.service';

const AUDIT: AuditContext = { correlationId: 'corr-1', actorId: 'sub-1', actorEmail: null, ipAddress: null };
const ACTOR: MasterActor = { userId: 'user-1', audit: AUDIT };
const NOW = new Date('2026-10-14T12:00:00Z');

function family(overrides: Partial<ProductFamilyDetailRecord> = {}): ProductFamilyDetailRecord {
  return { id: 'fam-1', code: 'ACERO', name: 'Acero', description: null, sortOrder: 0, isActive: true, createdAt: NOW, updatedAt: NOW, ...overrides };
}

function unit(overrides: Partial<UnitOfMeasureDetailRecord> = {}): UnitOfMeasureDetailRecord {
  return { id: 'unit-kg', code: 'KG', name: 'Kilogramo', symbol: 'kg', dimension: 'MASS', sortOrder: 0, isActive: true, createdAt: NOW, updatedAt: NOW, ...overrides };
}

function product(overrides: Partial<ProductDetailRecord> = {}): ProductDetailRecord {
  return {
    id: 'prod-1',
    sku: 'VAR-3',
    description: 'Varilla',
    family: { id: 'fam-1', code: 'ACERO', name: 'Acero' },
    baseUnit: { id: 'unit-kg', code: 'KG', symbol: 'kg', dimension: 'MASS' },
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

interface SetupOptions {
  families?: Record<string, ProductFamilyDetailRecord>;
  units?: Record<string, UnitOfMeasureDetailRecord>;
  product?: ProductDetailRecord | null;
  referenced?: boolean;
  duplicate?: boolean;
}

function setup(options: SetupOptions = {}) {
  const families = options.families ?? { 'fam-1': family() };
  const units = options.units ?? { 'unit-kg': unit() };
  const duplicate = options.duplicate ?? false;
  const repository = {
    searchFamilies: jest.fn().mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 100 }),
    findFamily: jest.fn(async (id: string) => families[id] ?? null),
    createFamily: jest.fn(async (input) => (duplicate ? { ok: false, reason: 'DUPLICATE' } : { ok: true, record: family({ ...input, id: 'fam-new' }) })),
    updateFamily: jest.fn(async (id: string, input) => family({ ...families[id], ...input })),
    searchUnits: jest.fn().mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 100 }),
    findUnit: jest.fn(async (id: string) => units[id] ?? null),
    createUnit: jest.fn(async (input) => (duplicate ? { ok: false, reason: 'DUPLICATE' } : { ok: true, record: unit({ ...input, id: 'unit-new' }) })),
    updateUnit: jest.fn(async (id: string, input) => unit({ ...units[id], ...input })),
    isUnitReferenced: jest.fn().mockResolvedValue(options.referenced ?? false),
    findProduct: jest.fn().mockResolvedValue(options.product === undefined ? product() : options.product),
    createProduct: jest.fn(async (input) => (duplicate ? { ok: false, reason: 'DUPLICATE' } : { ok: true, record: product({ sku: input.sku, id: 'prod-new' }) })),
    updateProduct: jest.fn(async (_id: string, input) => (duplicate ? { ok: false, reason: 'DUPLICATE' } : { ok: true, record: product({ ...input }) })),
  } as unknown as jest.Mocked<ProductMastersRepository>;
  const parameters = { get: jest.fn().mockResolvedValue('TON') };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ProductMastersService(repository, parameters as unknown as ParameterReader, audit as unknown as AuditService);
  return { service, repository, audit };
}

describe('ProductMastersService (07 F.7)', () => {
  describe('listas', () => {
    it('isActive por defecto true, null = todos; search normalizado', async () => {
      const { service, repository } = setup();
      await service.searchFamilies({ page: 1, pageSize: 100, search: '  Acéro ' });
      expect(repository.searchFamilies).toHaveBeenCalledWith(expect.objectContaining({ search: 'acero', isActive: true }));
      await service.searchUnits({ page: 1, pageSize: 100, isActive: null, sortBy: 'code', sortOrder: 'desc' });
      expect(repository.searchUnits).toHaveBeenCalledWith(expect.objectContaining({ search: null, isActive: null, sortBy: 'code', sortOrder: 'desc' }));
    });
  });

  describe('familias', () => {
    it('alta: código en mayúsculas, quién y auditoría crm.product_family.created', async () => {
      const { service, repository, audit } = setup();
      await service.createFamily({ code: ' acero-largo ', name: 'Aceros largos' }, ACTOR);
      expect(repository.createFamily).toHaveBeenCalledWith({ code: 'ACERO-LARGO', name: 'Aceros largos', description: null, sortOrder: 0 }, 'user-1');
      expect(audit.record).toHaveBeenCalledWith('crm.product_family.created', AUDIT, expect.objectContaining({ resourceType: 'crm.product_family', resourceId: 'fam-new' }));
    });

    it('alta duplicada → 409 RESOURCE_CONFLICT (code)', async () => {
      await expect(setup({ duplicate: true }).service.createFamily({ code: 'ACERO', name: 'x' }, ACTOR)).rejects.toMatchObject({
        code: 'RESOURCE_CONFLICT',
        details: [{ field: 'code', issue: 'duplicated' }],
      });
    });

    it('edición: solo lo que cambia; sin cambios no escribe ni audita', async () => {
      const { service, repository, audit } = setup();
      await service.updateFamily('fam-1', { name: 'Acero', isActive: true }, ACTOR);
      expect(repository.updateFamily).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();

      await service.updateFamily('fam-1', { name: 'Acero', isActive: false }, ACTOR);
      expect(repository.updateFamily).toHaveBeenCalledWith('fam-1', { isActive: false }, 'user-1');
      expect(audit.record).toHaveBeenCalledWith('crm.product_family.updated', AUDIT, expect.objectContaining({
        before: expect.objectContaining({ isActive: true }),
        after: expect.objectContaining({ isActive: false }),
      }));
    });

    it('inexistente → 404', async () => {
      await expect(setup().service.findFamily('nope')).rejects.toBeInstanceOf(ResourceNotFoundError);
    });
  });

  describe('unidades', () => {
    it('dimensión referenciada → 409 UNIT_DIMENSION_LOCKED; sin referencias se cambia', async () => {
      await expect(setup({ referenced: true }).service.updateUnit('unit-kg', { dimension: 'COUNT' }, ACTOR)).rejects.toMatchObject({
        code: 'UNIT_DIMENSION_LOCKED',
      });
      const { service, repository } = setup({ referenced: false });
      await service.updateUnit('unit-kg', { dimension: 'COUNT' }, ACTOR);
      expect(repository.updateUnit).toHaveBeenCalledWith('unit-kg', { dimension: 'COUNT' });
    });

    it('la misma dimensión no consulta referencias', async () => {
      const { service, repository } = setup({ referenced: true });
      await service.updateUnit('unit-kg', { dimension: 'MASS', name: 'Kilo' }, ACTOR);
      expect(repository.isUnitReferenced).not.toHaveBeenCalled();
      expect(repository.updateUnit).toHaveBeenCalledWith('unit-kg', { name: 'Kilo' });
    });

    it('desactivar la unidad de tonelaje → 409 CONVERSION_RULE_PROTECTED (tonnage_unit)', async () => {
      const { service } = setup({ units: { ton: unit({ id: 'ton', code: 'TON' }) } });
      await expect(service.updateUnit('ton', { isActive: false }, ACTOR)).rejects.toMatchObject({
        code: 'CONVERSION_RULE_PROTECTED',
        details: [{ field: 'isActive', reason: 'tonnage_unit' }],
      });
    });

    it('alta: código en mayúsculas y auditoría crm.unit_of_measure.created', async () => {
      const { service, repository, audit } = setup();
      await service.createUnit({ code: 'qq', name: 'Quintal', symbol: 'qq', dimension: 'MASS' }, ACTOR);
      expect(repository.createUnit).toHaveBeenCalledWith({ code: 'QQ', name: 'Quintal', symbol: 'qq', dimension: 'MASS', sortOrder: 0 });
      expect(audit.record).toHaveBeenCalledWith('crm.unit_of_measure.created', AUDIT, expect.anything());
    });
  });

  describe('productos', () => {
    it('alta: familia y unidad activas; SKU en mayúsculas; auditoría crm.product.created', async () => {
      const { service, repository, audit } = setup();
      await service.createProduct({ sku: ' var-3 ', description: 'Varilla', familyId: 'fam-1', baseUnitId: 'unit-kg' }, ACTOR);
      expect(repository.createProduct).toHaveBeenCalledWith({ sku: 'VAR-3', description: 'Varilla', familyId: 'fam-1', baseUnitId: 'unit-kg' }, 'user-1');
      expect(audit.record).toHaveBeenCalledWith('crm.product.created', AUDIT, expect.objectContaining({ resourceType: 'crm.product' }));
    });

    it.each([
      ['familia inexistente', { familyId: 'nope' }, 'familyId', 'not_found'],
      ['unidad inexistente', { baseUnitId: 'nope' }, 'baseUnitId', 'not_found'],
    ])('alta con %s → 422 UNKNOWN_REFERENCE', async (_label, override, field, issue) => {
      const { service, repository } = setup();
      await expect(
        service.createProduct({ sku: 'X', description: 'x', familyId: 'fam-1', baseUnitId: 'unit-kg', ...override }, ACTOR),
      ).rejects.toMatchObject({ code: 'UNKNOWN_REFERENCE', details: [{ field, issue }] });
      expect(repository.createProduct).not.toHaveBeenCalled();
    });

    it('alta con familia o unidad inactiva → 422 inactive', async () => {
      const { service } = setup({ families: { 'fam-1': family({ isActive: false }) }, units: { 'unit-kg': unit({ isActive: false }) } });
      await expect(service.createProduct({ sku: 'X', description: 'x', familyId: 'fam-1', baseUnitId: 'unit-kg' }, ACTOR)).rejects.toMatchObject({
        details: [{ field: 'familyId', issue: 'inactive' }],
      });
    });

    it('edición que conserva una familia ya desactivada no la revalida; cambiarla a una inactiva → 422', async () => {
      const families = { 'fam-1': family({ isActive: false }), 'fam-2': family({ id: 'fam-2', isActive: false }) };
      const { service, repository } = setup({ families });
      await service.updateProduct('prod-1', { familyId: 'fam-1', description: 'Nueva' }, ACTOR);
      expect(repository.updateProduct).toHaveBeenCalledWith('prod-1', { description: 'Nueva' }, 'user-1');
      await expect(service.updateProduct('prod-1', { familyId: 'fam-2' }, ACTOR)).rejects.toMatchObject({
        code: 'UNKNOWN_REFERENCE',
        details: [{ field: 'familyId', issue: 'inactive' }],
      });
    });

    it('SKU duplicado en la edición → 409 (sku)', async () => {
      await expect(setup({ duplicate: true }).service.updateProduct('prod-1', { sku: 'otro' }, ACTOR)).rejects.toMatchObject({
        code: 'RESOURCE_CONFLICT',
        details: [{ field: 'sku' }],
      });
    });

    it('inexistente → 404', async () => {
      await expect(setup({ product: null }).service.updateProduct('nope', { description: 'x' }, ACTOR)).rejects.toBeInstanceOf(ResourceNotFoundError);
    });
  });
});
