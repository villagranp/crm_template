import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys, type ListQuery } from '@/features/admin/common';

import {
  createTeam,
  deleteTeam,
  getTeam,
  listAllTeams,
  listTeams,
  replaceTeamMembers,
  searchUsers,
  type CreateTeamRequest,
  type TeamMembershipRequest,
  type UpdateTeamRequest,
  updateTeam,
} from './teams.api';

export const teamKeys = createQueryKeys('teams');
const hierarchyKey = [...teamKeys.all, 'hierarchy'] as const;
const userSearchKey = (search: string) => ['admin', 'teams', 'user-search', search] as const;

export function useTeams(query: ListQuery) {
  return useQuery({ queryKey: teamKeys.list(query), queryFn: () => listTeams(query), placeholderData: keepPreviousData });
}

/** Todos los equipos, para el árbol y el selector de padre. */
export function useTeamHierarchy(enabled = true) {
  return useQuery({ queryKey: hierarchyKey, queryFn: listAllTeams, enabled });
}

export function useTeam(teamId: string | null) {
  return useQuery({
    queryKey: teamKeys.detail(teamId ?? ''),
    queryFn: () => getTeam(teamId ?? ''),
    enabled: Boolean(teamId),
  });
}

export function useUserSearch(search: string, enabled: boolean) {
  return useQuery({
    queryKey: userSearchKey(search),
    queryFn: () => searchUsers(search),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Tras cualquier mutación se invalida el área entera: lista, jerarquía y detalles. */
function useInvalidateTeams() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: teamKeys.all });
}

export function useCreateTeam() {
  const invalidate = useInvalidateTeams();
  return useMutation({ mutationFn: (body: CreateTeamRequest) => createTeam(body), onSuccess: invalidate });
}

export function useUpdateTeam() {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: ({ teamId, body }: { teamId: string; body: UpdateTeamRequest }) => updateTeam(teamId, body),
    onSuccess: invalidate,
  });
}

export function useDeleteTeam() {
  const invalidate = useInvalidateTeams();
  return useMutation({ mutationFn: (teamId: string) => deleteTeam(teamId), onSuccess: invalidate });
}

export function useReplaceTeamMembers() {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: ({ teamId, members }: { teamId: string; members: TeamMembershipRequest[] }) =>
      replaceTeamMembers(teamId, members),
    onSuccess: invalidate,
  });
}
