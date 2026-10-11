import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { CustomerProjectItem } from '../customers.api';
import { menu, page, signInWith, signOut, simulateWideScreen } from '../testing/customer-fixtures';

import { CustomerProjectsSection } from './CustomerProjectsSection';

const PROJECT: CustomerProjectItem = {
  id: 'p-1',
  code: 'PRY-000001',
  name: 'Torre Norte',
  city: 'Mixco',
  country: { name: 'Guatemala' },
  phase: { id: 'f-1', code: 'DISENO', label: 'Diseño', progress: 30 },
  commercialStatus: { kind: 'OPPORTUNITY', label: 'Oportunidad', stage: null },
  owner: { id: 'u-1', displayName: 'Ana Asesora' },
  estimatedDecisionDate: '2026-12-01',
};

function Probe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}`}</p>;
}

function renderSection(initialEntry = '/clientes/c-1') {
  return renderWithProviders(
    <Routes>
      <Route path="/clientes/:customerId" element={<CustomerProjectsSection customerId="c-1" />} />
      <Route path="*" element={<Probe />} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['clientes.ver', 'proyectos.ver']);
});
afterEach(signOut);

describe('CustomerProjectsSection (F-08, D-02.10)', () => {
  it('sin la opción de Proyectos en el menú muestra el estado informativo y no llama a /projects (AC-02.38)', async () => {
    const fetchMock = mockApi({ 'GET /me/menu': () => jsonResponse(menu(['clientes-buscar'])) });

    renderSection();
    expect(await screen.findByText('Disponible próximamente')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/projects'))).toBe(false);
  });

  it('con el módulo disponible lista los proyectos del contrato F.7 y envía búsqueda y filtros con prefijo (AC-02.36, AC-02.37)', async () => {
    const fetchMock = mockApi({
      'GET /me/menu': () => jsonResponse(menu(['clientes-buscar', 'proyectos-buscar'])),
      'GET /projects': () => page([PROJECT]),
    });

    renderSection('/clientes/c-1?projects.phaseId=f-1&projects.sortBy=code&projects.sortOrder=desc');
    expect(await screen.findByText('Torre Norte')).toBeInTheDocument();
    expect(screen.getByText('Diseño · 30 %')).toBeInTheDocument();
    expect(screen.getByText('Mixco, Guatemala')).toBeInTheDocument();

    const url = new URL(String(fetchMock.mock.calls.find(([input]) => String(input).includes('/projects'))?.[0]), 'http://localhost');
    expect(url.searchParams.get('customerId')).toBe('c-1');
    expect(url.searchParams.get('phaseId')).toBe('f-1');
    expect(url.searchParams.get('sortBy')).toBe('code');
    expect(url.searchParams.get('sortOrder')).toBe('desc');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar proyectos por código o nombre' }), 'torre');
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => new URL(String(input), 'http://localhost').searchParams.get('search') === 'torre')).toBe(true),
    );
  });

  it('una fila navega al detalle del proyecto (AC-02.37)', async () => {
    mockApi({
      'GET /me/menu': () => jsonResponse(menu(['proyectos-buscar'])),
      'GET /projects': () => page([PROJECT]),
    });

    renderSection();
    await userEvent.click(await screen.findByRole('link', { name: /Abrir el proyecto Torre Norte/ }));
    expect(await screen.findByText('En /proyectos/p-1')).toBeInTheDocument();
  });

  it('vacío y error con reintento', async () => {
    let calls = 0;
    mockApi({
      'GET /me/menu': () => jsonResponse(menu(['proyectos-buscar'])),
      'GET /projects': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : page([]);
      },
    });

    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Este cliente no tiene proyectos visibles para ti')).toBeInTheDocument();
  });
});
