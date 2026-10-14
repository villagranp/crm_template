import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { menu, PROJECT, signInWith, signOut } from '../testing/project-fixtures';

import { ProjectFollowUpSection } from './ProjectFollowUpSection';

afterEach(signOut);

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}${location.search}`}</p>;
}

function renderSection() {
  return renderWithProviders(
    <Routes>
      <Route path="/ficha" element={<ProjectFollowUpSection project={PROJECT} />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: ['/ficha'] },
  );
}

function apiPaths(fetchMock: { mock: { calls: unknown[][] } }): string[] {
  return fetchMock.mock.calls.map(([input]) => new URL(String(input), 'http://localhost').pathname.replace(/^\/api\/v1/, ''));
}

describe('ProjectFollowUpSection (AC-03.16, PF-03.23, 04 §E.11)', () => {
  it('sin el Módulo 4 en el menú: estado informativo y sólo se consulta el menú', async () => {
    signInWith(['proyectos.ver', 'actividades.ver', 'actividades.crear']);
    const fetchMock = mockApi({ 'GET /me/menu': () => jsonResponse(menu(['proyectos-buscar'])) });

    renderSection();
    expect(await screen.findByText('El seguimiento comercial estará disponible con el módulo de Actividad comercial.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva actividad' })).not.toBeInTheDocument();
    expect(apiPaths(fetchMock).every((path) => path === '/me/menu')).toBe(true);
  });

  it('con el Módulo 4: monta su sección del proyecto y sus botones con cliente y proyecto preseleccionados', async () => {
    signInWith(['proyectos.ver', 'actividades.ver', 'actividades.crear', 'visitas.crear']);
    const fetchMock = mockApi({
      'GET /me/menu': () => jsonResponse(menu(['proyectos-buscar', 'actividad-actividades'])),
      'GET /follow-ups/trace': () => errorResponse(404, 'RESOURCE_NOT_FOUND'),
    });

    renderSection();
    // Mientras carga el menú, la tarjeta de espera del 03 lleva el mismo título.
    expect(await screen.findByText('Aún no hay actividad comercial registrada')).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Seguimiento comercial' });
    expect(within(section).getByRole('button', { name: 'Planificar visita' })).toBeInTheDocument();
    const trace = fetchMock.mock.calls.map(([input]) => new URL(String(input), 'http://localhost')).find((url) => url.pathname.endsWith('/follow-ups/trace'));
    expect(trace?.searchParams.get('projectId')).toBe(PROJECT.id);
    expect(trace?.searchParams.has('customerId')).toBe(false);

    await userEvent.click(within(section).getByRole('button', { name: 'Nueva actividad' }));
    expect(
      await screen.findByText(`En /actividad/actividades/nueva?customerId=${PROJECT.customer.id}&projectId=${PROJECT.id}`),
    ).toBeInTheDocument();
  });

  it('con el Módulo 4 pero sin permisos de creación: la sección sin botones', async () => {
    signInWith(['proyectos.ver', 'visitas.ver']);
    mockApi({
      'GET /me/menu': () => jsonResponse(menu(['proyectos-buscar', 'actividad-visitas'])),
      'GET /follow-ups/trace': () => errorResponse(404, 'RESOURCE_NOT_FOUND'),
    });

    renderSection();
    expect(await screen.findByText('Aún no hay actividad comercial registrada')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Seguimiento comercial' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva actividad' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Planificar visita' })).not.toBeInTheDocument();
  });
});
