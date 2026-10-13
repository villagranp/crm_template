import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { ProjectsSearchPage } from './ProjectsSearchPage';
import { FORM_OPTIONS, lastQuery, LIST_ITEM, page, signInWith, signOut, simulateWideScreen } from './testing/project-fixtures';

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}${location.search}`}</p>;
}

function SearchWithLocation() {
  const location = useLocation();
  return (
    <>
      <ProjectsSearchPage />
      <p data-testid="url">{location.search}</p>
    </>
  );
}

function renderPage(entry = '/proyectos') {
  return renderWithProviders(
    <Routes>
      <Route path="/proyectos" element={<SearchWithLocation />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [entry] },
  );
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['proyectos.ver', 'proyectos.crear']);
});
afterEach(signOut);

describe('ProjectsSearchPage (F-13)', () => {
  it('restaura filtros, orden y página de la URL y los envía con los nombres de la API (AC-03.25, PF-03.35, PF-03.120)', async () => {
    const fetchMock = mockApi({
      'GET /projects': () => page([LIST_ITEM], 45),
      'GET /projects/form-options': () => jsonResponse(FORM_OPTIONS),
    });

    renderPage('/proyectos?active=true&commercialStatus=WON,LOST&phaseId=ph-diseno&sortBy=name&sortOrder=asc&page=2&search=torre');
    expect(await screen.findByText('Torre Norte')).toBeInTheDocument();

    const query = lastQuery(fetchMock, '/projects');
    expect(Object.fromEntries(query)).toEqual({
      active: 'true',
      commercialStatus: 'WON,LOST',
      phaseId: 'ph-diseno',
      sortBy: 'name',
      sortOrder: 'asc',
      page: '2',
      pageSize: '20',
      search: 'torre',
    });

    const chips = within(screen.getByLabelText('Filtros activos'));
    expect(await chips.findByText('Situación: Activos')).toBeInTheDocument();
    expect(chips.getByText('Estado comercial: Ganado, Perdido')).toBeInTheDocument();
    expect(chips.getByText('Fase: Diseño')).toBeInTheDocument();
  });

  it('pinta fase con porcentaje, estado comercial y la fecha de decisión sin desplazamiento; la fila abre la ficha', async () => {
    mockApi({
      'GET /projects': () => page([LIST_ITEM]),
      'GET /projects/form-options': () => jsonResponse(FORM_OPTIONS),
    });

    renderPage();
    expect(await screen.findByText('Diseño · 10%')).toBeInTheDocument();
    expect(screen.getByText('En Cotizando')).toBeInTheDocument();
    expect(screen.getByText('Mixco, Guatemala')).toBeInTheDocument();
    expect(screen.getByText(new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(new Date(2026, 11, 1)))).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: /Abrir el proyecto Torre Norte/ }));
    expect(await screen.findByText('En /proyectos/p-1')).toBeInTheDocument();
  });

  it('aplica filtros repetibles separados por comas y el rango de fechas con su campo (RN-03.16, RN-03.17)', async () => {
    const fetchMock = mockApi({
      'GET /projects': () => page([LIST_ITEM]),
      'GET /projects/form-options': () => jsonResponse(FORM_OPTIONS),
    });

    renderPage();
    await screen.findByText('Torre Norte');
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros de proyectos' });

    await userEvent.click(within(form).getByRole('combobox', { name: 'Fase' }));
    const listbox = await screen.findByRole('listbox');
    await userEvent.click(within(listbox).getByRole('option', { name: 'Diseño' }));
    await userEvent.click(within(listbox).getByRole('option', { name: 'Cotización' }));
    await userEvent.keyboard('{Escape}');

    await userEvent.type(within(form).getByLabelText('Desde'), '2026-01-01');
    await userEvent.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(lastQuery(fetchMock, '/projects').get('phaseId')).toBe('ph-diseno,ph-cotizacion'));
    const query = lastQuery(fetchMock, '/projects');
    expect(query.get('dateFrom')).toBe('2026-01-01');
    expect(query.get('dateField')).toBe('estimatedDecisionDate');
  });

  it('un rango con "Desde" posterior a "Hasta" no se aplica', async () => {
    const fetchMock = mockApi({
      'GET /projects': () => page([LIST_ITEM]),
      'GET /projects/form-options': () => jsonResponse(FORM_OPTIONS),
    });

    renderPage();
    await screen.findByText('Torre Norte');
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros de proyectos' });
    await userEvent.type(within(form).getByLabelText('Desde'), '2026-05-01');
    await userEvent.type(within(form).getByLabelText('Hasta'), '2026-04-01');
    await userEvent.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));

    expect(await within(form).findByText('"Desde" no puede ser posterior a "Hasta".')).toBeInTheDocument();
    expect(lastQuery(fetchMock, '/projects').get('dateFrom')).toBeNull();
  });

  it('vacío sin filtros ofrece "Nuevo proyecto" con proyectos.crear; con filtros, "Limpiar filtros"', async () => {
    mockApi({
      'GET /projects': () => page([]),
      'GET /projects/form-options': () => jsonResponse(FORM_OPTIONS),
    });

    const { unmount } = renderPage();
    expect(await screen.findByText('Aún no hay proyectos')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Nuevo proyecto' }).length).toBeGreaterThanOrEqual(1);
    unmount();

    renderPage('/proyectos?city=Mixco');
    expect(await screen.findByText('No hay proyectos que coincidan con los filtros')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent(/^$/));
  });

  it('sin proyectos.crear no ofrece el alta', async () => {
    signInWith(['proyectos.ver']);
    mockApi({
      'GET /projects': () => page([]),
      'GET /projects/form-options': () => jsonResponse(FORM_OPTIONS),
    });

    renderPage();
    expect(await screen.findByText('Aún no hay proyectos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo proyecto' })).not.toBeInTheDocument();
  });

  it('error con referencia y "Reintentar"', async () => {
    let calls = 0;
    mockApi({
      'GET /projects': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : page([LIST_ITEM]);
      },
      'GET /projects/form-options': () => jsonResponse(FORM_OPTIONS),
    });

    renderPage();
    expect(await screen.findByText(/Referencia: corr-test/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Torre Norte')).toBeInTheDocument();
  });
});
