import {
  ACTIVITY_ACTIONS,
  activityStateViolation,
  activityStatusGroup,
  activityStatusSemantics,
  pickActivityStatus,
} from './activity-lifecycle';
import type { CatalogStateItem } from './catalog-state';

const item = (code: string, flag: string, sortOrder: number, isActive = true): CatalogStateItem => ({
  id: `id-${code}`,
  code,
  isActive,
  sortOrder,
  metadata: { isOpen: flag === 'isOpen', isCompleted: flag === 'isCompleted', isCancelled: flag === 'isCancelled' },
});

describe('activity-lifecycle', () => {
  it('lee la semántica del metadata y agrupa', () => {
    expect(activityStatusGroup(activityStatusSemantics({ isOpen: true, isCompleted: false, isCancelled: false }))).toBe('OPEN');
    expect(activityStatusGroup(activityStatusSemantics({ isOpen: false, isCompleted: true, isCancelled: false }))).toBe('COMPLETED');
    expect(activityStatusGroup(activityStatusSemantics({ isCancelled: true }))).toBe('CANCELLED');
    // Sin indicador válido: cerrado (solo lectura), la opción más restrictiva.
    expect(activityStatusGroup(activityStatusSemantics(null))).toBe('COMPLETED');
    expect(activityStatusGroup(activityStatusSemantics({ isOpen: 'true' }))).toBe('COMPLETED');
  });

  it('tabla completa de operaciones por grupo (RN-04.27, RN-04.28, RN-04.30)', () => {
    const table = Object.fromEntries(
      (['OPEN', 'COMPLETED', 'CANCELLED'] as const).map((group) => [
        group,
        Object.fromEntries(ACTIVITY_ACTIONS.map((action) => [action, activityStateViolation(group, action)])),
      ]),
    );
    expect(table).toEqual({
      OPEN: { EDIT: null, COMPLETE: null, CANCEL: null, DELETE: null },
      COMPLETED: {
        EDIT: 'RECORD_READ_ONLY',
        COMPLETE: 'INVALID_STATUS_TRANSITION',
        CANCEL: 'INVALID_STATUS_TRANSITION',
        DELETE: 'RECORD_READ_ONLY',
      },
      CANCELLED: { EDIT: 'RECORD_READ_ONLY', COMPLETE: 'INVALID_STATUS_TRANSITION', CANCEL: 'INVALID_STATUS_TRANSITION', DELETE: null },
    });
  });

  it('estado destino: activo con el indicador y menor sortOrder (RN-04.8)', () => {
    const items = [
      item('EN_PROCESO', 'isOpen', 2),
      item('PENDIENTE', 'isOpen', 1),
      item('ABIERTA_VIEJA', 'isOpen', 0, false),
      item('COMPLETADA', 'isCompleted', 3),
      item('CANCELADA', 'isCancelled', 4),
    ];
    expect(pickActivityStatus(items, 'isOpen')?.code).toBe('PENDIENTE');
    expect(pickActivityStatus(items, 'isCompleted')?.code).toBe('COMPLETADA');
    expect(pickActivityStatus(items, 'isCancelled')?.code).toBe('CANCELADA');
    expect(pickActivityStatus([item('X', 'isOpen', 1, false)], 'isOpen')).toBeNull();
  });
});
