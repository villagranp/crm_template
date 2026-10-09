import { httpClient } from '@/services/api';

/**
 * Cliente de la API de opciones de menú y módulos (PLAN-ADMIN §3, D6, D7).
 * Los tipos reflejan `backend/src/modules/access/dto/menu-option.dto.ts`.
 */

export type MenuOptionKind = 'LINK' | 'GROUP';

export interface MenuOption {
  id: string;
  key: string;
  parentId: string | null;
  label: string;
  description: string | null;
  icon: string | null;
  kind: MenuOptionKind;
  path: string | null;
  sortOrder: number;
  requiredPermissionId: string | null;
  requiredPermissionCode: string | null;
  isPublic: boolean;
  isSystem: boolean;
  isActive: boolean;
  module: { id: string; key: string; name: string };
}

export interface AppModule {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  isSystem: boolean;
  isActive: boolean;
}

export interface RegisteredRoute {
  path: string;
  label: string;
}

export interface PermissionSummary {
  id: string;
  code: string;
  name: string;
}

export interface MenuOptionRequest {
  moduleId?: string;
  key?: string;
  parentId?: string | null;
  label?: string;
  description?: string | null;
  icon?: string | null;
  kind?: MenuOptionKind;
  path?: string | null;
  sortOrder?: number;
  requiredPermissionId?: string | null;
  isPublic?: boolean;
  isActive?: boolean;
}

export interface MenuOrderItem {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

const PATH = '/menu-options';

export function listMenuOptions(): Promise<MenuOption[]> {
  return httpClient.get<MenuOption[]>(PATH);
}

export function listRegisteredRoutes(): Promise<RegisteredRoute[]> {
  return httpClient.get<RegisteredRoute[]>(`${PATH}/routes`);
}

export function listModules(): Promise<AppModule[]> {
  return httpClient.get<AppModule[]>('/modules');
}

export function listPermissions(): Promise<PermissionSummary[]> {
  return httpClient.get<PermissionSummary[]>('/permissions');
}

export function createMenuOption(body: MenuOptionRequest): Promise<MenuOption> {
  return httpClient.post<MenuOption>(PATH, { body });
}

export function updateMenuOption(id: string, body: MenuOptionRequest): Promise<MenuOption> {
  return httpClient.patch<MenuOption>(`${PATH}/${id}`, { body });
}

export function deleteMenuOption(id: string): Promise<void> {
  return httpClient.delete<void>(`${PATH}/${id}`);
}

export function reorderMenuOptions(items: MenuOrderItem[]): Promise<MenuOption[]> {
  return httpClient.put<MenuOption[]>(`${PATH}/order`, { body: { items } });
}
