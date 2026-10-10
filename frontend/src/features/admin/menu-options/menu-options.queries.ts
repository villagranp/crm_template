import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys } from '@/features/admin/common';

import {
  createMenuOption,
  deleteMenuOption,
  listMenuOptions,
  listModules,
  listPermissions,
  listRegisteredRoutes,
  reorderMenuOptions,
  updateMenuOption,
  type MenuOptionRequest,
  type MenuOrderItem,
} from './menu-options.api';

export const menuOptionKeys = createQueryKeys('menu-options');
const catalogKey = (name: string) => [...menuOptionKeys.all, 'catalog', name] as const;

export function useMenuOptions() {
  return useQuery({ queryKey: menuOptionKeys.lists(), queryFn: listMenuOptions });
}

export function useModules(enabled = true) {
  return useQuery({ queryKey: catalogKey('modules'), queryFn: listModules, enabled });
}

export function useRegisteredRoutes(enabled = true) {
  return useQuery({ queryKey: catalogKey('routes'), queryFn: listRegisteredRoutes, enabled });
}

export function usePermissionOptions(enabled = true) {
  return useQuery({ queryKey: catalogKey('permissions'), queryFn: listPermissions, enabled });
}

/** El menú propio puede cambiar: también `['me']` (y con él `/me/menu`). */
function useInvalidateMenu() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: menuOptionKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['me'] }),
    ]);
}

export function useCreateMenuOption() {
  const invalidate = useInvalidateMenu();
  return useMutation({ mutationFn: (body: MenuOptionRequest) => createMenuOption(body), onSuccess: invalidate });
}

export function useUpdateMenuOption() {
  const invalidate = useInvalidateMenu();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MenuOptionRequest }) => updateMenuOption(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteMenuOption() {
  const invalidate = useInvalidateMenu();
  return useMutation({ mutationFn: (id: string) => deleteMenuOption(id), onSuccess: invalidate });
}

export function useReorderMenuOptions() {
  const invalidate = useInvalidateMenu();
  return useMutation({ mutationFn: (items: MenuOrderItem[]) => reorderMenuOptions(items), onSuccess: invalidate });
}
