import { AccessDeniedError, PermissionDeniedError, ResourceConflictError, ResourceNotFoundError } from '@/common/errors/application-error';
import type { SequenceGenerator } from '@/infrastructure/database/ports/sequence-generator.port';
import type { TransactionContext, TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AuditService } from '@/modules/audit/audit.service';
import type { CatalogLookupService } from '@/modules/catalogs/catalog-lookup.service';
import type { CatalogReferenceValidator } from '@/modules/catalogs/catalog-reference.validator';
import type { CustomerReferenceGuard } from '@/modules/customers/customer-reference.guard';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import type { CommercialActorResolver } from './commercial-actor.resolver';
import type { CommercialLinkReader } from './ports/commercial-link.reader.port';
import type { CommercialUsersReader } from './ports/commercial-users.reader.port';
import type { ScheduleCandidateRecord, VisitRecord, VisitRepository } from './ports/visit.repository.port';
import { makeActor, TX } from './testing/activity-fixtures';
import { makeVisit, makeVisitScopes, VISIT_CATALOG_ITEMS } from './testing/visit-fixtures';
import { EVENT_ATTACHMENT_WINDOW_MS, VisitsService } from './visits.service';

const ASESOR = ['visitas.ver', 'visitas.crear', 'visitas.editar', 'visitas.cerrar', 'contactos.ver'];
const HOUR = 3_600_000;

type FakeOf<T> = { [K in keyof T]: jest.Mock };

interface Fakes {
  service: VisitsService;
  visits: FakeOf<VisitRepository>;
  links: FakeOf<CommercialLinkReader>;
  users: FakeOf<CommercialUsersReader>;
  sequences: { next: jest.Mock };
  customers: { assertUsableCustomer: jest.Mock; assertContactOfCustomer: jest.Mock };
  catalogReferences: { assertItem: jest.Mock };
  audit: { record: jest.Mock };
  logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };
}

