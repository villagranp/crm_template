import type { ListQuery, Paginated } from '@/features/admin/common';
import { type DownloadedFile, httpClient } from '@/services/api';

/**
 * Cliente de la API de usuarios (PLAN-ADMIN §3, «Usuarios»). Los tipos reflejan
 * los DTO del backend (`backend/src/modules/access/dto/user.dto.ts`).
 */

export const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'LOCKED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export type AssignmentEffect = 'GRANT' | 'DENY';

export interface UserTeam {
  id: string;
  name: string;
  isPrimary: boolean;
}

/** País del usuario (07 F.1, DM-2): `{ id, isoCode, name }` o `null`. */
export interface UserCountry {
  id: string;
  isoCode: string;
  name: string;
}

export interface UserListItem {
  id: string;
  email: string;
  displayName: string;
  jobTitle: string | null;
  /** Código de colaborador (07 RN-07.1): único, en mayúsculas. */
  employeeCode: string | null;
  country: UserCountry | null;
  status: UserStatus;
  roles: string[];
  teams: UserTeam[];
  /**
   * Sin ningún acceso concedido: usuario recién creado (p. ej. en el primer ingreso con Entra ID,
   * ADR-027) al que el administrador aún debe asignarle un rol. Lo calcula el backend.
   */
  pendingAccess: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface DirectAssignment {
  targetId: string;
  effect: AssignmentEffect;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface UserDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  jobTitle: string | null;
  phone: string | null;
  employeeCode: string | null;
  country: UserCountry | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Calculado por el servidor: usuario ACTIVE sin rol vigente ni permisos directos vigentes. */
  pendingAccess: boolean;
  teams: UserTeam[];
  roles: { id: string; code: string; name: string; isSystem: boolean; expiresAt: string | null }[];
  directPermissions: (DirectAssignment & { code: string; name: string })[];
  directMenuOptions: (DirectAssignment & { key: string; label: string })[];
}

export interface PermissionOrigin {
  code: string;
  effective: boolean;
  roles: string[];
  grant: { reason: string; expiresAt: string | null } | null;
  deny: { reason: string; expiresAt: string | null } | null;
}

export interface UserAccess {
  userId: string;
  roles: string[];
  permissions: string[];
  dataScope: 'OWN' | 'TEAM' | 'COUNTRY' | 'ORGANIZATION';
  origins: PermissionOrigin[];
}

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  jobTitle?: string;
  phone?: string;
  roleIds: string[];
  employeeCode?: string;
  /** Sólo administrador (07 RN-07.5): un no administrador recibe `403 ADMIN_ONLY`. */
  countryId?: string;
  /**
   * Sólo administrador con `equipos.editar` (07 RN-07.10). El backend marca
   * como principal el primero de la lista.
   */
  teamIds?: string[];
}

/**
 * `null` vacía el campo (el backend responde `422 CRM_PROFILE_INCOMPLETE` si el
 * usuario tiene un rol comercial). `countryId` sólo lo cambia un administrador.
 */
export interface UpdateUserRequest
  extends Partial<Pick<CreateUserRequest, 'firstName' | 'lastName' | 'jobTitle' | 'phone'>> {
  employeeCode?: string | null;
  countryId?: string | null;
}

/** Cuerpo de `PUT /users/{id}/teams` (07 F.2): como mucho un principal. */
export interface UserTeamAssignment {
  teamId: string;
  isPrimary: boolean;
}

