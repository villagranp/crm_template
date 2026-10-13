import { PermissionDeniedError, ResourceConflictError, ResourceNotFoundError } from '@/common/errors/application-error';
import type { SequenceGenerator } from '@/infrastructure/database/ports/sequence-generator.port';
import type { TransactionContext, TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AuditService } from '@/modules/audit/audit.service';
import type { CatalogLookupService } from '@/modules/catalogs/catalog-lookup.service';
import type { CatalogReferenceValidator } from '@/modules/catalogs/catalog-reference.validator';
import type { CustomerReferenceGuard } from '@/modules/customers/customer-reference.guard';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import { ActivitiesService } from './activities.service';
import type { CommercialActorResolver } from './commercial-actor.resolver';
import type { ActivityRecord, ActivityRepository } from './ports/activity.repository.port';
import type { CommercialLinkReader } from './ports/commercial-link.reader.port';
import type { CommercialUsersReader } from './ports/commercial-users.reader.port';
import { CATALOG_ITEMS, makeActivity, makeActor, makeScopes, teamScope, TX } from './testing/activity-fixtures';

const ASESOR = ['actividades.ver', 'actividades.crear', 'actividades.editar', 'actividades.cerrar', 'contactos.ver'];
const PARAMETERS: Record<string, unknown> = {
  'crm.campos_obligatorios': { activity: ['typeId', 'subject', 'customerId', 'ownerId', 'priorityId'] },
  'crm.valores_por_defecto': { 'activity.priorityId': 'MEDIA' },
  'crm.zona_horaria_negocio': 'America/Guatemala',
  'crm.alertas.actividad_por_vencer_horas': 48,
};

type FakeOf<T> = { [K in keyof T]: jest.Mock };

interface Fakes {
  service: ActivitiesService;
  activities: FakeOf<ActivityRepository>;
  links: FakeOf<CommercialLinkReader>;
  users: FakeOf<CommercialUsersReader>;
  sequences: { next: jest.Mock };
  run: jest.Mock;
  customers: { assertUsableCustomer: jest.Mock; assertContactOfCustomer: jest.Mock };
  catalogReferences: { assertItem: jest.Mock };
  audit: { record: jest.Mock };
}

function setup(stored: ActivityRecord | null = makeActivity(), scopes = makeScopes()): Fakes {
  let current = stored;
  const activities: FakeOf<ActivityRepository> = {
    findById: jest.fn(async () => current),
    search: jest.fn(),
    listPending: jest.fn(),
    create: jest.fn(async () => {
      current = makeActivity({ id: 'activity-new' });
      return 'activity-new';
    }),
    update: jest.fn(async () => true),
    deleteParticipants: jest.fn(async () => undefined),
    insertParticipants: jest.fn(async () => undefined),
  };
  const links: FakeOf<CommercialLinkReader> = {
    findProject: jest.fn(async () => ({ id: 'project-1', customerId: 'customer-1', isDeleted: false, isVisible: true })),
    findOpportunity: jest.fn(),
    lockProjects: jest.fn(async () => undefined),
    touchProjects: jest.fn(async () => undefined),
  };
  const users: FakeOf<CommercialUsersReader> = {
    isEligibleOwner: jest.fn(async () => true),
    listOwnerOptions: jest.fn(),
    findUserStates: jest.fn(async () => []),
  };
  const sequences = { next: jest.fn(async () => 'ACT-2026-000042') };
  const run = jest.fn(async (work: (tx: TransactionContext) => Promise<unknown>) => work(TX));
  const customers = { assertUsableCustomer: jest.fn(async () => ({})), assertContactOfCustomer: jest.fn(async () => ({})) };
  const catalogReferences = { assertItem: jest.fn(async () => ({})) };
  const audit = { record: jest.fn(async () => undefined) };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new ActivitiesService(
    activities as unknown as ActivityRepository,
    links as unknown as CommercialLinkReader,
    users as unknown as CommercialUsersReader,
    { run } as unknown as TransactionRunner,
    sequences as unknown as SequenceGenerator,
    { activityScopes: jest.fn(async () => scopes) } as unknown as CommercialActorResolver,
    customers as unknown as CustomerReferenceGuard,
    catalogReferences as unknown as CatalogReferenceValidator,
    { findByKey: jest.fn(async (key: string) => ({ items: CATALOG_ITEMS[key] ?? [] })) } as unknown as CatalogLookupService,
    { get: jest.fn(async (key: string) => PARAMETERS[key]) } as unknown as ParameterReader,
    audit as unknown as AuditService,
    logger as unknown as AppLogger,
  );
  return { service, activities, links, users, sequences, run, customers, catalogReferences, audit };
}

const order = (mock: jest.Mock): number => mock.mock.invocationCallOrder[0] ?? -1;

