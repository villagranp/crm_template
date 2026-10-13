import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateCrmCaches } from '@/features/crm/common/crm-cache';
import { projectKeys } from '@/features/crm/projects';
import { createScopedQueryKeys, type ListQuery } from '@/lib/query-keys';

import {
  changeOpportunityStage,
  createOpportunity,
  deleteOpportunity,
  getOpportunity,
  getOpportunityFormOptions,
  getOpportunityHistory,
  getStageSummary,
  listOpportunities,
  listProjectOpportunities,
  updateOpportunity,
  updateOpportunityResult,
  type CreateOpportunityInput,
  type OpportunityResultInput,
  type StageChangeInput,
  type UpdateOpportunityInput,
} from './opportunities.api';

/**
 * Claves bajo `['crm', 'opportunities']`. Las listas de un proyecto cuelgan de
 * `projectLists`, así que cualquier mutación invalida todas las listas (pipeline,
 * tablero y ficha) con `opportunityKeys.all`.
 */
const base = createScopedQueryKeys('crm', 'opportunities');

export const opportunityKeys = {
  ...base,
  projectList: (projectId: string, query: ListQuery) => [...base.all, 'project', projectId, query] as const,
  board: (query: ListQuery) => [...base.all, 'board', query] as const,
  stageSummary: (query: ListQuery) => [...base.all, 'stage-summary', query] as const,
  formOptions: (projectId: string | undefined) => [...base.all, 'form-options', projectId ?? null] as const,
  history: (opportunityId: string) => [...base.all, 'history', opportunityId] as const,
};

/** Las opciones cambian poco (catálogos y parámetros). */
const OPTIONS_STALE_TIME_MS = 5 * 60_000;
/** Tarjetas por página en cada columna del tablero ("Ver más"). */
export const BOARD_PAGE_SIZE = 10;

export function useOpportunities(query: ListQuery, enabled = true) {
  return useQuery({
    queryKey: opportunityKeys.list(query),
    queryFn: () => listOpportunities(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useProjectOpportunities(projectId: string, query: ListQuery, enabled = true) {
  return useQuery({
    queryKey: opportunityKeys.projectList(projectId, query),
    queryFn: () => listProjectOpportunities(projectId, query),
    placeholderData: keepPreviousData,
    enabled: enabled && Boolean(projectId),
  });
}

/** Una columna del tablero: paginación por etapa con "Ver más" (03 §E.7). */
export function useBoardColumn(query: ListQuery) {
  return useInfiniteQuery({
    queryKey: opportunityKeys.board(query),
    queryFn: ({ pageParam }) => listOpportunities({ ...query, page: pageParam, pageSize: BOARD_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined),
  });
}

export function useStageSummary(query: ListQuery, enabled = true) {
  return useQuery({
    queryKey: opportunityKeys.stageSummary(query),
    queryFn: () => getStageSummary(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useOpportunityFormOptions(projectId?: string, enabled = true) {
  return useQuery({
    queryKey: opportunityKeys.formOptions(projectId),
    queryFn: () => getOpportunityFormOptions(projectId),
    staleTime: OPTIONS_STALE_TIME_MS,
    enabled,
  });
}

export function useOpportunity(opportunityId: string | undefined) {
  return useQuery({
    queryKey: opportunityKeys.detail(opportunityId ?? ''),
    queryFn: () => getOpportunity(opportunityId ?? ''),
    enabled: Boolean(opportunityId),
  });
}

export function useOpportunityHistory(opportunityId: string, enabled = true) {
  return useQuery({
    queryKey: opportunityKeys.history(opportunityId),
    queryFn: () => getOpportunityHistory(opportunityId),
    enabled: enabled && Boolean(opportunityId),
  });
}

/**
 * Tras cualquier mutación: todas las listas y detalles de oportunidades, y lo
 * que el proyecto deriva de ellas (estado comercial, resumen, `lastActivityAt`,
 * historial, listas de proyectos y proyectos de la ficha del cliente).
 */
function useInvalidateOpportunities() {
  const queryClient = useQueryClient();
  return (projectId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: opportunityKeys.all }),
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectKeys.of(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: projectKeys.teamLists() }),
      invalidateCrmCaches(queryClient, ['customerProjects']),
    ]);
}

export function useCreateOpportunity(projectId: string) {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: (input: CreateOpportunityInput) => createOpportunity(projectId, input),
    onSuccess: () => invalidate(projectId),
  });
}

export function useUpdateOpportunity(opportunityId: string, projectId: string) {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: (input: UpdateOpportunityInput) => updateOpportunity(opportunityId, input),
    onSuccess: () => invalidate(projectId),
  });
}

export function useChangeOpportunityStage(opportunityId: string, projectId: string) {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: (input: StageChangeInput) => changeOpportunityStage(opportunityId, input),
    onSuccess: () => invalidate(projectId),
  });
}

export function useUpdateOpportunityResult(opportunityId: string, projectId: string) {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: (input: OpportunityResultInput) => updateOpportunityResult(opportunityId, input),
    onSuccess: () => invalidate(projectId),
  });
}

export function useDeleteOpportunity(opportunityId: string, projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: () => deleteOpportunity(opportunityId),
    // Tras borrar: el detalle y su historial salen de la caché (AGENTS §9.7).
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: opportunityKeys.detail(opportunityId) });
      queryClient.removeQueries({ queryKey: opportunityKeys.history(opportunityId) });
      // Sin esperar: quien elimina sale del detalle y no debe verlo recargar con 404.
      void invalidate(projectId);
    },
  });
}
