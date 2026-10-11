import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsTo, deferred, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { CustomersPage } from './CustomersPage';
import { FORM_OPTIONS, GT, LIST_ITEM, page, signInWith, signOut, simulateWideScreen } from './testing/customer-fixtures';

/** Parámetros de la última llamada a `GET /customers`. */
function lastListQuery(fetchMock: Mock): URLSearchParams {
  const urls = fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname.endsWith('/customers'));
  return urls[urls.length - 1]?.searchParams ?? new URLSearchParams();
}

function renderPage(initialEntry = '/clientes') {
  return renderWithProviders(
    <Routes>
      <Route path="/clientes" element={<CustomersPage />} />
      <Route path="/clientes/nuevo" element={<p>Pantalla de alta</p>} />
      <Route path="/clientes/:customerId" element={<p>Ficha abierta</p>} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
}

function listApi(listHandler: () => Response | Promise<Response>, extra: Record<string, () => Response> = {}) {
  return mockApi({
    'GET /customers': listHandler,
    'GET /customers/form-options': () => jsonResponse(FORM_OPTIONS),
    ...extra,
  });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['clientes.ver', 'clientes.crear']);
});

afterEach(signOut);

describe('CustomersPage (F-05)', () => {
  it('muestra la carga y después las filas, con el orden y la paginación por defecto (AC-02.1)', async () => {
    const reply = deferred<Response>();
    const fetchMock = listApi(() => reply.promise);

    renderPage();
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();

    reply.resolve(page([LIST_ITEM]));
    const table = await screen.findByRole('table', { name: 'Clientes' });
    expect(within(table).getByText('Constructora Peña S.A.')).toBeInTheDocument();
    expect(within(table).getByText('CLI-000001')).toBeInTheDocument();
    const query = lastListQuery(fetchMock);
    expect(query.get('sortBy')).toBe('legalName');
    expect(query.get('sortOrder')).toBe('asc');
    expect(query.get('pageSize')).toBe('20');
    expect(query.get('page')).toBe('1');
  });

  it('vacío sin filtros ofrece crear; vacío con filtros ofrece limpiarlos (AC-02.11)', async () => {
    listApi(() => page([]));

    const first = renderPage();
    expect(await screen.findByText('Todavía no hay clientes visibles para ti')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Nuevo cliente' }).length).toBeGreaterThanOrEqual(2);
    first.unmount();

    renderPage('/clientes?search=zzz');
    expect(await screen.findByText('Ningún cliente coincide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
  });

  it('un error muestra el mensaje con la referencia y "Reintentar" vuelve a pedir (AC-02.11)', async () => {
    let calls = 0;
    listApi(() => {
      calls += 1;
      return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : page([LIST_ITEM]);
    });

    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Constructora Peña S.A.')).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('restaura filtros, orden y página desde la URL (AC-02.9)', async () => {
    const fetchMock = listApi(() => page([LIST_ITEM], 45));

    renderPage(`/clientes?countryId=${GT.id}&city=Mixco&sortBy=crmCode&sortOrder=desc&page=2`);

    expect(await screen.findByText('Constructora Peña S.A.')).toBeInTheDocument();
    const query = lastListQuery(fetchMock);
    expect(query.get('countryId')).toBe(GT.id);
    expect(query.get('city')).toBe('Mixco');
    expect(query.get('sortBy')).toBe('crmCode');
    expect(query.get('sortOrder')).toBe('desc');
    expect(query.get('page')).toBe('2');
    expect(await screen.findByText('Ciudad: Mixco')).toBeInTheDocument();
    expect(await screen.findByText('País: Guatemala')).toBeInTheDocument();
  });

  it('aplica los filtros combinados en la consulta (AC-02.2)', async () => {
    const fetchMock = listApi(() => page([LIST_ITEM]));
    renderPage();
    await screen.findByText('Constructora Peña S.A.');

    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const filters = screen.getByRole('search', { name: 'Filtros de clientes' });
    await userEvent.type(within(filters).getByLabelText('Código CRM'), 'CLI-0');
    await userEvent.type(within(filters).getByLabelText('Razón social'), 'peña');
    await userEvent.click(within(filters).getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => {
      const query = lastListQuery(fetchMock);
      expect(query.get('crmCode')).toBe('CLI-0');
      expect(query.get('legalName')).toBe('peña');
    });
  });

  it('clic en una fila abre la ficha (AC-02.9)', async () => {
    listApi(() => page([LIST_ITEM]));

    renderPage();
    await userEvent.click(await screen.findByRole('link', { name: /Abrir la ficha de Constructora Peña/ }));
    expect(await screen.findByText('Ficha abierta')).toBeInTheDocument();
  });

  it('Enter sobre una fila enfocada abre la ficha (AC-02.9)', async () => {
    listApi(() => page([LIST_ITEM]));

    renderPage();
    const row = await screen.findByRole('link', { name: /Abrir la ficha de Constructora Peña/ });
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Ficha abierta')).toBeInTheDocument();
  });

  it('sin clientes.crear no ofrece "Nuevo cliente"; sin clientes.eliminar no hay interruptor de eliminados', async () => {
    signInWith(['clientes.ver']);
    listApi(() => page([LIST_ITEM]));

    renderPage();
    await screen.findByText('Constructora Peña S.A.');
    expect(screen.queryByRole('button', { name: 'Nuevo cliente' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ver eliminados')).not.toBeInTheDocument();
  });

  it('con clientes.eliminar lista los eliminados y permite restaurarlos (D-02.6)', async () => {
    signInWith(['clientes.ver', 'clientes.eliminar']);
    const deleted = { ...LIST_ITEM, isDeleted: true };
    const fetchMock = listApi(() => page([deleted]), {
      'POST /customers/c-1/restore': () => jsonResponse({ ...deleted, isDeleted: false }),
    });

    renderPage();
    await screen.findByText('Constructora Peña S.A.');
    await userEvent.click(screen.getByLabelText('Ver eliminados'));
    await waitFor(() => expect(lastListQuery(fetchMock).get('deleted')).toBe('true'));

    await userEvent.click(await screen.findByRole('button', { name: 'Restaurar Constructora Peña S.A.' }));
    expect(await screen.findByText('Cliente CLI-000001 restaurado.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/customers/c-1/restore')).toHaveLength(1);
  });

  it('un deleted=true manipulado en la URL no se envía sin clientes.eliminar', async () => {
    const fetchMock = listApi(() => page([LIST_ITEM]));
    renderPage('/clientes?deleted=true');
    await screen.findByText('Constructora Peña S.A.');
    expect(lastListQuery(fetchMock).has('deleted')).toBe(false);
  });
});
