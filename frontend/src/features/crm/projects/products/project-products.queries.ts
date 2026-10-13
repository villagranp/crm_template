import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateCrmCaches } from '@/features/crm/common/crm-cache';
import type { ListQuery } from '@/lib/query-keys';

import { projectKeys, useInvalidateProject } from '../projects.queries';

import {
  createProjectProduct,
  deleteProjectProduct,
  listProducts,
  listProjectProducts,
  updateProjectProduct,
  type CreateProjectProductInput,
  type UpdateProjectProductInput,
} from './project-products.api';

const CATALOG_PAGE_SIZE = 10;

export function useProjectProducts(projectId: string, query: ListQuery) {
  return useQuery({
    queryKey: projectKeys.productList(projectId, query),
    queryFn: () => listProjectProducts(projectId, query),
    placeholderData: keepPreviousData,
  });
}

/** Catálogo local (sólo activos) para el selector de producto (AC-03.59). */
export function useCatalogProducts(search: string, enabled: boolean) {
  const query: ListQuery = { search: search || undefined, isActive: 'true', page: 1, pageSize: CATALOG_PAGE_SIZE };
  return useQuery({
    queryKey: projectKeys.catalogProducts(query),
    queryFn: () => listProducts(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/**
 * Tras asociar, editar o quitar: la lista y sus totales, la ficha (resumen y
 * `lastActivityAt`), el historial y las listas de proyectos; también las filas
 * del forecast (son los productos asociados) y las oportunidades (sus
 * dependencias cuentan los productos activos).
 */
function useInvalidateProducts(projectId: string) {
  const queryClient = useQueryClient();
  const invalidateProject = useInvalidateProject();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
      invalidateProject(projectId),
      invalidateCrmCaches(queryClient, ['forecast', 'opportunities']),
    ]);
}

export function useCreateProjectProduct(projectId: string) {
  const invalidate = useInvalidateProducts(projectId);
  return useMutation({
    mutationFn: (input: CreateProjectProductInput) => createProjectProduct(projectId, input),
    onSuccess: invalidate,
  });
}

export function useUpdateProjectProduct(projectId: string) {
  const invalidate = useInvalidateProducts(projectId);
  return useMutation({
    mutationFn: ({ projectProductId, input }: { projectProductId: string; input: UpdateProjectProductInput }) =>
      updateProjectProduct(projectId, projectProductId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteProjectProduct(projectId: string) {
  const invalidate = useInvalidateProducts(projectId);
  return useMutation({
    mutationFn: (projectProductId: string) => deleteProjectProduct(projectId, projectProductId),
    onSuccess: invalidate,
  });
}
