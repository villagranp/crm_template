import { type CatalogMetadata, type CatalogStateItem, lowestActive, metadataFlag } from './catalog-state';
import type { LifecycleViolation } from './activity-lifecycle';

/**
 * Ciclo de vida de una visita por la semántica de `crm.estado_visita` (RN-04.4,
 * RN-04.15–RN-04.21, DM-20, D-04.3, D-04.6). Funciones puras: las usan los casos
 * de uso de visitas y calculan `allowedActions` junto con la política de acceso.
 *
 * ```text
 * PENDING (PROGRAMADA, REPROGRAMADA) ─ editar, reprogramar (→ REPROGRAMADA), registrar realizada, cancelar
 * DONE (REALIZADA)                   ─ corregir realización, confirmar (solo el dueño, DM-20)
 * CONFIRMED / CANCELLED              ─ solo lectura (terminales)
 * ```
 */

export interface VisitStatusSemantics {
  readonly isPending: boolean;
  readonly isDone: boolean;
  readonly isConfirmed: boolean;
  readonly isCancelled: boolean;
  /** Modificador de un estado pendiente: `REPROGRAMADA` (D-04.3). */
  readonly isRescheduled: boolean;
}

export type VisitStatusGroup = 'PENDING' | 'DONE' | 'CONFIRMED' | 'CANCELLED';

/** Operaciones del ciclo de vida (`allowedActions` de `VisitDetailDto`, F.1). */
export const VISIT_OPERATIONS = ['EDIT', 'COMPLETE', 'CORRECT_COMPLETION', 'CONFIRM', 'RESCHEDULE', 'CANCEL'] as const;
export type VisitOperation = (typeof VISIT_OPERATIONS)[number];

const OPERATIONS_BY_GROUP: Readonly<Record<VisitStatusGroup, readonly VisitOperation[]>> = {
  PENDING: ['EDIT', 'COMPLETE', 'RESCHEDULE', 'CANCEL'],
  DONE: ['CORRECT_COMPLETION', 'CONFIRM'],
  CONFIRMED: [],
  CANCELLED: [],
};

/** Estado destino de cada operación (`EDIT` y `CORRECT_COMPLETION` no cambian el estado). */
export type VisitStatusTarget = 'INITIAL' | 'RESCHEDULED' | 'DONE' | 'CONFIRMED' | 'CANCELLED';

export function visitStatusSemantics(metadata: CatalogMetadata): VisitStatusSemantics {
  return {
    isPending: metadataFlag(metadata, 'isPending'),
    isDone: metadataFlag(metadata, 'isDone'),
    isConfirmed: metadataFlag(metadata, 'isConfirmed'),
    isCancelled: metadataFlag(metadata, 'isCancelled'),
    isRescheduled: metadataFlag(metadata, 'isRescheduled'),
  };
}

/**
 * Grupo del estado. Sin indicador válido (el registro de semántica lo impide) se
 * trata como terminal (`CANCELLED`: ninguna operación), la opción más restrictiva.
 */
export function visitStatusGroup(semantics: VisitStatusSemantics): VisitStatusGroup {
  if (semantics.isPending) return 'PENDING';
  if (semantics.isDone) return 'DONE';
  if (semantics.isConfirmed) return 'CONFIRMED';
  return 'CANCELLED';
}

/** Operaciones que el **estado** admite (sin permisos ni propiedad, que añade la política). */
export function visitOperationsFor(group: VisitStatusGroup): readonly VisitOperation[] {
  return OPERATIONS_BY_GROUP[group];
}

/**
 * `null` si el estado admite la operación. Editar la planificación fuera de un
 * estado pendiente → `RECORD_READ_ONLY` (RN-04.15); cualquier otra operación no
 * admitida → `INVALID_STATUS_TRANSITION` (RN-04.16–RN-04.21).
 */
export function visitStateViolation(group: VisitStatusGroup, operation: VisitOperation): LifecycleViolation | null {
  if (OPERATIONS_BY_GROUP[group].includes(operation)) return null;
  return operation === 'EDIT' ? 'RECORD_READ_ONLY' : 'INVALID_STATUS_TRANSITION';
}

/**
 * Estado destino por semántica (RN-04.8, RN-04.19, D-04.3):
 * - `INITIAL`: activo con `isPending` y **sin** `isRescheduled`, menor `sortOrder`;
 * - `RESCHEDULED`: el activo con `isRescheduled`; si no hay (desactivado), el inicial;
 * - `DONE` / `CONFIRMED` / `CANCELLED`: activo con el indicador, menor `sortOrder`.
 */
export function pickVisitStatus(items: readonly CatalogStateItem[], target: VisitStatusTarget): CatalogStateItem | null {
  const has = (item: CatalogStateItem, key: keyof VisitStatusSemantics): boolean => metadataFlag(item.metadata, key);
  switch (target) {
    case 'INITIAL':
      return lowestActive(items, (item) => has(item, 'isPending') && !has(item, 'isRescheduled'));
    case 'RESCHEDULED':
      return lowestActive(items, (item) => has(item, 'isPending') && has(item, 'isRescheduled')) ?? pickVisitStatus(items, 'INITIAL');
    case 'DONE':
      return lowestActive(items, (item) => has(item, 'isDone'));
    case 'CONFIRMED':
      return lowestActive(items, (item) => has(item, 'isConfirmed'));
    case 'CANCELLED':
      return lowestActive(items, (item) => has(item, 'isCancelled'));
  }
}
