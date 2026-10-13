import {
  effectiveEnd,
  findScheduleConflicts,
  type ScheduleCandidate,
  scheduleConflictDecision,
  type ScheduledVisit,
} from './schedule-conflict';

const at = (time: string): Date => new Date(`2026-10-20T${time}:00.000Z`);

function visit(id: string, start: string, end: string | null, overrides: Partial<ScheduledVisit> = {}): ScheduledVisit {
  return { id, ownerId: 'owner-1', scheduledStartAt: at(start), scheduledEndAt: end ? at(end) : null, isCancelled: false, ...overrides };
}

function candidate(start: string, end: string | null, excludeVisitId: string | null = null): ScheduleCandidate {
  return { ownerId: 'owner-1', start: at(start), end: end ? at(end) : null, excludeVisitId };
}

const ids = (rows: readonly ScheduledVisit[]): string[] => rows.map((row) => row.id);

describe('schedule-conflict (RN-04.14, D-04.2, PF-04.4)', () => {
  it('fin efectivo: el planificado o la duración por defecto', () => {
    expect(effectiveEnd(at('10:00'), at('10:30'), 60)).toEqual(at('10:30'));
    expect(effectiveEnd(at('10:00'), null, 60)).toEqual(at('11:00'));
  });

  it('solape parcial sí; contiguo (fin = inicio) no', () => {
    const others = [visit('A', '09:00', '10:30'), visit('B', '11:00', '12:00'), visit('C', '08:00', '10:00')];
    expect(ids(findScheduleConflicts(candidate('10:00', '11:00'), others, 60))).toEqual(['A']);
  });

  it('sin fin usa la duración por defecto, en la candidata y en las otras', () => {
    expect(ids(findScheduleConflicts(candidate('10:00', null), [visit('A', '10:45', null)], 60))).toEqual(['A']);
    expect(ids(findScheduleConflicts(candidate('10:00', null), [visit('A', '10:45', null)], 30))).toEqual([]);
    expect(ids(findScheduleConflicts(candidate('11:30', '12:00'), [visit('B', '11:00', null)], 60))).toEqual(['B']);
  });

  it('excluye canceladas, la propia visita (excludeVisitId) y otros responsables; ordena por inicio', () => {
    const others = [
      visit('LATE', '10:30', '11:30'),
      visit('CANCELLED', '10:00', '11:00', { isCancelled: true }),
      visit('SELF', '10:00', '11:00'),
      visit('OTHER-OWNER', '10:00', '11:00', { ownerId: 'owner-2' }),
      visit('EARLY', '09:30', '10:15'),
    ];
    expect(ids(findScheduleConflicts(candidate('10:00', '11:00', 'SELF'), others, 60))).toEqual(['EARLY', 'LATE']);
  });

  it('modos NO / AVISAR / BLOQUEAR', () => {
    expect(scheduleConflictDecision('NO', 3)).toEqual({ evaluate: false, block: false, warn: false });
    expect(scheduleConflictDecision('AVISAR', 1)).toEqual({ evaluate: true, block: false, warn: true });
    expect(scheduleConflictDecision('AVISAR', 0)).toEqual({ evaluate: true, block: false, warn: false });
    expect(scheduleConflictDecision('BLOQUEAR', 1)).toEqual({ evaluate: true, block: true, warn: false });
    expect(scheduleConflictDecision('BLOQUEAR', 0)).toEqual({ evaluate: true, block: false, warn: false });
  });
});