/** Equipo que se puede asignar (de `GET /teams`). */
export interface TeamOption {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

/** País asignable (de los `form-options` de Clientes, 02 F2). */
export interface CountryOption {
  id: string;
  isoCode: string;
  name: string;
}

export interface DirectAssignmentRequest {
  targetId: string;
  effect: AssignmentEffect;
  reason: string;
  expiresAt?: string;
}

/**
 * Catálogos que la pantalla necesita para asignar. `GET /roles` devuelve el
 * `RoleResponseDto` completo; aquí sólo se declara lo que usa esta área.
 */
export interface RoleOption {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  /** Permisos que concede el rol. Vacío = no da acceso a nada (ADR-020, alta por un no administrador). */
  permissionCodes: string[];
}

export interface PermissionOption {
  id: string;
  code: string;
  name: string;
}

export interface MenuOptionOption {
  id: string;
  key: string;
  label: string;
  module: { name: string };
}

const USERS_PATH = '/users';
const ALL_ROLES_PAGE_SIZE = 100;
const ALL_TEAMS_PAGE_SIZE = 100;

export function listUsers(query: ListQuery): Promise<Paginated<UserListItem>> {
  return httpClient.get<Paginated<UserListItem>>(USERS_PATH, { query });
}

export function getUser(id: string): Promise<UserDetail> {
  return httpClient.get<UserDetail>(`${USERS_PATH}/${id}`);
}

export function getUserAccess(id: string): Promise<UserAccess> {
  return httpClient.get<UserAccess>(`${USERS_PATH}/${id}/access`);
}

export function createUser(body: CreateUserRequest): Promise<UserListItem> {
  return httpClient.post<UserListItem>(USERS_PATH, { body });
}

export function updateUser(id: string, body: UpdateUserRequest): Promise<UserDetail> {
  return httpClient.patch<UserDetail>(`${USERS_PATH}/${id}`, { body });
}

export function suspendUser(id: string, reason?: string): Promise<UserDetail> {
  return httpClient.post<UserDetail>(`${USERS_PATH}/${id}/suspend`, { body: reason ? { reason } : {} });
}

export function reactivateUser(id: string, reason?: string): Promise<UserDetail> {
  return httpClient.post<UserDetail>(`${USERS_PATH}/${id}/reactivate`, { body: reason ? { reason } : {} });
}

export function resetUserPassword(id: string): Promise<void> {
  return httpClient.post<void>(`${USERS_PATH}/${id}/password/reset`);
}

export function replaceUserRoles(id: string, roleIds: string[]): Promise<void> {
  return httpClient.put<void>(`${USERS_PATH}/${id}/roles`, { body: { ids: roleIds } });
}

/** `PUT /users/{id}/teams` (07 F.2, D-07.4): reemplaza todos los equipos del usuario. */
export function replaceUserTeams(id: string, teams: UserTeamAssignment[]): Promise<{ teams: UserTeam[] }> {
  return httpClient.put<{ teams: UserTeam[] }>(`${USERS_PATH}/${id}/teams`, { body: { teams } });
}

export function replaceUserPermissions(id: string, assignments: DirectAssignmentRequest[]): Promise<void> {
  return httpClient.put<void>(`${USERS_PATH}/${id}/permissions`, { body: { assignments } });
}

export function replaceUserMenuOptions(id: string, assignments: DirectAssignmentRequest[]): Promise<void> {
  return httpClient.put<void>(`${USERS_PATH}/${id}/menu-options`, { body: { assignments } });
}

export async function listAssignableRoles(): Promise<RoleOption[]> {
  const page = await httpClient.get<Paginated<RoleOption>>('/roles', {
    query: { pageSize: ALL_ROLES_PAGE_SIZE, sortBy: 'name', sortOrder: 'asc' },
  });
  return page.data;
}

/** Equipos para asignar (requiere `equipos.ver`). Primera página del tamaño máximo, por nombre. */
export async function listAssignableTeams(): Promise<TeamOption[]> {
  const page = await httpClient.get<Paginated<TeamOption>>('/teams', {
    query: { pageSize: ALL_TEAMS_PAGE_SIZE, sortBy: 'name', sortOrder: 'asc' },
  });
  return page.data.map(({ id, code, name, isActive }) => ({ id, code, name, isActive }));
}

/**
 * Países activos para el selector y el filtro de país (07 E.1, DM-2).
 *
 * No hay un endpoint de países bajo `usuarios.*`: se reutiliza la lista que
 * publica Clientes en `GET /customers/form-options` (02 F2), igual que los
 * filtros de Actividad comercial. Exige `clientes.ver`; sin él no se ofrece el
 * selector (el administrador lo tiene siempre, ADR-020).
 */
export async function listCountryOptions(): Promise<CountryOption[]> {
  const options = await httpClient.get<{ countries: CountryOption[] }>('/customers/form-options');
  return options.countries.map(({ id, isoCode, name }) => ({ id, isoCode, name }));
}

export function listPermissionCatalog(): Promise<PermissionOption[]> {
  return httpClient.get<PermissionOption[]>('/permissions');
}

export function listMenuOptionCatalog(): Promise<MenuOptionOption[]> {
  return httpClient.get<MenuOptionOption[]>('/menu-options');
}

/** Descarga el CSV de usuarios con los filtros activos (D13), por el cliente HTTP autenticado. */
export function exportUsers(filters: ListQuery): Promise<DownloadedFile> {
  return httpClient.download(`${USERS_PATH}/export`, { query: filters });
}
