import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { createQueryKeys, type ListQuery } from '@/features/admin/common';

import { getApproval, listApprovals } from './approvals.api';

export const approvalKeys = createQueryKeys('approvals');

export function useApprovals(query: ListQuery) {
  return useQuery({ queryKey: approvalKeys.list(query), queryFn: () => listApprovals(query), placeholderData: keepPreviousData });
}

export function useApproval(id: string | null) {
  return useQuery({
    queryKey: approvalKeys.detail(id ?? ''),
    queryFn: () => getApproval(id ?? ''),
    enabled: id !== null,
  });
}
