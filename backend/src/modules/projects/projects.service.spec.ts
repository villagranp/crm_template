import { AccessDeniedError, PermissionDeniedError, ResourceConflictError, ResourceNotFoundError } from '@/common/errors/application-error';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AuditService } from '@/modules/audit/audit.service';
import type { CustomerReferenceGuard } from '@/modules/customers/customer-reference.guard';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import type { ProjectAccessService, VisibleProject } from './project-access.service';
import { toVisibleProject } from './project-access.service';
import type { PhaseAndStageSemantics, ProjectCatalogsService } from './project-catalogs.service';
import type { ProjectCreationService } from './project-creation.service';
import { ProjectsService } from './projects.service';
import type { ProjectsRepository } from './ports/projects.repository.port';
import { fakeTransactions, makeActor, makeProject, makeScopes, ownerScope, PHASES, STAGES, TX } from './testing/project-fixtures';

const ADVISOR = ['proyectos.ver', 'proyectos.crear', 'proyectos.editar'];
const MANAGER = [...ADVISOR, 'proyectos.eliminar', 'proyectos.administrar'];
const TEAM = ownerScope(['user-1', 'user-2']);

const SEMANTICS: PhaseAndStageSemantics = {
  phases: [],
  stages: [],
  nonFinalPhaseIds: [PHASES.diseno.id, PHASES.cotizacion.id],
  finalPhaseIds: [PHASES.finalizado.id],
  openStageIds: [STAGES.contactado.id, STAGES.cotizando.id],
  closedStageIds: [STAGES.ganado.id, STAGES.perdido.id],
  openStageRanking: [STAGES.cotizando.id, STAGES.contactado.id],
  phaseRanking: [PHASES.diseno.id, PHASES.cotizacion.id, PHASES.finalizado.id],
};

function setup(options: { visible?: VisibleProject; parameters?: Record<string, unknown> } = {}) {
  const visible = options.visible ?? toVisibleProject(makeProject(), makeScopes());
  const repository = {
    search: jest.fn().mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 20 }),
    findById: jest.fn().mockResolvedValue(visible.record),
    lockProject: jest.fn().mockResolvedValue(true),
    codeExists: jest.fn().mockResolvedValue(false),
    update: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn().mockResolvedValue(undefined),
    countLinkedInteractions: jest.fn().mockResolvedValue({ visits: 0, activities: 0 }),
    countBlockingChildren: jest.fn().mockResolvedValue({ openOpportunities: 0, productsWithForecast: 0, nonCancelledVisits: 0, openActivities: 0 }),
    findCountry: jest.fn().mockResolvedValue({ id: 'country-sv', isoCode: 'SV', name: 'El Salvador', currencyCode: 'USD', isActive: true }),
    findEligibleOwner: jest.fn().mockResolvedValue('user-2'),
    touchLastActivity: jest.fn().mockResolvedValue(undefined),
  };
  const access = {
    scopes: jest.fn().mockResolvedValue(visible.scopes),
    findVisible: jest.fn().mockResolvedValue(visible),
    findEditable: jest.fn().mockResolvedValue(visible),
    assignableOwners: jest.fn().mockReturnValue({ kind: 'FILTERED', userIds: ['user-1', 'user-2'], countryIds: [] }),
  };
  const creation = { create: jest.fn().mockResolvedValue(visible.record) };
  const catalogs = { phaseAndStageSemantics: jest.fn().mockResolvedValue(SEMANTICS) };
  const guard = { assertUsableCustomer: jest.fn().mockResolvedValue({ id: 'customer-2', countryId: 'country-gt' }) };
  const params: Record<string, unknown> = { 'crm.zona_horaria_negocio': 'America/Guatemala', 'crm.campos_obligatorios': {}, ...options.parameters };
  const parameters = { get: jest.fn((key: string) => Promise.resolve(params[key])) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const logger = { info: jest.fn(), warn: jest.fn() };
  const transactions = fakeTransactions();
  const service = new ProjectsService(
    repository as unknown as ProjectsRepository,
    transactions,
    access as unknown as ProjectAccessService,
    creation as unknown as ProjectCreationService,
    catalogs as unknown as ProjectCatalogsService,
    guard as unknown as CustomerReferenceGuard,
    parameters as unknown as ParameterReader,
    audit as unknown as AuditService,
    logger as unknown as AppLogger,
  );
  return { service, repository, access, creation, guard, audit, transactions };
}

