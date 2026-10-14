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
 * Lectura de proyectos y oportunidades para validar los vínculos de visitas y
 * actividades (RN-04.1, RN-04.2).
 *
 * Puerto **propio del Módulo 4**, conservado al integrar el Módulo 3 (2026-10-13, 04
 * «Precisiones de implementación»): 03 no publica una guardia de referencia que
 * cubra estas reglas. `ProjectAccessService.findVisible` y el repositorio de
 * oportunidades filtran los eliminados (un único `404`), así que no distinguen
 * `UNKNOWN_REFERENCE` de `INACTIVE_REFERENCE`, ni conservan un vínculo ya guardado a un
 * proyecto eliminado; y una oportunidad es visible aquí por su proyecto
 * (`proyectos.ver`) **o** por `oportunidades.ver` (H.3), no solo por lo segundo. El
 * bloqueo del proyecto y `last_activity_at` sí son los del Módulo 3
 * (`LinkedProjectsService`).
 */
export interface CommercialLinkReader {
  /** `null` si no existe. No filtra eliminados ni alcance: lo informa para que el caso de uso decida el error. */
  findProject(projectId: string, visibility: VisibilityScope, tx?: TransactionContext): Promise<ProjectLink | null>;
  findOpportunity(
    opportunityId: string,
    visibility: { readonly projects: VisibilityScope; readonly opportunities: VisibilityScope },
    tx?: TransactionContext,
  ): Promise<OpportunityLink | null>;
}
