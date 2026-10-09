import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys, type ListQuery } from '@/features/admin/common';

import {
  createUser,
  exportUsers,
  getUser,
  getUserAccess,
  listAssignableRoles,
  listMenuOptionCatalog,
  listPermissionCatalog,
  listUsers,
  reactivateUser,
  replaceUserMenuOptions,
  replaceUserPermissions,
  replaceUserRoles,
  resetUserPassword,
  suspendUser,
  updateUser,
  type CreateUserRequest,
  type DirectAssignmentRequest,
  type UpdateUserRequest,
} from './users.api';
import { saveFile } from '@/features/admin/common/save-file';

export const userKeys = createQueryKeys('users');
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
