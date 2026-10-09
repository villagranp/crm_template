import type { ListQuery, Paginated } from '@/features/admin/common';
import { httpClient } from '@/services/api';

/** Equipo tal como lo devuelve `GET /teams` (`TeamResponseDto`). */
export interface Team {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  parentName: string | null;
  manager: { id: string; displayName: string } | null;
  isActive: boolean;
  memberCount: number;
  childCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  userId: string;
  displayName: string;
  email: string;
  isPrimary: boolean;
}

/** `GET /teams/{id}` (`TeamDetailResponseDto`). */
export interface TeamDetail extends Team {
  members: TeamMember[];
}

export interface CreateTeamRequest {
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  managerId: string | null;
  isActive: boolean;
}

/** `code` no viaja: es inmutable. */
export type UpdateTeamRequest = Partial<Omit<CreateTeamRequest, 'code'>>;

export interface TeamMembershipRequest {
  userId: string;
  isPrimary: boolean;
}

/** Usuario de `GET /users` reducido a lo que usan los selectores de esta pantalla. */
export interface UserOption {
  id: string;
  email: string;
  displayName: string;
  status: string;
}

const MAX_PAGE_SIZE = 100;
/** Tope de páginas al cargar la jerarquía completa (10 000 equipos). */
const MAX_HIERARCHY_PAGES = 100;
const USER_SEARCH_PAGE_SIZE = 20;

export function listTeams(query: ListQuery): Promise<Paginated<Team>> {
  return httpClient.get<Paginated<Team>>('/teams', { query });
}

/**
 * Todos los equipos, recorriendo las páginas de `GET /teams` con el tamaño
 * máximo. La jerarquía y el selector de padre necesitan el árbol entero.
 */
export async function listAllTeams(): Promise<Team[]> {
  const teams: Team[] = [];
  for (let page = 1; page <= MAX_HIERARCHY_PAGES; page += 1) {
    const response = await listTeams({ page, pageSize: MAX_PAGE_SIZE, sortBy: 'name', sortOrder: 'asc' });
    teams.push(...response.data);
    if (page >= response.pagination.totalPages) {
      break;
    }
  }
  return teams;
}

export function getTeam(teamId: string): Promise<TeamDetail> {
  return httpClient.get<TeamDetail>(`/teams/${teamId}`);
}

export function createTeam(body: CreateTeamRequest): Promise<TeamDetail> {
  return httpClient.post<TeamDetail>('/teams', { body });
}

export function updateTeam(teamId: string, body: UpdateTeamRequest): Promise<TeamDetail> {
  return httpClient.patch<TeamDetail>(`/teams/${teamId}`, { body });
}

export function deleteTeam(teamId: string): Promise<void> {
  return httpClient.delete<void>(`/teams/${teamId}`);
}

export function replaceTeamMembers(teamId: string, members: TeamMembershipRequest[]): Promise<TeamDetail> {
  return httpClient.put<TeamDetail>(`/teams/${teamId}/members`, { body: { members } });
}

/** Búsqueda de usuarios para elegir responsable o miembros (requiere `usuarios.ver`). */
export async function searchUsers(search: string): Promise<UserOption[]> {
  const response = await httpClient.get<Paginated<UserOption>>('/users', {
    query: { search: search || undefined, pageSize: USER_SEARCH_PAGE_SIZE },
  });
  return response.data.map(({ id, email, displayName, status }) => ({ id, email, displayName, status }));
}
