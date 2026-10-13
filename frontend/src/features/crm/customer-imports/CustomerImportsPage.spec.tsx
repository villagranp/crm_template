import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deferred, errorResponse, jsonResponse, mockUpload } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { CustomerImportsPage } from './CustomerImportsPage';
import {
  ALL_IMPORT_PERMISSIONS,
  DISABLED_SETTINGS,
  IMPORT_ID,
  LIST_ITEM,
  mockImportApi,
  page,
  SETTINGS,
  signInWith,
  signOut,
  simulateWideScreen,
  testFile,
  urlsTo,
  VALIDATED_IMPORT,
  type UrlRouteHandler,
} from './testing/customer-import-fixtures';

function renderPage(initialEntry = '/integraciones/clientes') {
  return renderWithProviders(
    <Routes>
      <Route path="/integraciones/clientes" element={<CustomerImportsPage />} />
      <Route path="/integraciones/clientes/:importId" element={<p>Detalle abierto</p>} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
}

function api(list: UrlRouteHandler = () => page([LIST_ITEM]), settings = SETTINGS) {
  return mockImportApi({
    'GET /customer-imports': list,
    'GET /customer-imports/settings': () => jsonResponse(settings),
  });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(ALL_IMPORT_PERMISSIONS);
});

afterEach(signOut);

describe('CustomerImportsPage (06 §E.1)', () => {
  it('muestra la carga y después el historial, ordenado por fecha descendente', async () => {
    const reply = deferred<Response>();
    const fetchMock = api(() => reply.promise);

    renderPage();
    expect(screen.getByRole('heading', { name: 'Carga masiva de clientes' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();

    reply.resolve(page([LIST_ITEM]));
    const table = await screen.findByRole('table', { name: 'Cargas de clientes' });
    const row = within(table).getByRole('link', { name: /Abrir la carga IMP-2026-0007/ });
    expect(row).toHaveTextContent('clientes-octubre.xlsx');
    expect(row).toHaveTextContent('Excel (.xlsx)');
    expect(row).toHaveTextContent('Pendiente de confirmar');
    expect(row).toHaveTextContent('Ana Asesora');
    const query = urlsTo(fetchMock, 'GET', '/customer-imports').at(-1)?.searchParams;
    expect(query?.get('sortBy')).toBe('createdAt');
    expect(query?.get('sortOrder')).toBe('desc');
    expect(query?.get('pageSize')).toBe('20');
  });

  it('envía estado, rango de fechas (ISO 8601) y búsqueda desde la URL', async () => {
    const fetchMock = api();

    renderPage('/integraciones/clientes?status=FAILED&createdFrom=2026-10-01&createdTo=2026-10-31&search=octubre');

    await screen.findByRole('table', { name: 'Cargas de clientes' });
    const query = urlsTo(fetchMock, 'GET', '/customer-imports').at(-1)?.searchParams;
    expect(query?.get('status')).toBe('FAILED');
    expect(query?.get('createdFrom')).toBe(new Date(2026, 9, 1).toISOString());
    expect(query?.get('createdTo')).toBe(new Date(2026, 9, 31, 23, 59, 59, 999).toISOString());
    expect(query?.get('search')).toBe('octubre');
  });

  it('cambiar el filtro de estado vuelve a consultar con ese estado', async () => {
    const fetchMock = api();
    renderPage();
    await screen.findByRole('table', { name: 'Cargas de clientes' });

    await userEvent.click(screen.getByRole('combobox', { name: 'Estado' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Completada con errores' }));

    await waitFor(() => expect(urlsTo(fetchMock, 'GET', '/customer-imports').at(-1)?.searchParams.get('status')).toBe('COMPLETED_WITH_ERRORS'));
  });

  it('ignora un estado inventado en la URL', async () => {
    const fetchMock = api();
    renderPage('/integraciones/clientes?status=HACKED');
    await screen.findByRole('table', { name: 'Cargas de clientes' });
    expect(urlsTo(fetchMock, 'GET', '/customer-imports').at(-1)?.searchParams.has('status')).toBe(false);
  });

  it('vacío sin filtros ofrece "Nueva carga"; con filtros, limpiarlos', async () => {
    api(() => page([]));

    const first = renderPage();
    expect(await screen.findByText('Aún no hay cargas')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Nueva carga' })).toHaveLength(2);
    first.unmount();

    renderPage('/integraciones/clientes?search=zzz');
    expect(await screen.findByText('Ninguna carga coincide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
  });

  it('un error muestra el mensaje con referencia y "Reintentar" vuelve a pedir', async () => {
    let calls = 0;
    api(() => {
      calls += 1;
      return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : page([LIST_ITEM]);
    });

    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('clientes-octubre.xlsx')).toBeInTheDocument();
  });

  it('clic en una fila abre el detalle', async () => {
    api();
    renderPage();
    await userEvent.click(await screen.findByRole('link', { name: /Abrir la carga IMP-2026-0007/ }));
    expect(await screen.findByText('Detalle abierto')).toBeInTheDocument();
  });

  it('sin importaciones.crear no muestra "Nueva carga" ni "Descargar plantilla" (PF-06.47)', async () => {
    signInWith(['importaciones.ver']);
    api(() => page([]));

    renderPage();
    expect(await screen.findByText('Aún no hay cargas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva carga' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Descargar plantilla/ })).not.toBeInTheDocument();
  });

  it('con importaciones.crear pero sin clientes.crear ofrece la plantilla y no la subida', async () => {
    signInWith(['importaciones.ver', 'importaciones.crear']);
    api();

    renderPage();
    expect(await screen.findByRole('button', { name: /Descargar plantilla/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva carga' })).not.toBeInTheDocument();
  });

  it('con la carga deshabilitada avisa, deshabilita las altas y deja ver el historial (AC-06.25)', async () => {
    api(undefined, DISABLED_SETTINGS);

    renderPage();
    expect(await screen.findByText(/La carga masiva no está habilitada en este entorno/)).toBeInTheDocument();
    expect(await screen.findByText('clientes-octubre.xlsx')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva carga' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Descargar plantilla/ })).toBeDisabled();
  });

  it('"Nueva carga" abre el diálogo y, con 201, navega al detalle de la carga creada', async () => {
    api();
    mockUpload(() => ({ status: 201, body: { ...VALIDATED_IMPORT, id: IMPORT_ID } }));

    renderPage();
    const button = await screen.findByRole('button', { name: 'Nueva carga' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Nueva carga de clientes' });
    await userEvent.upload(within(dialog).getByLabelText('Archivo de clientes'), testFile('clientes.csv'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Subir y validar' }));

    expect(await screen.findByText('Detalle abierto')).toBeInTheDocument();
  });

  it('descargar la plantilla pide el formato elegido y avisa si falla', async () => {
    const fetchMock = mockImportApi({
      'GET /customer-imports': () => page([LIST_ITEM]),
      'GET /customer-imports/settings': () => jsonResponse(SETTINGS),
      'GET /customer-imports/template': () => errorResponse(500, 'INTERNAL_ERROR'),
    });

    renderPage();
    const button = await screen.findByRole('button', { name: /Descargar plantilla/ });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Plantilla Excel (.xlsx)' }));

    expect(await screen.findByText(/No se pudo descargar la plantilla/)).toBeInTheDocument();
    expect(urlsTo(fetchMock, 'GET', '/customer-imports/template').at(-1)?.searchParams.get('format')).toBe('XLSX');
  });
});