describe('ProjectsService', () => {
  describe('search (F-13)', () => {
    it('traduce filtros a criterios: texto normalizado, ranking de DEF-B, fases activas y alcance de proyectos.ver', async () => {
      const { service, repository } = setup();
      await service.search(makeActor(ADVISOR), {
        page: 2,
        pageSize: 10,
        sortOrder: 'desc',
        search: '  Árbol  Norte ',
        city: 'MIXCO',
        active: true,
        commercialStatus: [{ kind: 'WON', stageId: null }],
        dateField: 'createdAt',
        dateFrom: '2026-01-01',
      });
      expect(repository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          pageSize: 10,
          sortBy: 'lastActivityAt',
          sortOrder: 'desc',
          search: 'arbol norte',
          city: 'mixco',
          activePhaseIds: SEMANTICS.nonFinalPhaseIds,
          commercialStatus: [{ kind: 'WON', stageId: null }],
          dateRange: { field: 'createdAt', from: '2026-01-01', to: null },
          timeZone: 'America/Guatemala',
          openStageRanking: SEMANTICS.openStageRanking,
          phaseRanking: SEMANTICS.phaseRanking,
          teamIds: [],
        }),
        makeScopes().view,
      );
    });

    it('active=false usa las fases finales; dateFrom > dateTo → 422 sin consultar', async () => {
      const { service, repository } = setup();
      await service.search(makeActor(ADVISOR), { page: 1, pageSize: 20, sortOrder: 'desc', active: false });
      expect(repository.search.mock.calls[0]?.[0]).toMatchObject({ activePhaseIds: SEMANTICS.finalPhaseIds });
      await expect(
        service.search(makeActor(ADVISOR), { page: 1, pageSize: 20, sortOrder: 'desc', dateField: 'createdAt', dateFrom: '2026-02-01', dateTo: '2026-01-31' }),
      ).rejects.toMatchObject({ code: 'INVALID_DATE_RANGE', details: [{ field: 'dateTo' }] });
      expect(repository.search).toHaveBeenCalledTimes(1);
    });

    it('cada fila trae el estado comercial agregado y sus capabilities', async () => {
      const { service, repository } = setup({ visible: toVisibleProject(makeProject(), makeScopes({ view: TEAM, administer: TEAM })) });
      repository.search.mockResolvedValue({
        items: [
          {
            id: 'p-2',
            owner: { id: 'user-2', displayName: 'B' },
            country: { id: 'country-gt', isoCode: 'GT', name: 'Guatemala' },
            commercial: { leadingOpenStage: null, opportunityCount: 2, hasWon: true },
          },
        ],
        totalItems: 1,
        page: 1,
        pageSize: 20,
      });
      const page = await service.search(makeActor(MANAGER), { page: 1, pageSize: 20, sortOrder: 'desc' });
      expect(page.items[0]).toMatchObject({
        commercialStatus: { kind: 'WON', label: 'Ganado', stage: null },
        capabilities: { canEdit: true, canAdminister: true, canDelete: false },
      });
    });
  });

  it('teamView: rango de última actualización sobre lastActivityAt y equipos', async () => {
    const { service, repository } = setup();
    await service.teamView(makeActor(ADVISOR), { page: 1, pageSize: 20, sortOrder: 'desc', teamIds: ['team-1'], lastActivityTo: '2026-10-01' });
    expect(repository.search.mock.calls[0]?.[0]).toMatchObject({
      teamIds: ['team-1'],
      dateRange: { field: 'lastActivityAt', from: null, to: '2026-10-01' },
      commercialStatus: [],
      activePhaseIds: null,
    });
    await expect(
      service.teamView(makeActor(ADVISOR), { page: 1, pageSize: 20, sortOrder: 'desc', lastActivityFrom: '2026-10-02', lastActivityTo: '2026-10-01' }),
    ).rejects.toMatchObject({ code: 'INVALID_DATE_RANGE', details: [{ field: 'lastActivityTo' }] });
  });

  describe('create (F-10)', () => {
    it('asesor ajeno o código manual sin administrar → 403 FIELD_NOT_EDITABLE con ambos campos, sin crear', async () => {
      const { service, creation } = setup();
      const error = await service
        .create(makeActor(ADVISOR), { name: 'x', customerId: 'customer-1', ownerId: 'user-2', code: 'man-1' })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AccessDeniedError);
      expect(error).toMatchObject({
        code: 'FIELD_NOT_EDITABLE',
        details: [
          { field: 'ownerId', requiredPermission: 'proyectos.administrar' },
          { field: 'code', requiredPermission: 'proyectos.administrar' },
        ],
      });
      expect(creation.create).not.toHaveBeenCalled();
    });

    it('delegación: nombre recortado, asesor = actor, código normalizado, sin clasificación ni productos', async () => {
      const { service, creation } = setup();
      await service.create(makeActor(MANAGER), { name: '  Torre ', customerId: 'customer-1', city: '  ', code: ' pry-x ' });
      expect(creation.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'Torre', ownerId: 'user-1', city: null, code: 'PRY-X', countryId: null, classification: null, products: [] }),
        { event: 'crm.project.created', duplicatedFromId: null },
      );
    });
  });

  describe('update (F-11)', () => {
    it('sin cambios efectivos (texto recortado, código igual normalizado) no abre transacción ni audita', async () => {
      const { service, transactions, audit } = setup();
      await service.update(makeActor(ADVISOR), 'project-1', { name: ' Torre Norte ', code: 'pry-2026-00001', ownerId: 'user-1' });
      expect(transactions.runs).toBe(0);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('reservados sin administrar → 403 FIELD_NOT_EDITABLE', async () => {
      const { service } = setup();
      await expect(service.update(makeActor(ADVISOR), 'project-1', { ownerId: 'user-2' })).rejects.toMatchObject({
        code: 'FIELD_NOT_EDITABLE',
        details: [{ field: 'ownerId', requiredPermission: 'proyectos.administrar' }],
      });
    });

    it('cambio de cliente: bloquea el proyecto, cuenta vínculos y valida con CustomerReferenceGuard dentro de la transacción', async () => {
      const { service, repository, guard, audit } = setup();
      await service.update(makeActor(ADVISOR), 'project-1', { customerId: 'customer-2', countryId: 'country-sv' });
      expect(repository.lockProject).toHaveBeenCalledWith('project-1', 'UPDATE', TX);
      expect(repository.countLinkedInteractions).toHaveBeenCalledWith('project-1', TX);
      expect(guard.assertUsableCustomer).toHaveBeenCalledWith('customer-2', expect.anything(), { requireActive: true, tx: TX });
      expect(repository.update).toHaveBeenCalledWith('project-1', { customerId: 'customer-2', countryId: 'country-sv' }, 'user-1', expect.any(Date), TX);
      expect(audit.record).toHaveBeenCalledWith('crm.project.updated', expect.anything(), expect.objectContaining({ maskedFields: ['address', 'description'] }));
    });

    it('cliente con visitas o actividades → 409 PROJECT_CUSTOMER_LOCKED sin escribir', async () => {
      const { service, repository, guard } = setup();
      repository.countLinkedInteractions.mockResolvedValue({ visits: 0, activities: 2 });
      await expect(service.update(makeActor(ADVISOR), 'project-1', { customerId: 'customer-2' })).rejects.toMatchObject({
        code: 'PROJECT_CUSTOMER_LOCKED',
        details: [{ field: 'customerId', dependency: 'activities', count: 2 }],
      });
      expect(guard.assertUsableCustomer).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('obligatorio enviado vacío, fechas incoherentes con el valor guardado y asesor no elegible → 422', async () => {
      const visible = toVisibleProject(makeProject({ estimatedStartDate: '2027-01-10' }), makeScopes({ administer: TEAM }));
      const { service, repository } = setup({ visible, parameters: { 'crm.campos_obligatorios': { project: ['city'] } } });
      await expect(service.update(makeActor(ADVISOR), 'project-1', { city: null, estimatedEndDate: '2027-01-09' })).rejects.toMatchObject({
        code: 'REQUIRED_FIELD_MISSING',
        details: [{ field: 'city' }, { field: 'estimatedEndDate', code: 'INVALID_DATE_RANGE' }],
      });
      repository.findEligibleOwner.mockResolvedValue(null);
      await expect(service.update(makeActor(MANAGER), 'project-1', { ownerId: 'user-9' })).rejects.toMatchObject({
        code: 'INVALID_OWNER',
        details: [{ field: 'ownerId' }],
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('código ocupado por otro proyecto → 409 PROJECT_CODE_TAKEN', async () => {
      const visible = toVisibleProject(makeProject(), makeScopes({ administer: TEAM }));
      const { service, repository } = setup({ visible });
      repository.codeExists.mockResolvedValue(true);
      const error = await service.update(makeActor(MANAGER), 'project-1', { code: 'pry-otro' }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ResourceConflictError);
      expect(error).toMatchObject({ code: 'PROJECT_CODE_TAKEN', details: [{ field: 'code', code: 'PRY-OTRO' }] });
    });
  });

  describe('remove (RN-03.12)', () => {
    it('sin la política de eliminar → 403 sin abrir transacción', async () => {
      const { service, transactions } = setup();
      const error = await service.remove(makeActor(['proyectos.ver', 'proyectos.eliminar']), 'project-1').catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(PermissionDeniedError);
      expect(transactions.runs).toBe(0);
    });

    it('cuenta bloqueos y borra en la misma transacción con la fila bloqueada', async () => {
      const visible = toVisibleProject(makeProject(), makeScopes({ delete: TEAM }));
      const { service, repository, audit } = setup({ visible });
      await service.remove(makeActor(MANAGER), 'project-1');
      expect(repository.lockProject).toHaveBeenCalledWith('project-1', 'UPDATE', TX);
      expect(repository.countBlockingChildren).toHaveBeenCalledWith(
        'project-1',
        { openStageIds: SEMANTICS.openStageIds, currentMonth: expect.objectContaining({ year: expect.any(Number) }) },
        TX,
      );
      expect(repository.softDelete).toHaveBeenCalledWith('project-1', 'user-1', expect.any(Date), TX);
      expect(audit.record).toHaveBeenCalledWith('crm.project.deleted', expect.anything(), expect.objectContaining({ metadata: { code: 'PRY-2026-00001' } }));
    });

    it('con hijos activos → 409 con solo los bloqueos > 0; proyecto desaparecido bajo el bloqueo → 404', async () => {
      const visible = toVisibleProject(makeProject(), makeScopes({ delete: TEAM }));
      const { service, repository } = setup({ visible });
      repository.countBlockingChildren.mockResolvedValue({ openOpportunities: 1, productsWithForecast: 0, nonCancelledVisits: 2, openActivities: 0 });
      await expect(service.remove(makeActor(MANAGER), 'project-1')).rejects.toMatchObject({
        code: 'PROJECT_HAS_ACTIVE_CHILDREN',
        details: [
          { dependency: 'openOpportunities', count: 1 },
          { dependency: 'nonCancelledVisits', count: 2 },
        ],
      });
      expect(repository.softDelete).not.toHaveBeenCalled();
      repository.lockProject.mockResolvedValue(false);
      await expect(service.remove(makeActor(MANAGER), 'project-1')).rejects.toBeInstanceOf(ResourceNotFoundError);
    });
  });

  it('toDetail: origen del duplicado solo si es visible; resumen por resultado', () => {
    const { service } = setup();
    const record = makeProject({
      duplicatedFrom: { id: 'src', code: 'PRY-1', name: 'Origen', ownerId: 'user-9', countryId: 'country-gt', isDeleted: false },
      opportunities: [
        { stage: STAGES.contactado, outcome: null },
        { stage: STAGES.ganado, outcome: 'WON' },
        { stage: STAGES.ganado, outcome: 'PARTIAL' },
        { stage: STAGES.perdido, outcome: 'LOST' },
      ],
    });
    const hidden = service.toDetail(makeActor(ADVISOR), toVisibleProject(record, makeScopes()));
    expect(hidden.duplicatedFrom).toBeNull();
    expect(hidden.summary).toMatchObject({ openOpportunities: 1, wonOpportunities: 1, partialOpportunities: 1, lostOpportunities: 1 });
    expect(hidden.commercialStatus).toMatchObject({ kind: 'OPEN_STAGE', stage: { code: 'CONTACTADO' } });
    const shown = service.toDetail(makeActor(ADVISOR), toVisibleProject(record, makeScopes({ view: ownerScope(['user-1', 'user-9']) })));
    expect(shown.duplicatedFrom).toEqual({ id: 'src', code: 'PRY-1', name: 'Origen' });
  });
});
