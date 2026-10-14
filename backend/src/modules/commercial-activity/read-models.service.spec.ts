import { RequestValidationError, ResourceNotFoundError } from '@/common/errors/application-error';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import { AgendaService, commercialDetailPath, resolveKinds } from './agenda.service';
import type { CommercialActorResolver, ReadModelScopes } from './commercial-actor.resolver';
import { InteractionsService } from './interactions.service';
import type { AgendaItemRecord, AgendaReadModel } from './ports/agenda-read-model.port';
import type { FollowUpRecord, InteractionReadModel } from './ports/interaction-read-model.port';
import { makeActor, ownScope } from './testing/activity-fixtures';

const SCOPES: ReadModelScopes = { visits: { direct: ownScope(), inherited: ownScope() }, activities: null };

function item(overrides: Partial<AgendaItemRecord> = {}): AgendaItemRecord {
  return {
    kind: 'VISIT',
    id: 'visit-1',
    code: 'VIS-2026-00001',
    date: new Date('2026-10-20T15:00:00Z'),
    endDate: null,
    typeId: null,
    typeLabel: null,
    subject: 'Objetivo',
    customer: { id: 'customer-1', crmCode: 'CLI-1', legalName: 'Cliente' },
    project: null,
    owner: { id: 'user-1', displayName: 'Asesora' },
    status: { id: 'visit-planned', code: 'PROGRAMADA', label: 'Programada', group: 'PENDING' },
    isRescheduled: false,
    isUnregistered: false,
    hasReminder: false,
    attachmentCount: 0,
    ...overrides,
  };
}

function setup(): {
  agenda: AgendaService;
  interactions: InteractionsService;
  agendaModel: { list: jest.Mock; calendar: jest.Mock };
  interactionModel: { list: jest.Mock; followUps: jest.Mock; listAttachments: jest.Mock };
} {
  const actors = { readScopes: jest.fn(async () => SCOPES) } as unknown as CommercialActorResolver;
  const parameters = {
    get: jest.fn(async (key: string) => (key === 'crm.zona_horaria_negocio' ? 'America/Guatemala' : 60)),
  } as unknown as ParameterReader;
  const agendaModel = {
    list: jest.fn(async () => ({ items: [item()], totalItems: 1, page: 1, pageSize: 20 })),
    calendar: jest.fn(async () => ({ items: [item(), item({ kind: 'ACTIVITY', id: 'act-1', typeLabel: 'Llamada' })], truncated: true })),
  };
  const interactionModel = {
    list: jest.fn(async () => ({ items: [], totalItems: 0, page: 1, pageSize: 50 })),
    followUps: jest.fn(async () => ({ items: [] as FollowUpRecord[], totalItems: 0, page: 1, pageSize: 1 })),
    listAttachments: jest.fn(async () => []),
  };
  const agenda = new AgendaService(agendaModel as unknown as AgendaReadModel, actors, parameters);
  const interactions = new InteractionsService(interactionModel as unknown as InteractionReadModel, agenda, actors, parameters);
  return { agenda, interactions, agendaModel, interactionModel };
}

describe('AgendaService (04 F.3, D-04.12)', () => {
  it('resolveKinds: kind explícito; solo tipo de actividad → solo actividades; nada → ambas', () => {
    expect(resolveKinds(['VISIT'], ['type-1'])).toEqual(['VISIT']);
    expect(resolveKinds(undefined, ['type-1'])).toEqual(['ACTIVITY']);
    expect(resolveKinds([], undefined)).toEqual(['VISIT', 'ACTIVITY']);
  });

  it('calendario: rango > 42 días → 400 RANGE_TOO_WIDE sin consultar; to < from → 400 VALIDATION_FAILED', async () => {
    const fakes = setup();
    await expect(fakes.agenda.calendar(makeActor(['visitas.ver']), { from: '2026-10-01T00:00:00Z', to: '2026-11-30T00:00:00Z' })).rejects.toMatchObject({
      code: 'RANGE_TOO_WIDE',
      details: [{ field: 'to', maxDays: 42 }],
    });
    await expect(fakes.agenda.calendar(makeActor(['visitas.ver']), { from: '2026-10-10T00:00:00Z', to: '2026-10-01T00:00:00Z' })).rejects.toBeInstanceOf(
      RequestValidationError,
    );
    expect(fakes.agendaModel.calendar).not.toHaveBeenCalled();
  });

  it('calendario: tope de 500, truncado y etiqueta "Visita" + ruta del detalle', async () => {
    const fakes = setup();
    const result = await fakes.agenda.calendar(makeActor(['visitas.ver']), { from: '2026-10-01T00:00:00Z', to: '2026-11-12T00:00:00Z' });
    expect(fakes.agendaModel.calendar).toHaveBeenCalledWith(expect.objectContaining({ kinds: ['VISIT', 'ACTIVITY'], defaultDurationMinutes: 60 }), SCOPES, 500);
    expect(result.truncated).toBe(true);
    expect(result.items.map((view) => [view.typeLabel, view.detailPath])).toEqual([
      ['Visita', '/actividad/visitas/visit-1'],
      ['Llamada', '/actividad/actividades/act-1'],
    ]);
    expect(commercialDetailPath('ACTIVITY', 'x')).toBe('/actividad/actividades/x');
  });
});

describe('InteractionsService (04 F.3, RN-04.34)', () => {
  it('trace exige exactamente uno de customerId o projectId', async () => {
    const fakes = setup();
    await expect(fakes.interactions.trace(makeActor(['visitas.ver']), {})).rejects.toBeInstanceOf(RequestValidationError);
    await expect(fakes.interactions.trace(makeActor(['visitas.ver']), { customerId: 'a', projectId: 'b' })).rejects.toBeInstanceOf(RequestValidationError);
  });

  it('trace sin ninguna visita ni actividad visible → 404 (no revela si existe)', async () => {
    const fakes = setup();
    await expect(fakes.interactions.trace(makeActor(['visitas.ver']), { customerId: 'customer-1' })).rejects.toBeInstanceOf(ResourceNotFoundError);
    expect(fakes.interactionModel.followUps).toHaveBeenCalledWith(
      expect.objectContaining({ groupBy: 'CUSTOMER', customerId: 'customer-1', projectId: null, today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
      SCOPES,
    );
  });

  it('seguimiento: la última interacción de una visita se etiqueta "Visita"', async () => {
    const fakes = setup();
    fakes.interactionModel.followUps.mockResolvedValueOnce({
      items: [
        {
          customer: { id: 'customer-1', crmCode: 'CLI-1', legalName: 'Cliente' },
          project: null,
          lastInteraction: { sourceType: 'VISIT', sourceId: 'visit-1', sourceCode: 'VIS-1', occurredAt: new Date(), typeLabel: null, summary: 'Bien' },
          nextAction: null,
          nextActionDate: null,
          nextActionSource: null,
          responsible: null,
          notes: 'Bien',
          attachmentCount: 0,
        },
      ],
      totalItems: 1,
      page: 1,
      pageSize: 20,
    });
    const page = await fakes.interactions.followUps(makeActor(['visitas.ver']), { page: 1, pageSize: 20, sortOrder: 'desc' });
    expect(page.items[0]?.lastInteraction?.typeLabel).toBe('Visita');
  });
});
