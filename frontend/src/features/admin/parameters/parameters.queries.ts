import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys } from '@/features/admin/common';

import { listParameters, updateParameter } from './parameters.api';

export const parameterKeys = createQueryKeys('parameters');

export function useParameters() {
  return useQuery({ queryKey: parameterKeys.lists(), queryFn: listParameters });
}

export function useUpdateParameter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => updateParameter(key, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: parameterKeys.all }),
  });
}
