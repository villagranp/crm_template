import { ResourceNotFoundError } from '@/common/errors/application-error';
import type { AuditContext, AuditService } from '@/modules/audit/audit.service';
import type { BusinessClock } from '@/modules/commercial-metrics/business-clock';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import type { SafetyMinuteRecord, SafetyMinuteRepository } from './ports/safety-minute.repository.port';
import { type SafetyMinuteActor, SafetyMinutesService } from './safety-minutes.service';

const AUDIT: AuditContext = { correlationId: 'corr-1', actorId: 'sub-1', actorEmail: null, ipAddress: null };
const ACTOR: SafetyMinuteActor = { userId: 'user-1', audit: AUDIT };
/** 14 de octubre de 2026 en Guatemala (UTC-6): 15:00 UTC. */
const NOW = new Date('2026-10-14T15:00:00Z');
const TODAY = '2026-10-14';
const YESTERDAY = '2026-10-13';
const TOMORROW = '2026-10-15';

function minute(overrides: Partial<SafetyMinuteRecord> = {}): SafetyMinuteRecord {
  return {
    id: 'minute-1',
    message: 'Usa siempre el casco.',
    displayDate: TOMORROW,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    updatedBy: { id: 'user-1', displayName: 'Admin' },
    ...overrides,
  };
}

function setup(options: { existing?: SafetyMinuteRecord | null; duplicate?: boolean; notFoundOnWrite?: boolean; timeZone?: string } = {}) {
  const existing = options.existing === undefined ? minute() : options.existing;
  const repository = {
    search: jest.fn().mockResolvedValue({ items: [minute({ displayDate: YESTERDAY }), minute({ id: 'm2', displayDate: TODAY }), minute({ id: 'm3' })], totalItems: 3, page: 1, pageSize: 20 }),
    findById: jest.fn().mockResolvedValue(existing),
    findByDisplayDate: jest.fn().mockResolvedValue(existing),
    findMessageByDisplayDate: jest.fn().mockResolvedValue(existing ? { displayDate: existing.displayDate, message: existing.message } : null),
    create: jest.fn(async (input: Partial<SafetyMinuteRecord>) =>
      options.duplicate ? { ok: false as const, reason: 'DUPLICATE' as const } : { ok: true as const, record: minute({ ...input, id: 'minute-new' }) },
    ),
    update: jest.fn(async (_id: string, input: Partial<SafetyMinuteRecord>) =>
      options.duplicate
        ? { ok: false as const, reason: 'DUPLICATE' as const }
        : options.notFoundOnWrite
          ? { ok: false as const, reason: 'NOT_FOUND' as const }
          : { ok: true as const, record: minute({ ...(existing ?? {}), ...input }) },
    ),
    delete: jest.fn().mockResolvedValue(!options.notFoundOnWrite),
  } as unknown as jest.Mocked<SafetyMinuteRepository>;
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const parameters = { get: jest.fn().mockResolvedValue(options.timeZone ?? 'America/Guatemala') };
  const clock: BusinessClock = { now: () => NOW };
  const service = new SafetyMinutesService(repository, audit as unknown as AuditService, parameters as unknown as ParameterReader, clock);
  return { service, repository, audit, parameters };
}

