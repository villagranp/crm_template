import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys, type ListQuery } from '@/features/admin/common';

import {
  createCatalog,
  createCatalogItem,
  deleteCatalog,
  getCatalog,
  listCatalogs,
  type CreateCatalogItemRequest,
  type CreateCatalogRequest,
  type UpdateCatalogItemRequest,
  type UpdateCatalogRequest,
  updateCatalog,
  updateCatalogItem,
} from './catalogs.api';
import type { SortOrderChange } from './item-order';

export const catalogKeys = createQueryKeys('catalogs');

export function useCatalogs(query: ListQuery) {
  return useQuery({
    queryKey: catalogKeys.list(query),
    queryFn: () => listCatalogs(query),
    placeholderData: keepPreviousData,
  });
}

export function useCatalog(catalogId: string | null) {
  return useQuery({
    queryKey: catalogKeys.detail(catalogId ?? ''),
    queryFn: () => getCatalog(catalogId ?? ''),
    enabled: Boolean(catalogId),
  });
}

function useInvalidateCatalogs() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: catalogKeys.all });
}

export function useCreateCatalog() {
  const invalidate = useInvalidateCatalogs();
  return useMutation({ mutationFn: (body: CreateCatalogRequest) => createCatalog(body), onSuccess: invalidate });
}

export function useUpdateCatalog() {
  const invalidate = useInvalidateCatalogs();
  return useMutation({
    mutationFn: ({ catalogId, body }: { catalogId: string; body: UpdateCatalogRequest }) => updateCatalog(catalogId, body),
    onSuccess: invalidate,
  });
}

export function useDeleteCatalog() {
  const invalidate = useInvalidateCatalogs();
  return useMutation({ mutationFn: (catalogId: string) => deleteCatalog(catalogId), onSuccess: invalidate });
}

export function useCreateCatalogItem(catalogId: string) {
  const invalidate = useInvalidateCatalogs();
  return useMutation({
    mutationFn: (body: CreateCatalogItemRequest) => createCatalogItem(catalogId, body),
    onSuccess: invalidate,
  });
}

export function useUpdateCatalogItem(catalogId: string) {
  const invalidate = useInvalidateCatalogs();
  return useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: UpdateCatalogItemRequest }) =>
      updateCatalogItem(catalogId, itemId, body),
    onSuccess: invalidate,
  });
}

/** Aplica un movimiento (uno o varios PATCH de `sortOrder`) en orden; se refresca al terminar, falle o no. */
export function useReorderCatalogItems(catalogId: string) {
  const invalidate = useInvalidateCatalogs();
  return useMutation({
    mutationFn: async (changes: SortOrderChange[]) => {
      for (const change of changes) {
        await updateCatalogItem(catalogId, change.itemId, { sortOrder: change.sortOrder });
      }
    },
    onSettled: invalidate,
  });
}
