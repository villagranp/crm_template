import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { Catalog, CatalogDetail, CatalogItem } from './catalogs.api';
import { CatalogsPage } from './CatalogsPage';

const ALL_PERMISSIONS = ['catalogos.ver', 'catalogos.crear', 'catalogos.editar', 'catalogos.eliminar'];
const DATES = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };

const OWN: Catalog = {
  id: 'cat-1',
  key: 'tipos',
  name: 'Tipos',
  description: null,
  isSystem: false,
  itemCount: 2,
  activeItemCount: 2,
  ...DATES,
};
const SYSTEM: Catalog = { ...OWN, id: 'cat-2', key: 'monedas', name: 'Monedas', isSystem: true };

function item(id: string, sortOrder: number): CatalogItem {
  return { id, catalogId: 'cat-1', code: id.toUpperCase(), label: `Elemento ${id}`, metadata: null, sortOrder, isActive: true, ...DATES };
}

const DETAIL: CatalogDetail = { ...OWN, items: [item('a', 10), item('b', 20)] };

function page(data: Catalog[]) {
  return { data, pagination: { page: 1, pageSize: 20, totalItems: data.length, totalPages: 1 } };
}

function signInWith(permissions: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'user-1', displayName: 'Persona de Prueba', roles: ['ADMIN'], permissions },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

beforeEach(() => {
  // jsdom no implementa `matchMedia`: pantalla ancha (vista de tabla, diálogos no a pantalla completa).
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: !query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false, errorMessage: null });
});

