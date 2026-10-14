import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RequirePermission } from '@/components/layout/RequirePermission';
import { deferred, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { REPORT_PERMISSIONS } from '../reports.permissions';
import {
  ADVISOR_PERMISSIONS,
  callCount,
  FILTER_OPTIONS,
  FUNNEL,
  FUNNEL_EMPTY,
  FUNNEL_NO_HISTORY,
  lastQuery,
  signInWith,
  signOut,
  simulateWideScreen,
} from '../testing/report-fixtures';

import type { SalesFunnel } from './funnel.api';
import { SalesFunnelPage } from './SalesFunnelPage';

vi.mock('../charts/ReportBarChart', async () => (await import('../testing/chart-doubles')).barChartModule);

const PANEL = 'Oportunidades por etapa del embudo';

function Destination() {
  const location = useLocation();
  return <p data-testid="destination">{`${location.pathname}${location.search}`}</p>;
}

function renderPage(initialEntry = '/reportes/embudo') {
  return renderWithProviders(
    <Routes>
      <Route
        path="/reportes/embudo"
        element={
          <RequirePermission permission={REPORT_PERMISSIONS.view}>
            <SalesFunnelPage />
          </RequirePermission>
        }
      />
      <Route path="/reportes/*" element={<Destination />} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
}

function api(funnel: SalesFunnel = FUNNEL, extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /reports/filter-options': () => jsonResponse(FILTER_OPTIONS),
    'GET /reports/funnel': () => jsonResponse(funnel),
    ...extra,
  });
}

async function showTable(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  const panel = await screen.findByRole('region', { name: PANEL });
  await user.click(await within(panel).findByRole('button', { name: 'Ver como tabla' }));
  return within(panel).getByRole('table', { name: 'Embudo comercial' });
}

function rowsOf(table: HTMLElement): (string | null)[] {
  return within(table)
    .getAllByRole('row')
    .map((row) => row.textContent);
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(ADVISOR_PERMISSIONS);
});

afterEach(signOut);