function setup(options: { stored?: VisitRecord | null; mode?: string; candidates?: ScheduleCandidateRecord[] } = {}): Fakes {
  let current = options.stored === undefined ? makeVisit() : options.stored;
  const parameters: Record<string, unknown> = {
    'crm.campos_obligatorios': { visit: ['customerId', 'scheduledStartAt', 'ownerId', 'objective'] },
    'crm.zona_horaria_negocio': 'America/Guatemala',
    'crm.visitas.validar_conflicto_horario': options.mode ?? 'AVISAR',
    'crm.visitas.duracion_por_defecto_minutos': 60,
  };
  const visits: FakeOf<VisitRepository> = {
    findById: jest.fn(async () => current),
    search: jest.fn(),
    listEvents: jest.fn(async () => []),
    findEvent: jest.fn(),
    lockOwnerSchedules: jest.fn(async () => undefined),
    findScheduleCandidates: jest.fn(async () => options.candidates ?? []),
    create: jest.fn(async () => {
      current = makeVisit({ id: 'visit-new' });
      return 'visit-new';
    }),
    update: jest.fn(async () => true),
    insertEvent: jest.fn(async () => 'event-1'),
    replaceParticipants: jest.fn(async () => undefined),
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
  const sequences = { next: jest.fn(async () => 'VIS-2026-00042') };
  const run = jest.fn(async (work: (tx: TransactionContext) => Promise<unknown>) => work(TX));
  const customers = { assertUsableCustomer: jest.fn(async () => ({})), assertContactOfCustomer: jest.fn(async () => ({})) };
  const catalogReferences = { assertItem: jest.fn(async () => ({})) };
  const audit = { record: jest.fn(async () => undefined) };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new VisitsService(
    visits as unknown as VisitRepository,
    links as unknown as CommercialLinkReader,
    users as unknown as CommercialUsersReader,
    { run } as unknown as TransactionRunner,
    sequences as unknown as SequenceGenerator,
    { visitScopes: jest.fn(async () => makeVisitScopes()) } as unknown as CommercialActorResolver,
    customers as unknown as CustomerReferenceGuard,
    catalogReferences as unknown as CatalogReferenceValidator,
    { findByKey: jest.fn(async (key: string) => ({ items: VISIT_CATALOG_ITEMS[key] ?? [] })) } as unknown as CatalogLookupService,
    { get: jest.fn(async (key: string) => parameters[key]) } as unknown as ParameterReader,
    audit as unknown as AuditService,
    logger as unknown as AppLogger,
  );
  return { service, visits, links, users, sequences, customers, catalogReferences, audit, logger };
}

const order = (mock: jest.Mock): number => mock.mock.invocationCallOrder[0] ?? -1;

function candidate(overrides: Partial<ScheduleCandidateRecord> = {}): ScheduleCandidateRecord {
  return {
    id: 'other-visit',
    code: 'VIS-2026-00031',
    ownerId: 'user-1',
    scheduledStartAt: new Date('2026-10-20T15:30:00.000Z'),
    scheduledEndAt: null,
    isCancelled: false,
    customerName: 'Otro cliente',
    isVisible: true,
    ...overrides,
  };
}

const PLAN = { customerId: 'customer-1', scheduledStartAt: '2026-10-20T15:00:00Z', objective: '  Presentar catálogo  ' };

describe('VisitsService.create (RN-04.13, RN-04.14)', () => {
  it('valida dentro de la transacción, bloquea la agenda antes de evaluar conflictos y pide el folio al final', async () => {
    const fakes = setup({ stored: null });
    const view = await fakes.service.create(makeActor(ASESOR), { ...PLAN, projectId: 'project-1' });

    expect(fakes.customers.assertUsableCustomer).toHaveBeenCalledWith('customer-1', expect.anything(), { requireActive: true, tx: TX });
    expect(fakes.links.findProject).toHaveBeenCalledWith('project-1', expect.anything(), TX);
    expect(fakes.visits.lockOwnerSchedules).toHaveBeenCalledWith(['user-1'], TX);
    expect(order(fakes.visits.findScheduleCandidates)).toBeGreaterThan(order(fakes.visits.lockOwnerSchedules));
    expect(order(fakes.sequences.next)).toBeGreaterThan(order(fakes.visits.findScheduleCandidates));
    expect(fakes.sequences.next).toHaveBeenCalledWith('crm.visita', TX, { timeZone: 'America/Guatemala' });
    expect(fakes.visits.create).toHaveBeenCalledWith(
      {
        code: 'VIS-2026-00042',
        fields: {
          customerId: 'customer-1',
          projectId: 'project-1',
          ownerId: 'user-1',
          statusId: 'visit-planned',
          scheduledStartAt: new Date('2026-10-20T15:00:00Z'),
          scheduledEndAt: null,
          objective: 'Presentar catálogo',
          location: null,
          reminderMinutesBefore: null,
        },
        createdById: 'user-1',
        participants: [],
        plannedEvent: expect.objectContaining({ eventType: 'PLANNED', fromStatusId: null, toStatusId: 'visit-planned', performedById: 'user-1' }),
      },
      TX,
    );
    expect(fakes.links.touchProjects).toHaveBeenCalledWith(['project-1'], expect.any(Date), TX);
    expect(fakes.audit.record).toHaveBeenCalledWith('crm.visit.created', expect.anything(), expect.objectContaining({ resourceId: 'visit-new' }));
    expect(view.scheduleConflicts).toEqual([]);
  });

  it('AVISAR: guarda y devuelve los solapes; una visita no visible va sin datos', async () => {
    const fakes = setup({ stored: null, candidates: [candidate(), candidate({ id: 'hidden', code: 'VIS-X', isVisible: false, scheduledStartAt: new Date('2026-10-20T14:30:00Z') })] });
    const view = await fakes.service.create(makeActor(ASESOR), PLAN);
    expect(fakes.visits.create).toHaveBeenCalled();
    expect(view.scheduleConflicts).toEqual([
      { visitId: null, code: null, scheduledStartAt: new Date('2026-10-20T14:30:00Z'), effectiveEndAt: new Date('2026-10-20T15:30:00Z'), customerName: null, isVisible: false },
      { visitId: 'other-visit', code: 'VIS-2026-00031', scheduledStartAt: new Date('2026-10-20T15:30:00Z'), effectiveEndAt: new Date('2026-10-20T16:30:00Z'), customerName: 'Otro cliente', isVisible: true },
    ]);
    expect(fakes.logger.info).toHaveBeenCalledWith('visit.schedule_conflict_warned', expect.objectContaining({ conflictingVisitIds: ['other-visit'], hiddenConflicts: 1 }));
  });

  it('BLOQUEAR: 409 SCHEDULE_CONFLICT y nada escrito; NO: ni bloquea ni consulta', async () => {
    const blocked = setup({ stored: null, mode: 'BLOQUEAR', candidates: [candidate()] });
    await expect(blocked.service.create(makeActor(ASESOR), PLAN)).rejects.toMatchObject({ code: 'SCHEDULE_CONFLICT' });
    expect(blocked.sequences.next).not.toHaveBeenCalled();
    expect(blocked.visits.create).not.toHaveBeenCalled();

    const off = setup({ stored: null, mode: 'NO', candidates: [candidate()] });
    const view = await off.service.create(makeActor(ASESOR), PLAN);
    expect(off.visits.lockOwnerSchedules).not.toHaveBeenCalled();
    expect(off.visits.findScheduleCandidates).not.toHaveBeenCalled();
    expect(view.scheduleConflicts).toEqual([]);
  });

  it('una contigua (fin = inicio) o cancelada no es conflicto', async () => {
    const fakes = setup({
      stored: null,
      candidates: [
        candidate({ scheduledStartAt: new Date('2026-10-20T14:00:00Z'), scheduledEndAt: new Date('2026-10-20T15:00:00Z') }),
        candidate({ id: 'c', isCancelled: true }),
      ],
    });
    expect((await fakes.service.create(makeActor(ASESOR), PLAN)).scheduleConflicts).toEqual([]);
  });

  it('ownerId ajeno sin visitas.administrar → 403 antes de leer nada; fin < inicio → 422', async () => {
    const fakes = setup({ stored: null });
    await expect(fakes.service.create(makeActor(ASESOR), { ...PLAN, ownerId: 'user-2' })).rejects.toEqual(new PermissionDeniedError('visitas.administrar'));
    await expect(fakes.service.create(makeActor(ASESOR), { ...PLAN, scheduledEndAt: '2026-10-20T14:00:00Z' })).rejects.toMatchObject({
      code: 'INVALID_DATE_RANGE',
      details: [{ field: 'scheduledEndAt', code: 'INVALID_DATE_RANGE' }],
    });
    expect(fakes.customers.assertUsableCustomer).not.toHaveBeenCalled();
  });
});

describe('VisitsService.update (RN-04.15)', () => {
  it('scheduledStartAt → 422 USE_RESCHEDULE; una realizada → 409 RECORD_READ_ONLY (estado antes que regla)', async () => {
    const pending = setup();
    await expect(pending.service.update(makeActor(ASESOR), 'visit-1', { scheduledStartAt: '2026-10-21T10:00:00Z' })).rejects.toMatchObject({
      code: 'USE_RESCHEDULE',
    });
    const done = setup({ stored: makeVisit({ statusId: 'visit-done' }) });
    await expect(done.service.update(makeActor(ASESOR), 'visit-1', { scheduledStartAt: '2026-10-21T10:00:00Z' })).rejects.toMatchObject({
      code: 'RECORD_READ_ONLY',
    });
  });

  it('sin cambios no escribe ni audita; cambiar el fin evalúa conflictos excluyéndose a sí misma', async () => {
    const fakes = setup();
    await fakes.service.update(makeActor(ASESOR), 'visit-1', { objective: 'Presentar catálogo' });
    expect(fakes.visits.update).not.toHaveBeenCalled();
    expect(fakes.audit.record).not.toHaveBeenCalled();

    await fakes.service.update(makeActor(ASESOR), 'visit-1', { scheduledEndAt: '2026-10-20T17:00:00Z' });
    expect(fakes.visits.findScheduleCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'user-1', excludeVisitId: 'visit-1', end: new Date('2026-10-20T17:00:00Z') }),
      expect.anything(),
      TX,
    );
    expect(fakes.visits.update).toHaveBeenCalledWith(
      'visit-1',
      { statusId: 'visit-planned', rescheduleCount: 0 },
      { scheduledEndAt: new Date('2026-10-20T17:00:00Z'), updatedById: 'user-1' },
      TX,
    );
  });

  it('RN-04.12: si la escritura condicionada no escribe → 409 CONCURRENT_CHANGE sin auditoría', async () => {
    const fakes = setup();
    fakes.visits.update.mockResolvedValueOnce(false);
    await expect(fakes.service.update(makeActor(ASESOR), 'visit-1', { location: 'Planta' })).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
      details: [{ reason: 'CONCURRENT_CHANGE' }],
    });
    expect(fakes.audit.record).not.toHaveBeenCalled();
  });
});

