import { activityDueBucket } from '@/modules/commercial-activity/activity-due-status';
import { activityStatusGroup, activityStatusSemantics } from '@/modules/commercial-activity/activity-lifecycle';
import { visitStatusGroup, visitStatusSemantics } from '@/modules/commercial-activity/visit-lifecycle';

import {
  activityCategory,
  activityStateGroup,
  activityStatusIdsByGroup,
  closedStageIds,
  isActivityDueSoon,
  isDoneUnconfirmedVisit,
  isFunnelStage,
  matchesOpportunityStatus,
  OPPORTUNITY_STATUS_FILTERS,
  type OpportunityCategory,
  opportunityCategory,
  opportunityCountsAreConsistent,
  type OpportunityOutcomeCode,
  openStageIds,
  type SemanticCatalogItem,
  tallyOpportunities,
  upcomingVisitsLimit,
  visitCategory,
  visitStatusIdsByCategory,
} from './metric-definitions';

/**
 * Definiciones que añade Reportes (05 G.3, K.2 paso 1): PF-05.1, PF-05.2 y la
 * equivalencia con las reglas de referencia del Módulo 4 (visitas y actividades).
 */

function item(code: string, metadata: Record<string, unknown> | null): SemanticCatalogItem {
  return { id: `id-${code}`, code, label: code, metadata };
}

const CONTACTADO = item('CONTACTADO', { order: 1, isClosed: false, outcome: null, inFunnel: true });
const COTIZANDO = item('COTIZANDO', { order: 2, isClosed: false, outcome: null, inFunnel: true });
const GANADO = item('GANADO', { order: 3, isClosed: true, outcome: 'WON', inFunnel: true });
const PERDIDO = item('PERDIDO', { order: 4, isClosed: true, outcome: 'LOST', inFunnel: false });
/** Etapa nueva añadida al catálogo (PF-05.1): sin cambiar código. */
const NEGOCIANDO = item('NEGOCIANDO', { order: 3, isClosed: false, outcome: null, inFunnel: true });

const visitFlags = (flag: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  isPending: false,
  isDone: false,
  isConfirmed: false,
  isCancelled: false,
  [flag]: true,
  ...extra,
});
const PROGRAMADA = item('PROGRAMADA', visitFlags('isPending', { isRescheduled: false }));
const REPROGRAMADA = item('REPROGRAMADA', visitFlags('isPending', { isRescheduled: true }));
const REALIZADA = item('REALIZADA', visitFlags('isDone'));
const CONFIRMADA = item('CONFIRMADA', visitFlags('isConfirmed'));
const CANCELADA_V = item('CANCELADA', visitFlags('isCancelled'));
const SIN_INDICADOR = item('ROTO', { isPending: false, isDone: false, isConfirmed: false, isCancelled: false });

const activityFlags = (flag: string): Record<string, unknown> => ({ isOpen: false, isCompleted: false, isCancelled: false, [flag]: true });
const PENDIENTE = item('PENDIENTE', activityFlags('isOpen'));
const EN_PROCESO = item('EN_PROCESO', activityFlags('isOpen'));
const COMPLETADA = item('COMPLETADA', activityFlags('isCompleted'));
const CANCELADA_A = item('CANCELADA', activityFlags('isCancelled'));

