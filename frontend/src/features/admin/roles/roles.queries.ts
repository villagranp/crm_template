import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys, type ListQuery } from '@/features/admin/common';

import {
  createRole,
  deleteRole,
  duplicateRole,
  getRole,
  listMenuOptions,
  listPermissions,
  listRoles,
  replaceRoleMenuOptions,
  replaceRolePermissions,
  updateRole,
  type CreateRoleRequest,
  type DuplicateRoleRequest,
  type UpdateRoleRequest,
} from './roles.api';

export const roleKeys = createQueryKeys('roles');
const catalogKey = (name: string) => [...roleKeys.all, 'catalog', name] as const;

export function useRoles(query: ListQuery) {
  return useQuery({ queryKey: roleKeys.list(query), queryFn: () => listRoles(query), placeholderData: keepPreviousData });
}

export function useRole(id: string | null) {
  return useQuery({ queryKey: roleKeys.detail(id ?? ''), queryFn: () => getRole(id ?? ''), enabled: Boolean(id) });
}

export function usePermissions(enabled = true) {
  return useQuery({ queryKey: catalogKey('permissions'), queryFn: listPermissions, enabled });
}

export function useMenuOptions(enabled = true) {
  return useQuery({ queryKey: catalogKey('menu-options'), queryFn: listMenuOptions, enabled });
}

/** Un cambio de rol puede cambiar el acceso propio: también `['me']`. */
function useInvalidateRoles() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: roleKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['me'] }),
    ]);
}

export function useCreateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({ mutationFn: (body: CreateRoleRequest) => createRole(body), onSuccess: invalidate });
}

export function useDuplicateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DuplicateRoleRequest }) => duplicateRole(id, body),
    onSuccess: invalidate,
  });
}

export function useUpdateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRoleRequest }) => updateRole(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({ mutationFn: (id: string) => deleteRole(id), onSuccess: invalidate });
}

export function useReplaceRolePermissions(id: string) {
  const invalidate = useInvalidateRoles();
  return useMutation({ mutationFn: (ids: string[]) => replaceRolePermissions(id, ids), onSuccess: invalidate });
}

export function useReplaceRoleMenuOptions(id: string) {
  const invalidate = useInvalidateRoles();
  return useMutation({ mutationFn: (ids: string[]) => replaceRoleMenuOptions(id, ids), onSuccess: invalidate });
}