describe('ActivitiesService.create', () => {
  it('valida dentro de la transacción, pide el folio al final, propaga tx y toca el proyecto (RN-04.11)', async () => {
    const fakes = setup(null);
    const view = await fakes.service.create(makeActor(ASESOR), {
      typeId: 'type-call',
      subject: '  Llamada  ',
      customerId: 'customer-1',
      projectId: 'project-1',
      durationMinutes: 10,
    });

    expect(fakes.customers.assertUsableCustomer).toHaveBeenCalledWith('customer-1', expect.anything(), { requireActive: true, tx: TX });
    expect(fakes.catalogReferences.assertItem.mock.calls).toEqual([
      ['crm.tipo_actividad', 'type-call', { field: 'typeId', requireActive: true, currentId: null, tx: TX }],
      ['crm.prioridad', 'priority-medium', { field: 'priorityId', requireActive: true, currentId: null, tx: TX }],
    ]);
    expect(fakes.links.findProject).toHaveBeenCalledWith('project-1', expect.anything(), TX);
    expect(fakes.links.lockProjects).toHaveBeenCalledWith(['project-1'], TX);
    expect(fakes.sequences.next).toHaveBeenCalledWith('crm.actividad', TX, { timeZone: 'America/Guatemala' });
    expect(order(fakes.sequences.next)).toBeGreaterThan(order(fakes.links.lockProjects));
    expect(order(fakes.sequences.next)).toBeGreaterThan(order(fakes.catalogReferences.assertItem));
    expect(fakes.activities.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ACT-2026-000042',
        subject: 'Llamada',
        statusId: 'status-pending',
        priorityId: 'priority-medium',
        ownerId: 'user-1',
        durationMinutes: 10,
        completedAt: null,
        completedById: null,
        createdById: 'user-1',
        participants: [],
      }),
      TX,
    );
    expect(fakes.links.touchProjects).toHaveBeenCalledWith(['project-1'], expect.any(Date), TX);
    expect(fakes.audit.record).toHaveBeenCalledWith('crm.activity.created', expect.anything(), expect.objectContaining({ resourceId: 'activity-new' }));
    expect(order(fakes.audit.record)).toBeGreaterThan(order(fakes.run));
    expect(view.allowedActions).toEqual(['EDIT', 'COMPLETE', 'CANCEL']);
  });

  it('con completion: exige actividades.cerrar antes de leer nada', async () => {
    const fakes = setup(null);
    await expect(
      fakes.service.create(makeActor(['actividades.crear']), {
        typeId: 'type-call',
        subject: 'X',
        customerId: 'customer-1',
        completion: { resultNotes: 'ok' },
      }),
    ).rejects.toEqual(new PermissionDeniedError('actividades.cerrar'));
    expect(fakes.run).not.toHaveBeenCalled();
  });

  it('con completion: se crea completada con resultado y completedBy = actor', async () => {
    const fakes = setup(null);
    await fakes.service.create(makeActor(ASESOR), {
      typeId: 'type-call',
      subject: 'X',
      customerId: 'customer-1',
      completion: { resultId: 'result-positive', comment: ' Hecho ' },
    });
    expect(fakes.activities.create).toHaveBeenCalledWith(
      expect.objectContaining({
        statusId: 'status-completed',
        resultId: 'result-positive',
        completedById: 'user-1',
        completionComment: 'Hecho',
        completedAt: expect.any(Date),
      }),
      TX,
    );
    expect(fakes.catalogReferences.assertItem).toHaveBeenCalledWith('crm.resultado_interaccion', 'result-positive', expect.objectContaining({ tx: TX }));
  });

  it('responsable ajeno: sin administrar → 403; con administrar se comprueba la elegibilidad en la transacción', async () => {
    const fakes = setup(null);
    await expect(
      fakes.service.create(makeActor(ASESOR), { typeId: 'type-call', subject: 'X', customerId: 'customer-1', ownerId: 'user-2' }),
    ).rejects.toEqual(new PermissionDeniedError('actividades.administrar'));

    const manager = setup(null, makeScopes({ administer: teamScope(['user-1', 'user-2']) }));
    manager.users.isEligibleOwner.mockResolvedValue(false);
    await expect(
      manager.service.create(makeActor([...ASESOR, 'actividades.administrar']), {
        typeId: 'type-call',
        subject: 'X',
        customerId: 'customer-1',
        ownerId: 'user-2',
      }),
    ).rejects.toMatchObject({ code: 'OWNER_NOT_ELIGIBLE' });
    expect(manager.users.isEligibleOwner).toHaveBeenCalledWith(
      'user-2',
      { scope: { kind: 'FILTERED', userIds: ['user-1', 'user-2'], countryIds: [] }, anyOfPermissions: ['actividades.ver'] },
      TX,
    );
    expect(manager.sequences.next).not.toHaveBeenCalled();
  });

  it('FIELD_NOT_APPLICABLE y REQUIRED_FIELD_MISSING se deciden antes de abrir la transacción', async () => {
    const fakes = setup(null);
    await expect(
      fakes.service.create(makeActor(ASESOR), { typeId: 'type-task', subject: 'T', customerId: 'customer-1', durationMinutes: 5, summary: 'x' }),
    ).rejects.toMatchObject({
      code: 'FIELD_NOT_APPLICABLE',
      details: [
        { field: 'durationMinutes', code: 'FIELD_NOT_APPLICABLE' },
        { field: 'summary', code: 'FIELD_NOT_APPLICABLE' },
      ],
    });
    await expect(fakes.service.create(makeActor(ASESOR), { typeId: 'type-call', subject: '   ', customerId: 'customer-1' })).rejects.toMatchObject({
      code: 'REQUIRED_FIELD_MISSING',
      details: [{ field: 'subject', code: 'REQUIRED_FIELD_MISSING' }],
    });
    expect(fakes.run).not.toHaveBeenCalled();
  });

  it('un proyecto de otro cliente → 422 PROJECT_CUSTOMER_MISMATCH y nada se escribe', async () => {
    const fakes = setup(null);
    fakes.links.findProject.mockResolvedValue({ id: 'project-1', customerId: 'customer-9', isDeleted: false, isVisible: true });
    await expect(
      fakes.service.create(makeActor(ASESOR), { typeId: 'type-call', subject: 'X', customerId: 'customer-1', projectId: 'project-1' }),
    ).rejects.toMatchObject({ code: 'PROJECT_CUSTOMER_MISMATCH', details: [{ field: 'projectId' }] });
    expect(fakes.activities.create).not.toHaveBeenCalled();
  });
});

