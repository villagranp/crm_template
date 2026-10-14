import type { CatalogStateItem } from './catalog-state';
import {
  pickVisitStatus,
  VISIT_OPERATIONS,
  visitOperationsFor,
  visitStateViolation,
  visitStatusGroup,
  visitStatusSemantics,
} from './visit-lifecycle';

const FLAGS = ['isPending', 'isDone', 'isConfirmed', 'isCancelled'] as const;

function item(
  code: string,
  flag: (typeof FLAGS)[number],
  sortOrder: number,
  extra: Record<string, unknown> = {},
  isActive = true,
): CatalogStateItem {
  return {
    id: `id-${code}`,
    code,
    isActive,
    sortOrder,
    metadata: { ...Object.fromEntries(FLAGS.map((key) => [key, key === flag])), isRescheduled: false, ...extra },
  };
}

const SEEDED = [
  item('PROGRAMADA', 'isPending', 1),
  item('REPROGRAMADA', 'isPending', 2, { isRescheduled: true }),
  item('REALIZADA', 'isDone', 3),
  item('CONFIRMADA', 'isConfirmed', 4),
  item('CANCELADA', 'isCancelled', 5),
];

describe('visit-lifecycle (PF-04.3)', () => {
  it('agrupa por semántica; REPROGRAMADA es pendiente', () => {
    const groups = SEEDED.map((status) => [status.code, visitStatusGroup(visitStatusSemantics(status.metadata))]);
    expect(groups).toEqual([
      ['PROGRAMADA', 'PENDING'],
      ['REPROGRAMADA', 'PENDING'],
      ['REALIZADA', 'DONE'],
      ['CONFIRMADA', 'CONFIRMED'],
      ['CANCELADA', 'CANCELLED'],
    ]);
    expect(visitStatusSemantics(SEEDED[1]!.metadata).isRescheduled).toBe(true);
    // Sin indicador válido: terminal, la opción más restrictiva.
    expect(visitStatusGroup(visitStatusSemantics(null))).toBe('CANCELLED');
  });

  it('tabla completa de transiciones permitidas y prohibidas por grupo', () => {
    const table = Object.fromEntries(
      (['PENDING', 'DONE', 'CONFIRMED', 'CANCELLED'] as const).map((group) => [
        group,
        Object.fromEntries(VISIT_OPERATIONS.map((operation) => [operation, visitStateViolation(group, operation)])),
      ]),
    );
    const IST = 'INVALID_STATUS_TRANSITION';
    expect(table).toEqual({
      PENDING: { EDIT: null, COMPLETE: null, CORRECT_COMPLETION: IST, CONFIRM: IST, RESCHEDULE: null, CANCEL: null },
      DONE: { EDIT: 'RECORD_READ_ONLY', COMPLETE: IST, CORRECT_COMPLETION: null, CONFIRM: null, RESCHEDULE: IST, CANCEL: IST },
      CONFIRMED: { EDIT: 'RECORD_READ_ONLY', COMPLETE: IST, CORRECT_COMPLETION: IST, CONFIRM: IST, RESCHEDULE: IST, CANCEL: IST },
      CANCELLED: { EDIT: 'RECORD_READ_ONLY', COMPLETE: IST, CORRECT_COMPLETION: IST, CONFIRM: IST, RESCHEDULE: IST, CANCEL: IST },
    });
    expect(visitOperationsFor('DONE')).toEqual(['CORRECT_COMPLETION', 'CONFIRM']);
    expect(visitOperationsFor('CONFIRMED')).toEqual([]);
  });

  it('estados destino por semántica, no por código (RN-04.8, D-04.3)', () => {
    expect(pickVisitStatus(SEEDED, 'INITIAL')?.code).toBe('PROGRAMADA');
    expect(pickVisitStatus(SEEDED, 'RESCHEDULED')?.code).toBe('REPROGRAMADA');
    expect(pickVisitStatus(SEEDED, 'DONE')?.code).toBe('REALIZADA');
    expect(pickVisitStatus(SEEDED, 'CONFIRMED')?.code).toBe('CONFIRMADA');
    expect(pickVisitStatus(SEEDED, 'CANCELLED')?.code).toBe('CANCELADA');
  });

  it('el inicial nunca es el reprogramado aunque tenga menor orden; sin reprogramada activa se usa el inicial', () => {
    const reordered = [
      item('REPROGRAMADA', 'isPending', 0, { isRescheduled: true }),
      ...SEEDED.filter((status) => status.code !== 'REPROGRAMADA'),
    ];
    expect(pickVisitStatus(reordered, 'INITIAL')?.code).toBe('PROGRAMADA');
    const inactive = SEEDED.map((status) => (status.code === 'REPROGRAMADA' ? { ...status, isActive: false } : status));
    expect(pickVisitStatus(inactive, 'RESCHEDULED')?.code).toBe('PROGRAMADA');
  });
});
