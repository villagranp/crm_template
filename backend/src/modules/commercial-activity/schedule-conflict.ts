/**
 * Conflictos horarios de visitas (RN-04.14, D-04.2): "preparar … sin bloquear".
 * Solo visitas del **mismo responsable**, no canceladas, cuyo intervalo
 * `[inicio, fin efectivo)` se cruza con el de la visita evaluada. Las actividades
 * no cuentan. Funciones puras: el adaptador acota las candidatas por responsable y
 * rango con el índice `(owner_id, scheduled_start_at)` y esto decide el solape.
 */

export const SCHEDULE_CONFLICT_MODES = ['NO', 'AVISAR', 'BLOQUEAR'] as const;
export type ScheduleConflictMode = (typeof SCHEDULE_CONFLICT_MODES)[number];

const MINUTE_MS = 60_000;

/** Fin efectivo: el fin planificado o, si falta, inicio + `crm.visitas.duracion_por_defecto_minutos` (RN-04.13). */
export function effectiveEnd(start: Date, end: Date | null, defaultDurationMinutes: number): Date {
  return end ?? new Date(start.getTime() + defaultDurationMinutes * MINUTE_MS);
}

/** Intervalos semiabiertos `[inicio, fin)`: dos visitas contiguas (fin = inicio) no se solapan. */
export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export interface ScheduleCandidate {
  readonly ownerId: string;
  readonly start: Date;
  readonly end: Date | null;
  /** Visita que se edita o reprograma: no compite consigo misma. */
  readonly excludeVisitId: string | null;
}

export interface ScheduledVisit {
  readonly id: string;
  readonly ownerId: string;
  readonly scheduledStartAt: Date;
  readonly scheduledEndAt: Date | null;
  /** `isCancelled` del estado: una cancelada no cuenta. */
  readonly isCancelled: boolean;
}

/** Visitas de `others` que entran en conflicto con la candidata, en orden de inicio. */
export function findScheduleConflicts<T extends ScheduledVisit>(
  candidate: ScheduleCandidate,
  others: readonly T[],
  defaultDurationMinutes: number,
): T[] {
  const candidateEnd = effectiveEnd(candidate.start, candidate.end, defaultDurationMinutes);
  return others
    .filter(
      (visit) =>
        visit.id !== candidate.excludeVisitId &&
        visit.ownerId === candidate.ownerId &&
        !visit.isCancelled &&
        intervalsOverlap(
          candidate.start,
          candidateEnd,
          visit.scheduledStartAt,
          effectiveEnd(visit.scheduledStartAt, visit.scheduledEndAt, defaultDurationMinutes),
        ),
    )
    .sort((a, b) => a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime());
}

export interface ScheduleConflictDecision {
  /** Con `NO` no se evalúa (ni se consulta la base). */
  readonly evaluate: boolean;
  /** Solo con `BLOQUEAR` y algún conflicto: `409 SCHEDULE_CONFLICT`, nada se escribe. */
  readonly block: boolean;
  /** Con `AVISAR`: se guarda y la respuesta lleva `scheduleConflicts`. */
  readonly warn: boolean;
}

export function scheduleConflictDecision(mode: ScheduleConflictMode, conflictCount: number): ScheduleConflictDecision {
  if (mode === 'NO') return { evaluate: false, block: false, warn: false };
  const found = conflictCount > 0;
  return { evaluate: true, block: mode === 'BLOQUEAR' && found, warn: mode === 'AVISAR' && found };
}
