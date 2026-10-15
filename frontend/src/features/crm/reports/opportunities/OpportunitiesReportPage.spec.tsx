import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import {
  FILTER_OPTIONS,
  lastQuery,
  MANAGER_PERMISSIONS,
  OPPORTUNITY_ROW_GTQ,
  OPPORTUNITY_ROW_USD,
  opportunitySummary,
  page,
  signInWith,
  signOut,
  simulateWideScreen,
} from '../testing/report-fixtures';

import { OpportunitiesReportPage } from './OpportunitiesReportPage';

vi.mock('@/lib/save-file', () => ({ saveFile: vi.fn() }));
vi.mock('../charts/ReportBarChart', async () => (await import('../testing/chart-doubles')).barChartModule);

function api(extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /reports/filter-options': () => jsonResponse(FILTER_OPTIONS),
    'GET /reports/opportunities': () => page([OPPORTUNITY_ROW_GTQ, OPPORTUNITY_ROW_USD]),
    'GET /reports/opportunities/summary': () => jsonResponse(opportunitySummary()),
    ...extra,
  });
}

function renderPage(initialEntry = '/reportes/oportunidades') {
  return renderWithProviders(<OpportunitiesReportPage />, { initialEntries: [initialEntry] });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(MANAGER_PERMISSIONS);
});

afterEach(signOut);

