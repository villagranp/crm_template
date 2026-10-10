import { useQueries, type QueryKey } from '@tanstack/react-query';

import type { ListQuery, Paginated } from './admin-api';

/** Parámetros de una consulta de lista que no cambian el total. */
const NON_FILTER_PARAMS = ['page', 'pageSize', 'sortBy', 'sortOrder'] as const;
/** La página más pequeña: sólo interesa `pagination.totalItems`. */
const COUNT_PAGE_SIZE = 1;

export interface UseFilterCountsOptions<TItem> {
  /** Consulta de la lista tal como la usa la pantalla (`table.apiQuery`). */
  baseQuery: ListQuery;
  /** Filtro cuyos valores se cuentan (p. ej. `status`). */
  filterKey: string;
  /** Valores a contar; `''` cuenta todos (sin ese filtro). */
  values: readonly string[];
  /** Clave de consulta de la lista del área (`<area>Keys.list`), para que las mutaciones la invaliden. */
  queryKey: (query: ListQuery) => QueryKey;
  queryFn: (query: ListQuery) => Promise<Paginated<TItem>>;
  enabled?: boolean;
}

/**
 * Contadores de los chips de filtro, sacados del `totalItems` de la API.
 *
 * Cada valor es una consulta de una sola fila con la búsqueda y el resto de
 * filtros actuales, así que el número coincide con lo que la tabla mostraría al
 * pulsar el chip. Usa la clave de lista del área: cualquier mutación que
 * invalide `lists()` refresca también los contadores. Devuelve `undefined`
 * para un valor mientras carga o si falló: el chip se pinta sin contador.
 */
export function useFilterCounts<TItem>({
  baseQuery,
  filterKey,
  values,
  queryKey,
  queryFn,
  enabled = true,
}: UseFilterCountsOptions<TItem>): Record<string, number | undefined> {
  const common: ListQuery = { ...baseQuery };
  for (const param of [...NON_FILTER_PARAMS, filterKey]) {
    delete common[param];
  }

  const results = useQueries({
    queries: values.map((value) => {
      const query: ListQuery = { ...common, page: 1, pageSize: COUNT_PAGE_SIZE };
      if (value) {
        query[filterKey] = value;
      }
      return {
        queryKey: queryKey(query),
        queryFn: () => queryFn(query),
        enabled,
        select: (page: Paginated<TItem>) => page.pagination.totalItems,
      };
    }),
  });

  return Object.fromEntries(values.map((value, index) => [value, results[index]?.data]));
}
