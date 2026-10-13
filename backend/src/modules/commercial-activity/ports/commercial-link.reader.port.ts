import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { VisibilityScope } from '@/modules/access/visibility-scope';

export const COMMERCIAL_LINK_READER = Symbol('COMMERCIAL_LINK_READER');

/** Proyecto que una visita o actividad quiere referenciar (RN-04.1, RN-04.2). */
export interface ProjectLink {
  readonly id: string;
  readonly customerId: string;
  readonly isDeleted: boolean;
  /** Dentro del alcance de `proyectos.ver` del actor (sobre `owner_id` / `country_id`). */
  readonly isVisible: boolean;
}

export interface OpportunityLink {
  readonly id: string;
  readonly projectId: string;
  readonly isDeleted: boolean;
  /** Visible por su proyecto (alcance de `proyectos.ver`, proyecto no eliminado) o por el alcance de `oportunidades.ver`. */
  readonly isVisible: boolean;
}

/**
 * Lectura y bloqueo de proyectos y oportunidades para validar los vínculos de
 * visitas y actividades, y escritura de `projects.last_activity_at` (RN-04.11,
 * 00 §2.6, la única escritura fuera de lo propio).
 *
 * Puerto **propio del Módulo 4** mientras el Módulo 3 no publique su guardia de
 * referencia ("Precisiones de implementación (2026-10-12)" de 04): cuando exista,
 * `findProject`/`findOpportunity` se sustituyen por ella.
 */
export interface CommercialLinkReader {
  /** `null` si no existe. No filtra eliminados ni alcance: lo informa para que el caso de uso decida el error. */
  findProject(projectId: string, visibility: VisibilityScope, tx?: TransactionContext): Promise<ProjectLink | null>;
  findOpportunity(
    opportunityId: string,
    visibility: { readonly projects: VisibilityScope; readonly opportunities: VisibilityScope },
    tx?: TransactionContext,
  ): Promise<OpportunityLink | null>;
  /**
   * Bloquea las filas de proyecto (`FOR NO KEY UPDATE`, en orden de id) hasta el fin
   * de la transacción: serializa con la eliminación del proyecto y con otras
   * mutaciones que también actualizan `last_activity_at`, sin interbloqueos por
   * subir de `FOR SHARE` a escritura.
   */
  lockProjects(projectIds: readonly string[], tx: TransactionContext): Promise<void>;
  /** `projects.last_activity_at = at` (sin tocar `updated_at`). */
  touchProjects(projectIds: readonly string[], at: Date, tx: TransactionContext): Promise<void>;
}