describe('ActivitiesService.update / complete / remove', () => {
  it('edición sin cambios: no abre transacción ni audita', async () => {
    const fakes = setup(makeActivity({ durationMinutes: 10 }));
    await fakes.service.update(makeActor(ASESOR), 'activity-1', { durationMinutes: 10, subject: 'Llamada' });
    expect(fakes.run).not.toHaveBeenCalled();
    expect(fakes.audit.record).not.toHaveBeenCalled();
  });

  it('escritura condicionada al estado leído: si otro la cambió → 409 INVALID_STATUS_TRANSITION, sin auditoría', async () => {
    const fakes = setup();
    fakes.activities.update.mockResolvedValue(false);
    await expect(fakes.service.update(makeActor(ASESOR), 'activity-1', { durationMinutes: 30 })).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
      details: [{ field: 'statusId', reason: 'CONCURRENT_CHANGE' }],
    });
    expect(fakes.activities.update).toHaveBeenCalledWith('activity-1', 'status-pending', { durationMinutes: 30, updatedById: 'user-1' }, TX);
    expect(fakes.audit.record).not.toHaveBeenCalled();
  });

  it('completar: 404 si no la ve, 409 si ya está completada, 422 sin resultado', async () => {
    await expect(setup(null).service.complete(makeActor(ASESOR), 'x', { resultNotes: 'ok' })).rejects.toBeInstanceOf(ResourceNotFoundError);
    const done = setup(makeActivity({ statusId: 'status-completed' }));
    await expect(done.service.complete(makeActor(ASESOR), 'activity-1', { resultNotes: 'ok' })).rejects.toBeInstanceOf(ResourceConflictError);
    await expect(setup().service.complete(makeActor(ASESOR), 'activity-1', {})).rejects.toMatchObject({ code: 'RESULT_REQUIRED' });
  });

  it('completar escribe estado, finalización y resultado condicionados, y toca el proyecto vinculado', async () => {
    const fakes = setup(makeActivity({ project: { id: 'project-1', code: 'PRY-1', name: 'P', isDeleted: false } }));
    await fakes.service.complete(makeActor(ASESOR), 'activity-1', { resultNotes: ' Bien ', comment: 'c' });
    expect(fakes.activities.update).toHaveBeenCalledWith(
      'activity-1',
      'status-pending',
      { statusId: 'status-completed', completedAt: expect.any(Date), completedById: 'user-1', completionComment: 'c', resultNotes: 'Bien', updatedById: 'user-1' },
      TX,
    );
    expect(fakes.links.lockProjects).toHaveBeenCalledWith(['project-1'], TX);
    expect(fakes.links.touchProjects).toHaveBeenCalledWith(['project-1'], expect.any(Date), TX);
    expect(fakes.audit.record).toHaveBeenCalledWith('crm.activity.completed', expect.anything(), expect.anything());
  });

  it('eliminar: el asesor no tiene permiso (403); una completada es historia (409)', async () => {
    await expect(setup().service.remove(makeActor(ASESOR), 'activity-1')).rejects.toEqual(new PermissionDeniedError('actividades.eliminar'));
    const manager = setup(makeActivity({ statusId: 'status-completed' }), makeScopes({ delete: teamScope(['user-1']) }));
    await expect(manager.service.remove(makeActor([...ASESOR, 'actividades.eliminar']), 'activity-1')).rejects.toMatchObject({
      code: 'RECORD_READ_ONLY',
    });
    expect(manager.run).not.toHaveBeenCalled();
  });
});
