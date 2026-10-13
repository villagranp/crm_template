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
import { PermissionDeniedError } from '@/common/errors/application-error';

import { fakeTransactions, makeActor, makeProject, makeScopes, poolOnly, TX } from './testing/project-fixtures';

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
const TON = { id: 'ton', code: 'TON', symbol: 't' };
const NOW = new Date('2026-12-15T18:00:00.000Z');
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
  const transactions = fakeTransactions();
  const repository = {
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
  const conversions = {
    resolve: jest.fn().mockResolvedValue(RULE),
    tonnageFor: jest.fn().mockReturnValue('0.0333'),
    // La unidad de tonelaje se lee por el pool: solo antes de la transacción (Revisión E5, M1).
    tonnageUnit: jest.fn(poolOnly(transactions, 'tonnageUnit', () => Promise.resolve(TON))),
  };
  const access = {
    findVisible: jest.fn().mockResolvedValue(visible),
    findEditable: jest.fn().mockResolvedValue(visible),
    // Bloquea el proyecto y decide sobre el registro bloqueado (Revisión E5, M4).
    lockEditable: jest.fn(async (_actor: unknown, projectId: string, _scopes: unknown, tx: unknown) => {
      if (!transactions.active || tx !== TX) throw new Error('lockEditable outside the transaction');
      await projects.lockProject(projectId, 'UPDATE', tx);
      return visible;
    }),
  };
  const catalogs = {
    activeItems: jest.fn().mockResolvedValue([
      { id: 'status-cotizado', code: 'COTIZADO', sortOrder: 2 },
      { id: 'status-propuesto', code: 'PROPUESTO', sortOrder: 1 },
    ]),
  };
  const parameters = {
    get: jest.fn(poolOnly(transactions, 'parameters.get', (key: string) => Promise.resolve(key === 'crm.forecast.horizonte_meses' ? 6 : 'America/Guatemala'))),
  };
  const service = new ProjectProductsService(
    repository as unknown as ProjectProductsRepository,
    projects as unknown as ProjectsRepository,
    transactions,
    access as unknown as ProjectAccessService,
    { assertItem: jest.fn().mockResolvedValue({}) } as unknown as CatalogReferenceValidator,
    catalogs as unknown as ProjectCatalogsService,
    products as unknown as ProductsService,
    conversions as unknown as UnitConversionResolver,
    parameters as unknown as ParameterReader,
    { record: jest.fn() } as unknown as AuditService,
    { info: jest.fn() } as unknown as AppLogger,
    { now: () => NOW },
  );
  return { service, repository, projects, products, conversions, access };
}

