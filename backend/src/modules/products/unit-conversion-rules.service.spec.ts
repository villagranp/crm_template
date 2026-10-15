import { ResourceNotFoundError } from '@/common/errors/application-error';
import type { AuditContext, AuditService } from '@/modules/audit/audit.service';
import type { CatalogReferenceValidator } from '@/modules/catalogs/catalog-reference.validator';
import type { UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

import type { ConversionRuleDetailRecord, ProductMastersRepository } from './ports/product-masters.repository.port';
import type { MasterActor } from './product-masters.service';
import { UnitConversionRulesService } from './unit-conversion-rules.service';

const AUDIT: AuditContext = { correlationId: 'corr-1', actorId: 'sub-1', actorEmail: null, ipAddress: null };
const ACTOR: MasterActor = { userId: 'user-1', audit: AUDIT };
const NOW = new Date('2026-10-14T12:00:00Z');
const TON = { id: 'ton', code: 'TON', symbol: 't' };

function rule(overrides: Partial<ConversionRuleDetailRecord> = {}): ConversionRuleDetailRecord {
  return {
    id: 'rule-1',
    fromUnit: { id: 'kg', code: 'KG', symbol: 'kg', dimension: 'MASS' },
    toUnit: { id: 'ton', code: 'TON', symbol: 't', dimension: 'MASS' },
    factor: '0.00100000',
    scope: 'GLOBAL',
    product: null,
    productFamily: null,
    projectType: null,
    description: null,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const IDENTITY = rule({ id: 'identity', fromUnit: { id: 'ton', code: 'TON', symbol: 't', dimension: 'MASS' }, factor: '1.00000000' });

function setup(options: { existing?: ConversionRuleDetailRecord | null; duplicate?: boolean; projectTypeOk?: boolean } = {}) {
  const units: Record<string, { id: string; isActive: boolean }> = { kg: { id: 'kg', isActive: true }, ton: { id: 'ton', isActive: true }, old: { id: 'old', isActive: false } };
  const repository = {
    searchRules: jest.fn().mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 20 }),
    findRule: jest.fn().mockResolvedValue(options.existing === undefined ? rule() : options.existing),
    findUnit: jest.fn(async (id: string) => units[id] ?? null),
    findProduct: jest.fn(async (id: string) => (id === 'prod-1' ? { id, isActive: true } : null)),
    findFamily: jest.fn(async (id: string) => (id === 'fam-1' ? { id, isActive: false } : null)),
    createRule: jest.fn(async (input) =>
      options.duplicate ? { ok: false, reason: 'DUPLICATE' } : { ok: true, record: rule({ id: 'rule-new', factor: input.factor, scope: input.scope }) },
    ),
    updateRule: jest.fn(async (_id: string, input) => rule({ ...(options.existing ?? rule()), ...input })),
  } as unknown as jest.Mocked<ProductMastersRepository>;
  const conversions = { tonnageUnit: jest.fn().mockResolvedValue(TON) };
  const catalogReferences = {
    check: jest.fn(async () =>
      options.projectTypeOk === false
        ? { ok: false, issue: { field: 'projectTypeId', reason: 'INACTIVE', catalogKey: 'crm.tipo_proyecto', code: 'X', message: 'x' } }
        : { ok: true, item: { id: 'type-1' } },
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new UnitConversionRulesService(
    repository,
    conversions as unknown as UnitConversionResolver,
    catalogReferences as unknown as CatalogReferenceValidator,
    audit as unknown as AuditService,
  );
  return { service, repository, audit, catalogReferences };
}

describe('UnitConversionRulesService (07 F.7, RN-07.36)', () => {
  it('alta GLOBAL: destino = tonelaje por defecto, factor normalizado, scopeKey GLOBAL y auditoría', async () => {
    const { service, repository, audit } = setup();
    await service.create({ fromUnitId: 'kg', factor: '0.001', scope: 'GLOBAL' }, ACTOR);
    expect(repository.createRule).toHaveBeenCalledWith(
      {
        fromUnitId: 'kg',
        toUnitId: 'ton',
        factor: '0.00100000',
        scope: 'GLOBAL',
        productId: null,
        productFamilyId: null,
        projectTypeId: null,
        scopeKey: 'GLOBAL',
        description: null,
      },
      'user-1',
    );
    expect(audit.record).toHaveBeenCalledWith('crm.unit_conversion_rule.created', AUDIT, expect.objectContaining({ resourceType: 'crm.unit_conversion_rule' }));
  });

  it('alta PRODUCT: scopeKey = id del producto', async () => {
    const { service, repository } = setup();
    await service.create({ fromUnitId: 'kg', factor: '0.002', scope: 'PRODUCT', productId: 'prod-1' }, ACTOR);
    expect(repository.createRule).toHaveBeenCalledWith(expect.objectContaining({ scope: 'PRODUCT', productId: 'prod-1', scopeKey: 'prod-1' }), 'user-1');
  });

  it('destino distinto de la unidad de tonelaje → 422 INVALID_CONVERSION_TARGET', async () => {
    await expect(setup().service.create({ fromUnitId: 'kg', toUnitId: 'kg', factor: '1', scope: 'GLOBAL' }, ACTOR)).rejects.toMatchObject({
      code: 'INVALID_CONVERSION_TARGET',
    });
  });

  it('ámbito incoherente → 422 INVALID_CONVERSION_SCOPE', async () => {
    await expect(setup().service.create({ fromUnitId: 'kg', factor: '1', scope: 'PRODUCT' }, ACTOR)).rejects.toMatchObject({
      code: 'INVALID_CONVERSION_SCOPE',
      details: [{ field: 'productId', issue: 'required' }],
    });
    await expect(setup().service.create({ fromUnitId: 'kg', factor: '1', scope: 'GLOBAL', productFamilyId: 'fam-1' }, ACTOR)).rejects.toMatchObject({
      code: 'INVALID_CONVERSION_SCOPE',
      details: [{ field: 'productFamilyId', issue: 'not_allowed' }],
    });
  });

  it.each([
    ['origen inexistente', { fromUnitId: 'nope' }, 'fromUnitId', 'not_found'],
    ['origen inactivo', { fromUnitId: 'old' }, 'fromUnitId', 'inactive'],
    ['producto inexistente', { scope: 'PRODUCT' as const, productId: 'nope' }, 'productId', 'not_found'],
    ['familia inactiva', { scope: 'PRODUCT_FAMILY' as const, productFamilyId: 'fam-1' }, 'productFamilyId', 'inactive'],
  ])('%s → 422 UNKNOWN_REFERENCE', async (_label, override, field, issue) => {
    await expect(setup().service.create({ fromUnitId: 'kg', factor: '1', scope: 'GLOBAL', ...override }, ACTOR)).rejects.toMatchObject({
      code: 'UNKNOWN_REFERENCE',
      details: [{ field, issue }],
    });
  });

  it('tipo de proyecto inactivo (crm.tipo_proyecto) → 422 UNKNOWN_REFERENCE', async () => {
    const { service, catalogReferences } = setup({ projectTypeOk: false });
    await expect(service.create({ fromUnitId: 'kg', factor: '1', scope: 'PROJECT_TYPE', projectTypeId: 'type-1' }, ACTOR)).rejects.toMatchObject({
      details: [{ field: 'projectTypeId', issue: 'inactive' }],
    });
    expect(catalogReferences.check).toHaveBeenCalledWith('crm.tipo_proyecto', 'type-1', { field: 'projectTypeId' });
  });

  it('identidad con factor ≠ 1 → 409 CONVERSION_RULE_PROTECTED; duplicada → 409 RESOURCE_CONFLICT', async () => {
    await expect(setup().service.create({ fromUnitId: 'ton', factor: '2', scope: 'GLOBAL' }, ACTOR)).rejects.toMatchObject({
      code: 'CONVERSION_RULE_PROTECTED',
      details: [{ reason: 'identity_factor' }],
    });
    await expect(setup({ duplicate: true }).service.create({ fromUnitId: 'kg', factor: '1', scope: 'GLOBAL' }, ACTOR)).rejects.toMatchObject({
      code: 'RESOURCE_CONFLICT',
      details: [{ field: 'fromUnitId' }, { field: 'toUnitId' }, { field: 'scope' }],
    });
  });

  it('edición: cambia el factor y audita; sin cambios no escribe', async () => {
    const { service, repository, audit } = setup();
    await service.update('rule-1', { factor: '0.001' }, ACTOR);
    expect(repository.updateRule).not.toHaveBeenCalled();
    await service.update('rule-1', { factor: '0.0011' }, ACTOR);
    expect(repository.updateRule).toHaveBeenCalledWith('rule-1', { factor: '0.00110000' }, 'user-1');
    expect(audit.record).toHaveBeenCalledWith('crm.unit_conversion_rule.updated', AUDIT, expect.objectContaining({
      before: expect.objectContaining({ factor: '0.00100000' }),
      after: expect.objectContaining({ factor: '0.00110000' }),
    }));
  });

  it('identidad TON→TON: no cambia de factor ni se desactiva; sí admite descripción', async () => {
    const { service, repository } = setup({ existing: IDENTITY });
    await expect(service.update('identity', { factor: '2' }, ACTOR)).rejects.toMatchObject({ code: 'CONVERSION_RULE_PROTECTED', details: [{ reason: 'identity_factor' }] });
    await expect(service.update('identity', { isActive: false }, ACTOR)).rejects.toMatchObject({ code: 'CONVERSION_RULE_PROTECTED', details: [{ reason: 'tonnage_identity' }] });
    await service.update('identity', { description: 'Identidad' }, ACTOR);
    expect(repository.updateRule).toHaveBeenCalledWith('identity', { description: 'Identidad' }, 'user-1');
  });

  it('desactivar una regla normal se permite; inexistente → 404', async () => {
    const { service, repository } = setup();
    await service.update('rule-1', { isActive: false }, ACTOR);
    expect(repository.updateRule).toHaveBeenCalledWith('rule-1', { isActive: false }, 'user-1');
    await expect(setup({ existing: null }).service.findById('nope')).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  describe('reactivar o cambiar el factor revalida destino y origen (M-2)', () => {
    const LB = { id: 'lb', code: 'LB', symbol: 'lb', dimension: 'MASS' } as const;
    const OLD = { id: 'old', code: 'OLD', symbol: 'o', dimension: 'MASS' } as const;

    it.each([
      ['reactivar', { isActive: true }],
      ['cambiar el factor', { factor: '0.002' }],
    ])('%s con un destino que ya no es la unidad de tonelaje → 422 INVALID_CONVERSION_TARGET, sin escribir', async (_label, input) => {
      const { service, repository, audit } = setup({ existing: rule({ toUnit: LB, isActive: false }) });
      await expect(service.update('rule-1', input, ACTOR)).rejects.toMatchObject({ code: 'INVALID_CONVERSION_TARGET' });
      expect(repository.updateRule).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it.each([
      ['reactivar', { isActive: true }],
      ['cambiar el factor', { factor: '0.002' }],
    ])('%s con el origen inactivo → 422 UNKNOWN_REFERENCE (inactive), sin escribir', async (_label, input) => {
      const { service, repository } = setup({ existing: rule({ fromUnit: OLD, isActive: false }) });
      await expect(service.update('rule-1', input, ACTOR)).rejects.toMatchObject({
        code: 'UNKNOWN_REFERENCE',
        details: [expect.objectContaining({ field: 'fromUnitId', issue: 'inactive' })],
      });
      expect(repository.updateRule).not.toHaveBeenCalled();
    });

    it('reactivar una regla válida se permite; desactivar o cambiar la descripción no revalidan', async () => {
      const { service, repository } = setup({ existing: rule({ isActive: false }) });
      await service.update('rule-1', { isActive: true }, ACTOR);
      expect(repository.updateRule).toHaveBeenCalledWith('rule-1', { isActive: true }, 'user-1');

      const stale = setup({ existing: rule({ toUnit: LB, fromUnit: OLD }) });
      await stale.service.update('rule-1', { description: 'Histórica' }, ACTOR);
      await stale.service.update('rule-1', { isActive: false }, ACTOR);
      expect(stale.repository.updateRule).toHaveBeenCalledTimes(2);
      expect(stale.repository.findUnit).not.toHaveBeenCalled();
    });
  });
});
