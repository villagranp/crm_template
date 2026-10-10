import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { DataTable, type DataTableColumn, type DataTableProps } from './DataTable';

interface Person {
  id: string;
  name: string;
  email: string;
}

const PEOPLE: Person[] = [
  { id: 'p-1', name: 'Ana Pruebas', email: 'ana@example.test' },
  { id: 'p-2', name: 'Beto Pruebas', email: 'beto@example.test' },
];

const COLUMNS: DataTableColumn<Person>[] = [
  { id: 'name', header: 'Nombre', render: (row) => row.name, sortable: true, primary: true },
  { id: 'email', header: 'Correo', render: (row) => row.email },
];

/** jsdom no implementa `matchMedia`; se simula una pantalla ancha (todas las consultas `min-width` se cumplen). */
function simulateScreen(isWide: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: isWide,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function renderTable(overrides: Partial<DataTableProps<Person>> = {}) {
  const props: DataTableProps<Person> = {
    label: 'Personas',
    columns: COLUMNS,
    rows: PEOPLE,
    getRowId: (row) => row.id,
    totalItems: 45,
    page: 1,
    pageSize: 20,
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    sort: null,
    onSortChange: vi.fn(),
    ...overrides,
  };
  renderWithProviders(<DataTable {...props} />);
  return props;
}

describe('DataTable en pantalla ancha', () => {
  beforeEach(() => simulateScreen(true));

  it('pinta una tabla accesible con cabeceras, filas y acciones', () => {
    renderTable({ rowActions: (row) => <button type="button">{`Editar ${row.name}`}</button> });

    const table = screen.getByRole('table', { name: 'Personas' });
    expect(within(table).getByRole('columnheader', { name: /nombre/i })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Acciones' })).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(PEOPLE.length + 1);
    expect(within(table).getByRole('button', { name: 'Editar Beto Pruebas' })).toBeInTheDocument();
  });

  it('notifica la página siguiente en base 1 y el cambio de tamaño', async () => {
    const user = userEvent.setup();
    const props = renderTable({ page: 2 });

    expect(screen.getByText('Mostrando 21–40 de 45')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página 2, actual' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(props.onPageChange).toHaveBeenCalledWith(3);

    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(props.onPageChange).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole('button', { name: 'Ir a la página 3' }));
    expect(props.onPageChange).toHaveBeenLastCalledWith(3);

    await user.click(screen.getByRole('combobox', { name: 'Filas por página' }));
    await user.click(screen.getByRole('option', { name: '50' }));
    expect(props.onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('ordena por una columna ordenable y alterna la dirección', async () => {
    const user = userEvent.setup();
    const props = renderTable({ sort: { field: 'name', direction: 'asc' } });

    const header = screen.getByRole('columnheader', { name: /nombre/i });
    expect(header).toHaveAttribute('aria-sort', 'ascending');

    await user.click(within(header).getByRole('button'));
    expect(props.onSortChange).toHaveBeenCalledWith({ field: 'name', direction: 'desc' });
    expect(
      within(screen.getByRole('columnheader', { name: 'Correo' })).queryByRole('button'),
    ).not.toBeInTheDocument();
  });

  it('muestra el estado vacío y no pagina cuando no hay filas', () => {
    renderTable({ rows: [], totalItems: 0, emptyTitle: 'No hay personas' });

    expect(screen.getByText('No hay personas')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Página siguiente' })).not.toBeInTheDocument();
  });

  it('muestra el cargador en la primera carga', () => {
    renderTable({ rows: undefined, isLoading: true });

    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
    expect(screen.queryByText(/no hay resultados/i)).not.toBeInTheDocument();
  });

  it('muestra el error traducido con opción de reintentar', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderTable({
      rows: undefined,
      errorMessage: 'No tienes permiso para realizar esta acción.',
      onRetry,
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No tienes permiso para realizar esta acción.',
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('DataTable en móvil', () => {
  beforeEach(() => simulateScreen(false));

  it('pinta cada fila como una tarjeta con su título, sus datos y sus acciones', () => {
    renderTable({ rowActions: (row) => <button type="button">{`Editar ${row.name}`}</button> });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Personas' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(PEOPLE.length);
    expect(within(cards[0]!).getByText('Ana Pruebas')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Correo')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('ana@example.test')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Acciones')).toBeInTheDocument();
    expect(
      within(cards[0]!).getByRole('button', { name: 'Editar Ana Pruebas' }),
    ).toBeInTheDocument();
  });

  it('ofrece el orden con un selector y sigue paginando', async () => {
    const user = userEvent.setup();
    const props = renderTable();

    await user.click(screen.getByRole('combobox', { name: 'Ordenar por' }));
    await user.click(screen.getByRole('option', { name: 'Nombre (descendente)' }));
    expect(props.onSortChange).toHaveBeenCalledWith({ field: 'name', direction: 'desc' });

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(props.onPageChange).toHaveBeenCalledWith(2);
  });
});
