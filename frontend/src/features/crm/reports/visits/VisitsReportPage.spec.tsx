import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { todayInTimeZone } from '@/features/crm/commercial-activity/entry-points';
import { errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { presetPeriod } from '../common/report-period';
import { FILTER_OPTIONS, lastQuery, MANAGER_PERMISSIONS, page, signInWith, signOut, simulateWideScreen, VISIT_ROW, VISIT_SUMMARY } from '../testing/report-fixtures';

import { VisitsReportPage } from './VisitsReportPage';

vi.mock('@/lib/save-file', () => ({ saveFile: vi.fn() }));

function api(extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /reports/filter-options': () => jsonResponse(FILTER_OPTIONS),
    'GET /reports/visits': () => page([VISIT_ROW]),
    'GET /reports/visits/summary': () => jsonResponse(VISIT_SUMMARY),
    ...extra,
  });
}

function renderPage(initialEntry = '/reportes/visitas') {
  return renderWithProviders(<VisitsReportPage />, { initialEntries: [initialEntry] });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith([...MANAGER_PERMISSIONS, 'visitas.ver']);
});

afterEach(signOut);

describe('VisitsReportPage (05 F-37)', () => {
  it('C.2: envía por defecto el mes en curso por la fecha planificada vigente a lista y resumen', async () => {
    const fetchMock = api();
    renderPage();

    await screen.findByRole('table', { name: 'Reporte de visitas' });
    const expected = presetPeriod('CURRENT_MONTH', todayInTimeZone(undefined));
    for (const path of ['/reports/visits', '/reports/visits/summary']) {
      const query = lastQuery(fetchMock, path);
      expect(query.get('from')).toBe(expected.from);
      expect(query.get('to')).toBe(expected.to);
    }
    expect(lastQuery(fetchMock, '/reports/visits').get('sortBy')).toBe('scheduledStartAt');
    expect(lastQuery(fetchMock, '/reports/visits').get('sortOrder')).toBe('desc');
  });

  it('AC-05.17: categorías disjuntas con total e informativos de reprogramación y atrasadas', async () => {
    api();
    renderPage();

    const summary = await screen.findByRole('region', { name: 'Resumen de visitas' });
    expect(await within(summary).findByRole('button', { name: 'Programadas: 4. Filtrar la tabla' })).toBeInTheDocument();
    expect(within(summary).getByRole('button', { name: 'Realizadas: 2. Filtrar la tabla' })).toBeInTheDocument();
    expect(within(summary).getByRole('button', { name: 'Confirmadas: 2. Filtrar la tabla' })).toBeInTheDocument();
    expect(within(summary).getByRole('button', { name: 'Canceladas: 1. Filtrar la tabla' })).toBeInTheDocument();
    expect(within(summary).getByText('Realizadas en total: 4')).toBeInTheDocument();
    expect(within(summary).getByText('Reprogramadas: 1 visita (2 reprogramaciones) · Pendientes atrasadas: 1')).toBeInTheDocument();
  });

  it('AC-05.18: una visita reprogramada aparece una vez con "Reprogramada 2 veces" y su fecha original', async () => {
    api();
    renderPage();

    const table = await screen.findByRole('table', { name: 'Reporte de visitas' });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText(/^Reprogramada 2 veces, original:/)).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Abrir la visita VIS-2026-00001' })).toHaveAttribute('href', '/actividad/visitas/v-1');
  });

  it('la tarjeta filtra por categoría de estado', async () => {
    const user = userEvent.setup();
    const fetchMock = api();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Confirmadas: 2. Filtrar la tabla' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/reports/visits').get('statusCategory')).toBe('CONFIRMED'));
    expect(lastQuery(fetchMock, '/reports/visits/summary').get('statusCategory')).toBe('CONFIRMED');
  });

  it('error de la lista con referencia y estado vacío', async () => {
    api({ 'GET /reports/visits': () => errorResponse(503, 'REPORT_TIMEOUT') });
    const { unmount } = renderPage();
    expect(await screen.findByText(/Acota los filtros.*Referencia: corr-test/)).toBeInTheDocument();
    unmount();

    api({ 'GET /reports/visits': () => page([]) });
    renderPage();
    expect(await screen.findByText('No hay registros para los filtros seleccionados')).toBeInTheDocument();
  });
});
