import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RequirePermission } from '@/components/layout/RequirePermission';
import { deferred, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { REPORT_PERMISSIONS } from '../reports.permissions';
import {
  ADVISOR_PERMISSIONS,
  callCount,
  FILTER_OPTIONS,
  lastQuery,
  MANAGER_PERMISSIONS,
  page,
  PROJECT_ROW,
  signInWith,
  signOut,
  simulateNarrowScreen,
  simulateWideScreen,
  xlsxResponse,
} from '../testing/report-fixtures';

import { ProjectsReportPage } from './ProjectsReportPage';

vi.mock('@/lib/save-file', () => ({ saveFile: vi.fn() }));

function renderPage(initialEntry = '/reportes/proyectos') {
  return renderWithProviders(
    <Routes>
      <Route
        path="/reportes/proyectos"
        element={
          <RequirePermission permission={REPORT_PERMISSIONS.view}>
            <ProjectsReportPage />
          </RequirePermission>
        }
      />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
}

function api(extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /reports/filter-options': () => jsonResponse(FILTER_OPTIONS),
    'GET /reports/projects': () => page([PROJECT_ROW], 41),
    ...extra,
  });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(MANAGER_PERMISSIONS);
});

afterEach(signOut);

describe('ProjectsReportPage (05 F-34)', () => {
  it('AC-05.1: lista los proyectos visibles con las 12 columnas y orden por defecto lastActivityAt desc', async () => {
    const fetchMock = api();
    renderPage();

    const table = await screen.findByRole('table', { name: 'Reporte de proyectos' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual([
      'Código',
      'Nombre',
      'Cliente',
      'País',
      'Ubicación',
      'Asesor',
      'Tipo',
      'Fase',
      '% avance',
      'Estado comercial',
      'Decisión estimada',
      'Última actualización',
    ]);
    const row = within(table).getAllByRole('row')[1] as HTMLElement;
    expect(within(row).getByText('Torre Norte')).toBeInTheDocument();
    expect(within(row).getByText('Mixco')).toBeInTheDocument();
    expect(within(row).getByText('Residencial')).toBeInTheDocument();
    expect(within(row).getByText('45 %')).toBeInTheDocument();
    expect(within(row).getByText('Cotizando')).toBeInTheDocument();
    expect(within(row).getByText('30 nov 2026')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 1–20 de 41')).toBeInTheDocument();
    const query = lastQuery(fetchMock, '/reports/projects');
    expect(Object.fromEntries(query)).toEqual({ page: '1', pageSize: '20', sortBy: 'lastActivityAt', sortOrder: 'desc' });
  });

  it('AC-05.4: el código enlaza a la ficha con proyectos.ver; sin ese permiso es texto', async () => {
    api();
    const { unmount } = renderPage();
    expect(await screen.findByRole('link', { name: 'Abrir el proyecto PRY-2026-00001' })).toHaveAttribute('href', '/proyectos/p-1');
    unmount();

    signInWith(['reportes.ver']);
    renderPage();
    await screen.findByRole('table', { name: 'Reporte de proyectos' });
    expect(screen.queryByRole('link', { name: 'Abrir el proyecto PRY-2026-00001' })).not.toBeInTheDocument();
    expect(screen.getByText('PRY-2026-00001')).toBeInTheDocument();
  });

  it('AC-05.3: los filtros combinados de la URL se envían juntos (país + fase + asesor + situación)', async () => {
    const fetchMock = api();
    renderPage('/reportes/proyectos?countryId=gt&phaseId=ph-design&ownerId=u-1&situation=ACTIVE');

    await screen.findByRole('table', { name: 'Reporte de proyectos' });
    const query = lastQuery(fetchMock, '/reports/projects');
    expect(query.get('countryId')).toBe('gt');
    expect(query.get('phaseId')).toBe('ph-design');
    expect(query.get('ownerId')).toBe('u-1');
    expect(query.get('situation')).toBe('ACTIVE');
    const chips = screen.getByLabelText('Filtros activos');
    expect(await within(chips).findByText('Fase: Diseño')).toBeInTheDocument();
    expect(within(chips).getByText('Situación: Activos (fase no final)')).toBeInTheDocument();
  });

  it('el estado comercial ofrece las etapas abiertas del catálogo y se filtra por OPEN_STAGE:<id>', async () => {
    const user = userEvent.setup();
    const fetchMock = api();
    renderPage();

    await screen.findByRole('table', { name: 'Reporte de proyectos' });
    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros del reporte de proyectos' });
    await waitFor(() => expect(within(form).getByRole('combobox', { name: 'Estado comercial' })).not.toHaveAttribute('aria-disabled'));
    await user.click(within(form).getByRole('combobox', { name: 'Estado comercial' }));
    await user.click(await screen.findByRole('option', { name: 'Abierta en Cotizando' }));
    await user.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(lastQuery(fetchMock, '/reports/projects').get('commercialStatus')).toBe('OPEN_STAGE:st-quote'));
  });

  it('con período exige la base de fecha (proyectos no tiene una por defecto)', async () => {
    const user = userEvent.setup();
    api();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros del reporte de proyectos' });
    fireEvent.change(within(form).getByLabelText('Desde'), { target: { value: '2026-01-01' } });
    fireEvent.change(within(form).getByLabelText('Hasta'), { target: { value: '2026-06-30' } });
    await user.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));

    expect(await within(form).findByText('Elige la fecha por la que se filtra el período.')).toBeInTheDocument();
  });

  it('ordenar por una columna lo envía al servidor y vuelve a la primera página', async () => {
    const user = userEvent.setup();
    const fetchMock = api();
    renderPage('/reportes/proyectos?page=2');

    const table = await screen.findByRole('table', { name: 'Reporte de proyectos' });
    await user.click(within(table).getByRole('button', { name: 'Nombre' }));

    await waitFor(() => expect(lastQuery(fetchMock, '/reports/projects').get('sortBy')).toBe('name'));
    expect(lastQuery(fetchMock, '/reports/projects').get('sortOrder')).toBe('asc');
    expect(lastQuery(fetchMock, '/reports/projects').get('page')).toBe('1');
  });

  describe('estados (PF-05.36)', () => {
    it('cargando: esqueletos mientras llega la primera página', async () => {
      const reply = deferred<Response>();
      api({ 'GET /reports/projects': () => reply.promise });
      renderPage();

      expect(await screen.findByRole('status', { name: 'Cargando' })).toBeInTheDocument();
      reply.resolve(page([PROJECT_ROW]).clone());
      expect(await screen.findByRole('table', { name: 'Reporte de proyectos' })).toBeInTheDocument();
    });

    it('vacío: "No hay registros para los filtros seleccionados" con "Limpiar filtros"', async () => {
      const user = userEvent.setup();
      const fetchMock = api({ 'GET /reports/projects': () => page([]) });
      renderPage('/reportes/proyectos?countryId=sv');

      expect(await screen.findByText('No hay registros para los filtros seleccionados')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
      await waitFor(() => expect(lastQuery(fetchMock, '/reports/projects').has('countryId')).toBe(false));
    });

    it('error: mensaje con referencia y "Reintentar" (503 REPORT_TIMEOUT)', async () => {
      const user = userEvent.setup();
      const fetchMock = api({ 'GET /reports/projects': () => errorResponse(503, 'REPORT_TIMEOUT') });
      renderPage();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('La consulta tardó demasiado. Acota los filtros');
      expect(alert).toHaveTextContent('Referencia: corr-test');
      const before = callCount(fetchMock, '/reports/projects');
      await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(callCount(fetchMock, '/reports/projects')).toBe(before + 1));
    });

    it('sin permiso: la ruta muestra "Sin acceso" y no llama a la API', () => {
      signInWith(['clientes.ver']);
      const fetchMock = api();
      renderPage();

      expect(screen.getByRole('heading', { name: /Sin acceso/i })).toBeInTheDocument();
      expect(callCount(fetchMock, '/reports/projects')).toBe(0);
    });
  });

  it('móvil: por debajo de sm la tabla se pinta como tarjetas', async () => {
    simulateNarrowScreen();
    api();
    renderPage();

    const list = await screen.findByRole('list', { name: 'Reporte de proyectos' });
    expect(within(list).getByText('Torre Norte')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Reporte de proyectos' })).not.toBeInTheDocument();
  });

  it('F-39: exporta con los mismos filtros y orden, sin paginación; sin reportes.exportar no hay botón', async () => {
    const user = userEvent.setup();
    const fetchMock = api({ 'GET /reports/projects/export': () => xlsxResponse('reporte-proyectos-20261014-0830.xlsx', 41) });
    const { unmount } = renderPage('/reportes/proyectos?countryId=gt&sortBy=name&sortOrder=asc&page=3&search=torre');

    await screen.findByRole('table', { name: 'Reporte de proyectos' });
    await user.click(screen.getByRole('button', { name: 'Exportar a Excel' }));
    expect(await screen.findByText('Se descargó reporte-proyectos-20261014-0830.xlsx con 41 filas.')).toBeInTheDocument();
    expect(Object.fromEntries(lastQuery(fetchMock, '/reports/projects/export'))).toEqual({
      countryId: 'gt',
      search: 'torre',
      sortBy: 'name',
      sortOrder: 'asc',
      format: 'xlsx',
    });
    unmount();

    signInWith(ADVISOR_PERMISSIONS);
    renderPage();
    await screen.findByRole('table', { name: 'Reporte de proyectos' });
    expect(screen.queryByRole('button', { name: 'Exportar a Excel' })).not.toBeInTheDocument();
  });
});
