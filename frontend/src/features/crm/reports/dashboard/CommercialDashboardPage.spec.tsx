import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RequirePermission } from '@/components/layout/RequirePermission';
import { deferred, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';
import { chartColors } from '@/theme';

import { REPORT_PERMISSIONS } from '../reports.permissions';
import {
  ADVISOR_PERMISSIONS,
  callCount,
  DASHBOARD,
  FILTER_OPTIONS,
  lastQuery,
  signInWith,
  signOut,
  simulateWideScreen,
  TRENDS,
} from '../testing/report-fixtures';

import { CommercialDashboardPage } from './CommercialDashboardPage';

vi.mock('../charts/ReportBarChart', async () => (await import('../testing/chart-doubles')).barChartModule);
vi.mock('../charts/ReportLineChart', async () => (await import('../testing/chart-doubles')).lineChartModule);
vi.mock('../charts/ReportComboChart', async () => (await import('../testing/chart-doubles')).comboChartModule);

const PANELS = [
  'Proyectos activos',
  'Oportunidades por etapa',
  'Ganadas vs. perdidas',
  'Forecast por mes',
  'Distribución por asesor',
  'Actividades y visitas',
  'Tendencias',
];

function Destination() {
  const location = useLocation();
  return <p data-testid="destination">{`${location.pathname}${location.search}`}</p>;
}

function renderPage(initialEntry = '/reportes/dashboard') {
  return renderWithProviders(
    <Routes>
      <Route
        path="/reportes/dashboard"
        element={
          <RequirePermission permission={REPORT_PERMISSIONS.view}>
            <CommercialDashboardPage />
          </RequirePermission>
        }
      />
      <Route path="/reportes/*" element={<Destination />} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
}

function api(extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /reports/filter-options': () => jsonResponse(FILTER_OPTIONS),
    'GET /reports/dashboard': () => jsonResponse(DASHBOARD),
    'GET /reports/dashboard/trends': () => jsonResponse(TRENDS),
    ...extra,
  });
}

function panel(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(ADVISOR_PERMISSIONS);
});

afterEach(signOut);