describe('SalesFunnelPage (05 F-41)', () => {
  it('AC-05.35/AC-05.47: etapas del embudo en orden con su cantidad, en barras HORIZONTALES con cantidad y %', async () => {
    api();
    renderPage();

    const panel = await screen.findByRole('region', { name: PANEL });
    const chart = await within(panel).findByTestId('bar-chart');
    expect(chart).toHaveAttribute('data-layout', 'horizontal');
    expect(within(chart).getAllByRole('button').map((item) => item.textContent)).toEqual(['Contactado = 3 [3 · 42.86 %]', 'Cotizando = 4 [4 · 57.14 %]']);
    expect(screen.getByTestId('funnel-total')).toHaveTextContent('Oportunidades en el embudo: 7');
  });

  it('PF-05.38: "Ver como tabla" con los mismos valores (Etapa, Cantidad, % del embudo, Conversión acumulada)', async () => {
    const user = userEvent.setup();
    api();
    renderPage();

    const table = await showTable(user);
    expect(rowsOf(table)).toEqual(['EtapaCantidad% del embudoConversión acumulada', 'Contactado342.86 %100 %', 'Cotizando457.14 %57.14 %']);
  });

  it('AC-05.36: conjunto vacío → porcentajes "—" con motivo "Sin datos", nunca 0 %', async () => {
    const user = userEvent.setup();
    api(FUNNEL_EMPTY);
    renderPage();

    const chart = await within(await screen.findByRole('region', { name: PANEL })).findByTestId('bar-chart');
    expect(within(chart).getAllByRole('button').map((item) => item.textContent)).toEqual(['Contactado = 0 [0]', 'Cotizando = 0 [0]']);
    const table = await showTable(user);
    expect(rowsOf(table)).toEqual(['EtapaCantidad% del embudoConversión acumulada', 'Contactado0—Sin datos—Sin datos', 'Cotizando0—Sin datos—Sin datos']);
    expect(within(table).queryByText(/0 %/)).not.toBeInTheDocument();
    expect(within(table).getAllByLabelText('— (Sin datos)')).toHaveLength(4);
  });

  it('AC-05.37: sin historial, la conversión es "—" con "Historial insuficiente" y la participación sí se calcula', async () => {
    const user = userEvent.setup();
    api(FUNNEL_NO_HISTORY);
    renderPage();

    expect(await screen.findByText('La conversión acumulada no se puede calcular: historial insuficiente. La participación de cada etapa sí se muestra.')).toBeInTheDocument();
    const table = await showTable(user);
    expect(rowsOf(table)).toEqual([
      'EtapaCantidad% del embudoConversión acumulada',
      'Contactado342.86 %—Historial insuficiente',
      'Cotizando457.14 %—Historial insuficiente',
    ]);
  });

  it('muestra insuficiente: el motivo indica el mínimo de la muestra (D-05.9)', async () => {
    const user = userEvent.setup();
    api({
      ...FUNNEL,
      stages: FUNNEL.stages.map((stage) => ({ ...stage, cumulativeConversion: null, unavailableReason: 'INSUFFICIENT_SAMPLE' as const })),
    });
    renderPage();

    const table = await showTable(user);
    expect(within(table).getAllByText('Muestra insuficiente (menos de 5 oportunidades)')).toHaveLength(2);
  });

  it('AC-05.38/AC-05.39: etapa y tipo de cliente de la URL se envían; los porcentajes son del embudo completo', async () => {
    const fetchMock = api({ ...FUNNEL, stages: [FUNNEL.stages[1] as SalesFunnel['stages'][number]] });
    renderPage('/reportes/embudo?stageId=st-quote&companyTypeId=ct-const&ownerId=u-1');

    const chart = await within(await screen.findByRole('region', { name: PANEL })).findByTestId('bar-chart');
    expect(within(chart).getAllByRole('button').map((item) => item.textContent)).toEqual(['Cotizando = 4 [4 · 57.14 %]']);
    expect(Object.fromEntries(lastQuery(fetchMock, '/reports/funnel'))).toEqual({ stageId: 'st-quote', companyTypeId: 'ct-const', ownerId: 'u-1' });
    const chips = screen.getByLabelText('Filtros activos');
    expect(within(chips).getByText('Etapa: Cotizando')).toBeInTheDocument();
    expect(within(chips).getByText('Tipo de cliente: Constructora')).toBeInTheDocument();
    expect(screen.getByText('Los porcentajes se calculan sobre el embudo completo con el resto de filtros.')).toBeInTheDocument();
  });

  it('el filtro de etapa sólo ofrece etapas del embudo', async () => {
    const user = userEvent.setup();
    api();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros del embudo comercial' });
    await user.click(within(form).getByRole('combobox', { name: 'Etapa' }));
    const options = (await screen.findAllByRole('option')).map((option) => option.textContent);
    expect(options).toEqual(['Todos', 'Contactado', 'Cotizando']);
  });

  it('clic en una etapa → reporte de oportunidades filtrado por esa etapa y los mismos filtros', async () => {
    const user = userEvent.setup();
    api();
    renderPage('/reportes/embudo?ownerId=u-1&countryId=gt&from=2026-01-01&to=2026-06-30');

    const chart = await within(await screen.findByRole('region', { name: PANEL })).findByTestId('bar-chart');
    await user.click(within(chart).getByRole('button', { name: /^Contactado/ }));

    expect(await screen.findByTestId('destination')).toHaveTextContent(
      '/reportes/oportunidades?stageId=st-contact&ownerId=u-1&countryId=gt&from=2026-01-01&to=2026-06-30&dateBasis=IDENTIFIED',
    );
  });

  it('la tabla ofrece el mismo destino como enlace (teclado)', async () => {
    const user = userEvent.setup();
    api();
    renderPage('/reportes/embudo?countryId=gt');

    const table = await showTable(user);
    expect(within(table).getByRole('link', { name: 'Ver las oportunidades en Cotizando' })).toHaveAttribute('href', '/reportes/oportunidades?stageId=st-quote&countryId=gt');
  });

  describe('estados (PF-05.36)', () => {
    it('cargando y error con referencia y "Reintentar"', async () => {
      const user = userEvent.setup();
      const reply = deferred<Response>();
      let calls = 0;
      const fetchMock = api(FUNNEL, {
        'GET /reports/funnel': () => {
          calls += 1;
          return calls === 1 ? reply.promise : jsonResponse(FUNNEL);
        },
      });
      renderPage();

      expect(await screen.findByRole('status', { name: `Cargando ${PANEL}` })).toBeInTheDocument();
      reply.resolve(errorResponse(422, 'INVALID_CATALOG_SEMANTICS'));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('La configuración de los catálogos comerciales está incompleta');
      expect(alert).toHaveTextContent('Referencia: corr-test');
      await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(callCount(fetchMock, '/reports/funnel')).toBe(2));
      expect(await within(screen.getByRole('region', { name: PANEL })).findByTestId('bar-chart')).toBeInTheDocument();
    });

    it('sin etapas del embudo: mensaje de vacío', async () => {
      api({ stages: [], totalInFunnel: 0, sampleMinimum: 5 });
      renderPage();

      expect(await screen.findByText('No hay etapas del embudo para los filtros seleccionados.')).toBeInTheDocument();
    });

    it('sin reportes.ver la ruta muestra "Sin acceso" y no llama a la API', () => {
      signInWith(['clientes.ver']);
      const fetchMock = api();
      renderPage();

      expect(screen.getByRole('heading', { name: /Sin acceso/i })).toBeInTheDocument();
      expect(callCount(fetchMock, '/reports/funnel')).toBe(0);
    });
  });
});
