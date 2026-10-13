import { type CatalogMetadata, type CatalogStateItem, lowestActive, metadataFlag } from './catalog-state';

/**
 * Ciclo de vida de una actividad por la semántica de `crm.estado_actividad`
 * (RN-04.4, RN-04.27, RN-04.28, RN-04.30, D-04.6, D-04.7). Funciones puras.
 *
 * ```text
 * OPEN (PENDIENTE, EN_PROCESO) ──completar──▶ COMPLETED   (solo lectura, no se elimina)
 *                              ──cancelar───▶ CANCELLED   (solo lectura, se puede eliminar)
 * ```
 */

export interface ActivityStatusSemantics {
  readonly isOpen: boolean;
  readonly isCompleted: boolean;
  readonly isCancelled: boolean;
}

export type ActivityStatusGroup = 'OPEN' | 'COMPLETED' | 'CANCELLED';

/** Operaciones sobre una actividad existente (`allowedActions` de F.2). */
export const ACTIVITY_ACTIONS = ['EDIT', 'COMPLETE', 'CANCEL', 'DELETE'] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export type LifecycleViolation = 'RECORD_READ_ONLY' | 'INVALID_STATUS_TRANSITION';

export function activityStatusSemantics(metadata: CatalogMetadata): ActivityStatusSemantics {
  return {
    isOpen: metadataFlag(metadata, 'isOpen'),
    isCompleted: metadataFlag(metadata, 'isCompleted'),
    isCancelled: metadataFlag(metadata, 'isCancelled'),
  };
}

/**
 * Grupo del estado. El registro de semántica garantiza exactamente un indicador
 * por elemento (00 §3.3); un estado sin indicador válido se trata como cerrado
 * (`COMPLETED`: solo lectura y no eliminable), la opción más restrictiva.
 */
export function activityStatusGroup(semantics: ActivityStatusSemantics): ActivityStatusGroup {
  if (semantics.isOpen) return 'OPEN';
  if (semantics.isCancelled) return 'CANCELLED';
  return 'COMPLETED';
}

/**
 * ¿Qué impide el estado? `null` si la operación es válida desde ese grupo.
 * - Editar fuera de `OPEN` → `RECORD_READ_ONLY` (RN-04.27).
 * - Completar o cancelar fuera de `OPEN` → `INVALID_STATUS_TRANSITION` (RN-04.28, RN-04.30).
 * - Eliminar una completada → `RECORD_READ_ONLY` (es historia, DM-33, D-04.7).
 */
export function activityStateViolation(group: ActivityStatusGroup, action: ActivityAction): LifecycleViolation | null {
  switch (action) {
    case 'EDIT':
      return group === 'OPEN' ? null : 'RECORD_READ_ONLY';
    case 'COMPLETE':
    case 'CANCEL':
      return group === 'OPEN' ? null : 'INVALID_STATUS_TRANSITION';
    case 'DELETE':
      return group === 'COMPLETED' ? 'RECORD_READ_ONLY' : null;
  }
}

/** Estado destino por semántica: el activo con el indicador y menor `sortOrder` (RN-04.8). */
export function pickActivityStatus(
  items: readonly CatalogStateItem[],
  flag: keyof ActivityStatusSemantics,
): CatalogStateItem | null {
  return lowestActive(items, (item) => metadataFlag(item.metadata, flag));
}
