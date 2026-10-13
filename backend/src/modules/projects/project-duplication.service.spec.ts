import type { UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

import type { ProjectAccessService } from './project-access.service';
import { toVisibleProject } from './project-access.service';
import type { ProjectCreationService } from './project-creation.service';
import { ProjectDuplicationService } from './project-duplication.service';
import type { ProjectProductsService } from './project-products.service';
import type { ProjectsService } from './projects.service';
import type { ProjectProductsRepository } from './ports/project-products.repository.port';
import { makeActor, makeProject, makeScopes } from './testing/project-fixtures';

const CREATOR = ['proyectos.ver', 'proyectos.crear'];
const ADMIN = [...CREATOR, 'proyectos.administrar'];
const COPY_ALL = { location: true, description: true, classification: true, products: true };
const RULE = { ruleId: 'rule-1', scope: 'GLOBAL' as const, factor: '0.03500000', fromUnitId: 'unit-m2', toUnit: { id: 'ton', code: 'TON', symbol: 't' } };

function setup() {
  const source = makeProject({
    owner: { id: 'user-2', displayName: 'Otro' },
    projectType: { id: 'type-1', code: 'VIVIENDA', label: 'Vivienda', isActive: true },
    measureUnit: { id: 'unit-m2', code: 'M2', symbol: 'm2', dimension: 'AREA', isActive: true },
    estimatedQuantity: '1200.0000',
    conversion: { ruleId: 'old-rule', scope: 'GLOBAL', factor: '0.01000000', toUnit: { id: 'ton', code: 'TON' } },
    estimatedTonnage: '12.0000',
  });
  const created = makeProject({ id: 'project-new' });
  const creation = { create: jest.fn().mockResolvedValue(created) };
  const conversions = { resolve: jest.fn().mockResolvedValue(RULE), tonnageFor: jest.fn().mockReturnValue('42.0000') };
  const repository = {
    listDuplicable: jest.fn().mockResolvedValue([{ productId: 'product-1', productActive: true, unitId: 'unit-var', unitActive: true, quantity: '10.0000' }]),
  };
  const access = {
    findVisible: jest.fn().mockResolvedValue(toVisibleProject(source, makeScopes())),
    scopes: jest.fn().mockResolvedValue(makeScopes()),
    isAssignableOwner: jest.fn().mockResolvedValue(true),
  };
  const service = new ProjectDuplicationService(
    repository as unknown as ProjectProductsRepository,
    access as unknown as ProjectAccessService,
    creation as unknown as ProjectCreationService,
    { initialStatusId: jest.fn().mockResolvedValue('status-propuesto') } as unknown as ProjectProductsService,
    { toDetail: jest.fn().mockReturnValue({}) } as unknown as ProjectsService,
    conversions as unknown as UnitConversionResolver,
  );
  return { service, creation, conversions, repository, access };
}

describe('ProjectDuplicationService (F-12)', () => {
  it('sin ownerId: un administrador cuyo alcance de administrar no incluye al asesor del origen duplica a su nombre (Revisión E5)', async () => {
    const { service, creation, access } = setup();
    access.isAssignableOwner.mockResolvedValue(false);
    await service.duplicate(makeActor(ADMIN), 'project-1', { name: 'Copia', copy: COPY_ALL });
    expect(access.isAssignableOwner).toHaveBeenCalledWith(expect.anything(), 'user-2', makeScopes());
    expect(creation.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ownerId: 'user-1' }), expect.anything());
  });

  it('ownerId en mayúsculas se normaliza; indicarse a sí mismo no exige administrar (Revisión E5, m1)', async () => {
    const { service, creation } = setup();
    await service.duplicate(makeActor(CREATOR), 'project-1', { name: 'Copia', copy: COPY_ALL, ownerId: 'USER-1' });
    expect(creation.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ownerId: 'user-1' }), expect.anything());
  });

  it('recalcula el tonelaje con la regla vigente y copia productos sin oportunidad con el estado inicial; evento `duplicated`', async () => {
    const { service, creation, conversions } = setup();
    await service.duplicate(makeActor(ADMIN), 'project-1', { name: 'Copia', copy: COPY_ALL });
    expect(conversions.resolve).toHaveBeenCalledWith({ fromUnitId: 'unit-m2', projectTypeId: 'type-1' });
    expect(conversions.resolve).toHaveBeenCalledWith({ fromUnitId: 'unit-var', productId: 'product-1', projectTypeId: 'type-1' });
    expect(creation.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Copia',
        ownerId: 'user-2',
        code: null,
        classification: {
          projectTypeId: 'type-1',
          sectorId: null,
          measureUnitId: 'unit-m2',
          estimatedQuantity: '1200.0000',
          conversionRuleId: 'rule-1',
          conversionFactor: '0.03500000',
          estimatedTonnage: '42.0000',
        },
        products: [
          {
            productId: 'product-1',
            opportunityId: null,
            quantity: '10.0000',
            unitId: 'unit-var',
            conversionRuleId: 'rule-1',
            conversionFactor: '0.03500000',
            tonnage: '42.0000',
            statusId: 'status-propuesto',
            notes: null,
          },
        ],
      }),
      { event: 'crm.project.duplicated', duplicatedFromId: 'project-1' },
    );
  });

  it('sin regla vigente la clasificación queda sin estimación; sin la casilla no lee productos', async () => {
    const { service, creation, conversions, repository } = setup();
    conversions.resolve.mockResolvedValue(null);
    await service.duplicate(makeActor(ADMIN), 'project-1', { name: 'Copia', copy: { ...COPY_ALL, products: false } });
    expect(repository.listDuplicable).not.toHaveBeenCalled();
    expect(creation.create.mock.calls[0]?.[1]).toMatchObject({
      classification: { conversionRuleId: null, conversionFactor: null, estimatedTonnage: null },
      products: [],
    });
  });

  it('asesor: sin administrar el asesor por defecto es él mismo; otro asesor o código → 403 FIELD_NOT_EDITABLE', async () => {
    const { service, creation } = setup();
    await service.duplicate(makeActor(CREATOR), 'project-1', { name: 'Copia', copy: COPY_ALL });
    expect(creation.create.mock.calls[0]?.[1]).toMatchObject({ ownerId: 'user-1' });
    await expect(service.duplicate(makeActor(CREATOR), 'project-1', { name: 'Copia', ownerId: 'user-2', code: 'X', copy: COPY_ALL })).rejects.toMatchObject({
      code: 'FIELD_NOT_EDITABLE',
      details: [{ field: 'ownerId' }, { field: 'code' }],
    });
  });
});
