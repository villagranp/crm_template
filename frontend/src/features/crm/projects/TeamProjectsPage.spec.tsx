import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { TeamProjectsPage } from './TeamProjectsPage';
import { ALL_CAPABILITIES, FORM_OPTIONS, lastQuery, page, signInWith, signOut, simulateWideScreen, TEAM_ITEM } from './testing/project-fixtures';

const OWN_ITEM = { ...TEAM_ITEM, id: 'p-3', code: 'PRY-2026-00060', name: 'Casa Lago', owner: { id: 'u-1', displayName: 'Ana Asesora' }, capabilities: ALL_CAPABILITIES };

function profile(dataScope: 'OWN' | 'TEAM' | 'COUNTRY' | 'ORGANIZATION', teams: { id: string; name: string }[] = []) {
  return { id: 'u-1', displayName: 'Ana Asesora', email: 'ana@example.test', roles: ['manager'], permissions: ['proyectos.ver'], teams, dataScope };
}

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}`}</p>;
}

function renderPage(entry = '/proyectos/equipo') {
  return renderWithProviders(
    <Routes>
      <Route path="/proyectos/equipo" element={<TeamProjectsPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [entry] },
  );
}

function api(extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /me': () => jsonResponse(profile('TEAM', [{ id: 't-norte', name: 'Norte' }])),
    'GET /projects/team-view': () => page([TEAM_ITEM, OWN_ITEM]),
    'GET /projects/form-options': () => jsonResponse(FORM_OPTIONS),
    'GET /projects/team-options': () => jsonResponse({ data: [{ id: 't-norte', code: 'NORTE', name: 'Norte', parentId: null }] }),
    ...extra,
  });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['proyectos.ver', 'proyectos.editar']);
});
afterEach(signOut);

describe('TeamProjectsPage (F-14)', () => {
  it('describe el alcance efectivo y marca "Solo lectura" los proyectos que no puede editar (AC-03.26, AC-03.28, PF-03.39)', async () => {
    api();

    renderPage();
    expect(await screen.findByText(/Ves los proyectos de tus equipos \(Norte\) y sus subequipos\./)).toBeInTheDocument();
    const readOnlyRow = await screen.findByRole('link', { name: 'Abrir el proyecto Bodega Sur (PRY-2026-00050), solo lectura' });
    expect(within(readOnlyRow).getByText('Solo lectura')).toBeInTheDocument();
    expect(within(readOnlyRow).getByText('Norte')).toBeInTheDocument();
    expect(within(readOnlyRow).getByText('Ganado')).toBeInTheDocument();
    expect(within(readOnlyRow).getByText('Luis Asesor')).toBeInTheDocument();
    const editableRow = screen.getByRole('link', { name: 'Abrir el proyecto Casa Lago (PRY-2026-00060)' });
    expect(within(editableRow).queryByText('Solo lectura')).not.toBeInTheDocument();
  });

  it('ordena por defecto por la última actualización descendente (AC-03.27)', async () => {
    const fetchMock = api();

    renderPage();
    await screen.findByText('Bodega Sur');
    expect(lastQuery(fetchMock, '/projects/team-view').get('sortBy')).toBe('lastActivityAt');
    expect(lastQuery(fetchMock, '/projects/team-view').get('sortOrder')).toBe('desc');
  });

  it.each([
    ['OWN', 'Ves tus proyectos.'],
    ['COUNTRY', 'Ves los proyectos de tu país.'],
    ['ORGANIZATION', 'Ves todos los proyectos.'],
  ] as const)('con alcance %s el encabezado lo dice', async (scope, text) => {
    api({ 'GET /me': () => jsonResponse(profile(scope)) });

    renderPage();
    expect(await screen.findByText(new RegExp(text.replace('.', '\\.')))).toBeInTheDocument();
  });

  it('el filtro de equipo sólo ofrece los equipos del alcance y se envía como teamId (AC-03.29)', async () => {
    const fetchMock = api();

    renderPage();
    await screen.findByText('Bodega Sur');
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros de proyectos del equipo' });
    await userEvent.click(within(form).getByRole('combobox', { name: 'Equipo' }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual(['Norte']);
    await userEvent.click(within(listbox).getByRole('option', { name: 'Norte' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(lastQuery(fetchMock, '/projects/team-view').get('teamId')).toBe('t-norte'));
    expect(await screen.findByText('Equipo: Norte')).toBeInTheDocument();
  });

  it('vacío por perfil', async () => {
    api({ 'GET /projects/team-view': () => page([]) });

    renderPage();
    expect(await screen.findByText('Tu equipo aún no tiene proyectos')).toBeInTheDocument();
  });

  it('la fila abre la ficha', async () => {
    api();

    renderPage();
    await userEvent.click(await screen.findByRole('link', { name: /Abrir el proyecto Casa Lago/ }));
    expect(await screen.findByText('En /proyectos/p-3')).toBeInTheDocument();
  });
});
