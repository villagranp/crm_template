import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys, type ListQuery } from '@/features/admin/common';

import {
  createConversionRule,
  getTonnageUnitCode,
  listConversionRules,
  listFamilyOptions,
  listProjectTypeOptions,
  listUnitOptions,
  searchProductOptions,
  updateConversionRule,
  type CreateConversionRuleRequest,
  type UpdateConversionRuleRequest,
} from './conversions.api';

export const conversionKeys = createQueryKeys('conversions');
const optionKey = (name: string, ...rest: string[]) =>
  [...conversionKeys.all, 'options', name, ...rest] as const;

export function useConversionRules(query: ListQuery) {
  return useQuery({
    queryKey: conversionKeys.list(query),
    queryFn: () => listConversionRules(query),
    placeholderData: keepPreviousData,
  });
}

export function useUnitOptions() {
  return useQuery({ queryKey: optionKey('units'), queryFn: listUnitOptions });
}

export function useFamilyOptions(enabled: boolean) {
  return useQuery({ queryKey: optionKey('families'), queryFn: listFamilyOptions, enabled });
}

export function useProductOptions(search: string, enabled: boolean) {
  return useQuery({
    queryKey: optionKey('products', search),
    queryFn: () => searchProductOptions(search),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useProjectTypeOptions(enabled: boolean) {
  return useQuery({
    queryKey: optionKey('project-types'),
    queryFn: listProjectTypeOptions,
    enabled,
  });
}

export function useTonnageUnitCode(enabled: boolean) {
  return useQuery({ queryKey: optionKey('tonnage-unit'), queryFn: getTonnageUnitCode, enabled });
}

function useInvalidateRules() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: conversionKeys.lists() });
}

export function useCreateConversionRule() {
  const invalidate = useInvalidateRules();
  return useMutation({
    mutationFn: (body: CreateConversionRuleRequest) => createConversionRule(body),
    onSuccess: invalidate,
  });
}

export function useUpdateConversionRule() {
  const invalidate = useInvalidateRules();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateConversionRuleRequest }) =>
      updateConversionRule(id, body),
    onSuccess: invalidate,
  });
}
