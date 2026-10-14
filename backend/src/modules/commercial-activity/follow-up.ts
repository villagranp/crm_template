/**
 * Seguimiento comercial por cliente o proyecto (RN-04.34, D-04.9, DM-22). Definición
 * de referencia para el modelo de lectura (que la aplica en SQL) y para Inicio.
 * Funciones puras.
 */

export interface FollowUpSource {
  readonly sourceType: 'VISIT' | 'ACTIVITY';
  readonly sourceId: string;
  readonly ownerId: string;
  readonly nextAction: string | null;
  /** Fecha de calendario `YYYY-MM-DD` (columna `date`). */
  readonly nextActionDate: string | null;
}

export interface FollowUpInteraction extends FollowUpSource {
  readonly occurredAt: Date;
  readonly summary: string | null;
}

export interface FollowUpSelection<I extends FollowUpInteraction, S extends FollowUpSource> {
  readonly lastInteraction: I | null;
  /** Registro que aporta la próxima acción: con fecha ≥ hoy, o la última interacción (sin fecha). */
  readonly nextActionSource: S | I | null;
  readonly nextAction: string | null;
  readonly nextActionDate: string | null;
  /** Dueño del registro que aporta la próxima acción o, si no hay, de la última interacción. */
  readonly responsibleId: string | null;
  /** Resumen de la última interacción. */
  readonly notes: string | null;
}

/** "Hoy" como `YYYY-MM-DD` en la zona horaria de negocio (`crm.zona_horaria_negocio`, RN-04.9, D-04.17). */
export function businessToday(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * - Última interacción: la de mayor `occurredAt` (desempate por id, estable).
 * - Próxima acción: entre `sources` (visitas y actividades no eliminadas del
 *   cliente/proyecto), la `nextAction` con `nextActionDate ≥ today` más cercana; si
 *   ninguna tiene fecha válida, la `nextAction` sin fecha de la última interacción.
 * - Responsable: dueño del registro que aporta la próxima acción, o de la última interacción.
 */
export function selectFollowUp<I extends FollowUpInteraction, S extends FollowUpSource>(
  interactions: readonly I[],
  sources: readonly S[],
  today: string,
): FollowUpSelection<I, S> {
  const lastInteraction =
    [...interactions].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || a.sourceId.localeCompare(b.sourceId))[0] ?? null;

  const upcoming = sources
    .filter((source) => source.nextAction !== null && source.nextAction.trim() !== '' && source.nextActionDate !== null && source.nextActionDate >= today)
    .sort((a, b) => (a.nextActionDate ?? '').localeCompare(b.nextActionDate ?? '') || a.sourceId.localeCompare(b.sourceId))[0];

  const fallback =
    lastInteraction && lastInteraction.nextAction !== null && lastInteraction.nextAction.trim() !== '' && lastInteraction.nextActionDate === null
      ? lastInteraction
      : null;

  const nextActionSource: S | I | null = upcoming ?? fallback;
  return {
    lastInteraction,
    nextActionSource,
    nextAction: nextActionSource?.nextAction ?? null,
    nextActionDate: upcoming ? upcoming.nextActionDate : null,
    responsibleId: nextActionSource?.ownerId ?? lastInteraction?.ownerId ?? null,
    notes: lastInteraction?.summary ?? null,
  };
}
