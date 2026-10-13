import { RequestValidationError } from '@/common/errors/application-error';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AuditService } from '@/modules/audit/audit.service';
import type { CatalogReferenceValidator } from '@/modules/catalogs/catalog-reference.validator';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';
import type { ProductsService } from '@/modules/products/products.service';
import { conversionRuleNotFoundError } from '@/modules/unit-conversions/unit-conversion-errors';
import type { UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

import type { ProjectAccessService } from './project-access.service';
import { toVisibleProject } from './project-access.service';
import { ProjectClassificationService, quantityIssue, tonnageModeOf } from './project-classification.service';
import type { ProjectsRepository } from './ports/projects.repository.port';
import { fakeLockEditable, fakeTransactions, makeActor, makeProject, makeScopes, TX } from './testing/project-fixtures';

const EDITOR = ['proyectos.ver', 'proyectos.editar'];
const RULE = { ruleId: 'rule-1', scope: 'PROJECT_TYPE' as const, factor: '0.03500000', fromUnitId: 'unit-m2', toUnit: { id: 'unit-ton', code: 'TON', symbol: 't' } };

function setup(parameters: Record<string, unknown> = {}) {
  const visible = toVisibleProject(makeProject(), makeScopes());
  const repository = {
    lockProject: jest.fn().mockResolvedValue(true),
    updateClassification: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(visible.record),
  };
  const catalog = { assertItem: jest.fn().mockResolvedValue({}) };
  const products = { findUnit: jest.fn().mockResolvedValue({ id: 'unit-m2', isActive: true }) };
  const conversions = {
    require: jest.fn().mockResolvedValue(RULE),
    tonnageFor: jest.fn((quantity: string, rule: { factor: string }) => (quantity === '1200.0000' && rule.factor === RULE.factor ? '42.0000' : 'x')),
  };
  const reader = { get: jest.fn().mockResolvedValue(parameters) };
  const service = new ProjectClassificationService(
    repository as unknown as ProjectsRepository,
    fakeTransactions(),
    { findEditable: jest.fn().mockResolvedValue(visible), lockEditable: fakeLockEditable(repository) } as unknown as ProjectAccessService,
    catalog as unknown as CatalogReferenceValidator,
    products as unknown as ProductsService,
    conversions as unknown as UnitConversionResolver,
    reader as unknown as ParameterReader,
    { record: jest.fn() } as unknown as AuditService,
    { info: jest.fn() } as unknown as AppLogger,
  );
  return { service, repository, catalog, products, conversions };
}

describe('ProjectClassificationService (F-15)', () => {
  it('RULE: resuelve la regla (PROJECT_TYPE > GLOBAL) y guarda la foto con el tonelaje calculado dentro de la transacción', async () => {
    const { service, repository, catalog, conversions } = setup();
    await service.update(makeActor(EDITOR), 'project-1', {
      projectTypeId: 'type-vivienda',
      measureUnitId: 'unit-m2',
      estimatedQuantity: '1200',
      tonnageMode: 'RULE',
    });
    expect(conversions.require).toHaveBeenCalledWith({ fromUnitId: 'unit-m2', projectTypeId: 'type-vivienda' }, { field: 'measureUnitId' });
    expect(catalog.assertItem).toHaveBeenCalledWith('crm.tipo_proyecto', 'type-vivienda', {
      field: 'projectTypeId',
      requireActive: true,
      currentId: null,
      tx: TX,
    });
    expect(repository.updateClassification).toHaveBeenCalledWith(
      'project-1',
      {
        projectTypeId: 'type-vivienda',
        sectorId: null,
        measureUnitId: 'unit-m2',
        estimatedQuantity: '1200.0000',
        conversionRuleId: 'rule-1',
        conversionFactor: '0.03500000',
        estimatedTonnage: '42.0000',
      },
      'user-1',
      expect.any(Date),
      TX,
    );
  });

  it('el error de regla se lanza tras validar catálogos (orden de incidencias) y no escribe', async () => {
    const { service, repository, catalog, conversions } = setup();
    conversions.require.mockRejectedValue(conversionRuleNotFoundError('measureUnitId', { fromUnitId: 'unit-m2', toUnitCode: 'TON' }));
    catalog.assertItem.mockRejectedValueOnce(Object.assign(new Error('catalog'), { code: 'INVALID_CATALOG_VALUE' }));
    await expect(
      service.update(makeActor(EDITOR), 'project-1', { projectTypeId: 'x', measureUnitId: 'unit-m2', estimatedQuantity: '1', tonnageMode: 'RULE' }),
    ).rejects.toMatchObject({ code: 'INVALID_CATALOG_VALUE' });
    await expect(
      service.update(makeActor(EDITOR), 'project-1', { measureUnitId: 'unit-m2', estimatedQuantity: '1', tonnageMode: 'RULE' }),
    ).rejects.toMatchObject({ code: 'CONVERSION_RULE_NOT_FOUND' });
    expect(repository.updateClassification).not.toHaveBeenCalled();
  });

  it('MANUAL guarda el tonelaje sin regla; NONE sin tonelaje; manualTonnage fuera de MANUAL → 400', async () => {
    const { service, repository } = setup();
    await service.update(makeActor(EDITOR), 'project-1', { tonnageMode: 'MANUAL', manualTonnage: '50' });
    expect(repository.updateClassification.mock.calls[0]?.[1]).toMatchObject({ conversionRuleId: null, conversionFactor: null, estimatedTonnage: '50.0000' });
    await service.update(makeActor(EDITOR), 'project-1', { tonnageMode: 'NONE', estimatedQuantity: '5' });
    expect(repository.updateClassification.mock.calls[1]?.[1]).toMatchObject({ estimatedQuantity: '5.0000', estimatedTonnage: null });
    await expect(service.update(makeActor(EDITOR), 'project-1', { tonnageMode: 'NONE', manualTonnage: '1' })).rejects.toBeInstanceOf(RequestValidationError);
  });

  it('obligatorios: RULE sin unidad ni cantidad, MANUAL sin tonelaje, parámetro de obligatorios y negativos → 422 con todas las incidencias', async () => {
    const { service } = setup({ project: ['sectorId'] });
    await expect(service.update(makeActor(EDITOR), 'project-1', { tonnageMode: 'RULE' })).rejects.toMatchObject({
      code: 'REQUIRED_FIELD_MISSING',
      details: [{ field: 'sectorId' }, { field: 'measureUnitId', tonnageMode: 'RULE' }, { field: 'estimatedQuantity', tonnageMode: 'RULE' }],
    });
    await expect(service.update(makeActor(EDITOR), 'project-1', { sectorId: 's', tonnageMode: 'MANUAL', estimatedQuantity: '-1' })).rejects.toMatchObject({
      code: 'REQUIRED_FIELD_MISSING',
      details: [{ field: 'manualTonnage' }, { field: 'estimatedQuantity', code: 'INVALID_QUANTITY' }],
    });
  });

  it('unidad inexistente o desactivada (que cambia) → 422 UNKNOWN_REFERENCE', async () => {
    const { service, products } = setup();
    products.findUnit.mockResolvedValue({ id: 'unit-old', isActive: false });
    await expect(service.update(makeActor(EDITOR), 'project-1', { measureUnitId: 'unit-old', tonnageMode: 'NONE' })).rejects.toMatchObject({
      code: 'UNKNOWN_REFERENCE',
      details: [{ field: 'measureUnitId' }],
    });
  });

  it('tonnageModeOf y quantityIssue', () => {
    expect(tonnageModeOf({ conversion: RULE, estimatedTonnage: '1.0000' })).toBe('RULE');
    expect(tonnageModeOf({ conversion: null, estimatedTonnage: '1.0000' })).toBe('MANUAL');
    expect(tonnageModeOf({ conversion: null, estimatedTonnage: null })).toBe('NONE');
    expect(quantityIssue('0', 'quantity')).toBeNull();
    expect(quantityIssue('123456789012345.1234', 'quantity')).toBeNull();
    expect(quantityIssue('-0.0001', 'quantity')).toMatchObject({ field: 'quantity', code: 'INVALID_QUANTITY' });
    expect(quantityIssue('1.12345', 'quantity')).toMatchObject({ code: 'INVALID_QUANTITY' });
  });
});
