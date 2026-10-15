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

const DETAIL: CatalogDetail = {
  ...OWN,
  metadataSchema: null,
  closedSet: false,
  items: [item('a', 10), item('b', 20)],
};

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
  describe('07 E.3: catálogos del CRM', () => {
    const CRM: Catalog = {
      ...OWN,
      id: 'cat-crm',
      key: 'crm.etapa_oportunidad',
      name: 'Etapas de oportunidad',
      isSystem: true,
    };
    const STAGE: CatalogItem = {
      ...item('st-1', 10),
      catalogId: 'cat-crm',
      code: 'PROSPECCION',
      label: 'Prospección',
      metadata: { order: 10, isClosed: false, outcome: null, inFunnel: true },
    };
    const INACTIVE_STAGE: CatalogItem = {
      ...item('st-2', 20),
      catalogId: 'cat-crm',
      code: 'ANTIGUA',
      label: 'Etapa antigua',
      isActive: false,
      metadata: { order: 20, isClosed: false, outcome: null, inFunnel: false },
    };
    const CRM_DETAIL: CatalogDetail = {
      ...CRM,
      closedSet: false,
      metadataSchema: [
        { key: 'order', type: 'number', required: true, integer: true, min: 0, max: 1000 },
        { key: 'isClosed', type: 'boolean', required: true },
        { key: 'outcome', type: 'enum', required: false, nullable: true, values: ['WON', 'LOST'] },
        { key: 'inFunnel', type: 'boolean', required: true },
      ],
      items: [STAGE, INACTIVE_STAGE],
    };
    const RESULT: Catalog = {
      ...OWN,
      id: 'cat-res',
      key: 'crm.resultado_oportunidad',
      name: 'Resultados de oportunidad',
      isSystem: true,
    };
    const RESULT_DETAIL: CatalogDetail = {
      ...RESULT,
      closedSet: true,
      metadataSchema: [
        { key: 'requiresReason', type: 'boolean', required: true },
        { key: 'requiresAwardedPercent', type: 'boolean', required: true },
        { key: 'stageOutcome', type: 'enum', required: true, values: ['WON', 'LOST'] },
      ],
      items: [
        {
          ...item('res-1', 10),
          catalogId: 'cat-res',
          code: 'WON',
          label: 'Ganada',
          metadata: { requiresReason: false, requiresAwardedPercent: false, stageOutcome: 'WON' },
        },
      ],
    };

    it('el filtro rápido «Catálogos del CRM» busca por el prefijo crm.', async () => {
      signInWith(ALL_PERMISSIONS);
      const fetchMock = mockApi({ 'GET /catalogs': () => jsonResponse(page([CRM])) });
      const user = userEvent.setup();
      renderWithProviders(<CatalogsPage />);

      const scope = await screen.findByRole('group', { name: 'Filtrar por ámbito' });
      await user.click(within(scope).getByRole('button', { name: 'Catálogos del CRM' }));

      await waitFor(() => {
        const searches = fetchMock.mock.calls
          .map(([input]) => new URL(String(input), 'http://localhost'))
          .filter((url) => url.pathname.endsWith('/catalogs') && url.searchParams.get('pageSize') !== '1')
          .map((url) => url.searchParams.get('search'));
        expect(searches.at(-1)).toBe('crm.');
      });
      expect(within(scope).getByRole('button', { name: 'Catálogos del CRM' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('PF-07.11: con metadataSchema el alta pinta un formulario y envía el metadata tipado', async () => {
      signInWith(ALL_PERMISSIONS);
      const fetchMock = mockApi({
        'GET /catalogs': () => jsonResponse(page([CRM])),
        'GET /catalogs/cat-crm': () => jsonResponse(CRM_DETAIL),
        'POST /catalogs/cat-crm/items': () => jsonResponse(STAGE, 201),
      });
      const user = userEvent.setup();
      renderWithProviders(<CatalogsPage />);

      await user.click(await screen.findByRole('button', { name: 'Elementos de Etapas de oportunidad' }));
      const dialog = await screen.findByRole('dialog', { name: 'Catálogo Etapas de oportunidad' });
      await within(dialog).findByText('Prospección');
      // El metadata se lee con etiquetas, no como JSON.
      expect(within(dialog).getByText(/Orden en el flujo: 10 · Etapa cerrada: no/)).toBeInTheDocument();
      expect(within(dialog).queryByLabelText('Nuevo elemento: datos extra')).not.toBeInTheDocument();

      await user.click(within(dialog).getByLabelText('Nuevo elemento: código'));
      await user.paste('GANADA');
      await user.click(within(dialog).getByLabelText('Nuevo elemento: etiqueta'));
      await user.paste('Ganada');
      // Sin el orden (obligatorio) no se envía.
      await user.click(within(dialog).getByRole('button', { name: 'Añadir' }));
      expect(await within(dialog).findByText('Obligatorio.')).toBeInTheDocument();
      expect(callsTo(fetchMock, 'POST', '/catalogs/cat-crm/items')).toHaveLength(0);

      await user.click(within(dialog).getByLabelText('Nuevo elemento: Orden en el flujo'));
      await user.paste('90');
      await user.click(within(dialog).getByLabelText('Nuevo elemento: Etapa cerrada'));
      await user.click(within(dialog).getByRole('combobox', { name: /resultado de la etapa/i }));
      await user.click(await screen.findByRole('option', { name: 'Ganada' }));
      await user.click(within(dialog).getByRole('button', { name: 'Añadir' }));

      await waitFor(() => expect(callsTo(fetchMock, 'POST', '/catalogs/cat-crm/items')).toHaveLength(1));
      expect(JSON.parse(String(callsTo(fetchMock, 'POST', '/catalogs/cat-crm/items')[0]?.body))).toEqual({
        code: 'GANADA',
        label: 'Ganada',
        metadata: { order: 90, isClosed: true, outcome: 'WON', inFunnel: false },
      });
    });

    it('muestra el campo de un 422 INVALID_CATALOG_METADATA y los parámetros de referenced_by_parameter', async () => {
      signInWith(ALL_PERMISSIONS);
      mockApi({
        'GET /catalogs': () => jsonResponse(page([CRM])),
        'GET /catalogs/cat-crm': () => jsonResponse(CRM_DETAIL),
        'POST /catalogs/cat-crm/items': () =>
          errorResponse(422, 'INVALID_CATALOG_METADATA', [{ field: 'metadata.outcome', issue: 'Valor no admitido' }]),
        'PATCH /catalogs/cat-crm/items/st-1': () =>
          errorResponse(409, 'CATALOG_INVARIANT', [
            { reason: 'referenced_by_parameter', code: 'PROSPECCION', keys: ['crm.valores_por_defecto'] },
          ]),
      });
      const user = userEvent.setup();
      renderWithProviders(<CatalogsPage />);

      await user.click(await screen.findByRole('button', { name: 'Elementos de Etapas de oportunidad' }));
      const dialog = await screen.findByRole('dialog', { name: 'Catálogo Etapas de oportunidad' });
      await within(dialog).findByText('Prospección');
      await user.click(within(dialog).getByLabelText('Nuevo elemento: código'));
      await user.paste('X');
      await user.click(within(dialog).getByLabelText('Nuevo elemento: etiqueta'));
      await user.paste('X');
      await user.click(within(dialog).getByLabelText('Nuevo elemento: Orden en el flujo'));
      await user.paste('5');
      await user.click(within(dialog).getByRole('button', { name: 'Añadir' }));

      expect(await within(dialog).findByText('Resultado de la etapa: Valor no admitido')).toBeInTheDocument();

      await user.click(within(dialog).getByRole('checkbox', { name: 'Desactivar Prospección' }));
      expect(await within(dialog).findByText(/Un parámetro del CRM usa este valor/)).toBeInTheDocument();
      expect(within(dialog).getByText('Parámetros: crm.valores_por_defecto')).toBeInTheDocument();
    });

    it('filtra los elementos activos y oculta subir/bajar mientras filtra', async () => {
      signInWith(ALL_PERMISSIONS);
      mockApi({
        'GET /catalogs': () => jsonResponse(page([CRM])),
        'GET /catalogs/cat-crm': () => jsonResponse(CRM_DETAIL),
      });
      const user = userEvent.setup();
      renderWithProviders(<CatalogsPage />);

      await user.click(await screen.findByRole('button', { name: 'Elementos de Etapas de oportunidad' }));
      const dialog = await screen.findByRole('dialog', { name: 'Catálogo Etapas de oportunidad' });
      expect(await within(dialog).findByText('Etapa antigua')).toBeInTheDocument();
      const table = within(dialog).getByRole('table', { name: 'Elementos' });
      expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
        'Código',
        'Etiqueta',
        'Orden',
        'Estado',
        'Acciones',
      ]);

      await user.click(within(dialog).getByRole('button', { name: 'Sólo activos' }));

      expect(within(dialog).queryByText('Etapa antigua')).not.toBeInTheDocument();
      expect(within(dialog).getByText('Prospección')).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Bajar Prospección' })).not.toBeInTheDocument();
    });

    it('un conjunto cerrado se indica, no permite añadir ni desactivar y al editar sólo envía la etiqueta', async () => {
      signInWith(ALL_PERMISSIONS);
      const fetchMock = mockApi({
        'GET /catalogs': () => jsonResponse(page([RESULT])),
        'GET /catalogs/cat-res': () => jsonResponse(RESULT_DETAIL),
        'PATCH /catalogs/cat-res/items/res-1': () => jsonResponse(RESULT_DETAIL.items[0]),
      });
      const user = userEvent.setup();
      renderWithProviders(<CatalogsPage />);

      await user.click(await screen.findByRole('button', { name: 'Elementos de Resultados de oportunidad' }));
      const dialog = await screen.findByRole('dialog', { name: 'Catálogo Resultados de oportunidad' });
      expect(await within(dialog).findByText('Conjunto cerrado')).toBeInTheDocument();
      expect(within(dialog).queryByRole('form', { name: 'Añadir elemento' })).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('checkbox', { name: 'Desactivar Ganada' })).not.toBeInTheDocument();
      expect(within(dialog).getByText('Activo')).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Editar Ganada' }));
      const form = within(dialog).getByRole('form', { name: 'Editar elemento WON' });
      expect(within(form).getByLabelText('Elemento WON: Exige motivo')).toBeDisabled();
      const label = within(form).getByLabelText('Elemento WON: etiqueta');
      await user.clear(label);
      await user.click(label);
      await user.paste('Ganada total');
      await user.click(within(form).getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/catalogs/cat-res/items/res-1')).toHaveLength(1));
      expect(JSON.parse(String(callsTo(fetchMock, 'PATCH', '/catalogs/cat-res/items/res-1')[0]?.body))).toEqual({
        label: 'Ganada total',
      });
    });
  });
});
