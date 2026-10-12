import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { ListQuery } from '@/lib/query-keys';

/**
 * Estado de una tabla paginada en el servidor, guardado en la URL.
 *
 * Página, tamaño, búsqueda, orden y filtros viven en los search params, así
 * que una vista filtrada se puede compartir, recargar y recorrer con
 * atrás/adelante. Los nombres de parámetro son los mismos que los de la API
 * (`page`, `pageSize`, `search`, `sortBy`, `sortOrder` y cada filtro por su
 * nombre, API-STANDARDS §Colecciones), de modo que `apiQuery` se pasa tal cual
 * a `httpClient.get(path, { query: apiQuery })` y a la clave de consulta.
 *
 * Los valores por defecto no se escriben en la URL. Los valores inválidos de
 * la URL (página negativa, tamaño no permitido, orden fuera de la lista
 * blanca) se ignoran y se usa el valor por defecto: el backend valida de todos
 * modos, pero así un enlace manipulado no deja la tabla en error.
 *
 * Las opciones con arrays u objetos (`filterKeys`, `sortableFields`,
 * `defaultSort`, `pageSizeOptions`) deben ser constantes de módulo: si se
 * escriben en línea, el estado se recalcula en cada render.
 */

export type SortDirection = 'asc' | 'desc';

export interface TableSort {
  /** Campo de orden tal como lo acepta la API en `sortBy`. */
  field: string;
  direction: SortDirection;
}

export const DEFAULT_PAGE_SIZE = 20;
/** Tamaños ofrecidos; el máximo coincide con el tope del backend (`MAX_PAGE_SIZE` = 100). */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
/** Espera tras la última pulsación antes de lanzar la búsqueda. */
export const SEARCH_DEBOUNCE_MS = 300;

const FIRST_PAGE = 1;
const NO_FILTERS: readonly never[] = [];
const PARAM = {
  page: 'page',
  pageSize: 'pageSize',
  search: 'search',
  sortBy: 'sortBy',
  sortOrder: 'sortOrder',
} as const;

export interface UseTableQueryStateOptions<TFilter extends string> {
  /** Nombres de los filtros de la pantalla; cada uno es un search param con el mismo nombre que en la API. */
  filterKeys?: readonly TFilter[];
  /** Campos por los que se permite ordenar (lista blanca); si se omite, se acepta cualquiera. */
  sortableFields?: readonly string[];
  defaultSort?: TableSort | null;
  defaultPageSize?: number;
  pageSizeOptions?: readonly number[];
  searchDebounceMs?: number;
  /**
   * Prefijo de los search params (p. ej. `'projects.'`) cuando una pantalla
   * tiene varias listas en la URL. `apiQuery` sigue sin prefijo.
   */
  paramPrefix?: string;
}

export interface TableQueryState<TFilter extends string> {
  /** Página en base 1, como la API. */
  page: number;
  pageSize: number;
  /** Búsqueda ya aplicada (con debounce). Para el `<input>` usa `searchInput`. */
  search: string;
  sort: TableSort | null;
  filters: Partial<Record<TFilter, string>>;
}

export interface UseTableQueryStateResult<TFilter extends string> {
  state: TableQueryState<TFilter>;
  /** Parámetros para la API y para la clave de consulta. Sin vacíos. */
  apiQuery: ListQuery;
  /** Valor inmediato del campo de búsqueda (se aplica a la URL tras el debounce). */
  searchInput: string;
  setSearchInput: (value: string) => void;
  setPage: (page: number) => void;
  /** Cambia el tamaño y vuelve a la primera página. */
  setPageSize: (pageSize: number) => void;
  /** Cambia el orden y vuelve a la primera página. `null` = orden por defecto. */
  setSort: (sort: TableSort | null) => void;
  /** Fija o quita (`undefined`/`''`) un filtro y vuelve a la primera página. */
  setFilter: (key: TFilter, value: string | undefined) => void;
  /**
   * Fija varios filtros en una sola navegación y vuelve a la primera página.
   * Usar en formularios de filtros: varias llamadas a `setFilter` seguidas se
   * pisarían, porque cada una parte de la URL anterior a las demás.
   */
  setFilters: (values: Partial<Record<TFilter, string | undefined>>) => void;
  /** Quita búsqueda y filtros; conserva tamaño y orden. */
  clearFilters: () => void;
  pageSizeOptions: readonly number[];
}

function parsePositiveInt(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return value >= FIRST_PAGE ? value : null;
}

