import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { endOfDayIso, formatDate, formatDateTime, startOfDayIso } from '../common/date-time';
import { ASESOR_PERMISSIONS, CUSTOMER_REF, FORM_OPTIONS, INTERACTION, lastQuery, ME, page, signInWith, signOut, simulateWideScreen } from '../testing/fixtures';
import { ACTIVITY_INTERACTION, FROZEN_NOW } from '../testing/read-model-fixtures';

import { InteractionHistoryPage } from './InteractionHistoryPage';

function SearchProbe() {
  const location = useLocation();
  return <p data-testid="search">{location.search}</p>;
}

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}`}</p>;
}

function renderPage(initialEntry = '/actividad/historial') {
  return renderWithProviders(
    <Routes>
      <Route
        path="/actividad/historial"
        element={
          <>
            <InteractionHistoryPage />
            <SearchProbe />
          </>
        }
      />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
}

function routes(interactions = () => page([INTERACTION, ACTIVITY_INTERACTION])) {
  return mockApi({
    'GET /interactions': interactions,
    'GET /activities/form-options': () => jsonResponse(FORM_OPTIONS),
    'GET /customers/c-1': () => jsonResponse({ ...CUSTOMER_REF, country: { id: 'mx' } }),
    'GET /commercial-activity/owner-options': () => page([ME]),
  });
}

/** Pantalla estrecha (`< md`): ninguna consulta `min-width` coincide. */
function simulateNarrowScreen(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FROZEN_NOW);
  simulateWideScreen();
  signInWith(ASESOR_PERMISSIONS);
});

afterEach(() => {
  vi.useRealTimers();
  signOut();
});

describe('InteractionHistoryPage (F-24, PF-04.55)', () => {
  it('línea de tiempo por defecto, más recientes primero, agrupada por día y con enlace a cada origen (AC-04.15, AC-04.16)', async () => {
    const fetchMock = routes(() => page([ACTIVITY_INTERACTION, INTERACTION]));
    renderPage();

    const visitLink = await screen.findByRole('link', { name: 'Ver visita VIS-2026-00001' });
    expect(visitLink).toHaveAttribute('href', '/actividad/visitas/v-1');
    expect(screen.getByRole('link', { name: 'Ver actividad ACT-2026-000001' })).toHaveAttribute('href', '/actividad/actividades/a-1');
    const days = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(days).toEqual([formatDate(ACTIVITY_INTERACTION.occurredAt), formatDate(INTERACTION.occurredAt)]);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    const query = lastQuery(fetchMock, '/interactions');
    expect(query.get('sortBy')).toBe('occurredAt');
    expect(query.get('sortOrder')).toBe('desc');
    expect(screen.getByRole('button', { name: 'Línea de tiempo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Más antiguas primero' })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(visitLink);
    expect(await screen.findByText('En /actividad/visitas/v-1')).toBeInTheDocument();
  });

  it('invierte el orden (sortOrder=asc) y lo guarda en la URL', async () => {
    const fetchMock = routes();
    renderPage();
    await screen.findByRole('link', { name: 'Ver visita VIS-2026-00001' });

    await userEvent.click(screen.getByRole('button', { name: 'Más antiguas primero' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/interactions').get('sortOrder')).toBe('asc'));
    expect(screen.getByRole('button', { name: 'Más antiguas primero' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('search')).toHaveTextContent('?sortBy=occurredAt&sortOrder=asc');

    await userEvent.click(screen.getByRole('button', { name: 'Más antiguas primero' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/interactions').get('sortOrder')).toBe('desc'));
  });

  it('conmuta a tabla (view=table) con fecha, tipo, usuario, cliente, proyecto, resumen, resultado y registro', async () => {
    routes();
    renderPage();
    await screen.findByRole('link', { name: 'Ver visita VIS-2026-00001' });

    await userEvent.click(screen.getByRole('button', { name: 'Tabla' }));
    const table = await screen.findByRole('table', { name: 'Interacciones' });
    expect(screen.getByTestId('search')).toHaveTextContent('?view=table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Fecha', 'Tipo', 'Usuario', 'Cliente', 'Proyecto', 'Resumen', 'Resultado', 'Registro']);

    const [, visitRow, activityRow] = within(table).getAllByRole('row');
    expect(
      within(visitRow as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      formatDateTime(INTERACTION.occurredAt),
      'Visita',
      'Ana Asesora',
      'Constructora Peña S.A.',
      'Torre Norte',
      'Presentar catálogoInteresados en la línea premium.',
      'Interesado',
      'Ver visita VIS-2026-00001',
    ]);
    expect(within(activityRow as HTMLElement).getByRole('link', { name: 'Ver actividad ACT-2026-000001' })).toHaveAttribute('href', '/actividad/actividades/a-1');
    expect(within(activityRow as HTMLElement).getAllByText('—')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Línea de tiempo' }));
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
    expect(screen.getByTestId('search')).toHaveTextContent(/^$/);
  });

  it('en pantallas estrechas siempre es línea de tiempo y no se ofrece el conmutador', async () => {
    simulateNarrowScreen();
    routes();
    renderPage('/actividad/historial?view=table');

    expect(await screen.findByRole('link', { name: 'Ver visita VIS-2026-00001' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tabla' })).not.toBeInTheDocument();
  });

  it('tipo "Visita" envía sourceType=VISIT; un tipo de actividad envía typeId; resultado y fechas (AC-04.18)', async () => {
    const fetchMock = routes();
    renderPage();
    await screen.findByRole('link', { name: 'Ver visita VIS-2026-00001' });

    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const filters = screen.getByRole('search', { name: 'Filtros del historial' });
    await userEvent.click(within(filters).getByRole('combobox', { name: 'Tipo' }));
    const typeOptions = (await screen.findAllByRole('option')).map((option) => option.textContent);
    expect(typeOptions).toEqual(['Todos', 'Visita', 'Llamada', 'Correo']);
    await userEvent.click(screen.getByRole('option', { name: 'Visita' }));
    fireEvent.change(within(filters).getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(within(filters).getByLabelText('Hasta'), { target: { value: '2026-10-11' } });
    await userEvent.click(within(filters).getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(lastQuery(fetchMock, '/interactions').get('sourceType')).toBe('VISIT'));
    let query = lastQuery(fetchMock, '/interactions');
    expect(query.get('typeId')).toBeNull();
    expect(query.get('from')).toBe(startOfDayIso('2026-10-01'));
    expect(query.get('to')).toBe(endOfDayIso('2026-10-11'));
    expect(screen.getByTestId('search')).toHaveTextContent('?from=2026-10-01&to=2026-10-11&sourceType=VISIT');
    const chips = screen.getByLabelText('Filtros activos');
    expect(within(chips).getByText('Tipo: Visita')).toBeInTheDocument();
    expect(within(chips).getByText('Desde: 1 oct 2026')).toBeInTheDocument();
    expect(within(chips).getByText('Hasta: 11 oct 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtros (3)' })).toBeInTheDocument();

    await userEvent.click(within(filters).getByRole('combobox', { name: 'Tipo' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Llamada' }));
    await userEvent.click(within(filters).getByRole('combobox', { name: 'Resultado' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Interesado' }));
    await userEvent.click(within(filters).getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(lastQuery(fetchMock, '/interactions').get('typeId')).toBe('t-call'));
    query = lastQuery(fetchMock, '/interactions');
    expect(query.get('sourceType')).toBeNull();
    expect(query.get('resultId')).toBe('r-ok');
    expect(within(screen.getByLabelText('Filtros activos')).getByText('Tipo: Llamada')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Filtros activos')).getByText('Resultado: Interesado')).toBeInTheDocument();
  });

  it('preselección desde la URL (fichas y seguimiento): cliente, proyecto y oportunidad se envían y se muestran como chips', async () => {
    const fetchMock = routes(() => page([INTERACTION]));
    renderPage('/actividad/historial?customerId=c-1&projectId=p-1&opportunityId=o-1&userId=u-1');

    await screen.findByRole('link', { name: 'Ver visita VIS-2026-00001' });
    const query = lastQuery(fetchMock, '/interactions');
    expect(query.get('customerId')).toBe('c-1');
    expect(query.get('projectId')).toBe('p-1');
    expect(query.get('opportunityId')).toBe('o-1');
    expect(query.get('userId')).toBe('u-1');
    const chips = screen.getByLabelText('Filtros activos');
    expect(within(chips).getByText('Cliente: Constructora Peña S.A.')).toBeInTheDocument();
    expect(within(chips).getByText('Proyecto: Torre Norte')).toBeInTheDocument();
    expect(within(chips).getByText('Oportunidad: Seleccionada')).toBeInTheDocument();
    expect(await within(chips).findByText('Usuario: Ana Asesora')).toBeInTheDocument();
    expect(lastQuery(fetchMock, '/commercial-activity/owner-options').getAll('id')).toEqual(['u-1']);
    // La línea de tiempo ya es de ese cliente y proyecto: no los repite.
    expect(screen.getByText('Ana Asesora · Próxima acción: Enviar cotización (20 oct 2026)')).toBeInTheDocument();

    await userEvent.click(within(chips).getByRole('button', { name: 'Limpiar' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/interactions').get('customerId')).toBeNull());
    expect(lastQuery(fetchMock, '/interactions').get('projectId')).toBeNull();
    expect(lastQuery(fetchMock, '/interactions').get('opportunityId')).toBeNull();
  });

  it('nunca envía `search` a /interactions aunque llegue en la URL (la API responde 400)', async () => {
    const fetchMock = routes();
    renderPage('/actividad/historial?search=algo&resultId=r-ok');

    await screen.findByRole('link', { name: 'Ver visita VIS-2026-00001' });
    const query = lastQuery(fetchMock, '/interactions');
    expect(query.get('resultId')).toBe('r-ok');
    expect(query.has('search')).toBe(false);
  });

  it('error con referencia y reintento; vacío con filtros con "Limpiar filtros"; vacío sin filtros', async () => {
    let calls = 0;
    routes(() => {
      calls += 1;
      return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : page([]);
    });
    renderPage('/actividad/historial?resultId=r-ok');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo cargar el historial');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ninguna interacción coincide')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(await screen.findByText('Aún no hay interacciones registradas')).toBeInTheDocument();
  });

  it('en la vista de tabla los estados los pinta la tabla (error con reintento)', async () => {
    routes(() => errorResponse(503, 'SERVICE_UNAVAILABLE'));
    renderPage('/actividad/historial?view=table');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo cargar la lista');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    expect(within(alert).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
