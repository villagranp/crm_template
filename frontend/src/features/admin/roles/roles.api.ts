import type { ListQuery, Paginated } from '@/features/admin/common';
import { httpClient } from '@/services/api';

/**
 * Cliente de la API de roles y permisos (PLAN-ADMIN §3). Los tipos reflejan
 * `backend/src/modules/access/dto/role.dto.ts`.
 */

export const DATA_SCOPES = ['OWN', 'TEAM', 'TERRITORY', 'ORGANIZATION'] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  dataScope: DataScope;
  isSystem: boolean;
  isActive: boolean;
  permissionCodes: string[];
  menuOptionIds: string[];
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  id: string;
  code: string;
  resource: string;
  action: string;
  name: string;
  moduleKey: string | null;
}

export interface MenuOptionSummary {
  id: string;
  key: string;
  label: string;
  parentId: string | null;
  kind: 'LINK' | 'GROUP';
  sortOrder: number;
  isActive: boolean;
  module: { id: string; key: string; name: string };
}

export interface CreateRoleRequest {
  code: string;
  name: string;
  description?: string;
  dataScope: DataScope;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string | null;
  dataScope?: DataScope;
  isActive?: boolean;
}

export interface DuplicateRoleRequest {
  code: string;
  name: string;
  description?: string;
}

const ROLES_PATH = '/roles';

export function listRoles(query: ListQuery): Promise<Paginated<Role>> {
  return httpClient.get<Paginated<Role>>(ROLES_PATH, { query });
}

export function getRole(id: string): Promise<Role> {
  return httpClient.get<Role>(`${ROLES_PATH}/${id}`);
}

export function createRole(body: CreateRoleRequest): Promise<Role> {
  return httpClient.post<Role>(ROLES_PATH, { body });
}

export function duplicateRole(id: string, body: DuplicateRoleRequest): Promise<Role> {
  return httpClient.post<Role>(`${ROLES_PATH}/${id}/duplicate`, { body });
}

export function updateRole(id: string, body: UpdateRoleRequest): Promise<Role> {
  return httpClient.patch<Role>(`${ROLES_PATH}/${id}`, { body });
}

export function deleteRole(id: string): Promise<void> {
  return httpClient.delete<void>(`${ROLES_PATH}/${id}`);
}

export function replaceRolePermissions(id: string, permissionIds: string[]): Promise<Role> {
  return httpClient.put<Role>(`${ROLES_PATH}/${id}/permissions`, { body: { ids: permissionIds } });
}

export function replaceRoleMenuOptions(id: string, menuOptionIds: string[]): Promise<Role> {
  return httpClient.put<Role>(`${ROLES_PATH}/${id}/menu-options`, { body: { ids: menuOptionIds } });
}

export function listPermissions(): Promise<Permission[]> {
  return httpClient.get<Permission[]>('/permissions');
}

export function listMenuOptions(): Promise<MenuOptionSummary[]> {
  return httpClient.get<MenuOptionSummary[]>('/menu-options');
}
