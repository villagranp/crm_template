import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { projectKeys } from '@/features/crm/projects';
import { createScopedQueryKeys, type ListQuery } from '@/lib/query-keys';

import {
  getForecastTotals,
  getForecastWindow,
  listForecastRows,
  listForecastUnits,
  saveForecastLines,
  type SaveForecastLineInput,
} from './forecast.api';

/** Claves bajo `['crm', 'forecast']`: un guardado invalida filas y totales de cualquier filtro. */
const base = createScopedQueryKeys('crm', 'forecast');

export const forecastKeys = {
  ...base,
  window: () => [...base.all, 'window'] as const,
  rows: (query: ListQuery) => [...base.all, 'rows', query] as const,
  totals: (query: ListQuery) => [...base.all, 'totals', query] as const,
  units: () => [...base.all, 'units'] as const,
};

const OPTIONS_STALE_TIME_MS = 5 * 60_000;

export function useForecastWindow() {
  return useQuery({ queryKey: forecastKeys.window(), queryFn: getForecastWindow, staleTime: OPTIONS_STALE_TIME_MS });
}

export function useForecastRows(query: ListQuery) {
  return useQuery({
    queryKey: forecastKeys.rows(query),
    queryFn: () => listForecastRows(query),
    placeholderData: keepPreviousData,
  });
}

export function useForecastTotals(query: ListQuery) {
  return useQuery({
    queryKey: forecastKeys.totals(query),
    queryFn: () => getForecastTotals(query),
    placeholderData: keepPreviousData,
  });
}

export function useForecastUnits(enabled: boolean) {
  return useQuery({ queryKey: forecastKeys.units(), queryFn: listForecastUnits, staleTime: OPTIONS_STALE_TIME_MS, enabled });
}

/**
 * Guardado en lote. Tras guardar se recargan filas y totales, y lo que el
 * proyecto deriva del forecast (`lastActivityAt`, historial).
 */
export function useSaveForecastLines() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lines: SaveForecastLineInput[]) => saveForecastLines(lines),
    onSuccess: (_result, lines) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: forecastKeys.all }),
        ...[...new Set(lines.map((line) => line.projectId))].flatMap((projectId) => [
          queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
          queryClient.invalidateQueries({ queryKey: projectKeys.of(projectId) }),
        ]),
        queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
      ]),
  });
}