describe('SafetyMinutesService (Ajustes 1, RN-AJ1.7–RN-AJ1.13)', () => {
  it('today: usa la zona de crm.zona_horaria_negocio, no UTC', async () => {
    const { service, parameters } = setup();
    await expect(service.today()).resolves.toBe(TODAY);
    expect(parameters.get).toHaveBeenCalledWith('crm.zona_horaria_negocio');
    // En UTC+14 ya es el día siguiente.
    await expect(setup({ timeZone: 'Pacific/Kiritimati' }).service.today()).resolves.toBe(TOMORROW);
  });

  it('search: defectos displayDate desc, filtros nulos y editable/deletable por fila', async () => {
    const { service, repository } = setup();
    const page = await service.search({ page: 1, pageSize: 20 });
    expect(repository.search).toHaveBeenCalledWith({ page: 1, pageSize: 20, from: null, to: null, sortBy: 'displayDate', sortOrder: 'desc' });
    expect(page.items.map((item) => [item.record.displayDate, item.editable, item.deletable])).toEqual([
      [YESTERDAY, false, false],
      [TODAY, true, false],
      [TOMORROW, true, true],
    ]);
  });

  it('get: 404 si no existe', async () => {
    await expect(setup({ existing: null }).service.get('x')).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('findToday: devuelve solo fecha y mensaje, o null si no hay (D-AJ1.3)', async () => {
    const { service, repository } = setup({ existing: minute({ displayDate: TODAY }) });
    await expect(service.findToday()).resolves.toEqual({ displayDate: TODAY, message: 'Usa siempre el casco.' });
    expect(repository.findMessageByDisplayDate).toHaveBeenCalledWith(TODAY);
    // Sin consultar autores: no usa la lectura completa.
    expect(repository.findByDisplayDate).not.toHaveBeenCalled();
    await expect(setup({ existing: null }).service.findToday()).resolves.toBeNull();
  });

  describe('create', () => {
    it('guarda quién y audita safety_minute.created con resourceType safety_minute', async () => {
      const { service, repository, audit } = setup();
      const view = await service.create({ message: 'Mensaje', displayDate: TOMORROW }, ACTOR);
      expect(repository.create).toHaveBeenCalledWith({ message: 'Mensaje', displayDate: TOMORROW }, 'user-1');
      expect(view).toMatchObject({ editable: true, deletable: true });
      expect(audit.record).toHaveBeenCalledWith('safety_minute.created', AUDIT, {
        resourceType: 'safety_minute',
        resourceId: 'minute-new',
        before: null,
        after: { message: 'Mensaje', displayDate: TOMORROW },
      });
    });

    it('hoy se puede programar; una fecha pasada es 422 SAFETY_MINUTE_PAST_DATE y no escribe', async () => {
      const { service, repository, audit } = setup();
      await expect(service.create({ message: 'x', displayDate: TODAY }, ACTOR)).resolves.toBeDefined();
      await expect(service.create({ message: 'x', displayDate: YESTERDAY }, ACTOR)).rejects.toMatchObject({ code: 'SAFETY_MINUTE_PAST_DATE' });
      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledTimes(1);
    });

    it('fecha ocupada → 409 SAFETY_MINUTE_DUPLICATE sin auditar', async () => {
      const { service, audit } = setup({ duplicate: true });
      await expect(service.create({ message: 'x', displayDate: TOMORROW }, ACTOR)).rejects.toMatchObject({
        code: 'SAFETY_MINUTE_DUPLICATE',
        details: [expect.objectContaining({ field: 'displayDate' })],
      });
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('edita mensaje y fecha de uno futuro y audita antes/después', async () => {
      const { service, repository, audit } = setup();
      const view = await service.update('minute-1', { message: 'Nuevo', displayDate: '2026-10-20' }, ACTOR);
      expect(repository.update).toHaveBeenCalledWith('minute-1', { message: 'Nuevo', displayDate: '2026-10-20' }, 'user-1', TODAY);
      expect(view.record).toMatchObject({ message: 'Nuevo', displayDate: '2026-10-20' });
      expect(audit.record).toHaveBeenCalledWith('safety_minute.updated', AUDIT, {
        resourceType: 'safety_minute',
        resourceId: 'minute-1',
        before: { message: 'Usa siempre el casco.', displayDate: TOMORROW },
        after: { message: 'Nuevo', displayDate: '2026-10-20' },
      });
    });

    it('el de hoy se puede editar (D-AJ1.5)', async () => {
      const { service } = setup({ existing: minute({ displayDate: TODAY }) });
      await expect(service.update('minute-1', { message: 'Corregido' }, ACTOR)).resolves.toMatchObject({ editable: true, deletable: false });
    });

    it('uno pasado → 409 SAFETY_MINUTE_LOCKED (past)', async () => {
      const { service, repository } = setup({ existing: minute({ displayDate: YESTERDAY }) });
      await expect(service.update('minute-1', { message: 'x' }, ACTOR)).rejects.toMatchObject({
        code: 'SAFETY_MINUTE_LOCKED',
        details: [expect.objectContaining({ reason: 'past' })],
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('mover a una fecha pasada → 422 SAFETY_MINUTE_PAST_DATE', async () => {
      const { service } = setup();
      await expect(service.update('minute-1', { displayDate: YESTERDAY }, ACTOR)).rejects.toMatchObject({ code: 'SAFETY_MINUTE_PAST_DATE' });
    });

    it('fecha nueva ocupada → 409 SAFETY_MINUTE_DUPLICATE', async () => {
      const { service } = setup({ duplicate: true });
      await expect(service.update('minute-1', { displayDate: '2026-10-20' }, ACTOR)).rejects.toMatchObject({ code: 'SAFETY_MINUTE_DUPLICATE' });
    });

    it('sin cambios no escribe ni audita', async () => {
      const { service, repository, audit } = setup();
      await service.update('minute-1', { message: 'Usa siempre el casco.', displayDate: TOMORROW }, ACTOR);
      await service.update('minute-1', {}, ACTOR);
      expect(repository.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('404 si no existe o si desaparece durante la escritura', async () => {
      await expect(setup({ existing: null }).service.update('x', { message: 'a' }, ACTOR)).rejects.toBeInstanceOf(ResourceNotFoundError);
      await expect(setup({ notFoundOnWrite: true }).service.update('x', { message: 'a' }, ACTOR)).rejects.toBeInstanceOf(ResourceNotFoundError);
    });
  });

  describe('carrera de medianoche (la fila pasa a pasado entre la lectura y la escritura)', () => {
    it('update: la escritura condicionada no escribe, relee y responde 409 LOCKED sin auditar', async () => {
      const { service, repository, audit } = setup();
      repository.update.mockResolvedValue({ ok: false, reason: 'NOT_FOUND' });
      repository.findById.mockResolvedValueOnce(minute({ displayDate: TODAY })).mockResolvedValueOnce(minute({ displayDate: YESTERDAY }));
      await expect(service.update('minute-1', { message: 'x' }, ACTOR)).rejects.toMatchObject({
        code: 'SAFETY_MINUTE_LOCKED',
        details: [expect.objectContaining({ reason: 'past' })],
      });
      expect(repository.update).toHaveBeenCalledWith('minute-1', { message: 'x' }, 'user-1', TODAY);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('update: si al releer ya no existe, 404', async () => {
      const { service, repository } = setup();
      repository.update.mockResolvedValue({ ok: false, reason: 'NOT_FOUND' });
      repository.findById.mockResolvedValueOnce(minute()).mockResolvedValueOnce(null);
      await expect(service.update('minute-1', { message: 'x' }, ACTOR)).rejects.toBeInstanceOf(ResourceNotFoundError);
    });

    it.each([
      ['pasó a ayer', YESTERDAY, 'past'],
      ['pasó a hoy', TODAY, 'today'],
    ])('delete: %s → 409 LOCKED (%s) sin auditar', async (_name, displayDate, reason) => {
      const { service, repository, audit } = setup();
      repository.delete.mockResolvedValue(false);
      repository.findById.mockResolvedValueOnce(minute()).mockResolvedValueOnce(minute({ displayDate }));
      await expect(service.delete('minute-1', ACTOR)).rejects.toMatchObject({
        code: 'SAFETY_MINUTE_LOCKED',
        details: [expect.objectContaining({ reason })],
      });
      expect(repository.delete).toHaveBeenCalledWith('minute-1', TODAY);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('delete: si al releer ya no existe, 404', async () => {
      const { service, repository } = setup();
      repository.delete.mockResolvedValue(false);
      repository.findById.mockResolvedValueOnce(minute()).mockResolvedValueOnce(null);
      await expect(service.delete('minute-1', ACTOR)).rejects.toBeInstanceOf(ResourceNotFoundError);
    });
  });

  describe('delete', () => {
    it('borra uno futuro y audita safety_minute.deleted con el estado previo', async () => {
      const { service, repository, audit } = setup();
      await service.delete('minute-1', ACTOR);
      expect(repository.delete).toHaveBeenCalledWith('minute-1', TODAY);
      expect(audit.record).toHaveBeenCalledWith('safety_minute.deleted', AUDIT, {
        resourceType: 'safety_minute',
        resourceId: 'minute-1',
        before: { message: 'Usa siempre el casco.', displayDate: TOMORROW },
        after: null,
      });
    });

    it.each([
      ['hoy', TODAY, 'today'],
      ['una pasada', YESTERDAY, 'past'],
    ])('%s → 409 SAFETY_MINUTE_LOCKED (%s) y no borra', async (_name, displayDate, reason) => {
      const { service, repository, audit } = setup({ existing: minute({ displayDate }) });
      await expect(service.delete('minute-1', ACTOR)).rejects.toMatchObject({
        code: 'SAFETY_MINUTE_LOCKED',
        details: [expect.objectContaining({ reason })],
      });
      expect(repository.delete).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('404 si no existe o ya fue borrada', async () => {
      await expect(setup({ existing: null }).service.delete('x', ACTOR)).rejects.toBeInstanceOf(ResourceNotFoundError);
      await expect(setup({ notFoundOnWrite: true }).service.delete('x', ACTOR)).rejects.toBeInstanceOf(ResourceNotFoundError);
    });
  });
});
