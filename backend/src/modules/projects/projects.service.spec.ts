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
import type { CustomerAccessScopes } from '@/modules/customers/customer-actor.resolver';

import { fakeTransactions, makeActor, makeProject, makeScopes, ownerScope, PHASES, poolOnly, STAGES, TX } from './testing/project-fixtures';

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

const CUSTOMER_SCOPES = { marker: 'customer-scopes' } as unknown as CustomerAccessScopes;
// 2026-12-15 en Guatemala: mes en curso del negocio = 2026-12.
const NOW = new Date('2026-12-15T18:00:00.000Z');

function setup(options: { visible?: VisibleProject; locked?: VisibleProject; parameters?: Record<string, unknown> } = {}) {
  const visible = options.visible ?? toVisibleProject(makeProject(), makeScopes());
  const transactions = fakeTransactions();
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
    // Alcances y lecturas sin `tx` van por el pool: nunca con la transacción abierta (Revisión E5, M1).
    scopes: jest.fn(poolOnly(transactions, 'access.scopes', () => Promise.resolve(visible.scopes))),
    findVisible: jest.fn(async (_actor: unknown, _id: string, opts: { tx?: unknown } = {}) => {
      if (transactions.active && opts.tx !== TX) throw new Error('findVisible used the pool inside the transaction');
      return transactions.active ? (options.locked ?? visible) : visible;
    }),
    findEditable: jest.fn(poolOnly(transactions, 'access.findEditable', () => Promise.resolve(visible))),
    lockEditable: jest.fn(async (_actor: unknown, projectId: string, _scopes: unknown, tx: unknown) => {
      await repository.lockProject(projectId, 'UPDATE', tx);
      return options.locked ?? visible;
    }),
    assignableOwners: jest.fn().mockReturnValue({ kind: 'FILTERED', userIds: ['user-1', 'user-2'], countryIds: [] }),
  };
  const creation = { create: jest.fn().mockResolvedValue(visible.record) };
  const catalogs = { phaseAndStageSemantics: jest.fn().mockResolvedValue(SEMANTICS) };
  const guard = {
    accessScopes: jest.fn(poolOnly(transactions, 'guard.accessScopes', () => Promise.resolve(CUSTOMER_SCOPES))),
    assertUsableCustomer: jest.fn().mockResolvedValue({ id: 'customer-2', countryId: 'country-gt' }),
  };
  const params: Record<string, unknown> = { 'crm.zona_horaria_negocio': 'America/Guatemala', 'crm.campos_obligatorios': {}, ...options.parameters };
  const parameters = { get: jest.fn(poolOnly(transactions, 'parameters.get', (key: string) => Promise.resolve(params[key]))) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const logger = { info: jest.fn(), warn: jest.fn() };
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
    { now: () => NOW },
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

    it('cambio de cliente: bloquea el proyecto, cuenta vínculos y valida con CustomerReferenceGuard dentro de la transacción con los alcances leídos antes (sin pool)', async () => {
      const { service, repository, guard, audit } = setup();
      await service.update(makeActor(ADVISOR), 'project-1', { customerId: 'customer-2', countryId: 'country-sv' });
      expect(repository.lockProject).toHaveBeenCalledWith('project-1', 'UPDATE', TX);
      expect(repository.countLinkedInteractions).toHaveBeenCalledWith('project-1', TX);
      expect(guard.accessScopes).toHaveBeenCalledTimes(1);
      expect(guard.assertUsableCustomer).toHaveBeenCalledWith('customer-2', expect.anything(), { requireActive: true, tx: TX, scopes: CUSTOMER_SCOPES });
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

    it('fechas: el rango se valida contra el registro bloqueado → 422 INVALID_DATE_RANGE aunque la lectura previa lo permitiera (Revisión E5, M4)', async () => {
      const locked = toVisibleProject(makeProject({ estimatedEndDate: '2027-01-05' }), makeScopes());
      const { service, repository } = setup({ locked });
      await expect(service.update(makeActor(ADVISOR), 'project-1', { estimatedStartDate: '2027-01-10' })).rejects.toMatchObject({
        code: 'INVALID_DATE_RANGE',
        details: [{ field: 'estimatedEndDate', code: 'INVALID_DATE_RANGE', startField: 'estimatedStartDate' }],
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('cambios y auditoría salen del registro bloqueado: un campo que otra petición ya dejó igual no se reescribe', async () => {
      const locked = toVisibleProject(makeProject({ city: 'Mixco', description: 'nueva' }), makeScopes());
      const { service, repository, audit } = setup({ locked });
      await service.update(makeActor(ADVISOR), 'project-1', { city: 'Mixco', description: 'otra' });
      expect(repository.update).toHaveBeenCalledWith('project-1', { description: 'otra' }, 'user-1', expect.any(Date), TX);
      expect(audit.record.mock.calls[0]?.[2]).toMatchObject({ before: expect.objectContaining({ city: 'Mixco' }) });
    });

    it('reservados decididos sobre el registro bloqueado: sin administrar en su alcance → 403 FIELD_NOT_EDITABLE (Revisión E5, M4)', async () => {
      const visible = toVisibleProject(makeProject(), makeScopes({ administer: TEAM }));
      const locked = toVisibleProject(makeProject({ owner: { id: 'user-7', displayName: 'Fuera' } }), makeScopes({ administer: TEAM }));
      const { service, repository } = setup({ visible, locked });
      await expect(service.update(makeActor(MANAGER), 'project-1', { code: 'pry-nuevo' })).rejects.toMatchObject({
        code: 'FIELD_NOT_EDITABLE',
        details: [{ field: 'code', requiredPermission: 'proyectos.administrar' }],
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('UUID en mayúsculas: el mismo asesor no cuenta como cambio ni exige administrar (Revisión E5, m1)', async () => {
      const { service, transactions } = setup();
      await service.update(makeActor(ADVISOR), 'project-1', { ownerId: 'USER-1' });
      expect(transactions.runs).toBe(0);
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
    it('asesor reasignado entre la lectura y el bloqueo: la política se repite sobre el bloqueado → 403 sin borrar (Revisión E5, M4)', async () => {
      const visible = toVisibleProject(makeProject(), makeScopes({ delete: TEAM }));
      const locked = toVisibleProject(makeProject({ owner: { id: 'user-2', displayName: 'Otro' } }), makeScopes({ delete: TEAM }));
      const { service, repository } = setup({ visible, locked });
      const actor = makeActor(['proyectos.ver', 'proyectos.eliminar']);
      await expect(service.remove(actor, 'project-1')).rejects.toBeInstanceOf(PermissionDeniedError);
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

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
      // Mes en curso del reloj del negocio inyectado (Revisión E5, m2).
      expect(repository.countBlockingChildren).toHaveBeenCalledWith('project-1', { openStageIds: SEMANTICS.openStageIds, currentMonth: { year: 2026, month: 12 } }, TX);
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
