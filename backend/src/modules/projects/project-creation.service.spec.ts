import type { SequenceGenerator } from '@/infrastructure/database/ports/sequence-generator.port';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AuditService } from '@/modules/audit/audit.service';
import type { CatalogReferenceValidator } from '@/modules/catalogs/catalog-reference.validator';
import type { CustomerAccessScopes } from '@/modules/customers/customer-actor.resolver';
import type { CustomerReferenceGuard } from '@/modules/customers/customer-reference.guard';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import type { ProjectAccessService } from './project-access.service';
import type { ProjectCatalogsService } from './project-catalogs.service';
import { type NewProjectDraft, ProjectCreationService } from './project-creation.service';
import type { ProjectProductsRepository } from './ports/project-products.repository.port';
import type { ProjectsRepository } from './ports/projects.repository.port';
import { fakeTransactions, makeActor, makeProject, makeScopes, PHASES, poolOnly, TX } from './testing/project-fixtures';

const CUSTOMER_SCOPES = { marker: 'customer-scopes' } as unknown as CustomerAccessScopes;
const DRAFT: NewProjectDraft = {
  name: 'Torre Norte',
  customerId: 'customer-1',
  countryId: null,
  city: null,
  address: null,
  description: null,
  estimatedStartDate: null,
  estimatedEndDate: null,
  estimatedDecisionDate: null,
  ownerId: 'user-1',
  code: null,
  classification: null,
  products: [],
};

function setup() {
  const transactions = fakeTransactions();
  const projects = {
    findCountry: jest.fn().mockResolvedValue({ id: 'country-gt', isActive: true }),
    findEligibleOwner: jest.fn().mockResolvedValue('user-2'),
    codeExists: jest.fn().mockResolvedValue(false),
    create: jest.fn().mockResolvedValue('project-1'),
    findById: jest.fn().mockResolvedValue(makeProject()),
  };
  // Todo lo que va por el pool falla si se llama con la transacción abierta (Revisión E5, M1).
  const access = {
    scopes: jest.fn(poolOnly(transactions, 'access.scopes', () => Promise.resolve(makeScopes()))),
    assignableOwners: jest.fn().mockReturnValue({ kind: 'FILTERED', userIds: ['user-1'], countryIds: [] }),
  };
  const guard = {
    accessScopes: jest.fn(poolOnly(transactions, 'guard.accessScopes', () => Promise.resolve(CUSTOMER_SCOPES))),
    assertUsableCustomer: jest.fn().mockResolvedValue({ id: 'customer-1', countryId: 'country-gt' }),
  };
  const params: Record<string, unknown> = {
    'crm.campos_obligatorios': {},
    'crm.zona_horaria_negocio': 'America/Guatemala',
    'crm.valores_por_defecto': { 'project.phaseId': 'DISENO' },
  };
  const parameters = { get: jest.fn(poolOnly(transactions, 'parameters.get', (key: string) => Promise.resolve(params[key]))) };
  const catalogs = {
    phaseAndStageSemantics: jest.fn(
      poolOnly(transactions, 'catalogs.phaseAndStageSemantics', () =>
        Promise.resolve({ phases: [{ ...PHASES.diseno, isActive: true, metadata: { order: 1 } }] }),
      ),
    ),
  };
  const sequences = { next: jest.fn().mockResolvedValue('PRY-2026-00001') };
  const service = new ProjectCreationService(
    projects as unknown as ProjectsRepository,
    { create: jest.fn() } as unknown as ProjectProductsRepository,
    transactions,
    sequences as unknown as SequenceGenerator,
    access as unknown as ProjectAccessService,
    guard as unknown as CustomerReferenceGuard,
    { assertItem: jest.fn().mockResolvedValue({}) } as unknown as CatalogReferenceValidator,
    catalogs as unknown as ProjectCatalogsService,
    parameters as unknown as ParameterReader,
    { record: jest.fn() } as unknown as AuditService,
    { info: jest.fn(), warn: jest.fn() } as unknown as AppLogger,
  );
  return { service, guard, projects };
}

describe('ProjectCreationService (Revisión E5, M1 y m1)', () => {
  it('los alcances de clientes se resuelven antes de la transacción y la guarda los recibe (sin conexión extra con el FOR SHARE)', async () => {
    const { service, guard } = setup();
    await service.create(makeActor(['proyectos.crear']), DRAFT, { event: 'crm.project.created', duplicatedFromId: null });
    expect(guard.accessScopes).toHaveBeenCalledTimes(1);
    expect(guard.assertUsableCustomer).toHaveBeenCalledWith('customer-1', expect.anything(), { requireActive: true, tx: TX, scopes: CUSTOMER_SCOPES });
  });

  it('asesor = el propio actor con otra capitalización: no se consulta la elegibilidad', async () => {
    const { service, projects } = setup();
    await service.create(makeActor(['proyectos.crear']), { ...DRAFT, ownerId: 'USER-1' }, { event: 'crm.project.created', duplicatedFromId: null });
    expect(projects.findEligibleOwner).not.toHaveBeenCalled();
  });
});