describe('VisitsService.complete / correctCompletion (RN-04.16, RN-04.17)', () => {
  it('registrar: REALIZADA, quién y cuándo, asistentes ATTENDED y evento COMPLETED en la misma transacción', async () => {
    const fakes = setup();
    await fakes.service.complete(makeActor(ASESOR), 'visit-1', {
      actualStartAt: '2026-10-01T15:00:00Z',
      attendees: [{ externalName: 'Ingeniera' }],
      resultId: 'result-positive',
      nextAction: 'Enviar cotización',
      nextActionDate: '2026-10-25',
    });
    expect(fakes.catalogReferences.assertItem).toHaveBeenCalledWith('crm.resultado_interaccion', 'result-positive', {
      field: 'resultId',
      requireActive: true,
      currentId: null,
      tx: TX,
    });
    expect(fakes.visits.update).toHaveBeenCalledWith(
      'visit-1',
      { statusId: 'visit-planned', rescheduleCount: 0 },
      expect.objectContaining({
        statusId: 'visit-done',
        actualStartAt: new Date('2026-10-01T15:00:00Z'),
        completionRecordedById: 'user-1',
        completionRecordedAt: expect.any(Date),
        nextActionDate: new Date('2026-10-25T00:00:00.000Z'),
      }),
      TX,
    );
    expect(fakes.visits.replaceParticipants).toHaveBeenCalledWith(
      'visit-1',
      'customer-1',
      'ATTENDED',
      [{ contactId: null, userId: null, externalName: 'Ingeniera', role: 'ATTENDED' }],
      'user-1',
      TX,
    );
    expect(fakes.visits.insertEvent).toHaveBeenCalledWith('visit-1', expect.objectContaining({ eventType: 'COMPLETED', fromStatusId: 'visit-planned', toStatusId: 'visit-done' }), TX);
    expect(fakes.audit.record).toHaveBeenCalledWith('crm.visit.completed', expect.anything(), expect.anything());
  });

  it('fecha real futura → 422 ACTUAL_DATE_IN_FUTURE; fin < inicio → 422 INVALID_DATE_RANGE', async () => {
    const fakes = setup();
    const future = new Date(Date.now() + HOUR).toISOString();
    await expect(fakes.service.complete(makeActor(ASESOR), 'visit-1', { actualStartAt: future })).rejects.toMatchObject({ code: 'ACTUAL_DATE_IN_FUTURE' });
    await expect(
      fakes.service.complete(makeActor(ASESOR), 'visit-1', { actualStartAt: '2026-10-01T15:00:00Z', actualEndAt: '2026-10-01T14:00:00Z' }),
    ).rejects.toMatchObject({ code: 'INVALID_DATE_RANGE' });
    expect(fakes.visits.update).not.toHaveBeenCalled();
  });

  it('corregir no genera evento ni cambia quién la registró; sobre una pendiente → 409', async () => {
    const done = makeVisit({ statusId: 'visit-done', actualStartAt: new Date('2026-10-01T15:00:00Z'), resultSummary: 'Bien' });
    const fakes = setup({ stored: done });
    await fakes.service.correctCompletion(makeActor(ASESOR), 'visit-1', { actualStartAt: '2026-10-01T15:00:00Z', resultSummary: 'Muy bien' });
    expect(fakes.visits.update).toHaveBeenCalledWith('visit-1', { statusId: 'visit-done', rescheduleCount: 0 }, { resultSummary: 'Muy bien', updatedById: 'user-1' }, TX);
    expect(fakes.visits.insertEvent).not.toHaveBeenCalled();
    expect(fakes.audit.record).toHaveBeenCalledWith('crm.visit.completion_corrected', expect.anything(), expect.anything());

    const pending = setup();
    await expect(pending.service.correctCompletion(makeActor(ASESOR), 'visit-1', { actualStartAt: '2026-10-01T15:00:00Z' })).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    });
  });
});