describe('ProjectProductsService (F-19)', () => {
  it('asociar: regla por precedencia de línea con el tipo del proyecto bloqueado (en la tx, unidad de tonelaje leída antes), unicidad bajo el bloqueo del proyecto y lastActivityAt en la misma transacción', async () => {
    const { service, repository, projects, conversions } = setup();
    await service.create(makeActor(EDITOR), 'project-1', { productId: 'product-1', quantity: '10' });
    expect(conversions.tonnageUnit).toHaveBeenCalledTimes(1);
    expect(conversions.resolve).toHaveBeenCalledWith({ fromUnitId: 'unit-var', productId: 'product-1', projectTypeId: 'type-1' }, TX, TON);
    expect(projects.lockProject).toHaveBeenCalledWith('project-1', 'UPDATE', TX);
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

  it('editar: escribe solo las columnas que cambian, recalculadas con la regla vigente; el duplicado solo se busca si cambia la oportunidad', async () => {
    const { service, repository } = setup();
    await service.update(makeActor(EDITOR), 'project-1', 'pp-1', { quantity: '20' });
    expect(repository.findActiveDuplicate).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith(
      'project-1',
      'pp-1',
      { quantity: '20.0000', conversionRuleId: 'rule-1', conversionFactor: '0.00333333', tonnage: '0.0333' },
      'user-1',
      TX,
    );
    await service.update(makeActor(EDITOR), 'project-1', 'pp-1', { opportunityId: 'OPP-1' });
    expect(repository.findActiveDuplicate).toHaveBeenCalledWith({ projectId: 'project-1', opportunityId: 'opp-1', productId: 'product-1', excludeId: 'pp-1' }, TX);
  });

  it('editar: la petición se combina con el estado leído bajo el bloqueo, no con la lectura previa (Revisión E5, M3)', async () => {
    const { service, repository, conversions } = setup();
    conversions.resolve.mockResolvedValue(null);
    const fresh = { ...LINE, quantity: '50.0000', notes: 'de otra petición' };
    repository.findById.mockImplementation(async (_projectId: string, _id: string, tx?: unknown) => (tx === TX ? fresh : LINE));
    await service.update(makeActor(EDITOR), 'project-1', 'pp-1', { notes: 'mía' });
    // La cantidad concurrente (50) sobrevive: solo se escribe `notes`.
    expect(repository.update).toHaveBeenCalledWith('project-1', 'pp-1', { notes: 'mía' }, 'user-1', TX);
  });

  it('editar: quitada por otra petición mientras se esperaba el bloqueo → 404 sin escribir (nunca 500)', async () => {
    const { service, repository, projects } = setup();
    repository.findById.mockImplementation(async (_projectId: string, _id: string, tx?: unknown) => (tx === TX ? null : LINE));
    await expect(service.update(makeActor(EDITOR), 'project-1', 'pp-1', { quantity: '2' })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect(repository.update).not.toHaveBeenCalled();
    expect(projects.touchLastActivity).not.toHaveBeenCalled();
  });

  it('editar sin cambios efectivos (mismos valores y misma regla) no escribe ni toca el proyecto', async () => {
    const { service, repository, projects, conversions } = setup();
    conversions.resolve.mockResolvedValue(null);
    await expect(service.update(makeActor(EDITOR), 'project-1', 'pp-1', { quantity: '10', notes: null })).resolves.toEqual(LINE);
    expect(repository.update).not.toHaveBeenCalled();
    expect(projects.touchLastActivity).not.toHaveBeenCalled();
  });

  it('asociar, editar y quitar: el 403 de la política sobre el proyecto bloqueado gana a la lectura previa (Revisión E5, M4)', async () => {
    const { service, repository, access } = setup();
    access.lockEditable.mockRejectedValue(new PermissionDeniedError('proyectos.administrar'));
    await expect(service.create(makeActor(EDITOR), 'project-1', { productId: 'product-1', quantity: '1' })).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(service.update(makeActor(EDITOR), 'project-1', 'pp-1', { quantity: '2' })).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(service.remove(makeActor(EDITOR), 'project-1', 'pp-1')).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.softDelete).not.toHaveBeenCalled();
  });

  it('quitar: con forecast en la ventana y sin otra asociación → 409 PRODUCT_HAS_FORECAST; con otra asociación activa, se quita', async () => {
    const { service, repository, projects } = setup();
    repository.forecastPeriodsWithQuantity.mockResolvedValue([{ year: 2027, month: 1 }]);
    await expect(service.remove(makeActor(EDITOR), 'project-1', 'pp-1')).rejects.toMatchObject({
      code: 'PRODUCT_HAS_FORECAST',
      details: [{ productId: 'product-1', periods: ['2027-01'] }],
    });
    expect(projects.lockProject).toHaveBeenCalledWith('project-1', 'UPDATE', TX);
    // Ventana del reloj del negocio inyectado (Revisión E5, m2): 2026-12 → 2027-01 … 2027-06.
    expect(repository.forecastPeriodsWithQuantity.mock.calls[0]?.[2]).toEqual([
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
      { year: 2027, month: 3 },
      { year: 2027, month: 4 },
      { year: 2027, month: 5 },
      { year: 2027, month: 6 },
    ]);
    expect(repository.softDelete).not.toHaveBeenCalled();

    repository.countOtherActive.mockResolvedValue(1);
    await service.remove(makeActor(EDITOR), 'project-1', 'pp-1');
    expect(repository.softDelete).toHaveBeenCalledWith('project-1', 'pp-1', 'user-1', TX);
  });
});