describe('metric-definitions · oportunidades (RN-05.20–RN-05.27)', () => {
  it('PF-05.1: categoriza por la semántica del catálogo, también una etapa nueva NEGOCIANDO (isClosed = false)', () => {
    expect(opportunityCategory(CONTACTADO, null)).toBe('OPEN');
    expect(opportunityCategory(NEGOCIANDO, null)).toBe('OPEN');
    expect(opportunityCategory(GANADO, 'WON')).toBe('WON_FULL');
    expect(opportunityCategory(GANADO, 'PARTIAL')).toBe('PARTIAL');
    expect(opportunityCategory(PERDIDO, 'LOST')).toBe('LOST');
    expect(opportunityCategory(GANADO, null)).toBe('CLOSED_NO_RESULT');
    // Abierta aunque tenga un resultado heredado: manda la etapa vigente (DEF-A).
    expect(opportunityCategory(COTIZANDO, 'WON')).toBe('OPEN');
    expect(openStageIds([CONTACTADO, NEGOCIANDO, GANADO])).toEqual(['id-CONTACTADO', 'id-NEGOCIANDO']);
    expect(closedStageIds([CONTACTADO, NEGOCIANDO, GANADO, PERDIDO])).toEqual(['id-GANADO', 'id-PERDIDO']);
    expect([CONTACTADO, GANADO, PERDIDO].map(isFunnelStage)).toEqual([true, true, false]);
  });

  it('el filtro `status` (RN-05.32): WON incluye PARTIAL; CLOSED, todas las cerradas', () => {
    const table: Record<string, OpportunityCategory[]> = {};
    for (const status of OPPORTUNITY_STATUS_FILTERS) {
      table[status] = (['OPEN', 'WON_FULL', 'PARTIAL', 'LOST', 'CLOSED_NO_RESULT'] as const).filter((category) => matchesOpportunityStatus(category, status));
    }
    expect(table).toEqual({
      OPEN: ['OPEN'],
      CLOSED: ['WON_FULL', 'PARTIAL', 'LOST', 'CLOSED_NO_RESULT'],
      WON: ['WON_FULL', 'PARTIAL'],
      PARTIAL: ['PARTIAL'],
      LOST: ['LOST'],
      CLOSED_NO_RESULT: ['CLOSED_NO_RESULT'],
    });
  });

  it('PF-05.2: el invariante de conteos se cumple con cualquier combinación de WON/PARTIAL/LOST/sin resultado', () => {
    const stages = [CONTACTADO, COTIZANDO, GANADO, PERDIDO, NEGOCIANDO];
    const outcomes: (OpportunityOutcomeCode | null)[] = ['WON', 'PARTIAL', 'LOST', null];
    const all: OpportunityCategory[] = [];
    for (const stage of stages) {
      for (const outcome of outcomes) {
        all.push(opportunityCategory(stage, outcome));
        const counts = tallyOpportunities(all);
        expect(opportunityCountsAreConsistent(counts)).toBe(true);
      }
    }
    expect(tallyOpportunities(all)).toEqual({ total: 20, open: 12, won: 4, wonFull: 2, partial: 2, lost: 2, closedWithoutResult: 2 });
    expect(opportunityCountsAreConsistent({ total: 3, open: 1, won: 1, wonFull: 1, partial: 0, lost: 0, closedWithoutResult: 0 })).toBe(false);
    expect(opportunityCountsAreConsistent({ total: 2, open: 0, won: 1, wonFull: 0, partial: 2, lost: 1, closedWithoutResult: 0 })).toBe(false);
  });
});