describe('CommercialDashboardPage (05 F-40)', () => {
  it('AC-05.30: siete paneles con filtros de período, país y asesor; sin alertas ni accesos rápidos del Inicio', async () => {
    const fetchMock = api();
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard comercial' })).toBeInTheDocument();
    for (const name of PANELS) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    // RN-05.51: nada operativo del Inicio (alertas, accesos rápidos, pendientes, actividad reciente).
    expect(screen.queryByRole('region', { name: /alertas|accesos rápidos|pendientes|actividad reciente/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /alertas|accesos rápidos|pendientes|actividad reciente/i })).not.toBeInTheDocument();

    // Sin período en la URL no se envía ninguno: el chip muestra el que aplicó el servidor.
    await waitFor(() => expect(callCount(fetchMock, '/reports/dashboard')).toBeGreaterThan(0));
    expect(lastQuery(fetchMock, '/reports/dashboard').toString()).toBe('');
    expect(lastQuery(fetchMock, '/reports/dashboard/trends').toString()).toBe('');
    const chips = await screen.findByLabelText('Filtros activos');
    expect(within(chips).getByText('Período: 1 sep 2026 – 31 oct 2026 (por defecto)')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros del dashboard comercial' });
    expect(within(form).getByLabelText('Desde')).toBeInTheDocument();
    expect(within(form).getByRole('combobox', { name: 'País' })).toBeInTheDocument();
    expect(within(form).getByRole('combobox', { name: 'Asesor' })).toBeInTheDocument();
  });

  it('AC-05.31: el asesor y el país de la URL se envían a los paneles y a las tendencias', async () => {
    const fetchMock = api();
    renderPage('/reportes/dashboard?ownerId=u-1&countryId=gt&from=2026-01-01&to=2026-06-30');

    await waitFor(() => expect(callCount(fetchMock, '/reports/dashboard/trends')).toBeGreaterThan(0));
    const expected = { ownerId: 'u-1', countryId: 'gt', from: '2026-01-01', to: '2026-06-30' };
    expect(Object.fromEntries(lastQuery(fetchMock, '/reports/dashboard'))).toEqual(expected);
    expect(Object.fromEntries(lastQuery(fetchMock, '/reports/dashboard/trends'))).toEqual(expected);
    const chips = await screen.findByLabelText('Filtros activos');
    expect(within(chips).getByText('Asesor: Ana Asesora')).toBeInTheDocument();
    expect(within(chips).getByText('País: Guatemala')).toBeInTheDocument();
  });

  it('valida el máximo de 24 meses de calendario antes de consultar (P-05.14)', async () => {
    const user = userEvent.setup();
    const fetchMock = api();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros del dashboard comercial' });
    fireEvent.change(within(form).getByLabelText('Desde'), { target: { value: '2024-01-31' } });
    fireEvent.change(within(form).getByLabelText('Hasta'), { target: { value: '2026-01-01' } });
    await user.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));

    expect(await within(form).findByText('El período no puede abarcar más de 24 meses.')).toBeInTheDocument();
    expect(lastQuery(fetchMock, '/reports/dashboard').has('from')).toBe(false);
  });

  it('AC-05.32: si fallan las tendencias, sólo ese panel muestra el error y "Reintentar"', async () => {
    const user = userEvent.setup();
    const fetchMock = api({ 'GET /reports/dashboard/trends': () => errorResponse(503, 'REPORT_TIMEOUT') });
    renderPage();

    const alert = await within(panel('Tendencias')).findByRole('alert');
    expect(alert).toHaveTextContent('La consulta tardó demasiado. Acota los filtros');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    for (const name of PANELS.filter((item) => item !== 'Tendencias')) {
      expect(within(panel(name)).queryByRole('alert')).not.toBeInTheDocument();
    }
    expect(within(panel('Oportunidades por etapa')).getByTestId('bar-chart')).toBeInTheDocument();

    const before = callCount(fetchMock, '/reports/dashboard/trends');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(callCount(fetchMock, '/reports/dashboard/trends')).toBe(before + 1));
    expect(callCount(fetchMock, '/reports/dashboard')).toBe(1);
  });

  it('PF-05.36: cargando por panel y error de permiso con referencia', async () => {
    const reply = deferred<Response>();
    api({ 'GET /reports/dashboard': () => reply.promise, 'GET /reports/dashboard/trends': () => errorResponse(403, 'PERMISSION_DENIED') });
    renderPage();

    expect(await screen.findByRole('status', { name: 'Cargando Proyectos activos' })).toBeInTheDocument();
    expect(await within(panel('Tendencias')).findByRole('alert')).toHaveTextContent('No tienes permiso para consultar o exportar este reporte.');
    reply.resolve(jsonResponse(DASHBOARD));
    expect(await within(panel('Proyectos activos')).findByTestId('active-projects-count')).toHaveTextContent('7');
  });

  it('sin reportes.ver la ruta muestra "Sin acceso" y no llama a la API', () => {
    signInWith(['clientes.ver']);
    const fetchMock = api();
    renderPage();

    expect(screen.getByRole('heading', { name: /Sin acceso/i })).toBeInTheDocument();
    expect(callCount(fetchMock, '/reports/dashboard')).toBe(0);
  });

  it('AC-05.33/PF-05.38: cada gráfica tiene "Ver como tabla" con los mismos valores y leyenda con texto', async () => {
    const user = userEvent.setup();
    api();
    renderPage();

    const wonLost = panel('Ganadas vs. perdidas');
    const chart = await within(wonLost).findByTestId('bar-chart');
    expect(chart).toHaveAttribute('data-layout', 'vertical');
    expect(within(chart).getAllByRole('button').map((item) => item.textContent)).toEqual(['sep 2026 = 2 / 1 / 1', 'oct 2026 = 0 / 0 / 2']);
    const legend = within(wonLost).getByRole('list', { name: 'Leyenda' });
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Ganadas (completas)', 'Ganadas parciales', 'Perdidas']);
    // Perdidas es un estado negativo: rojo semántico del tema; las demás, azules de identidad.
    expect(within(chart).getByTestId('chart-series')).toHaveTextContent(
      `wonFull:Ganadas (completas):${chartColors.light.series[0]}|partial:Ganadas parciales:${chartColors.light.series[1]}|lost:Perdidas:${chartColors.light.negative}`,
    );

    await user.click(within(wonLost).getByRole('button', { name: 'Ver como tabla' }));
    const table = within(wonLost).getByRole('table', { name: 'Ganadas y perdidas por mes' });
    expect(within(table).getAllByRole('row').map((row) => row.textContent)).toEqual(['MesGanadasDe ellas parcialesPerdidas', 'sep 2026311', 'oct 2026002']);

    for (const name of PANELS) {
      const region = panel(name);
      expect(within(region).getByRole('button', { name: /Ver como (tabla|gráfica)/ })).toBeInTheDocument();
    }

    const trends = panel('Tendencias');
    expect(within(trends).getAllByTestId('line-chart')).toHaveLength(5);
    await user.click(within(trends).getByRole('button', { name: 'Ver como tabla' }));
    expect(within(within(trends).getByRole('table', { name: 'Tendencias por mes' })).getAllByRole('row').map((row) => row.textContent)).toEqual([
      'MesOportunidades identificadasOportunidades ganadasOportunidades perdidasActividades realizadasVisitas realizadas',
      'sep 202653163',
      'oct 202620220',
    ]);
  });

  it('AC-05.34: proyectos activos muestra la cifra actual e indica que no tiene tendencia', async () => {
    api();
    renderPage();

    const region = panel('Proyectos activos');
    expect(await within(region).findByTestId('active-projects-count')).toHaveTextContent('7');
    expect(within(region).getByText(/El período no aplica y este indicador no tiene tendencia/)).toBeInTheDocument();
    expect(within(panel('Tendencias')).getByText('Series mensuales de los indicadores con fecha histórica. Proyectos activos no tiene tendencia.')).toBeInTheDocument();
  });

  it('forecast: barras + acumulado en un solo eje y aviso de líneas sin conversión', async () => {
    const user = userEvent.setup();
    api();
    renderPage();

    const region = panel('Forecast por mes');
    const chart = await within(region).findByTestId('combo-chart');
    expect(within(chart).getAllByRole('button').map((item) => item.textContent)).toEqual(['sep 2026 = 10 / 10', 'oct 2026 = 12.5 / 22.5']);
    expect(within(region).getByTestId('forecast-without-conversion')).toHaveTextContent('1 línea sin conversión a toneladas no suma en el gráfico.');
    await user.click(within(region).getByRole('button', { name: 'Ver como tabla' }));
    expect(within(within(region).getByRole('table', { name: 'Forecast por mes' })).getAllByRole('row').map((row) => row.textContent)).toEqual([
      'MesToneladasAcumuladoLíneas sin conversión',
      'sep 202610.00 t10.00 t0',
      'oct 202612.50 t22.50 t1',
    ]);
  });

  it('asesores: "Otros" agrupa el resto; abiertas/ganadas y toneladas en gráficas separadas (otra unidad)', async () => {
    const user = userEvent.setup();
    api();
    renderPage();

    const region = panel('Distribución por asesor');
    const [counts, tonnage] = await within(region).findAllByTestId('bar-chart');
    expect(within(counts as HTMLElement).getAllByRole('button').map((item) => item.textContent)).toEqual(['Ana Asesora = 4 / 2', 'Otros = 1 / 1']);
    expect(within(tonnage as HTMLElement).getAllByRole('button').map((item) => item.textContent)).toEqual(['Ana Asesora = 15', 'Otros = 7.5']);
    await user.click(within(region).getByRole('button', { name: 'Ver como tabla' }));
    const table = within(region).getByRole('table', { name: 'Distribución por asesor' });
    expect(within(table).getAllByRole('row').map((row) => row.textContent)).toEqual([
      'AsesorAbiertasGanadasToneladas de forecast',
      'Ana Asesora4215.00 t',
      'Otros117.50 t',
    ]);
    expect(within(table).getByRole('link', { name: 'Ver las oportunidades de Ana Asesora' })).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: /Otros/ })).not.toBeInTheDocument();
  });

  it('clic en una barra de etapa → reporte de oportunidades con la etapa, los filtros y el período (IDENTIFIED)', async () => {
    const user = userEvent.setup();
    api();
    renderPage('/reportes/dashboard?ownerId=u-1');

    const chart = await within(panel('Oportunidades por etapa')).findByTestId('bar-chart');
    await user.click(within(chart).getByRole('button', { name: 'Cotizando = 4' }));

    expect(await screen.findByTestId('destination')).toHaveTextContent(
      '/reportes/oportunidades?stageId=st-quote&ownerId=u-1&from=2026-09-01&to=2026-10-31&dateBasis=IDENTIFIED',
    );
  });

  it('la tabla ofrece el mismo destino por teclado: fase → proyectos activos; mes → forecast del mes', async () => {
    const user = userEvent.setup();
    api();
    renderPage('/reportes/dashboard?countryId=gt');

    const projects = panel('Proyectos activos');
    await user.click(await within(projects).findByRole('button', { name: 'Ver como tabla' }));
    expect(within(projects).getByRole('link', { name: 'Ver los proyectos activos en Diseño' })).toHaveAttribute(
      'href',
      '/reportes/proyectos?phaseId=ph-design&situation=ACTIVE&countryId=gt',
    );

    const forecast = panel('Forecast por mes');
    await user.click(within(forecast).getByRole('button', { name: 'Ver como tabla' }));
    expect(within(forecast).getByRole('link', { name: 'Ver el forecast de oct 2026' })).toHaveAttribute(
      'href',
      '/reportes/forecast?fromMonth=2026-10&toMonth=2026-10&countryId=gt',
    );
  });
});