describe('VisitsService.confirm (RN-04.18, DM-20)', () => {
  const done = (overrides = {}): VisitRecord => makeVisit({ statusId: 'visit-done', actualStartAt: new Date('2026-10-01T15:00:00Z'), ...overrides });

  it('el dueño confirma con resumen: CONFIRMADA, confirmedBy = dueño, evento CONFIRMED', async () => {
    const fakes = setup({ stored: done() });
    await fakes.service.confirm(makeActor(ASESOR), 'visit-1', { confirmationSummary: 'Confirmada' });
    expect(fakes.visits.update).toHaveBeenCalledWith(
      'visit-1',
      { statusId: 'visit-done', rescheduleCount: 0, requiresSummary: false },
      expect.objectContaining({ statusId: 'visit-confirmed', confirmedById: 'user-1', confirmationSummary: 'Confirmada' }),
      TX,
    );
    expect(fakes.visits.insertEvent).toHaveBeenCalledWith('visit-1', expect.objectContaining({ eventType: 'CONFIRMED', performedById: 'user-1' }), TX);
  });

  it('sin resumen pero con comentarios previos → 200 (exige que sigan existiendo al escribir)', async () => {
    const fakes = setup({ stored: done({ comments: 'Todo bien' }) });
    await fakes.service.confirm(makeActor(ASESOR), 'visit-1', {});
    expect(fakes.visits.update).toHaveBeenCalledWith('visit-1', { statusId: 'visit-done', rescheduleCount: 0, requiresSummary: true }, expect.anything(), TX);
  });

  it('orden: 404 → 403 PERMISSION_DENIED → 403 VISIT_CONFIRMATION_OWNER_ONLY → 409 → 422', async () => {
    await expect(setup({ stored: null }).service.confirm(makeActor(ASESOR), 'visit-1', {})).rejects.toBeInstanceOf(ResourceNotFoundError);
    // Sin visitas.cerrar y además ajena: gana PERMISSION_DENIED.
    await expect(setup({ stored: done() }).service.confirm(makeActor(['visitas.ver', 'visitas.administrar'], 'manager-1'), 'visit-1', {})).rejects.toEqual(
      new PermissionDeniedError('visitas.cerrar'),
    );
    const ownerOnly = setup({ stored: done() }).service.confirm(makeActor([...ASESOR, 'visitas.administrar'], 'manager-1'), 'visit-1', { confirmationSummary: 'x' });
    await expect(ownerOnly).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(ownerOnly).rejects.toMatchObject({ code: 'VISIT_CONFIRMATION_OWNER_ONLY' });
    // Ajena y pendiente: el 403 de propiedad va antes que el 409 de estado.
    await expect(setup().service.confirm(makeActor([...ASESOR, 'visitas.administrar'], 'manager-1'), 'visit-1', {})).rejects.toMatchObject({
      code: 'VISIT_CONFIRMATION_OWNER_ONLY',
    });
    await expect(setup().service.confirm(makeActor(ASESOR), 'visit-1', { confirmationSummary: 'x' })).rejects.toBeInstanceOf(ResourceConflictError);
    await expect(setup({ stored: done() }).service.confirm(makeActor(ASESOR), 'visit-1', {})).rejects.toMatchObject({
      code: 'CONFIRMATION_SUMMARY_REQUIRED',
      details: [{ field: 'confirmationSummary', code: 'CONFIRMATION_SUMMARY_REQUIRED' }],
    });
  });
});

