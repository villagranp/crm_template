import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SEARCH_DEBOUNCE_MS,
  useTableQueryState,
  type UseTableQueryStateOptions,
} from './use-table-query-state';

type Filter = 'status' | 'roleId';

const FILTER_KEYS: readonly Filter[] = ['status', 'roleId'];
const SORTABLE_FIELDS = ['displayName', 'createdAt'] as const;
const OPTIONS: UseTableQueryStateOptions<Filter> = {
  filterKeys: FILTER_KEYS,
  sortableFields: SORTABLE_FIELDS,
};

function renderTableState(
  initialUrl = '/lista',
  options: UseTableQueryStateOptions<Filter> = OPTIONS,
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>;
  }
  return renderHook(
    () => ({ table: useTableQueryState<Filter>(options), location: useLocation() }),
    {
      wrapper: Wrapper,
    },
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useTableQueryState', () => {
  it('sin parámetros usa los valores por defecto y no escribe nada en la URL', () => {
    const { result } = renderTableState();

    expect(result.current.table.state).toEqual({
      page: 1,
      pageSize: 20,
      search: '',
      sort: null,
      filters: {},
    });
    expect(result.current.table.apiQuery).toEqual({ page: 1, pageSize: 20 });
    expect(result.current.location.search).toBe('');
  });

  it('lee el estado de la URL con los mismos nombres que la API', () => {
    const { result } = renderTableState(
      '/lista?page=3&pageSize=50&search=ana&sortBy=createdAt&sortOrder=desc&status=ACTIVE&otro=x',
    );

    expect(result.current.table.state).toEqual({
      page: 3,
      pageSize: 50,
      search: 'ana',
      sort: { field: 'createdAt', direction: 'desc' },
      filters: { status: 'ACTIVE' },
    });
    expect(result.current.table.apiQuery).toEqual({
      page: 3,
      pageSize: 50,
      search: 'ana',
      sortBy: 'createdAt',
      sortOrder: 'desc',
      status: 'ACTIVE',
    });
  });

  it('ignora valores manipulados: página inválida, tamaño no ofrecido y orden fuera de la lista blanca', () => {
    const { result } = renderTableState(
      '/lista?page=-2&pageSize=5000&sortBy=passwordHash&sortOrder=desc',
    );

    expect(result.current.table.state.page).toBe(1);
    expect(result.current.table.state.pageSize).toBe(20);
    expect(result.current.table.state.sort).toBeNull();
  });

  it('cambiar de página conserva el resto; cambiar orden, tamaño o filtro vuelve a la primera página', () => {
    const { result } = renderTableState('/lista?status=ACTIVE');

    act(() => result.current.table.setPage(4));
    expect(result.current.location.search).toBe('?status=ACTIVE&page=4');

    act(() => result.current.table.setSort({ field: 'displayName', direction: 'asc' }));
    expect(result.current.table.state.page).toBe(1);
    expect(result.current.table.state.sort).toEqual({ field: 'displayName', direction: 'asc' });

    act(() => result.current.table.setPage(2));
    act(() => result.current.table.setPageSize(50));
    expect(result.current.table.state).toMatchObject({ page: 1, pageSize: 50 });

    act(() => result.current.table.setPage(2));
    act(() => result.current.table.setFilter('roleId', 'r-1'));
    expect(result.current.table.state).toMatchObject({
      page: 1,
      filters: { status: 'ACTIVE', roleId: 'r-1' },
    });

    act(() => result.current.table.setFilter('status', undefined));
    expect(result.current.table.state.filters).toEqual({ roleId: 'r-1' });
  });

  it('setFilters aplica varios filtros en una sola navegación, sin pisarse', () => {
    const { result } = renderTableState('/lista?page=3&status=ACTIVE');

    act(() => result.current.table.setFilters({ status: undefined, roleId: ' r-2 ' }));

    expect(result.current.table.state).toMatchObject({ page: 1, filters: { roleId: 'r-2' } });
  });

  it('aplica la búsqueda a la URL sólo cuando el usuario deja de escribir, y vuelve a la primera página', () => {
    vi.useFakeTimers();
    const { result } = renderTableState('/lista?page=3');

    act(() => result.current.table.setSearchInput('an'));
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    });
    act(() => result.current.table.setSearchInput(' ana '));

    expect(result.current.table.searchInput).toBe(' ana ');
    expect(result.current.table.state.search).toBe('');

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    expect(result.current.table.state.search).toBe('ana');
    expect(result.current.table.state.page).toBe(1);
    expect(result.current.location.search).toBe('?search=ana');
  });

  it('limpiar filtros quita búsqueda y filtros pero conserva tamaño y orden', () => {
    const { result } = renderTableState(
      '/lista?search=ana&status=ACTIVE&pageSize=50&sortBy=createdAt&sortOrder=asc',
    );

    act(() => result.current.table.clearFilters());

    expect(result.current.table.state).toEqual({
      page: 1,
      pageSize: 50,
      search: '',
      sort: { field: 'createdAt', direction: 'asc' },
      filters: {},
    });
    expect(result.current.table.searchInput).toBe('');
  });

  it('con prefijo lee y escribe sólo sus parámetros y entrega la consulta sin prefijo', () => {
    const PREFIX_OPTIONS: UseTableQueryStateOptions<Filter> = { ...OPTIONS, paramPrefix: 'projects.' };
    const { result } = renderTableState('/ficha?page=4&status=OTRO&projects.status=ACTIVE&projects.page=2', PREFIX_OPTIONS);

    expect(result.current.table.state.page).toBe(2);
    expect(result.current.table.apiQuery).toEqual({ page: 2, pageSize: 20, status: 'ACTIVE' });

    act(() => result.current.table.setFilter('roleId', 'r-1'));

    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('projects.roleId')).toBe('r-1');
    expect(params.has('projects.page')).toBe(false);
    expect(params.get('page')).toBe('4');
    expect(params.get('status')).toBe('OTRO');
  });
});
