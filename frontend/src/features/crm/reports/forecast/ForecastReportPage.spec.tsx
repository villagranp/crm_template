import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import {
  callCount,
  FILTER_OPTIONS,
  FORECAST_GROUP,
  FORECAST_ROW,
  FORECAST_SUMMARY,
  lastQuery,
  MANAGER_PERMISSIONS,
  page,
  signInWith,
  signOut,
  simulateWideScreen,
  xlsxResponse,
} from '../testing/report-fixtures';

import { ForecastReportPage } from './ForecastReportPage';

vi.mock('@/lib/save-file', () => ({ saveFile: vi.fn() }));

function api(extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /reports/filter-options': () => jsonResponse(FILTER_OPTIONS),
    'GET /reports/forecast': () => page([FORECAST_ROW]),
    'GET /reports/forecast/summary': () => jsonResponse(FORECAST_SUMMARY),
    'GET /reports/forecast/consolidated': () => page([FORECAST_GROUP]),
    ...extra,
  });
}

function renderPage(initialEntry = '/reportes/forecast') {
  return renderWithProviders(<ForecastReportPage />, { initialEntries: [initialEntry] });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(MANAGER_PERMISSIONS);
});

afterEach(signOut);

describe('ForecastReportPage (05 F-36)', () => {
  it('AC-05.12: sin meses usa el rango del servidor (M+1…M+6) con totales, acumulado y última actualización', async () => {
    const fetchMock = api();
    renderPage();

    const totals = await screen.findByRole('table', { name: 'Totales mensuales del forecast' });
    const rows = within(totals).getAllByRole('row').map((row) => row.textContent);
    expect(rows[0]).toBe('Conceptonov 2026dic 2026Total');
    expect(rows[1]).toBe('Tonelaje (t)10.00 t5.50 t15.50 t');
    expect(rows[2]).toBe('Acumulado (t)10.00 t15.50 t');
    expect(lastQuery(fetchMock, '/reports/forecast/summary').has('fromMonth')).toBe(false);
    expect(within(screen.getByLabelText('Filtros activos')).getByText('Meses: nov 2026 – dic 2026 (próximos 6 meses)')).toBeInTheDocument();
    expect(screen.getByText(/Última actualización:/)).toBeInTheDocument();
    expect(lastQuery(fetchMock, '/reports/forecast').get('sortBy')).toBe('period');
  });

  it('AC-05.13: cantidades por unidad sin mezclar, aviso de líneas sin conversión y "sin conversión" en la fila', async () => {
    api();
    renderPage();

    const totals = await screen.findByRole('table', { name: 'Totales mensuales del forecast' });
    const rows = within(totals).getAllByRole('row').map((row) => row.textContent);
    expect(rows).toContain('Cantidad (kg)10,000 kg5,500 kg15,500 kg');
    expect(rows).toContain('Cantidad (VAR)120 VAR0 VAR120 VAR');
    expect(rows).toContain('Líneas sin conversión101');
    expect(screen.getByText('1 línea sin conversión: se muestran en su unidad y no suman en las toneladas.')).toBeInTheDocument();
    const detail = screen.getByRole('table', { name: 'Reporte de forecast' });
    expect(within(detail).getByText('sin conversión')).toBeInTheDocument();
    expect(within(detail).getByText('120 VAR')).toBeInTheDocument();
  });

  it('AC-05.14: "Consolidado" agrupa por producto con segundo nivel y exporta con groupBy/thenBy', async () => {
    const user = userEvent.setup();
    const fetchMock = api({ 'GET /reports/forecast/export': () => xlsxResponse('reporte-forecast.xlsx', 3) });
    renderPage();

    await screen.findByRole('table', { name: 'Reporte de forecast' });
    await user.click(screen.getByRole('tab', { name: 'Consolidado' }));
    const matrix = await screen.findByRole('table', { name: 'Forecast consolidado' });
    expect(within(matrix).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Mes', 'nov 2026', 'dic 2026', 'Total']);
    expect(lastQuery(fetchMock, '/reports/forecast/consolidated').get('groupBy')).toBe('MONTH');

    await user.click(screen.getByRole('combobox', { name: 'Agrupar por' }));
    await user.click(await screen.findByRole('option', { name: 'Producto' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/reports/forecast/consolidated').get('groupBy')).toBe('PRODUCT'));
    await user.click(screen.getByRole('combobox', { name: 'Luego por' }));
    await user.click(await screen.findByRole('option', { name: 'Asesor' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/reports/forecast/consolidated').get('thenBy')).toBe('OWNER'));
    expect(within(screen.getByRole('table', { name: 'Forecast consolidado' })).getByText('VAR-3 · Varilla corrugada #3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Exportar a Excel' }));
    await screen.findByText('Se descargó reporte-forecast.xlsx con 3 filas.');
    const exportQuery = lastQuery(fetchMock, '/reports/forecast/export');
    expect(exportQuery.get('groupBy')).toBe('PRODUCT');
    expect(exportQuery.get('thenBy')).toBe('OWNER');
    expect(exportQuery.has('page')).toBe(false);
  });

  it('la vista consolidada no pide el detalle (y al revés)', async () => {
    const fetchMock = api();
    renderPage('/reportes/forecast?vista=consolidado');

    await screen.findByRole('table', { name: 'Forecast consolidado' });
    expect(callCount(fetchMock, '/reports/forecast')).toBe(0);
  });

  it('un rango de meses de la URL se envía y se puede quitar desde su chip', async () => {
    const user = userEvent.setup();
    const fetchMock = api();
    renderPage('/reportes/forecast?fromMonth=2025-01&toMonth=2025-06');

    await screen.findByRole('table', { name: 'Reporte de forecast' });
    expect(lastQuery(fetchMock, '/reports/forecast/summary').get('fromMonth')).toBe('2025-01');
    const chip = within(screen.getByLabelText('Filtros activos')).getByText(/^Meses:/).closest('.MuiChip-root') as HTMLElement;
    await user.click(within(chip).getByTestId('CancelIcon'));
    await waitFor(() => expect(lastQuery(fetchMock, '/reports/forecast/summary').has('fromMonth')).toBe(false));
  });
});
