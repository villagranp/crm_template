import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys, type ListQuery } from '@/features/admin/common';

import {
  createSafetyMinute,
  deleteSafetyMinute,
  listSafetyMinutes,
  updateSafetyMinute,
  type CreateSafetyMinuteRequest,
  type UpdateSafetyMinuteRequest,
} from './safety-minutes.api';

export const safetyMinuteKeys = createQueryKeys('safety-minutes');

export function useSafetyMinutes(query: ListQuery) {
  return useQuery({
    queryKey: safetyMinuteKeys.list(query),
    queryFn: () => listSafetyMinutes(query),
    placeholderData: keepPreviousData,
  });
}

/** Alta, edición y borrado invalidan las listas del área. */
function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: safetyMinuteKeys.lists() });
}

export function useCreateSafetyMinute() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateSafetyMinuteRequest) => createSafetyMinute(body),
    onSuccess: invalidate,
  });
}

export function useUpdateSafetyMinute() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSafetyMinuteRequest }) => updateSafetyMinute(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteSafetyMinute() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => deleteSafetyMinute(id), onSuccess: invalidate });
}
