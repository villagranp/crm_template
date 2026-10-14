import { useQuery } from '@tanstack/react-query';

import { createScopedQueryKeys } from '@/lib/query-keys';

import { getReportFilterOptions } from './filter-options.api';

/** Claves de Reportes: todo cuelga de `['crm', 'reports']` (solo lectura: no hay mutaciones que invaliden). */
export const reportKeys = createScopedQueryKeys('crm', 'reports');

const FILTER_OPTIONS_STALE_TIME_MS = 5 * 60_000;

/**
 * Opciones de filtro de todas las pantallas de Reportes (E.1: nunca listas fijas). Compartidas
 * en caché; si fallan, la pantalla sigue funcionando y los selectores quedan deshabilitados.
 */
export function useReportFilterOptions() {
  return useQuery({
    queryKey: [...reportKeys.all, 'filter-options'] as const,
    queryFn: getReportFilterOptions,
    staleTime: FILTER_OPTIONS_STALE_TIME_MS,
  });
}