describe('OpportunitiesReportPage (05 F-35)', () => {
  it('AC-05.5/AC-05.6: resumen con ganadas que incluyen parciales y cerradas sin resultado cuando hay', async () => {
    api();
    renderPage();

    const summary = await screen.findByRole('region', { name: 'Resumen de oportunidades' });
    expect(await within(summary).findByRole('button', { name: 'Abiertas: 4. Filtrar la tabla' })).toBeInTheDocument();
    expect(within(summary).getByRole('button', { name: 'Ganadas: 3. Filtrar la tabla' })).toBeInTheDocument();
    expect(within(summary).getByText('de las cuales parciales: 2')).toBeInTheDocument();
    expect(within(summary).getByRole('button', { name: 'Perdidas: 2. Filtrar la tabla' })).toBeInTheDocument();
    expect(within(summary).getByRole('button', { name: 'Resultados parciales: 2. Filtrar la tabla' })).toBeInTheDocument();
    expect(within(summary).getByRole('button', { name: 'Cerradas sin resultado: 1. Filtrar la tabla' })).toBeInTheDocument();
  });

  it('AC-05.6/AC-05.9/AC-05.44: filas con "Parcial 60 %", monto original + USD y fecha estimada marcada', async () => {
    api();
    renderPage();

    const table = await screen.findByRole('table', { name: 'Reporte de oportunidades' });
    const [, gtq, usd] = within(table).getAllByRole('row') as HTMLElement[];
    expect(within(gtq as HTMLElement).getByText('Parcial 60 %')).toBeInTheDocument();
    expect(within(gtq as HTMLElement).getByText('GTQ 7,750.00')).toBeInTheDocument();
    expect(within(gtq as HTMLElement).getByText('≈ USD 1,000.00')).toBeInTheDocument();
    expect(within(gtq as HTMLElement).getByText('12.50 t')).toBeInTheDocument();
    expect(within(usd as HTMLElement).getByText('USD 2,500.00')).toBeInTheDocument();
    expect(within(usd as HTMLElement).queryByText(/^≈/)).not.toBeInTheDocument();
    expect(within(usd as HTMLElement).getByText('30 nov 2026 (estimada)')).toBeInTheDocument();
  });

  it('AC-05.11/PF-05.46: un solo total en USD; sin referencia local cuando no viene', async () => {
    api();
    renderPage();

    const totals = await screen.findByRole('region', { name: 'Estimación total' });
    expect(within(totals).getByText('Estimación total (USD)')).toBeInTheDocument();
    expect(within(totals).getByText('USD 125,000.00')).toBeInTheDocument();
    expect(within(totals).getByText('340.50 t')).toBeInTheDocument();
    expect(within(totals).queryByText(/referencial/)).not.toBeInTheDocument();
  });

  it('AC-05.45/PF-05.46: con un país de otra moneda, la referencia local en texto secundario con "referencial" y la fecha de la tasa', async () => {
    api({
      'GET /reports/opportunities/summary': () =>
        jsonResponse(
          opportunitySummary({
            localReference: { currencyCode: 'GTQ', amount: '968750.0000', exchangeRate: '7.75000000', exchangeRateDate: '2026-10-01', cutDate: '2026-10-14', label: 'referencial' },
            localReferenceUnavailableReason: null,
          }),
        ),
    });
    renderPage('/reportes/oportunidades?countryId=gt');

    const totals = await screen.findByRole('region', { name: 'Estimación total' });
    expect(within(totals).getByText('USD 125,000.00')).toBeInTheDocument();
    expect(within(totals).getByTestId('local-reference')).toHaveTextContent('≈ GTQ 968,750.00 (referencial, tasa del 1 oct 2026)');
  });

  it('AC-05.10/PF-05.38: por etapa, barras horizontales y "Ver como tabla" con los mismos valores; por asesor, tabla', async () => {
    const user = userEvent.setup();
    api();
    renderPage();

    const stagePanel = await screen.findByRole('region', { name: 'Distribución por etapa' });
    const chart = await within(stagePanel).findByTestId('bar-chart');
    expect(chart).toHaveAttribute('data-layout', 'horizontal');
    expect(within(chart).getAllByRole('button').map((item) => item.textContent)).toEqual(['Contactado = 0', 'Cotizando = 4', 'Cerrada = 6']);
    await user.click(within(stagePanel).getByRole('button', { name: 'Ver como tabla' }));

    const byStage = within(stagePanel).getByRole('table', { name: 'Oportunidades por etapa' });
    const stageRows = within(byStage).getAllByRole('row').map((row) => row.textContent);
    expect(stageRows).toEqual(['EtapaOportunidades', 'Contactado0', 'Cotizando4', 'Cerrada6']);
    const byOwner = screen.getByRole('table', { name: 'Oportunidades por asesor' });
    expect(within(byOwner).getAllByRole('row').map((row) => row.textContent)).toEqual([
      'AsesorTotalAbiertasGanadasParcialesPerdidas',
      'Ana Asesora62211',
      'Luis Gerente42111',
    ]);
  });

  it('una tarjeta de estado filtra la tabla y el resumen con el mismo conjunto (RN-05.9)', async () => {
    const user = userEvent.setup();
    const fetchMock = api();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Ganadas: 3. Filtrar la tabla' }));

    await waitFor(() => expect(lastQuery(fetchMock, '/reports/opportunities').get('status')).toBe('WON'));
    expect(lastQuery(fetchMock, '/reports/opportunities/summary').get('status')).toBe('WON');
    expect(lastQuery(fetchMock, '/reports/opportunities/summary').has('page')).toBe(false);
    expect(within(screen.getByLabelText('Filtros activos')).getByText('Estado: Ganadas (incluye parciales)')).toBeInTheDocument();
  });

  it('AC-05.8: con dateBasis=DECIDED y período lo indica la pantalla y lo envía', async () => {
    const fetchMock = api();
    renderPage('/reportes/oportunidades?from=2026-10-01&to=2026-10-31&dateBasis=DECIDED');

    expect(await screen.findByText('Con la fecha de decisión solo entran las oportunidades con resultado registrado.', { selector: '.MuiAlert-message' })).toBeInTheDocument();
    const query = lastQuery(fetchMock, '/reports/opportunities');
    expect(query.get('dateBasis')).toBe('DECIDED');
    expect(query.get('from')).toBe('2026-10-01');
    expect(query.get('to')).toBe('2026-10-31');
  });

  it('el error del resumen no oculta la lista; se reintenta por separado', async () => {
    api({ 'GET /reports/opportunities/summary': () => errorResponse(422, 'PERIOD_TOO_LONG', [{ field: 'to', maxYears: 5 }]) });
    renderPage();

    expect(await screen.findByText(/No se pudo cargar el resumen. El período no puede superar 5 años/)).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Reporte de oportunidades' })).toBeInTheDocument();
  });
});