describe('VisitsService.reschedule / cancel (RN-04.19, RN-04.20)', () => {
  const future = new Date(Date.now() + 48 * HOUR);

  it('misma fila: fecha nueva, +1, REPROGRAMADA, conserva la duración y evento con fechas y motivo', async () => {
    const stored = makeVisit({ scheduledStartAt: new Date(Date.now() + 24 * HOUR), scheduledEndAt: new Date(Date.now() + 25 * HOUR) });
    const fakes = setup({ stored });
    await fakes.service.reschedule(makeActor(ASESOR), 'visit-1', { newScheduledStartAt: future.toISOString(), reasonId: 'reason-client', comment: 'Pide el cliente' });
    expect(fakes.catalogReferences.assertItem).toHaveBeenCalledWith('crm.motivo_reprogramacion', 'reason-client', { field: 'reasonId', requireActive: true, tx: TX });
    expect(fakes.visits.update).toHaveBeenCalledWith(
      'visit-1',
      { statusId: 'visit-planned', rescheduleCount: 0 },
      expect.objectContaining({
        statusId: 'visit-rescheduled',
        scheduledStartAt: future,
        scheduledEndAt: new Date(future.getTime() + HOUR),
        rescheduleCount: 1,
      }),
      TX,
    );
    expect(fakes.visits.insertEvent).toHaveBeenCalledWith(
      'visit-1',
      expect.objectContaining({
        eventType: 'RESCHEDULED',
        previousScheduledStartAt: stored.scheduledStartAt,
        newScheduledStartAt: future,
        reasonId: 'reason-client',
        reasonText: null,
        comment: 'Pide el cliente',
      }),
      TX,
    );
  });

  it('misma fecha, fecha pasada o sin motivo → 422; una realizada → 409', async () => {
    const stored = makeVisit({ scheduledStartAt: future });
    const fakes = setup({ stored });
    await expect(fakes.service.reschedule(makeActor(ASESOR), 'visit-1', { newScheduledStartAt: future.toISOString(), reasonText: 'x' })).rejects.toMatchObject({
      code: 'RESCHEDULE_SAME_DATE',
    });
    await expect(fakes.service.reschedule(makeActor(ASESOR), 'visit-1', { newScheduledStartAt: '2020-01-01T00:00:00Z', reasonText: 'x' })).rejects.toMatchObject({
      code: 'DATE_IN_PAST',
    });
    await expect(fakes.service.reschedule(makeActor(ASESOR), 'visit-1', { newScheduledStartAt: new Date(future.getTime() + HOUR).toISOString() })).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
    });
    const done = setup({ stored: makeVisit({ statusId: 'visit-done' }) });
    await expect(done.service.reschedule(makeActor(ASESOR), 'visit-1', { newScheduledStartAt: future.toISOString(), reasonText: 'x' })).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    });
  });

  it('cancelar: CANCELADA con cancelledAt y evento con motivo de su catálogo', async () => {
    const fakes = setup();
    await fakes.service.cancel(makeActor(ASESOR), 'visit-1', { reasonId: 'cancel-client' });
    expect(fakes.catalogReferences.assertItem).toHaveBeenCalledWith('crm.motivo_cancelacion', 'cancel-client', { field: 'reasonId', requireActive: true, tx: TX });
    expect(fakes.visits.update).toHaveBeenCalledWith('visit-1', expect.anything(), expect.objectContaining({ statusId: 'visit-cancelled', cancelledAt: expect.any(Date) }), TX);
    expect(fakes.visits.insertEvent).toHaveBeenCalledWith('visit-1', expect.objectContaining({ eventType: 'CANCELLED', toStatusId: 'visit-cancelled', reasonId: 'cancel-client' }), TX);
  });
});