export function useTableQueryState<TFilter extends string = never>(
  options: UseTableQueryStateOptions<TFilter> = {},
): UseTableQueryStateResult<TFilter> {
  const {
    filterKeys = NO_FILTERS,
    sortableFields,
    defaultSort = null,
    defaultPageSize = DEFAULT_PAGE_SIZE,
    pageSizeOptions = PAGE_SIZE_OPTIONS,
    searchDebounceMs = SEARCH_DEBOUNCE_MS,
    paramPrefix = '',
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();

  const state = useMemo<TableQueryState<TFilter>>(() => {
    const parsedPageSize = parsePositiveInt(searchParams.get(paramPrefix + PARAM.pageSize));
    const pageSize = parsedPageSize !== null && pageSizeOptions.includes(parsedPageSize) ? parsedPageSize : defaultPageSize;

    const sortBy = searchParams.get(paramPrefix + PARAM.sortBy);
    const isSortAllowed = sortBy !== null && (!sortableFields || sortableFields.includes(sortBy));
    const direction: SortDirection = searchParams.get(paramPrefix + PARAM.sortOrder) === 'desc' ? 'desc' : 'asc';

    const filters: Partial<Record<TFilter, string>> = {};
    for (const key of filterKeys) {
      const value = searchParams.get(paramPrefix + key);
      if (value) {
        filters[key] = value;
      }
    }

    return {
      page: parsePositiveInt(searchParams.get(paramPrefix + PARAM.page)) ?? FIRST_PAGE,
      pageSize,
      search: searchParams.get(paramPrefix + PARAM.search) ?? '',
      sort: isSortAllowed ? { field: sortBy, direction } : defaultSort,
      filters,
    };
  }, [searchParams, filterKeys, sortableFields, defaultSort, defaultPageSize, pageSizeOptions, paramPrefix]);
  const searchParam = state.search;

  const apiQuery = useMemo<ListQuery>(() => {
    const query: ListQuery = { page: state.page, pageSize: state.pageSize };
    if (state.search) {
      query.search = state.search;
    }
    if (state.sort) {
      query.sortBy = state.sort.field;
      query.sortOrder = state.sort.direction;
    }
    for (const [key, value] of Object.entries(state.filters)) {
      if (typeof value === 'string' && value) {
        query[key] = value;
      }
    }
    return query;
  }, [state]);

  /** Aplica cambios a la URL; `resetPage` vuelve a la primera página. */
  const update = useCallback(
    (changes: Record<string, string | null>, { resetPage = true, replace = false } = {}) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '') {
              next.delete(paramPrefix + key);
            } else {
              next.set(paramPrefix + key, value);
            }
          }
          if (resetPage) {
            next.delete(paramPrefix + PARAM.page);
          }
          return next;
        },
        { replace },
      );
    },
    [setSearchParams, paramPrefix],
  );

  // Búsqueda con debounce: el input responde al instante y la URL (y con ella
  // la consulta) sólo cambia cuando el usuario deja de escribir.
  const [searchInput, setSearchInput] = useState(searchParam);

  useEffect(() => {
    // Navegación atrás/adelante o "limpiar filtros": el input sigue a la URL.
    setSearchInput(searchParam);
  }, [searchParam]);

  useEffect(() => {
    const normalized = searchInput.trim();
    if (normalized === searchParam) {
      return undefined;
    }
    const timer = setTimeout(() => update({ [PARAM.search]: normalized }, { replace: true }), searchDebounceMs);
    return () => clearTimeout(timer);
  }, [searchInput, searchParam, searchDebounceMs, update]);

  const setPage = useCallback(
    (page: number) => update({ [PARAM.page]: page > FIRST_PAGE ? String(page) : null }, { resetPage: false }),
    [update],
  );

  const setPageSize = useCallback(
    (pageSize: number) => update({ [PARAM.pageSize]: pageSize === defaultPageSize ? null : String(pageSize) }),
    [update, defaultPageSize],
  );

  const setSort = useCallback(
    (sort: TableSort | null) =>
      update({ [PARAM.sortBy]: sort?.field ?? null, [PARAM.sortOrder]: sort?.direction ?? null }),
    [update],
  );

  const setFilter = useCallback((key: TFilter, value: string | undefined) => update({ [key]: value ?? null }), [update]);

  const setFilters = useCallback(
    (values: Partial<Record<TFilter, string | undefined>>) =>
      update(
        Object.fromEntries(
          Object.entries<string | undefined>(values).map(([key, value]) => [key, value?.trim() || null]),
        ),
      ),
    [update],
  );

  const clearFilters = useCallback(() => {
    setSearchInput('');
    update(Object.fromEntries([PARAM.search, ...filterKeys].map((key) => [key, null])));
  }, [update, filterKeys]);

  return {
    state,
    apiQuery,
    searchInput,
    setSearchInput,
    setPage,
    setPageSize,
    setSort,
    setFilter,
    setFilters,
    clearFilters,
    pageSizeOptions,
  };
}
