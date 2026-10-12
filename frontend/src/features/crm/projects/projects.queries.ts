import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createScopedQueryKeys, type ListQuery } from '@/lib/query-keys';

import {
  createPhaseChange,
  createProject,
  deleteProject,
  duplicateProject,
  getProject,
  getProjectFormOptions,
  listOwnerOptions,
  listPhaseHistory,
  listProjectHistory,
  listProjects,
  listTeamOptions,
  listTeamProjects,
  resolveConversion,
  updateClassification,
  updateProject,
  type ConversionLookup,
  type CreatePhaseChangeInput,
  type CreateProjectInput,
  type DuplicateProjectInput,
  type OwnerOptionPurpose,
  type UpdateClassificationInput,
  type UpdateProjectInput,
} from './projects.api';

/**
 * Claves bajo `['crm', 'projects']`. Todo lo que cuelga de un proyecto (fase,
 * historial, productos) lleva su id, así que una mutación invalida lo suyo sin
 * conocer las claves de otras áreas.
 */
const base = createScopedQueryKeys('crm', 'projects');

export const projectKeys = {
  ...base,
  teamLists: () => [...base.all, 'team-view'] as const,
  teamList: (query: ListQuery) => [...base.all, 'team-view', query] as const,
  formOptions: () => [...base.all, 'form-options'] as const,
  ownerOptions: (query: ListQuery) => [...base.all, 'owner-options', query] as const,
  teamOptions: () => [...base.all, 'team-options'] as const,
  /** Subrecursos de un proyecto: `invalidateQueries({ queryKey: projectKeys.of(id) })` los recarga todos. */
  of: (projectId: string) => [...base.all, 'of', projectId] as const,
  phaseHistory: (projectId: string, query: ListQuery) => [...base.all, 'of', projectId, 'phase-history', query] as const,
  history: (projectId: string, query: ListQuery) => [...base.all, 'of', projectId, 'history', query] as const,
  products: (projectId: string) => [...base.all, 'of', projectId, 'products'] as const,
  productList: (projectId: string, query: ListQuery) => [...base.all, 'of', projectId, 'products', query] as const,
  catalogProducts: (query: ListQuery) => [...base.all, 'catalog-products', query] as const,
  conversion: (lookup: ConversionLookup) => [...base.all, 'conversion', lookup] as const,
};

/** Las opciones cambian poco (catálogos y parámetros): se reutilizan durante la sesión de pantalla. */
const OPTIONS_STALE_TIME_MS = 5 * 60_000;
const PICKER_PAGE_SIZE = 20;

export function useProjects(query: ListQuery, enabled = true) {
  return useQuery({
    queryKey: projectKeys.list(query),
    queryFn: () => listProjects(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useTeamProjects(query: ListQuery) {
  return useQuery({
    queryKey: projectKeys.teamList(query),
    queryFn: () => listTeamProjects(query),
    placeholderData: keepPreviousData,
  });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(projectId ?? ''),
    queryFn: () => getProject(projectId ?? ''),
    enabled: Boolean(projectId),
  });
}

export function useProjectFormOptions(enabled = true) {
  return useQuery({
    queryKey: projectKeys.formOptions(),
    queryFn: getProjectFormOptions,
    staleTime: OPTIONS_STALE_TIME_MS,
    enabled,
  });
}

export function useOwnerOptions(search: string, purpose: OwnerOptionPurpose, enabled: boolean) {
  const query: ListQuery = { search: search || undefined, purpose, page: 1, pageSize: PICKER_PAGE_SIZE };
  return useQuery({
    queryKey: projectKeys.ownerOptions(query),
    queryFn: () => listOwnerOptions(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useTeamOptions(enabled = true) {
  return useQuery({
    queryKey: projectKeys.teamOptions(),
    queryFn: listTeamOptions,
    staleTime: OPTIONS_STALE_TIME_MS,
    enabled,
  });
}

export function usePhaseHistory(projectId: string, query: ListQuery) {
  return useQuery({
    queryKey: projectKeys.phaseHistory(projectId, query),
    queryFn: () => listPhaseHistory(projectId, query),
    placeholderData: keepPreviousData,
  });
}

export function useProjectHistory(projectId: string, query: ListQuery) {
  return useQuery({
    queryKey: projectKeys.history(projectId, query),
    queryFn: () => listProjectHistory(projectId, query),
    placeholderData: keepPreviousData,
  });
}

/** Vista previa de la regla de conversión; sólo con unidad elegida. */
export function useConversionPreview(lookup: ConversionLookup | null) {
  return useQuery({
    queryKey: projectKeys.conversion(lookup ?? { fromUnitId: '' }),
    queryFn: () => resolveConversion(lookup ?? { fromUnitId: '' }),
    enabled: Boolean(lookup?.fromUnitId),
    staleTime: OPTIONS_STALE_TIME_MS,
  });
}

/** Tras cambiar un proyecto: listas (búsqueda y equipo) y lo que cuelga de él. */
export function useInvalidateProject() {
  const queryClient = useQueryClient();
  return (projectId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: projectKeys.teamLists() }),
      queryClient.invalidateQueries({ queryKey: projectKeys.of(projectId) }),
    ]);
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: projectKeys.teamLists() }),
      ]),
  });
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => updateProject(projectId, input),
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(projectId), project);
      return invalidate(projectId);
    },
  });
}

export function useDeleteProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteProject(projectId),
    // Quien elimina vuelve a la búsqueda: la ficha y sus subrecursos salen de la caché.
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(projectId) });
      queryClient.removeQueries({ queryKey: projectKeys.of(projectId) });
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: projectKeys.teamLists() }),
      ]);
    },
  });
}

export function useDuplicateProject(sourceProjectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DuplicateProjectInput) => duplicateProject(sourceProjectId, input),
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(project.id), project);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: projectKeys.teamLists() }),
      ]);
    },
  });
}

/** Clasificación y fase cambian la ficha (y `lastActivityAt`): se recarga el detalle. */
export function useUpdateClassification(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: (input: UpdateClassificationInput) => updateClassification(projectId, input),
    onSuccess: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }), invalidate(projectId)]),
  });
}

export function useCreatePhaseChange(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: (input: CreatePhaseChangeInput) => createPhaseChange(projectId, input),
    onSuccess: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }), invalidate(projectId)]),
  });
}
