import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { endOfDayIso, startOfDayIso } from '../common/date-time';
import { ASESOR_PERMISSIONS, lastQuery, page, signInWith, signOut, simulateWideScreen } from '../testing/fixtures';
import { VISIT_FORM_OPTIONS, VISIT_LIST_ITEM } from '../testing/visit-fixtures';

import { VisitsPage } from './VisitsPage';

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}${location.search}`}</p>;
}

function renderPage(initialEntry = '/actividad/visitas') {
  return renderWithProviders(
    <Routes>
      <Route path="/actividad/visitas" element={<VisitsPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
}

function api(extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /visits': () => page([VISIT_LIST_ITEM]),
    'GET /visits/form-options': () => jsonResponse(VISIT_FORM_OPTIONS),
    'GET /customers/form-options': () => jsonResponse({ countries: [{ id: 'gt', name: 'Guatemala', isoCode: 'GT' }] }),
    ...extra,
  });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(ASESOR_PERMISSIONS);
});

afterEach(signOut);

describe('VisitsPage (F-25, AC-04.19)', () => {
  it('muestra código, fecha vigente con reprogramaciones, cliente, proyecto, responsable, objetivo, estado, resultado y adjuntos', async () => {
    const fetchMock = api();
    renderPage();

    const table = await screen.findByRole('table', { name: 'Visitas' });
    const row = within(table).getByRole('link', { name: 'Abrir la visita VIS-2026-00001: Presentar catálogo' });
    expect(within(row).getByText('VIS-2026-00001')).toBeInTheDocument();
    expect(within(row).getByText('Reprogramada ×2')).toBeInTheDocument();
    expect(within(row).getByText('Constructora Peña S.A.')).toBeInTheDocument();
    expect(within(row).getByText('Torre Norte')).toBeInTheDocument();
    expect(within(row).getByText('Ana Asesora')).toBeInTheDocument();
    expect(within(row).getAllByText('Reprogramada').length).toBeGreaterThan(0);
    expect(within(row).getByLabelText('3 adjuntos')).toBeInTheDocument();
    const query = lastQuery(fetchMock, '/visits');
    expect(query.get('sortBy')).toBe('scheduledStartAt');
    expect(query.get('sortOrder')).toBe('desc');

    await userEvent.click(row);
    expect(await screen.findByText('En /actividad/visitas/v-1')).toBeInTheDocument();
  });

  it('aplica filtros combinados en la URL y los envía al servidor (rango como día completo)', async () => {
    const user = userEvent.setup();
    const fetchMock = api();
    renderPage();

    await screen.findByRole('table', { name: 'Visitas' });
    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    const filters = screen.getByRole('search', { name: 'Filtros de visitas' });
    await user.type(within(filters).getByLabelText('Desde'), '2026-10-01');
    await user.type(within(filters).getByLabelText('Hasta'), '2026-10-31');
    await user.click(within(filters).getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: 'Realizada' }));
    await user.click(within(filters).getByRole('combobox', { name: 'País' }));
    await user.click(await screen.findByRole('option', { name: 'Guatemala' }));
    await user.click(within(filters).getByLabelText('Pendientes de confirmar'));
    await user.click(within(filters).getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(lastQuery(fetchMock, '/visits').get('statusId')).toBe('vs-real'));
    const query = lastQuery(fetchMock, '/visits');
    expect(query.get('from')).toBe(startOfDayIso('2026-10-01'));
    expect(query.get('to')).toBe(endOfDayIso('2026-10-31'));
    expect(query.get('countryId')).toBe('gt');
    expect(query.get('pendingConfirmation')).toBe('true');
    const chips = screen.getByLabelText('Filtros activos');
    expect(within(chips).getByText('Estado: Realizada')).toBeInTheDocument();
    expect(within(chips).getByText('País: Guatemala')).toBeInTheDocument();
    expect(within(chips).getByText('Pendientes de confirmar')).toBeInTheDocument();

    await user.click(within(chips).getByRole('button', { name: 'Limpiar' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/visits').has('statusId')).toBe(false));
  });

  it('respeta "sin registrar" y el grupo de estado que llegan por la URL (destino de Inicio)', async () => {
    const fetchMock = api();
    renderPage('/actividad/visitas?unregistered=true&statusGroup=PENDING');

    await screen.findByRole('table', { name: 'Visitas' });
    const query = lastQuery(fetchMock, '/visits');
    expect(query.get('unregistered')).toBe('true');
    expect(query.get('statusGroup')).toBe('PENDING');
    expect(within(screen.getByLabelText('Filtros activos')).getByText('Sin registrar')).toBeInTheDocument();
  });

  it('ordena por cliente en el servidor', async () => {
    const fetchMock = api();
    renderPage();
    const table = await screen.findByRole('table', { name: 'Visitas' });

    await userEvent.click(within(table).getByRole('button', { name: 'Cliente' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/visits').get('sortBy')).toBe('customerName'));
  });

  it('error con referencia y reintento; vacío sin filtros ofrece planificar', async () => {
    let calls = 0;
    api({
      'GET /visits': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : page([]);
      },
    });
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Todavía no hay visitas visibles para ti')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Planificar visita' })).toHaveLength(2);
  });

  it('sin visitas.crear no ofrece "Planificar visita"; sin clientes.ver no ofrece el filtro de país', async () => {
    signInWith(['visitas.ver']);
    const fetchMock = api();
    renderPage();

    await screen.findByRole('table', { name: 'Visitas' });
    expect(screen.queryByRole('button', { name: 'Planificar visita' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    expect(within(screen.getByRole('search', { name: 'Filtros de visitas' })).queryByRole('combobox', { name: 'País' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/customers/form-options'))).toBe(false);
  });
});