describe('CatalogsPage', () => {
  it('muestra acciones según permisos; los de sistema no se pueden eliminar', async () => {
    signInWith(ALL_PERMISSIONS);
    mockApi({ 'GET /catalogs': () => jsonResponse(page([OWN, SYSTEM])) });

    renderWithProviders(<CatalogsPage />);

    await screen.findByRole('table', { name: 'Catálogos' });
    expect(screen.getByRole('button', { name: 'Nuevo catálogo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar Tipos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar Monedas' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Monedas' })).toBeInTheDocument();
  });

  it('sólo con catalogos.ver no muestra crear, editar ni eliminar', async () => {
    signInWith(['catalogos.ver']);
    mockApi({
      'GET /catalogs': () => jsonResponse(page([OWN])),
      'GET /catalogs/cat-1': () => jsonResponse(DETAIL),
    });
    const user = userEvent.setup();
    renderWithProviders(<CatalogsPage />);

    await screen.findByRole('table', { name: 'Catálogos' });
    expect(screen.queryByRole('button', { name: 'Nuevo catálogo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Tipos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar Tipos' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Elementos de Tipos' }));
    const dialog = await screen.findByRole('dialog', { name: 'Catálogo Tipos' });
    expect(await within(dialog).findByText('Elemento a')).toBeInTheDocument();
    expect(within(dialog).queryByRole('form', { name: 'Añadir elemento' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Subir Elemento b' })).not.toBeInTheDocument();
  });

  it('valida y crea un catálogo', async () => {
    signInWith(ALL_PERMISSIONS);
    const fetchMock = mockApi({
      'GET /catalogs': () => jsonResponse(page([OWN])),
      'POST /catalogs': () => jsonResponse({ ...OWN, id: 'cat-9', items: [] }, 201),
    });
    const user = userEvent.setup();
    renderWithProviders(<CatalogsPage />);

    await user.click(await screen.findByRole('button', { name: 'Nuevo catálogo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo catálogo' });
    await user.type(within(dialog).getByLabelText(/clave/i), 'Con Mayúsculas');
    await user.type(within(dialog).getByLabelText(/nombre/i), 'Prueba');
    await user.click(within(dialog).getByRole('button', { name: 'Crear catálogo' }));
    expect(await within(dialog).findByText(/sólo minúsculas/i)).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/catalogs')).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText(/clave/i));
    await user.type(within(dialog).getByLabelText(/clave/i), 'prueba');
    await user.click(within(dialog).getByRole('button', { name: 'Crear catálogo' }));

    await waitFor(() => expect(callsTo(fetchMock, 'POST', '/catalogs')).toHaveLength(1));
    expect(JSON.parse(String(callsTo(fetchMock, 'POST', '/catalogs')[0]?.body))).toEqual({
      key: 'prueba',
      name: 'Prueba',
      description: null,
    });
  });

  it('en un catálogo de sistema la clave es de sólo lectura y no se envía', async () => {
    signInWith(ALL_PERMISSIONS);
    const fetchMock = mockApi({
      'GET /catalogs': () => jsonResponse(page([SYSTEM])),
      'PATCH /catalogs/cat-2': () => jsonResponse({ ...SYSTEM, items: [] }),
    });
    const user = userEvent.setup();
    renderWithProviders(<CatalogsPage />);

    await user.click(await screen.findByRole('button', { name: 'Editar Monedas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar catálogo Monedas' });
    expect(within(dialog).getByLabelText(/clave/i)).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/catalogs/cat-2')).toHaveLength(1));
    expect(JSON.parse(String(callsTo(fetchMock, 'PATCH', '/catalogs/cat-2')[0]?.body))).not.toHaveProperty('key');
  });

  it('traduce CATALOG_NOT_EMPTY al eliminar', async () => {
    signInWith(ALL_PERMISSIONS);
    mockApi({
      'GET /catalogs': () => jsonResponse(page([OWN])),
      'DELETE /catalogs/cat-1': () => errorResponse(409, 'CATALOG_NOT_EMPTY'),
    });
    const user = userEvent.setup();
    renderWithProviders(<CatalogsPage />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar Tipos' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar catálogo' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialog).findByText(/sólo se puede eliminar si está vacío/i)).toBeInTheDocument();
  });

  it('añade, reordena y desactiva elementos; traduce el código repetido', async () => {
    signInWith(ALL_PERMISSIONS);
    const fetchMock = mockApi({
      'GET /catalogs': () => jsonResponse(page([OWN])),
      'GET /catalogs/cat-1': () => jsonResponse(DETAIL),
      'POST /catalogs/cat-1/items': () => errorResponse(409, 'RESOURCE_CONFLICT'),
      'PATCH /catalogs/cat-1/items/a': () => jsonResponse(item('a', 20)),
      'PATCH /catalogs/cat-1/items/b': () => jsonResponse(item('b', 10)),
    });
    const user = userEvent.setup();
    renderWithProviders(<CatalogsPage />);

    await user.click(await screen.findByRole('button', { name: 'Elementos de Tipos' }));
    const dialog = await screen.findByRole('dialog', { name: 'Catálogo Tipos' });
    await within(dialog).findByText('Elemento a');

    // Metadata inválido: no se envía.
    await user.type(within(dialog).getByLabelText('Nuevo elemento: código'), 'A');
    await user.type(within(dialog).getByLabelText('Nuevo elemento: etiqueta'), 'Repetido');
    await user.type(within(dialog).getByLabelText('Nuevo elemento: datos extra'), '[[1]');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir' }));
    expect(await within(dialog).findByText(/debe ser un objeto json/i)).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/catalogs/cat-1/items')).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText('Nuevo elemento: datos extra'));
    await user.click(within(dialog).getByRole('button', { name: 'Añadir' }));
    expect(await within(dialog).findByText(/ya existe un elemento con ese código/i)).toBeInTheDocument();
    // Se conserva lo escrito tras el error.
    expect(within(dialog).getByLabelText('Nuevo elemento: etiqueta')).toHaveValue('Repetido');

    await user.click(within(dialog).getByRole('button', { name: 'Subir Elemento b' }));
    await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/catalogs/cat-1/items/a')).toHaveLength(1));
    expect(JSON.parse(String(callsTo(fetchMock, 'PATCH', '/catalogs/cat-1/items/b')[0]?.body))).toEqual({ sortOrder: 10 });
    expect(JSON.parse(String(callsTo(fetchMock, 'PATCH', '/catalogs/cat-1/items/a')[0]?.body))).toEqual({ sortOrder: 20 });

    await user.click(await within(dialog).findByRole('checkbox', { name: 'Desactivar Elemento a' }));
    await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/catalogs/cat-1/items/a')).toHaveLength(2));
    expect(JSON.parse(String(callsTo(fetchMock, 'PATCH', '/catalogs/cat-1/items/a')[1]?.body))).toEqual({ isActive: false });
  });
});