describe('VisitsService adjuntos (F.4, D-04.18)', () => {
  const occurredAt = new Date('2026-10-12T15:00:00.000Z');

  it('evento: solo quien lo ejecutó y en 15 minutos; de otra visita → 404', async () => {
    const fakes = setup();
    fakes.visits.findEvent.mockResolvedValue({ id: 'event-1', visitId: 'visit-1', eventType: 'RESCHEDULED', performedById: 'user-1', occurredAt });
    await expect(
      fakes.service.assertCanAttachToEvent(makeActor(ASESOR), 'visit-1', 'event-1', new Date(occurredAt.getTime() + EVENT_ATTACHMENT_WINDOW_MS)),
    ).resolves.toBeUndefined();
    await expect(
      fakes.service.assertCanAttachToEvent(makeActor(ASESOR), 'visit-1', 'event-1', new Date(occurredAt.getTime() + EVENT_ATTACHMENT_WINDOW_MS + 1)),
    ).rejects.toMatchObject({ code: 'RECORD_READ_ONLY', details: [{ reason: 'EVENT_ATTACHMENT_WINDOW_EXPIRED' }] });
    await expect(fakes.service.assertCanAttachToEvent(makeActor(ASESOR, 'user-2'), 'visit-1', 'event-1', occurredAt)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
    fakes.visits.findEvent.mockResolvedValue(null);
    await expect(fakes.service.assertCanAttachToEvent(makeActor(ASESOR), 'visit-1', 'event-x', occurredAt)).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('visita confirmada o cancelada → 409 RECORD_READ_ONLY; realizada sí admite adjuntos', async () => {
    await expect(setup({ stored: makeVisit({ statusId: 'visit-confirmed' }) }).service.assertCanManageAttachments(makeActor(ASESOR), 'visit-1')).rejects.toMatchObject({
      code: 'RECORD_READ_ONLY',
    });
    await expect(setup({ stored: makeVisit({ statusId: 'visit-cancelled' }) }).service.assertCanManageAttachments(makeActor(ASESOR), 'visit-1')).rejects.toMatchObject({
      code: 'RECORD_READ_ONLY',
    });
    await expect(setup({ stored: makeVisit({ statusId: 'visit-done' }) }).service.assertCanManageAttachments(makeActor(ASESOR), 'visit-1')).resolves.toBeUndefined();
    await expect(setup().service.assertCanManageAttachments(makeActor(ASESOR, 'user-2'), 'visit-1')).rejects.toEqual(new PermissionDeniedError('visitas.administrar'));
  });
});

describe('VisitsService.scheduleConflicts (F.1)', () => {
  it('otro responsable exige visitas.administrar y que sea elegible', async () => {
    const fakes = setup();
    await expect(fakes.service.scheduleConflicts(makeActor(ASESOR), { ownerId: 'user-2', start: '2026-10-20T15:00:00Z' })).rejects.toEqual(
      new PermissionDeniedError('visitas.administrar'),
    );
    fakes.users.isEligibleOwner.mockResolvedValueOnce(false);
    await expect(
      fakes.service.scheduleConflicts(makeActor([...ASESOR, 'visitas.administrar']), { ownerId: 'user-2', start: '2026-10-20T15:00:00Z' }),
    ).rejects.toMatchObject({ code: 'OWNER_NOT_ELIGIBLE' });
  });

  it('con modo NO devuelve lista vacía sin consultar', async () => {
    const fakes = setup({ mode: 'NO', candidates: [candidate()] });
    expect(await fakes.service.scheduleConflicts(makeActor(ASESOR), { start: '2026-10-20T15:00:00Z' })).toEqual({ mode: 'NO', conflicts: [] });
    expect(fakes.visits.findScheduleCandidates).not.toHaveBeenCalled();
  });
});
