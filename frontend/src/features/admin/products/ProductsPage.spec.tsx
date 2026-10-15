import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { Product, ProductFamily, UnitOfMeasure } from './products.api';
import { ProductsPage } from './ProductsPage';

const FAMILY: ProductFamily = {
  id: 'fam-1',
  code: 'ACERO',
  name: 'Acero',
  description: null,
  sortOrder: 10,
  isActive: true,
};
const TON: UnitOfMeasure = {
  id: 'unit-ton',
  code: 'TON',
  name: 'Tonelada',
  symbol: 't',
  dimension: 'MASS',
  sortOrder: 1,
  isActive: true,
};
const KG: UnitOfMeasure = {
  id: 'unit-kg',
  code: 'KG',
  name: 'Kilogramo',
  symbol: 'kg',
  dimension: 'MASS',
  sortOrder: 2,
  isActive: true,
};
const PRODUCT: Product = {
  id: 'prod-1',
  sku: 'VAR-3',
  description: 'Varilla de 3/8',
  family: { id: FAMILY.id, code: FAMILY.code, name: FAMILY.name },
  baseUnit: { id: TON.id, code: TON.code, symbol: TON.symbol, dimension: TON.dimension },
  isActive: true,
};

function page<T>(data: T[]) {
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

function api(extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /products': () => jsonResponse(page([PRODUCT])),
    'GET /product-families': () => jsonResponse(page([FAMILY])),
    'GET /units-of-measure': () => jsonResponse(page([TON, KG])),
    ...extra,
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
  useAuthStore.setState({
    status: 'anonymous',
    user: null,
    passwordChangeRequired: false,
    errorMessage: null,
  });
});

describe('ProductsPage', () => {
  it('con sólo productos.ver lista productos sin acciones de escritura', async () => {
    signInWith(['productos.ver']);
    api();

    renderWithProviders(<ProductsPage />);

    const table = await screen.findByRole('table', { name: 'Productos' });
    expect(within(table).getByText('VAR-3')).toBeInTheDocument();
    expect(within(table).getByText('Acero')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Productos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'Nuevo producto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar VAR-3' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Eliminar/ })).not.toBeInTheDocument();
  });

  it('el filtro de estado envía isActive=all o false; sin filtro, el backend da sólo activos', async () => {
    signInWith(['productos.ver']);
    const fetchMock = api();
    const user = userEvent.setup();

    renderWithProviders(<ProductsPage />);
    await screen.findByRole('table', { name: 'Productos' });
    const queries = () =>
      fetchMock.mock.calls
        .map(([input]) => new URL(String(input), 'http://localhost'))
        .filter((url) => url.pathname.endsWith('/products'))
        .map((url) => url.searchParams.get('isActive'));
    expect(queries()[0]).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Todos/ }));
    await waitFor(() => expect(queries().at(-1)).toBe('all'));
    await user.click(screen.getByRole('button', { name: /^Inactivos/ }));
    await waitFor(() => expect(queries().at(-1)).toBe('false'));
  });

  it('da de alta un producto con familia y unidad base activas', async () => {
    signInWith(['productos.ver', 'productos.configurar']);
    const fetchMock = api({ 'POST /products': () => jsonResponse(PRODUCT, 201) });
    const user = userEvent.setup();

    renderWithProviders(<ProductsPage />);
    await user.click(await screen.findByRole('button', { name: 'Nuevo producto' }));

    const dialog = screen.getByRole('dialog', { name: 'Nuevo producto' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /SKU/ }), {
      target: { value: 'VAR-4' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Descripción/ }), {
      target: { value: 'Varilla de 1/2' },
    });
    await user.click(within(dialog).getByRole('combobox', { name: /Familia/ }));
    await user.click(await screen.findByRole('option', { name: 'Acero' }));
    await user.click(within(dialog).getByRole('combobox', { name: /Unidad base/ }));
    await user.click(await screen.findByRole('option', { name: 'Kilogramo (kg)' }));
    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [post] = callsTo(fetchMock, 'POST', '/products');
    expect(JSON.parse(String(post?.body))).toEqual({
      sku: 'VAR-4',
      description: 'Varilla de 1/2',
      familyId: 'fam-1',
      baseUnitId: 'unit-kg',
    });
  });

  it('corrige el SKU; si ya existe, muestra el 409 con un mensaje propio', async () => {
    signInWith(['productos.ver', 'productos.configurar']);
    const fetchMock = api({
      'PATCH /products/prod-1': () => errorResponse(409, 'RESOURCE_CONFLICT', [{ field: 'sku' }]),
    });
    const user = userEvent.setup();

    renderWithProviders(<ProductsPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar VAR-3' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar producto VAR-3' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /SKU/ }), {
      target: { value: 'VAR-9' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await within(dialog).findByText('Ya existe un producto con ese SKU.'),
    ).toBeInTheDocument();
    const [patch] = callsTo(fetchMock, 'PATCH', '/products/prod-1');
    expect(JSON.parse(String(patch?.body))).toMatchObject({ sku: 'VAR-9' });
  });

  it('desactiva una familia desde su pestaña (sin borrado)', async () => {
    signInWith(['productos.ver', 'productos.configurar']);
    const fetchMock = api({
      'PATCH /product-families/fam-1': () => jsonResponse({ ...FAMILY, isActive: false }),
    });
    const user = userEvent.setup();

    renderWithProviders(<ProductsPage />);
    await user.click(screen.getByRole('tab', { name: 'Familias' }));
    await user.click(await screen.findByRole('button', { name: 'Desactivar Acero' }));
    const confirm = screen.getByRole('dialog', { name: 'Desactivar la familia' });
    await user.click(within(confirm).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, 'PATCH', '/product-families/fam-1')).toHaveLength(1),
    );
    const [patch] = callsTo(fetchMock, 'PATCH', '/product-families/fam-1');
    expect(JSON.parse(String(patch?.body))).toEqual({ isActive: false });
  });

  it('unidades: cambiar la dimensión de una unidad usada explica el 409 UNIT_DIMENSION_LOCKED', async () => {
    signInWith(['productos.ver', 'productos.configurar']);
    const fetchMock = api({
      'PATCH /units-of-measure/unit-kg': () => errorResponse(409, 'UNIT_DIMENSION_LOCKED'),
    });
    const user = userEvent.setup();

    renderWithProviders(<ProductsPage />, {
      initialEntries: ['/administracion/productos?tab=unidades'],
    });
    await user.click(await screen.findByRole('button', { name: 'Editar Kilogramo' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar unidad Kilogramo' });
    expect(within(dialog).getByRole('textbox', { name: /Código/ })).toBeDisabled();
    await user.click(within(dialog).getByRole('combobox', { name: /Dimensión/ }));
    await user.click(await screen.findByRole('option', { name: 'Conteo' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    expect(await within(dialog).findByText(/su dimensión no se puede cambiar/)).toBeInTheDocument();
    const [patch] = callsTo(fetchMock, 'PATCH', '/units-of-measure/unit-kg');
    expect(JSON.parse(String(patch?.body))).toMatchObject({ dimension: 'COUNT' });
    expect(JSON.parse(String(patch?.body))).not.toHaveProperty('code');
  });

  it('un error de carga se muestra traducido y se puede reintentar', async () => {
    signInWith(['productos.ver']);
    mockApi({ 'GET /products': () => errorResponse(500, 'INTERNAL_ERROR') });

    renderWithProviders(<ProductsPage />);

    expect(
      await screen.findByText('Ha ocurrido un error en el servidor. Inténtalo de nuevo más tarde.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