describe('metric-definitions · visitas (RN-05.38, DEF-E) y actividades (RN-05.41, DEF-D)', () => {
  const VISIT_STATUSES = [PROGRAMADA, REPROGRAMADA, REALIZADA, CONFIRMADA, CANCELADA_V, SIN_INDICADOR];

  it('categoría de visita: REPROGRAMADA es programada; sin indicador válido, cancelada (como el Módulo 4)', () => {
    expect(VISIT_STATUSES.map(visitCategory)).toEqual(['SCHEDULED', 'SCHEDULED', 'COMPLETED', 'CONFIRMED', 'CANCELLED', 'CANCELLED']);
    const fromModule4 = { PENDING: 'SCHEDULED', DONE: 'COMPLETED', CONFIRMED: 'CONFIRMED', CANCELLED: 'CANCELLED' } as const;
    for (const status of VISIT_STATUSES) {
      expect(visitCategory(status)).toBe(fromModule4[visitStatusGroup(visitStatusSemantics(status.metadata))]);
    }
    // DEF-E (firma de 01): estado `isDone` sin `confirmed_at` = la categoría `COMPLETED` de Reportes.
    const doneUnconfirmed = (status: SemanticCatalogItem): boolean =>
      isDoneUnconfirmedVisit({ isDone: status.metadata?.['isDone'] === true, confirmedAt: null });
    expect(VISIT_STATUSES.map(doneUnconfirmed)).toEqual(VISIT_STATUSES.map((status) => visitCategory(status) === 'COMPLETED'));
    expect(isDoneUnconfirmedVisit({ isDone: true, confirmedAt: new Date() })).toBe(false);
    expect(visitStatusIdsByCategory(VISIT_STATUSES)).toEqual({
      SCHEDULED: ['id-PROGRAMADA', 'id-REPROGRAMADA'],
      COMPLETED: ['id-REALIZADA'],
      CONFIRMED: ['id-CONFIRMADA'],
      CANCELLED: ['id-CANCELADA', 'id-ROTO'],
    });
  });

  it('"visita próxima": hasta ahora + días (límite incluido)', () => {
    expect(upcomingVisitsLimit(new Date('2026-10-13T00:00:00Z'), 7).toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });

  it('categoría de actividad: pendiente y vencida disjuntas, igual que la bandeja del Módulo 4', () => {
    const now = new Date('2026-10-13T12:00:00Z');
    const past = new Date(now.getTime() - 1);
    const future = new Date(now.getTime() + 1);
    expect(activityCategory(PENDIENTE, past, now)).toBe('OVERDUE');
    expect(activityCategory(EN_PROCESO, now, now)).toBe('PENDING');
    expect(activityCategory(PENDIENTE, future, now)).toBe('PENDING');
    expect(activityCategory(PENDIENTE, null, now)).toBe('PENDING');
    expect(activityCategory(COMPLETADA, past, now)).toBe('COMPLETED');
    expect(activityCategory(CANCELADA_A, past, now)).toBe('CANCELLED');
    for (const status of [PENDIENTE, EN_PROCESO, COMPLETADA, CANCELADA_A]) {
      expect(activityStateGroup(status)).toBe(activityStatusGroup(activityStatusSemantics(status.metadata)));
      for (const dueAt of [past, now, future, null]) {
        const bucket = activityDueBucket({ isOpen: activityStateGroup(status) === 'OPEN', dueAt }, now, 48);
        const category = activityCategory(status, dueAt, now);
        if (bucket === null) expect(['COMPLETED', 'CANCELLED']).toContain(category);
        else expect(category).toBe(bucket === 'OVERDUE' ? 'OVERDUE' : 'PENDING');
        expect(isActivityDueSoon(status, dueAt, now, 48)).toBe(bucket === 'DUE_SOON');
      }
    }
    expect(activityStatusIdsByGroup([PENDIENTE, EN_PROCESO, COMPLETADA, CANCELADA_A])).toEqual({
      open: ['id-PENDIENTE', 'id-EN_PROCESO'],
      completed: ['id-COMPLETADA'],
      cancelled: ['id-CANCELADA'],
    });
  });

  it('"por vencer" incluye el límite superior y excluye las vencidas y las que no vencen', () => {
    const now = new Date('2026-10-13T12:00:00Z');
    const limit = new Date(now.getTime() + 48 * 3_600_000);
    expect(isActivityDueSoon(PENDIENTE, limit, now, 48)).toBe(true);
    expect(isActivityDueSoon(PENDIENTE, new Date(limit.getTime() + 1), now, 48)).toBe(false);
    expect(isActivityDueSoon(PENDIENTE, null, now, 48)).toBe(false);
    expect(isActivityDueSoon(PENDIENTE, new Date(now.getTime() - 1), now, 48)).toBe(false);
    expect(isActivityDueSoon(COMPLETADA, limit, now, 48)).toBe(false);
  });
});
