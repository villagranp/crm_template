import { businessToday, type FollowUpInteraction, type FollowUpSource, selectFollowUp } from './follow-up';

function interaction(id: string, occurredAt: string, extra: Partial<FollowUpInteraction> = {}): FollowUpInteraction {
  return {
    sourceType: 'ACTIVITY',
    sourceId: id,
    ownerId: `owner-${id}`,
    nextAction: null,
    nextActionDate: null,
    occurredAt: new Date(occurredAt),
    summary: `Resumen ${id}`,
    ...extra,
  };
}

function source(id: string, nextAction: string | null, nextActionDate: string | null): FollowUpSource {
  return { sourceType: 'VISIT', sourceId: id, ownerId: `owner-${id}`, nextAction, nextActionDate };
}

describe('follow-up (RN-04.34, D-04.9, PF-04.7)', () => {
  const TODAY = '2026-10-12';

  it('última interacción = mayor occurredAt; próxima acción = la fecha ≥ hoy más cercana', () => {
    const interactions = [interaction('A', '2026-10-01T10:00:00Z'), interaction('B', '2026-10-11T10:00:00Z')];
    const sources = [source('V1', 'Enviar cotización', '2026-10-20'), source('V2', 'Llamar', '2026-10-12'), source('V3', 'Vieja', '2026-10-11')];
    expect(selectFollowUp(interactions, sources, TODAY)).toEqual({
      lastInteraction: interactions[1],
      nextActionSource: sources[1],
      nextAction: 'Llamar',
      nextActionDate: '2026-10-12',
      responsibleId: 'owner-V2',
      notes: 'Resumen B',
    });
  });

  it('sin fechas vigentes: la próxima acción sin fecha de la última interacción', () => {
    const last = interaction('B', '2026-10-11T10:00:00Z', { nextAction: 'Visitar obra' });
    const result = selectFollowUp([interaction('A', '2026-10-01T10:00:00Z'), last], [source('V3', 'Vieja', '2026-10-01')], TODAY);
    expect(result).toMatchObject({ nextActionSource: last, nextAction: 'Visitar obra', nextActionDate: null, responsibleId: 'owner-B' });
  });

  it('ninguna próxima acción: responsable y notas de la última interacción; sin nada, todo nulo', () => {
    expect(selectFollowUp([interaction('A', '2026-10-01T10:00:00Z')], [], TODAY)).toMatchObject({
      nextActionSource: null,
      nextAction: null,
      nextActionDate: null,
      responsibleId: 'owner-A',
      notes: 'Resumen A',
    });
    expect(selectFollowUp([], [], TODAY)).toEqual({
      lastInteraction: null,
      nextActionSource: null,
      nextAction: null,
      nextActionDate: null,
      responsibleId: null,
      notes: null,
    });
  });

  it('"hoy" se calcula en la zona de negocio, no en UTC (RN-04.9)', () => {
    // 2026-10-13 03:00 UTC sigue siendo 12 de octubre en Guatemala (UTC-6).
    const now = new Date('2026-10-13T03:00:00Z');
    expect(businessToday(now, 'America/Guatemala')).toBe('2026-10-12');
    expect(businessToday(now, 'UTC')).toBe('2026-10-13');
    const sources = [source('V1', 'Llamar', '2026-10-12')];
    expect(selectFollowUp([], sources, businessToday(now, 'America/Guatemala')).nextAction).toBe('Llamar');
    expect(selectFollowUp([], sources, businessToday(now, 'UTC')).nextAction).toBeNull();
  });
});
