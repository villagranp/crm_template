import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AuditService } from '@/modules/audit/audit.service';
import type { CatalogReferenceValidator } from '@/modules/catalogs/catalog-reference.validator';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';
import type { ProductsService } from '@/modules/products/products.service';
import type { UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

import type { ProjectAccessService } from './project-access.service';
import { toVisibleProject } from './project-access.service';
import type { ProjectCatalogsService } from './project-catalogs.service';
import { ProjectProductsService } from './project-products.service';
import type { ProjectProductRecord, ProjectProductsRepository } from './ports/project-products.repository.port';
import type { ProjectsRepository } from './ports/projects.repository.port';
import { fakeTransactions, makeActor, makeProject, makeScopes, TX } from './testing/project-fixtures';

const EDITOR = ['proyectos.ver', 'proyectos.editar'];
const PRODUCT = {
  id: 'product-1',
  sku: 'VAR-3',
  description: 'Varilla',
  family: { id: 'fam', code: 'F', name: 'F' },
  baseUnit: { id: 'unit-var', code: 'VAR', symbol: 'var', dimension: 'COUNT' as const },
  isActive: true,
};
const RULE = { ruleId: 'rule-1', scope: 'PRODUCT' as const, factor: '0.00333333', fromUnitId: 'unit-var', toUnit: { id: 'ton', code: 'TON', symbol: 't' } };
const LINE: ProjectProductRecord = {
  id: 'pp-1',
  projectId: 'project-1',
  product: { id: 'product-1', sku: 'VAR-3', description: 'Varilla', family: { id: 'fam', code: 'F', name: 'F' }, isActive: true },
  opportunity: null,
  quantity: '10.0000',
  unit: { id: 'unit-var', code: 'VAR', symbol: 'var', dimension: 'COUNT', isActive: true },
  conversion: null,
  tonnage: null,
  status: { id: 'status-propuesto', code: 'PROPUESTO', label: 'Propuesto', isActive: true, countsInTotals: true },
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  updatedBy: null,
};

function setup() {
  const visible = toVisibleProject(makeProject({ projectType: { id: 'type-1', code: 'VIVIENDA', label: 'Vivienda', isActive: true } }), makeScopes());
  const repository = {
    lockAssociationKey: jest.fn().mockResolvedValue(undefined),
    findActiveDuplicate: jest.fn().mockResolvedValue(null),
    opportunityBelongsToProject: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue('pp-1'),
    update: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(LINE),
    countOtherActive: jest.fn().mockResolvedValue(0),
    forecastPeriodsWithQuantity: jest.fn().mockResolvedValue([]),
  };
  const projects = { lockProject: jest.fn().mockResolvedValue(true), touchLastActivity: jest.fn().mockResolvedValue(undefined) };
  const products = { findProduct: jest.fn().mockResolvedValue(PRODUCT), findUnit: jest.fn().mockResolvedValue({ id: 'unit-var', isActive: true }) };
  const conversions = { resolve: jest.fn().mockResolvedValue(RULE), tonnageFor: jest.fn().mockReturnValue('0.0333') };
  const catalogs = {
    activeItems: jest.fn().mockResolvedValue([
      { id: 'status-cotizado', code: 'COTIZADO', sortOrder: 2 },
      { id: 'status-propuesto', code: 'PROPUESTO', sortOrder: 1 },
    ]),
  };
  const parameters = { get: jest.fn((key: string) => Promise.resolve(key === 'crm.forecast.horizonte_meses' ? 6 : 'America/Guatemala')) };
  const service = new ProjectProductsService(
    repository as unknown as ProjectProductsRepository,
    projects as unknown as ProjectsRepository,
    fakeTransactions(),
    { findVisible: jest.fn().mockResolvedValue(visible), findEditable: jest.fn().mockResolvedValue(visible) } as unknown as ProjectAccessService,
    { assertItem: jest.fn().mockResolvedValue({}) } as unknown as CatalogReferenceValidator,
    catalogs as unknown as ProjectCatalogsService,
    products as unknown as ProductsService,
    conversions as unknown as UnitConversionResolver,
    parameters as unknown as ParameterReader,
    { record: jest.fn() } as unknown as AuditService,
    { info: jest.fn() } as unknown as AppLogger,
  );
  return { service, repository, projects, products, conversions };
}

describe('ProjectProductsService (F-19)', () => {
  it('asociar: regla por precedencia de línea con el tipo del proyecto, unicidad bajo bloqueo consultivo y lastActivityAt en la misma transacción', async () => {
    const { service, repository, projects, conversions } = setup();
    await service.create(makeActor(EDITOR), 'project-1', { productId: 'product-1', quantity: '10' });
    expect(conversions.resolve).toHaveBeenCalledWith({ fromUnitId: 'unit-var', productId: 'product-1', projectTypeId: 'type-1' });
    expect(projects.lockProject).toHaveBeenCalledWith('project-1', 'UPDATE', TX);
    expect(repository.lockAssociationKey).toHaveBeenCalledWith('project-1', null, 'product-1', TX);
    expect(repository.findActiveDuplicate).toHaveBeenCalledWith({ projectId: 'project-1', opportunityId: null, productId: 'product-1', excludeId: null }, TX);
    expect(repository.create).toHaveBeenCalledWith(
      {
        projectId: 'project-1',
        productId: 'product-1',
        opportunityId: null,
        quantity: '10.0000',
        unitId: 'unit-var',
        conversionRuleId: 'rule-1',
        conversionFactor: '0.00333333',
        tonnage: '0.0333',
        statusId: 'status-propuesto',
        notes: null,
        createdById: 'user-1',
      },
      TX,
    );
    expect(projects.touchLastActivity).toHaveBeenCalledWith(['project-1'], expect.any(Date), TX);
  });

  it('sin regla: sin tonelaje ni foto (DM-24)', async () => {
    const { service, repository, conversions } = setup();
    conversions.resolve.mockResolvedValue(null);
    await service.create(makeActor(EDITOR), 'project-1', { productId: 'product-1', quantity: '1' });
    expect(repository.create.mock.calls[0]?.[0]).toMatchObject({ conversionRuleId: null, conversionFactor: null, tonnage: null });
  });

  it('errores: producto inactivo, cantidad negativa, oportunidad ajena, duplicado activo', async () => {
    const { service, repository, products } = setup();
    await expect(service.create(makeActor(EDITOR), 'project-1', { productId: 'product-1', quantity: '-1' })).rejects.toMatchObject({ code: 'INVALID_QUANTITY' });
    products.findProduct.mockResolvedValueOnce({ ...PRODUCT, isActive: false });
    await expect(service.create(makeActor(EDITOR), 'project-1', { productId: 'product-1', quantity: '1' })).rejects.toMatchObject({ code: 'PRODUCT_INACTIVE' });
    repository.opportunityBelongsToProject.mockResolvedValueOnce(false);
    await expect(service.create(makeActor(EDITOR), 'project-1', { productId: 'product-1', quantity: '1', opportunityId: 'opp-x' })).rejects.toMatchObject({
      code: 'OPPORTUNITY_NOT_IN_PROJECT',
      details: [{ field: 'opportunityId' }],
    });
    repository.findActiveDuplicate.mockResolvedValueOnce({ id: 'pp-9', productId: 'product-1', opportunityId: null });
    await expect(service.create(makeActor(EDITOR), 'project-1', { productId: 'product-1', quantity: '1' })).rejects.toMatchObject({
      code: 'PROJECT_PRODUCT_DUPLICATE',
      details: [{ field: 'productId', projectProductId: 'pp-9', productId: 'product-1', opportunityId: null }],
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('editar: solo bloquea la clave si cambia la oportunidad; recalcula con la regla vigente', async () => {
    const { service, repository } = setup();
    await service.update(makeActor(EDITOR), 'project-1', 'pp-1', { quantity: '20' });
    expect(repository.lockAssociationKey).not.toHaveBeenCalled();
    expect(repository.update.mock.calls[0]?.[2]).toMatchObject({ quantity: '20.0000', conversionRuleId: 'rule-1', statusId: 'status-propuesto' });
    await service.update(makeActor(EDITOR), 'project-1', 'pp-1', { opportunityId: 'opp-1' });
    expect(repository.lockAssociationKey).toHaveBeenCalledWith('project-1', 'opp-1', 'product-1', TX);
  });

  it('quitar: con forecast en la ventana y sin otra asociación → 409 PRODUCT_HAS_FORECAST; con otra asociación activa, se quita', async () => {
    const { service, repository, projects } = setup();
    repository.forecastPeriodsWithQuantity.mockResolvedValue([{ year: 2027, month: 1 }]);
    await expect(service.remove(makeActor(EDITOR), 'project-1', 'pp-1')).rejects.toMatchObject({
      code: 'PRODUCT_HAS_FORECAST',
      details: [{ productId: 'product-1', periods: ['2027-01'] }],
    });
    expect(projects.lockProject).toHaveBeenCalledWith('project-1', 'UPDATE', TX);
    expect(repository.forecastPeriodsWithQuantity.mock.calls[0]?.[2]).toHaveLength(6);
    expect(repository.softDelete).not.toHaveBeenCalled();

    repository.countOtherActive.mockResolvedValue(1);
    await service.remove(makeActor(EDITOR), 'project-1', 'pp-1');
    expect(repository.softDelete).toHaveBeenCalledWith('project-1', 'pp-1', 'user-1', TX);
  });
});
