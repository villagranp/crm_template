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

export interface UserListItem {
  id: string;
  email: string;
  displayName: string;
  jobTitle: string | null;
  status: UserStatus;
  roles: string[];
  teams: UserTeam[];
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
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  dataScope: 'OWN' | 'TEAM' | 'TERRITORY' | 'ORGANIZATION';
  origins: PermissionOrigin[];
}

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  jobTitle?: string;
  phone?: string;
  roleIds: string[];
}

export type UpdateUserRequest = Partial<Pick<CreateUserRequest, 'firstName' | 'lastName' | 'jobTitle' | 'phone'>>;

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
