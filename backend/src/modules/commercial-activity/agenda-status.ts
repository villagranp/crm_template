import type { ActivityStatusGroup } from './activity-lifecycle';
import type { VisitStatusGroup } from './visit-lifecycle';

/**
 * Estado y fecha de un evento en la agenda (RN-04.35, RN-04.36, RN-04.22). Definición
 * de referencia para la agenda, los detalles (`status.group`) e Inicio (G.2).
 */

export const AGENDA_STATUS_GROUPS = ['PENDING', 'OVERDUE', 'DONE', 'CONFIRMED', 'CANCELLED'] as const;
export type AgendaStatusGroup = (typeof AGENDA_STATUS_GROUPS)[number];

/** Visita: `PENDING` (isPending), `DONE` (isDone), `CONFIRMED`, `CANCELLED`. */
export function visitAgendaGroup(group: VisitStatusGroup): AgendaStatusGroup {
  return group;
}

/** Actividad: abierta → `PENDING`, o `OVERDUE` si `due_at < now`; completada → `DONE`; cancelada → `CANCELLED`. */
export function activityAgendaGroup(group: ActivityStatusGroup, dueAt: Date | null, now: Date): AgendaStatusGroup {
  switch (group) {
    case 'OPEN':
      return dueAt !== null && dueAt.getTime() < now.getTime() ? 'OVERDUE' : 'PENDING';
    case 'COMPLETED':
      return 'DONE';
    case 'CANCELLED':
      return 'CANCELLED';
  }
}

/**
 * Fecha de una visita en la agenda: la real si está realizada o confirmada (y la
 * tiene), si no la planificada **vigente** (una reprogramada aparece una sola vez).
 */
export function visitAgendaDate(visit: {
  readonly group: VisitStatusGroup;
  readonly actualStartAt: Date | null;
  readonly scheduledStartAt: Date;
}): Date {
  const done = visit.group === 'DONE' || visit.group === 'CONFIRMED';
  return done && visit.actualStartAt !== null ? visit.actualStartAt : visit.scheduledStartAt;
}

/** Fecha de una actividad en la agenda: `scheduled_at`, si no `due_at`; sin ninguna no está en el calendario. */
export function activityAgendaDate(activity: { readonly scheduledAt: Date | null; readonly dueAt: Date | null }): Date | null {
  return activity.scheduledAt ?? activity.dueAt;
}

/** "Sin registrar" (RN-04.22, D-04.16): pendiente cuya hora planificada ya pasó. Derivado, no es un estado. */
export function isUnregisteredVisit(group: VisitStatusGroup, scheduledStartAt: Date, now: Date): boolean {
  return group === 'PENDING' && scheduledStartAt.getTime() < now.getTime();
}
