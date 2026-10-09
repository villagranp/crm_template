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

/**
 * Puerto de persistencia de equipos (ADR-004). Las reglas (ciclos, equipo
 * principal único, condiciones de borrado) viven en `TeamsService`; el
 * adaptador solo traduce y garantiza la atomicidad que se le pide.
 */
export interface TeamsRepository {
  list(filter: ListTeamsFilter): Promise<Page<TeamRecord>>;
  /** Solo equipos no eliminados. */
  findById(teamId: string): Promise<TeamDetailRecord | null>;
  /** Incluye eliminados: el código queda reservado tras el borrado lógico. */
  existsByCode(code: string): Promise<boolean>;
  /** Todas las aristas de equipos no eliminados. */
  listLinks(): Promise<TeamLink[]>;
  /** De los ids dados, los que pertenecen a usuarios existentes y no eliminados. */
  findExistingUserIds(userIds: readonly string[]): Promise<string[]>;
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
}
