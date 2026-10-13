import { useEffect, useState } from 'react';

import { SEARCH_DEBOUNCE_MS } from '@/components/data';

import { fromDateTimeLocalValue } from '../common/date-time';

import type { ScheduleConflictMode, ScheduleConflictsQuery } from './visits.api';
import { useScheduleConflicts } from './visits.queries';

export interface VisitScheduleConflictsInput {
  /** `crm.visitas.validar_conflicto_horario` (de `form-options`); con `NO` no se consulta. */
  mode: ScheduleConflictMode | undefined;
  /** Responsable; `undefined` = el usuario (por defecto del backend). */
  ownerId?: string;
  /** Valores `datetime-local` del formulario. */
  start: string;
  end: string;
  /** Al editar o reprogramar: la propia visita no cuenta. */
  excludeVisitId?: string;
  enabled?: boolean;
}

/** Espera tras el último cambio de fecha, fin o responsable antes de consultar. */
export const CONFLICT_CHECK_DEBOUNCE_MS = SEARCH_DEBOUNCE_MS;

function buildQuery(input: VisitScheduleConflictsInput): ScheduleConflictsQuery | null {
  if (input.enabled === false || !input.mode || input.mode === 'NO') {
    return null;
  }
  const start = fromDateTimeLocalValue(input.start);
  if (!start) {
    return null;
  }
  const end = fromDateTimeLocalValue(input.end);
  const query: ScheduleConflictsQuery = { start };
  if (end && new Date(end).getTime() >= new Date(start).getTime()) {
    query.end = end;
  }
  if (input.ownerId) {
    query.ownerId = input.ownerId;
  }
  if (input.excludeVisitId) {
    query.excludeVisitId = input.excludeVisitId;
  }
  return query;
}

function sameQuery(left: ScheduleConflictsQuery | null, right: ScheduleConflictsQuery | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Aviso de conflicto horario al planificar o reprogramar (04 §E.7, RN-04.14):
 * consulta `GET /visits/schedule-conflicts` con *debounce* cuando cambian la
 * fecha, el fin o el responsable. Es sólo un aviso: nunca deshabilita "Guardar"
 * (con `AVISAR` el backend guarda igualmente; con `BLOQUEAR` responde `409`).
 */
export function useVisitScheduleConflicts(input: VisitScheduleConflictsInput) {
  const next = buildQuery(input);
  const [query, setQuery] = useState<ScheduleConflictsQuery | null>(next);
  const nextKey = JSON.stringify(next);

  useEffect(() => {
    const parsed = JSON.parse(nextKey) as ScheduleConflictsQuery | null;
    if (parsed === null) {
      setQuery(null);
      return undefined;
    }
    const timer = setTimeout(() => setQuery((current) => (sameQuery(current, parsed) ? current : parsed)), CONFLICT_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [nextKey]);

  const result = useScheduleConflicts(query);
  const active = query !== null && sameQuery(query, next);
  return {
    /** Solapes de la última consulta vigente (vacío mientras no hay datos). */
    conflicts: active ? (result.data?.conflicts ?? []) : [],
    mode: input.mode,
    isChecking: query !== null && (result.isFetching || !active),
    isError: active && result.isError,
  };
}
