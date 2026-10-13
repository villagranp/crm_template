import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deferred, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { ACTIVITY_LIST_ITEM, FORM_OPTIONS, lastQuery, page, signInWith, signOut, simulateWideScreen, TYPE_CALL } from '../testing/fixtures';

import { ActivitiesPage } from './ActivitiesPage';

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}${location.search}`}</p>;
}

function renderPage(initialEntry = '/actividad/actividades') {
  return renderWithProviders(
    <Routes>
      <Route path="/actividad/actividades" element={<ActivitiesPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
}

function api(list: () => Response | Promise<Response>) {
  return mockApi({
    'GET /activities': list,
    'GET /activities/form-options': () => jsonResponse(FORM_OPTIONS),
  });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['actividades.ver', 'actividades.crear']);
});

afterEach(signOut);

describe('ActivitiesPage (F-30, AC-04.42)', () => {
  it('muestra la carga y después las columnas del listado, con el orden por defecto por vencimiento', async () => {
    const reply = deferred<Response>();
    const fetchMock = api(() => reply.promise);
    renderPage();

    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
    reply.resolve(page([ACTIVITY_LIST_ITEM]));

    const table = await screen.findByRole('table', { name: 'Actividades' });
    expect(within(table).getByText('ACT-2026-000001')).toBeInTheDocument();
    expect(within(table).getByText('Llamada')).toBeInTheDocument();
    expect(within(table).getByText('Torre Norte')).toBeInTheDocument();
    expect(within(table).getByText('Próxima a vencer')).toBeInTheDocument();
    expect(within(table).getByText('Alta')).toBeInTheDocument();
    expect(within(table).getByText('2')).toBeInTheDocument();
    const query = lastQuery(fetchMock, '/activities');
    expect(query.get('sortBy')).toBe('dueAt');
    expect(query.get('sortOrder')).toBe('asc');
  });

  it('restaura filtros de la URL y convierte el rango de fechas en instantes del día completo', async () => {
    const fetchMock = api(() => page([ACTIVITY_LIST_ITEM]));
    renderPage(`/actividad/actividades?typeId=${TYPE_CALL.id}&dueFrom=2026-10-01&dueTo=2026-10-31&overdue=true`);

    await screen.findByText('ACT-2026-000001');
    const query = lastQuery(fetchMock, '/activities');
    expect(query.get('typeId')).toBe(TYPE_CALL.id);
    expect(query.get('overdue')).toBe('true');
    expect(query.get('dueFrom')).toBe(new Date('2026-10-01T00:00').toISOString());
    expect(query.get('dueTo')).toBe(new Date('2026-10-31T23:59:59.999').toISOString());
    expect(await screen.findByText('Tipo: Llamada', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(screen.getByText('Solo vencidas', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(screen.getByText('Vence desde: 1 oct 2026', { selector: '.MuiChip-label' })).toBeInTheDocument();
  });

  it('aplica los filtros combinados desde el panel', async () => {
    const fetchMock = api(() => page([ACTIVITY_LIST_ITEM]));
    renderPage();
    await screen.findByText('ACT-2026-000001');

    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const filters = screen.getByRole('search', { name: 'Filtros de actividades' });
    await userEvent.click(within(filters).getByRole('combobox', { name: 'Prioridad' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Alta' }));
    await userEvent.click(within(filters).getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(lastQuery(fetchMock, '/activities').get('priorityId')).toBe('pr-alta'));
  });

  it('vacío sin filtros ofrece crear; con filtros, limpiarlos; error con referencia y reintento', async () => {
    let calls = 0;
    api(() => {
      calls += 1;
      return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : page([]);
    });
    const first = renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Todavía no hay actividades visibles para ti')).toBeInTheDocument();
    first.unmount();

    renderPage('/actividad/actividades?search=zzz');
    expect(await screen.findByText('Ninguna actividad coincide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
  });

  it('"Nueva actividad" ofrece los tipos del catálogo y abre el alta con el tipo', async () => {
    api(() => page([ACTIVITY_LIST_ITEM]));
    renderPage();
    await screen.findByText('ACT-2026-000001');

    const [headerButton] = screen.getAllByRole('button', { name: 'Nueva actividad' });
    await userEvent.click(headerButton as HTMLElement);
    const options = await screen.findAllByRole('menuitem');
    expect(options.map((option) => option.textContent)).toEqual(['Llamada', 'Correo', 'Tarea']);
    await userEvent.click(options[0] as HTMLElement);
    expect(await screen.findByText(`En /actividad/actividades/nueva?typeId=${TYPE_CALL.id}`)).toBeInTheDocument();
  });

  it('sin actividades.crear no ofrece "Nueva actividad"; una fila abre el detalle con teclado', async () => {
    signInWith(['actividades.ver']);
    api(() => page([ACTIVITY_LIST_ITEM]));
    renderPage();

    const row = await screen.findByRole('link', { name: /Abrir la actividad ACT-2026-000001/ });
    expect(screen.queryByRole('button', { name: 'Nueva actividad' })).not.toBeInTheDocument();
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('En /actividad/actividades/a-1')).toBeInTheDocument();
  });
});
