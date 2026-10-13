import type { VisibilityScope } from '@/modules/access/visibility-scope';

/**
 * Visibilidad de visitas y actividades (04 H.3, 00 §4.2, DM-13). La resuelve el
 * servicio con `VisibilityScopeResolver` y el adaptador la traduce a SQL (nunca el
 * controlador):
 *
 * ```text
 * direct    → owner_id IN (:ownerIds) OR customers.country_id IN (:countryIds)   (o ALL)
 * inherited → EXISTS proyecto vinculado, no eliminado, dentro del alcance de proyectos
 * ```
 *
 * Eventos, participantes y adjuntos heredan la visibilidad de su visita o actividad.
 */
export interface CommercialVisibility {
  /** Alcance del permiso de ver del recurso (`actividades.ver` o `visitas.ver`). */
  readonly direct: VisibilityScope;
  /** Alcance de `proyectos.ver` sobre `projects.owner_id` / `projects.country_id` (herencia de solo lectura, DM-13). */
  readonly inherited: VisibilityScope;
}

/** `DIRECT`: por el alcance propio del permiso; `INHERITED`: solo por un proyecto vinculado visible (solo lectura). */
export type CommercialAccess = 'DIRECT' | 'INHERITED';
