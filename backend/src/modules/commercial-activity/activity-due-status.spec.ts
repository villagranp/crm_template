import { activityDueBucket, comparePendingActivities, dueSoonLimit, type PendingOrderKey } from './activity-due-status';

const NOW = new Date('2026-10-12T15:00:00.000Z');
const HOURS = 48;
const at = (iso: string): Date => new Date(iso);

describe('activityDueBucket (RN-04.31, PF-04.1)', () => {
  it.each([
    ['vencida: vencimiento pasado', '2026-10-12T14:59:59.999Z', 'OVERDUE'],
    ['próxima: vence justo ahora', '2026-10-12T15:00:00.000Z', 'DUE_SOON'],
    ['próxima: dentro de 47 h', '2026-10-14T14:00:00.000Z', 'DUE_SOON'],
    ['próxima: límite exacto de 48 h (incluido)', '2026-10-14T15:00:00.000Z', 'DUE_SOON'],
    ['pendiente: 1 ms después del límite', '2026-10-14T15:00:00.001Z', 'PENDING'],
  ])('%s', (_label, due, expected) => {
    expect(activityDueBucket({ isOpen: true, dueAt: at(due) }, NOW, HOURS)).toBe(expected);
  });

  it('sin vencimiento es pendiente', () => {
    expect(activityDueBucket({ isOpen: true, dueAt: null }, NOW, HOURS)).toBe('PENDING');
  });

  it('completada o cancelada (no abierta) no tiene grupo, aunque esté vencida', () => {
    expect(activityDueBucket({ isOpen: false, dueAt: at('2026-01-01T00:00:00Z') }, NOW, HOURS)).toBeNull();
    expect(activityDueBucket({ isOpen: false, dueAt: null }, NOW, HOURS)).toBeNull();
  });

  it('el umbral es el parámetro: con 1 h, a las 2 h ya no es próxima', () => {
    const due = at('2026-10-12T17:00:00.000Z');
    expect(activityDueBucket({ isOpen: true, dueAt: due }, NOW, 48)).toBe('DUE_SOON');
    expect(activityDueBucket({ isOpen: true, dueAt: due }, NOW, 1)).toBe('PENDING');
    expect(dueSoonLimit(NOW, 1)).toEqual(at('2026-10-12T16:00:00.000Z'));
  });
});

describe('comparePendingActivities (RN-04.32, PF-04.2)', () => {
  const row = (code: string, weight: number, due: string | null, scheduled: string | null = null): PendingOrderKey => ({
    code,
    priorityWeight: weight,
    dueAt: due ? at(due) : null,
    scheduledAt: scheduled ? at(scheduled) : null,
  });

  it('peso desc, vencimiento asc con nulos al final, programada asc y código', () => {
    const rows = [
      row('ACT-7', 2, null),
      row('ACT-1', 1, '2026-10-01T00:00:00Z'),
      row('ACT-5', 3, null),
      row('ACT-4', 3, '2026-10-20T00:00:00Z'),
      row('ACT-3', 3, '2026-10-13T00:00:00Z', '2026-10-13T09:00:00Z'),
      row('ACT-2', 3, '2026-10-13T00:00:00Z', '2026-10-12T09:00:00Z'),
      row('ACT-6', 2, '2026-10-30T00:00:00Z'),
      row('ACT-8', 2, null),
    ];
    expect([...rows].sort(comparePendingActivities).map((item) => item.code)).toEqual([
      'ACT-2',
      'ACT-3',
      'ACT-4',
      'ACT-5',
      'ACT-6',
      'ACT-7',
      'ACT-8',
      'ACT-1',
    ]);
  });
});
