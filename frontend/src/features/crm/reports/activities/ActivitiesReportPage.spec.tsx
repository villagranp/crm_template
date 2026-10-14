import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { todayInTimeZone } from '@/features/crm/commercial-activity/entry-points';
import { jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { presetPeriod } from '../common/report-period';
import {
  ACTIVITY_ROW,
  ACTIVITY_SUMMARY,
  FILTER_OPTIONS,
  lastQuery,
  MANAGER_PERMISSIONS,
  page,
  signInWith,
  signOut,
  simulateWideScreen,
  xlsxResponse,
} from '../testing/report-fixtures';

import { ActivitiesReportPage } from './ActivitiesReportPage';

vi.mock('@/lib/save-file', () => ({ saveFile: vi.fn() }));

function api(extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /reports/filter-options': () => jsonResponse(FILTER_OPTIONS),
    'GET /reports/activities': () => page([ACTIVITY_ROW]),
    'GET /reports/activities/summary': () => jsonResponse(ACTIVITY_SUMMARY),
    ...extra,
  });
}

function renderPage(initialEntry = '/reportes/actividades') {
  return renderWithProviders(<ActivitiesReportPage />, { initialEntries: [initialEntry] });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(MANAGER_PERMISSIONS);
});

afterEach(signOut);

describe('ActivitiesReportPage (05 F-38)', () => {
  it('AC-05.20: pendientes y vencidas disjuntas, total y próximas a vencer', async () => {
    api();
    renderPage();

    const summary = await screen.findByRole('region', { name: 'Resumen de actividades' });
    expect(await within(summary).findByRole('button', { name: 'Pendientes: 3. Filtrar la tabla' })).toBeInTheDocument();
    expect(within(summary).getByRole('button', { name: 'Vencidas: 2. Filtrar la tabla' })).toBeInTheDocument();
    expect(within(summary).getByRole('button', { name: 'Realizadas: 4. Filtrar la tabla' })).toBeInTheDocument();
    expect(within(summary).getByRole('button', { name: 'Canceladas: 1. Filtrar la tabla' })).toBeInTheDocument();
    expect(within(summary).getByText('Próximas a vencer (en 48 h): 1')).toBeInTheDocument();
  });

  it('la vencida se marca con el texto "Vencida" y sin actividades.ver el código no es enlace', async () => {
    api();
    renderPage();

    const table = await screen.findByRole('table', { name: 'Reporte de actividades' });
    expect(within(table).getByText('Vencida')).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: 'Abrir la actividad ACT-2026-000001' })).not.toBeInTheDocument();
  });

  it('AC-05.22: lista, resumen y exportación usan los mismos filtros (período por defecto incluido)', async () => {
    const user = userEvent.setup();
    const fetchMock = api({ 'GET /reports/activities/export': () => xlsxResponse('reporte-actividades.xlsx', 1) });
    renderPage('/reportes/actividades?ownerId=u-1&typeId=at-call&statusCategory=OVERDUE&customerId=c-1');

    await screen.findByRole('table', { name: 'Reporte de actividades' });
    await user.click(screen.getByRole('button', { name: 'Exportar a Excel' }));
    await screen.findByText('Se descargó reporte-actividades.xlsx con 1 fila.');

    const period = presetPeriod('CURRENT_MONTH', todayInTimeZone(undefined));
    const filters = { ownerId: 'u-1', typeId: 'at-call', statusCategory: 'OVERDUE', customerId: 'c-1', from: period.from, to: period.to };
    expect(Object.fromEntries(lastQuery(fetchMock, '/reports/activities/summary'))).toEqual(filters);
    expect(Object.fromEntries(lastQuery(fetchMock, '/reports/activities'))).toEqual({ ...filters, page: '1', pageSize: '20', sortBy: 'activityDate', sortOrder: 'desc' });
    await waitFor(() =>
      expect(Object.fromEntries(lastQuery(fetchMock, '/reports/activities/export'))).toEqual({ ...filters, sortBy: 'activityDate', sortOrder: 'desc', format: 'xlsx' }),
    );
  });
});
