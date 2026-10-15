import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys, type ListQuery } from '@/features/admin/common';

import {
  createExchangeRate,
  listCurrencies,
  listExchangeRates,
  updateExchangeRate,
  type CreateExchangeRateRequest,
  type UpdateExchangeRateRequest,
} from './exchange-rates.api';

export const exchangeRateKeys = createQueryKeys('exchange-rates');
const currencyKey = [...exchangeRateKeys.all, 'currencies'] as const;

export function useExchangeRates(query: ListQuery) {
  return useQuery({
    queryKey: exchangeRateKeys.list(query),
    queryFn: () => listExchangeRates(query),
    placeholderData: keepPreviousData,
  });
}

/** Monedas sembradas (cinco filas, sólo lectura): cambian con un despliegue, así que no caducan en la sesión. */
export function useCurrencies() {
  return useQuery({ queryKey: currencyKey, queryFn: listCurrencies, staleTime: Infinity });
}

function useInvalidateRates() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: exchangeRateKeys.lists() });
}

export function useCreateExchangeRate() {
  const invalidate = useInvalidateRates();
  return useMutation({
    mutationFn: (body: CreateExchangeRateRequest) => createExchangeRate(body),
    onSuccess: invalidate,
  });
}

export function useUpdateExchangeRate() {
  const invalidate = useInvalidateRates();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateExchangeRateRequest }) =>
      updateExchangeRate(id, body),
    onSuccess: invalidate,
  });
}
