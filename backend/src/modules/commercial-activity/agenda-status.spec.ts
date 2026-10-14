import type { VisitStatusGroup } from './visit-lifecycle';
import { activityAgendaDate, activityAgendaGroup, isUnregisteredVisit, visitAgendaDate, visitAgendaGroup } from './agenda-status';

const NOW = new Date('2026-10-12T15:00:00.000Z');
const PAST = new Date('2026-10-10T10:00:00.000Z');
const FUTURE = new Date('2026-10-20T10:00:00.000Z');

describe('agenda-status (RN-04.35, RN-04.36, PF-04.6)', () => {
  it('grupo de una visita', () => {
    const groups: VisitStatusGroup[] = ['PENDING', 'DONE', 'CONFIRMED', 'CANCELLED'];
    expect(groups.map(visitAgendaGroup)).toEqual(['PENDING', 'DONE', 'CONFIRMED', 'CANCELLED']);
  });

  it('grupo de una actividad: abierta vencida es OVERDUE', () => {
    expect(activityAgendaGroup('OPEN', PAST, NOW)).toBe('OVERDUE');
    expect(activityAgendaGroup('OPEN', FUTURE, NOW)).toBe('PENDING');
    expect(activityAgendaGroup('OPEN', null, NOW)).toBe('PENDING');
    expect(activityAgendaGroup('COMPLETED', PAST, NOW)).toBe('DONE');
    expect(activityAgendaGroup('CANCELLED', PAST, NOW)).toBe('CANCELLED');
  });

  it('fecha de una visita: real si está realizada o confirmada; si no, la vigente', () => {
    expect(visitAgendaDate({ group: 'DONE', actualStartAt: PAST, scheduledStartAt: FUTURE })).toBe(PAST);
    expect(visitAgendaDate({ group: 'CONFIRMED', actualStartAt: PAST, scheduledStartAt: FUTURE })).toBe(PAST);
    expect(visitAgendaDate({ group: 'PENDING', actualStartAt: PAST, scheduledStartAt: FUTURE })).toBe(FUTURE);
    expect(visitAgendaDate({ group: 'DONE', actualStartAt: null, scheduledStartAt: FUTURE })).toBe(FUTURE);
  });

  it('fecha de una actividad: programada, si no vencimiento, si no ninguna', () => {
    expect(activityAgendaDate({ scheduledAt: PAST, dueAt: FUTURE })).toBe(PAST);
    expect(activityAgendaDate({ scheduledAt: null, dueAt: FUTURE })).toBe(FUTURE);
    expect(activityAgendaDate({ scheduledAt: null, dueAt: null })).toBeNull();
  });

  it('"Sin registrar": pendiente con la hora planificada ya pasada (RN-04.22)', () => {
    expect(isUnregisteredVisit('PENDING', PAST, NOW)).toBe(true);
    expect(isUnregisteredVisit('PENDING', FUTURE, NOW)).toBe(false);
    expect(isUnregisteredVisit('DONE', PAST, NOW)).toBe(false);
  });
});
