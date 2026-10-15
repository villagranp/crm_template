import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';

export const TEAMS_REPOSITORY = Symbol('TEAMS_REPOSITORY');

/** Campos por los que se puede ordenar la lista (lista blanca, API-STANDARDS). */
export const TEAM_SORT_FIELDS = ['name', 'code', 'createdAt', 'updatedAt'] as const;
export type TeamSortField = (typeof TEAM_SORT_FIELDS)[number];

export interface TeamRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  parentName: string | null;
  manager: { id: string; displayName: string } | null;
  isActive: boolean;
  /** Miembros del equipo. */
  memberCount: number;
  /** Subequipos directos no eliminados. */
  childCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMemberRecord {
  userId: string;
  displayName: string;
  email: string;
  isPrimary: boolean;
}

export interface TeamDetailRecord extends TeamRecord {
  members: TeamMemberRecord[];
}

/** Arista de la jerarquía, para comprobar ciclos sin cargar equipos completos. */
export interface TeamLink {
  id: string;
  parentId: string | null;
}

export interface ListTeamsFilter extends PageRequest {
  readonly sortBy?: TeamSortField;
  /** Busca en código y nombre. */
  readonly search?: string;
  readonly parentId?: string;
  readonly isActive?: boolean;
}

export interface CreateTeamInput {
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  managerId: string | null;
  isActive: boolean;
}

/** Campo omitido = sin cambio; `null` = quitar el valor. */
export interface UpdateTeamInput {
  name?: string;
  description?: string | null;
  parentId?: string | null;
  managerId?: string | null;
  isActive?: boolean;
}

export interface TeamMembershipInput {
  userId: string;
  isPrimary: boolean;
}

/** Pertenencia de un usuario a un equipo no eliminado, vista desde el usuario (D-07.4). */
export interface UserTeamMembershipRecord {
  teamId: string;
  teamName: string;
  isPrimary: boolean;
}

export interface UserTeamAssignmentInput {
  teamId: string;
  isPrimary: boolean;
}

/**
 * Puerto de persistencia de equipos (ADR-004). Las reglas (ciclos, equipo
 * principal único, condiciones de borrado) viven en `TeamsService`; el
 * adaptador solo traduce y garantiza la atomicidad que se le pide.
 */
export interface TeamsRepository {
  /**
   * Sección crítica de la jerarquía (D8, sin ciclos). Ejecuta `work` en una
   * única transacción serializada frente a cualquier otra llamada a este mismo
   * método; `work` recibe un repositorio ligado a esa transacción. Así la
   * lectura del árbol, la comprobación de ciclos y la escritura no se
   * intercalan con otro movimiento. Si `work` lanza, nada se aplica.
   */
  withHierarchyLock<T>(work: (repository: TeamsRepository) => Promise<T>): Promise<T>;

  list(filter: ListTeamsFilter): Promise<Page<TeamRecord>>;
  /** Solo equipos no eliminados. */
  findById(teamId: string): Promise<TeamDetailRecord | null>;
  /** Los equipos no eliminados de entre los ids dados, con sus miembros, en una sola lectura. */
  findManyByIds(teamIds: readonly string[]): Promise<TeamDetailRecord[]>;
  /** Incluye eliminados: el código queda reservado tras el borrado lógico. */
  existsByCode(code: string): Promise<boolean>;
  /** Todas las aristas de equipos no eliminados. */
  listLinks(): Promise<TeamLink[]>;
  /** De los ids dados, los que pertenecen a usuarios existentes y no eliminados. */
  findExistingUserIds(userIds: readonly string[]): Promise<string[]>;
  /** De los ids dados, los de equipos no eliminados. */
  findExistingTeamIds(teamIds: readonly string[]): Promise<string[]>;
  /** Equipos no eliminados del usuario, por nombre. */
  listUserMemberships(userId: string): Promise<UserTeamMembershipRecord[]>;
  create(input: CreateTeamInput): Promise<string>;
  update(teamId: string, input: UpdateTeamInput): Promise<void>;
  softDelete(teamId: string): Promise<void>;
  /**
   * Reemplaza los miembros del equipo en una transacción. A los usuarios de
   * `clearPrimaryElsewhereFor` se les quita la marca de principal en cualquier
   * otro equipo dentro de la misma transacción.
   */
  replaceMembers(
    teamId: string,
    members: readonly TeamMembershipInput[],
    clearPrimaryElsewhereFor: readonly string[],
  ): Promise<void>;
  /**
   * Reemplaza en una transacción **todos** los equipos no eliminados del usuario
   * (D-07.4): quita los que no están en `teams` y crea o actualiza el resto con
   * su `isPrimary`. El servicio ya garantizó como mucho un principal.
   *
   * Las pertenencias a equipos eliminados no se borran (igual que
   * `replaceMembers`, que solo toca el equipo pedido): no aparecen en ninguna
   * lectura ni en la auditoría, y borrarlas en silencio alteraría la historia
   * de un equipo que ya no se puede editar. Si `teams` trae un principal, sí se
   * les quita la marca, como hace `replaceMembers` en cualquier otro equipo.
   */
  replaceUserTeams(userId: string, teams: readonly UserTeamAssignmentInput[]): Promise<void>;
}
