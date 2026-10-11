export const VISIBILITY_SCOPE_READER = Symbol('VISIBILITY_SCOPE_READER');

/** Equipos alcanzados por el alcance `TEAM` de un usuario y las personas que contienen. */
export interface TeamScopeRecord {
  /** Equipos donde el usuario es miembro o responsable, más todos sus subequipos (recursivo). */
  readonly teamIds: readonly string[];
  /** Miembros y responsables de esos equipos (sin repetir). Puede incluir al propio usuario. */
  readonly userIds: readonly string[];
}

/**
 * Lecturas que necesita `VisibilityScopeResolver` (00 §4.2) además de la
 * instantánea de acceso (`ACCESS_REPOSITORY`). Puerto propio para que el
 * resolutor no conozca Prisma (ADR-004).
 */
export interface VisibilityScopeReader {
  /** País del usuario (`users.country_id`, DM-14) o `null`. */
  findUserCountryId(userId: string): Promise<string | null>;
  /**
   * Alcance `TEAM` (DM-12): equipos activos y no eliminados donde el usuario es
   * miembro (`team_members`) o responsable (`teams.manager_id`), con sus
   * subequipos activos a cualquier profundidad, y sus miembros y responsables.
   * Un equipo inactivo o eliminado no concede nada ni propaga a sus hijos.
   */
  findTeamScope(userId: string): Promise<TeamScopeRecord>;
}
