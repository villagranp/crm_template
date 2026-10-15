import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys, type ListQuery } from '@/features/admin/common';

import {
  createUser,
  exportUsers,
  getUser,
  getUserAccess,
  listAssignableRoles,
  listAssignableTeams,
  listCountryOptions,
  listMenuOptionCatalog,
  listPermissionCatalog,
  listUsers,
  reactivateUser,
  replaceUserMenuOptions,
  replaceUserPermissions,
  replaceUserRoles,
  replaceUserTeams,
  resetUserPassword,
  suspendUser,
  updateUser,
  type CreateUserRequest,
  type DirectAssignmentRequest,
  type UpdateUserRequest,
  type UserTeamAssignment,
} from './users.api';
import { saveFile } from '@/lib/save-file';

export const userKeys = createQueryKeys('users');
/** Claves del área Equipos (`createQueryKeys('teams').all`), sin importar de otra área. */
const TEAMS_AREA_KEY = createQueryKeys('teams').all;
const accessKey = (id: string) => [...userKeys.detail(id), 'access'] as const;
const catalogKey = (name: string) => [...userKeys.all, 'catalog', name] as const;

export function useUsers(query: ListQuery) {
  return useQuery({ queryKey: userKeys.list(query), queryFn: () => listUsers(query), placeholderData: keepPreviousData });
}

export function useUser(id: string | null) {
  return useQuery({ queryKey: userKeys.detail(id ?? ''), queryFn: () => getUser(id ?? ''), enabled: Boolean(id) });
}

export function useUserAccess(id: string, enabled = true) {
  return useQuery({ queryKey: accessKey(id), queryFn: () => getUserAccess(id), enabled });
}

export function useAssignableRoles(enabled = true) {
  return useQuery({ queryKey: catalogKey('roles'), queryFn: listAssignableRoles, enabled });
}

export function useAssignableTeams(enabled = true) {
  return useQuery({ queryKey: catalogKey('teams'), queryFn: listAssignableTeams, enabled });
}

/** Países activos (los de `GET /customers/form-options`). Cambian muy poco: se cachean 5 minutos. */
const COUNTRIES_STALE_MS = 5 * 60_000;

export function useCountryOptions(enabled = true) {
  return useQuery({
    queryKey: catalogKey('countries'),
    queryFn: listCountryOptions,
    enabled,
    staleTime: COUNTRIES_STALE_MS,
  });
}

export function usePermissionCatalog(enabled = true) {
  return useQuery({ queryKey: catalogKey('permissions'), queryFn: listPermissionCatalog, enabled });
}

export function useMenuOptionCatalog(enabled = true) {
  return useQuery({ queryKey: catalogKey('menu-options'), queryFn: listMenuOptionCatalog, enabled });
}

/**
 * Tras cualquier cambio de un usuario: su lista y su detalle. También `['me']`,
 * por si la persona se cambió el acceso a sí misma.
 */
function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: userKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['me'] }),
    ]);
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: (body: CreateUserRequest) => createUser(body), onSuccess: invalidate });
}

export function useUpdateUser(id: string) {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: (body: UpdateUserRequest) => updateUser(id, body), onSuccess: invalidate });
}

export function useChangeUserStatus(id: string) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ action, reason }: { action: 'suspend' | 'reactivate'; reason?: string }) =>
      action === 'suspend' ? suspendUser(id, reason) : reactivateUser(id, reason),
    onSuccess: invalidate,
  });
}

export function useResetUserPassword(id: string) {
  return useMutation({ mutationFn: () => resetUserPassword(id) });
}

export function useReplaceUserRoles(id: string) {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: (roleIds: string[]) => replaceUserRoles(id, roleIds), onSuccess: invalidate });
}

/**
 * `PUT /users/{id}/teams` (07 F.2). Invalida también los equipos: su número de
 * miembros cambia y la pantalla de Equipos debe mostrar lo mismo (AC-07.8).
 */
export function useReplaceUserTeams(id: string) {
  const invalidate = useInvalidateUsers();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teams: UserTeamAssignment[]) => replaceUserTeams(id, teams),
    onSuccess: () =>
      Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: TEAMS_AREA_KEY })]),
  });
}

export function useReplaceUserPermissions(id: string) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (assignments: DirectAssignmentRequest[]) => replaceUserPermissions(id, assignments),
    onSuccess: invalidate,
  });
}

export function useReplaceUserMenuOptions(id: string) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (assignments: DirectAssignmentRequest[]) => replaceUserMenuOptions(id, assignments),
    onSuccess: invalidate,
  });
}

/** Descarga el CSV y lo entrega al navegador (D13). */
export function useExportUsers() {
  return useMutation({
    mutationFn: async (filters: ListQuery) => {
      const file = await exportUsers(filters);
      saveFile(file.blob, file.fileName ?? `usuarios-${new Date().toISOString().slice(0, 10)}.csv`);
    },
  });
}
