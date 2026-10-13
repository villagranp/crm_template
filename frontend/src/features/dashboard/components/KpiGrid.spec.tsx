import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { resolveDashboardAccess } from '../dashboard.permissions';
import {
  activityIndicators,
  ALL_SOURCE_PERMISSIONS,
  dashboardRequests,
  emptyTargets,
  forecastIndicators,
  opportunityIndicators,
  projectIndicators,
  resetSession,
  setSessionPermissions,
  targetIndicators,
  visitIndicators,
} from '../testing/dashboard-fixtures';
import { KpiGrid } from './KpiGrid';

/** Sesión con esos permisos y el acceso por bloque que `HomePage` calcularía con ellos. */
function accessFor(permissions: string[]) {
  setSessionPermissions(permissions);
  const granted = new Set(permissions);
  return resolveDashboardAccess((permission) => granted.has(permission));
}

afterEach(resetSession);

function indicatorRoutes(
  overrides: Record<string, RouteHandler> = {},
): Record<string, RouteHandler> {
  return {
    'GET /dashboard/indicators/projects': () => jsonResponse(projectIndicators()),
    'GET /dashboard/indicators/opportunities': () => jsonResponse(opportunityIndicators()),
    'GET /dashboard/indicators/forecast': () => jsonResponse(forecastIndicators()),
    'GET /dashboard/indicators/visits': () => jsonResponse(visitIndicators()),
    'GET /dashboard/indicators/activities': () => jsonResponse(activityIndicators()),
    'GET /dashboard/indicators/targets': () => jsonResponse(targetIndicators()),
    ...overrides,
  };
}

describe('KpiGrid', () => {
  it('con todos los permisos pinta K1–K9 con cifras reales, pies y enlaces de E.3', async () => {
    mockApi(indicatorRoutes());
    renderWithProviders(<KpiGrid access={accessFor(ALL_SOURCE_PERMISSIONS)} />);

    const projects = screen.getByRole('region', { name: 'Proyectos activos' });
    expect(await within(projects).findByText('42')).toBeInTheDocument();
    expect(within(projects).getByRole('link', { name: /ver proyectos activos/i })).toHaveAttribute(
      'href',
      '/proyectos?active=true',
    );

    const open = screen.getByRole('region', { name: 'Oportunidades abiertas' });
    expect(await within(open).findByText('17')).toBeInTheDocument();
    expect(
      within(open).getByText('Cotizando 11 · Contactado 4 · Negociando 2'),
    ).toBeInTheDocument();

    const won = screen.getByRole('region', { name: 'Oportunidades ganadas' });
    expect(within(won).getByText('5')).toBeInTheDocument();
    expect(within(won).getByText('1 parcial · 1 oct – 31 oct 2026')).toBeInTheDocument();
    expect(within(won).getByRole('link')).toHaveAttribute(
      'href',
      '/proyectos/oportunidades?outcome=WON,PARTIAL&decisionFrom=2026-10-01&decisionTo=2026-10-31',
    );

    const forecast = screen.getByRole('region', { name: 'Forecast próximos seis meses' });
    expect(await within(forecast).findByText('1,250.50 t')).toBeInTheDocument();
    expect(within(forecast).getByText(/3 líneas sin conversión/)).toBeInTheDocument();
    expect(within(forecast).getByText(/1,200 var/)).toBeInTheDocument();
    expect(within(forecast).getByRole('table')).toHaveTextContent('nov 2026');

    const visits = screen.getByRole('region', { name: 'Visitas pendientes' });
    expect(await within(visits).findByText('9')).toBeInTheDocument();
    expect(within(visits).getByText('4 próximas en 7 días · 2 atrasadas')).toBeInTheDocument();
    // `/actividad/visitas` aún no existe: sin enlace y con la nota (RN-01.19).
    expect(within(visits).queryByRole('link')).not.toBeInTheDocument();
    expect(
      within(visits).getByText('Listado disponible cuando se habilite el módulo'),
    ).toBeInTheDocument();

    const pending = screen.getByRole('region', { name: 'Actividades pendientes' });
    expect(await within(pending).findByText('14')).toBeInTheDocument();
    expect(within(pending).getByText('3 por vencer en 48 h')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Actividades vencidas' })).getByText('5'),
    ).toBeInTheDocument();

    const targets = screen.getByRole('region', { name: 'Metas y cumplimiento' });
    expect(await within(targets).findByText('64.00 %')).toBeInTheDocument();
  });

  it('PF-01.4: sin proyectos.ver no pinta K1 ni pide /dashboard/indicators/projects', async () => {
    const fetchMock = mockApi(indicatorRoutes());
    renderWithProviders(<KpiGrid access={accessFor(['oportunidades.ver', 'actividades.ver'])} />);

    expect(
      await screen.findByRole('region', { name: 'Oportunidades abiertas' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(dashboardRequests(fetchMock)).toHaveLength(2));
    expect(screen.queryByRole('region', { name: 'Proyectos activos' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Forecast próximos seis meses' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Metas y cumplimiento' })).not.toBeInTheDocument();
    expect(
      dashboardRequests(fetchMock).some((url) => url.startsWith('/dashboard/indicators/projects')),
    ).toBe(false);
  });

  it('PF-01.25: K5 con 500 muestra error con reintento y referencia; las demás tarjetas siguen', async () => {
    let forecastCalls = 0;
    const fetchMock = mockApi(
      indicatorRoutes({
        'GET /dashboard/indicators/forecast': () => {
          forecastCalls += 1;
          return forecastCalls === 1
            ? errorResponse(500, 'INTERNAL_ERROR')
            : jsonResponse(
                forecastIndicators({
                  totalTonnage: null,
                  months: [],
                  unconvertedLines: 0,
                  quantitiesByUnit: [],
                }),
              );
        },
      }),
    );
    renderWithProviders(<KpiGrid access={accessFor(['proyectos.ver', 'forecast.ver'])} />);

    const forecast = screen.getByRole('region', { name: 'Forecast próximos seis meses' });
    expect(await within(forecast).findByText(/error en el servidor/i)).toBeInTheDocument();
    expect(within(forecast).getByText('Referencia: corr-test')).toBeInTheDocument();
    expect(
      await within(screen.getByRole('region', { name: 'Proyectos activos' })).findByText('42'),
    ).toBeInTheDocument();

    await userEvent.click(within(forecast).getByRole('button', { name: 'Reintentar' }));

    // Sin líneas en la ventana: "Sin proyección", nunca "0 t" (RN-01.11).
    expect(await within(forecast).findByText('Sin proyección')).toBeInTheDocument();
    expect(within(forecast).queryByText(/0\.00 t/)).not.toBeInTheDocument();
    expect(
      dashboardRequests(fetchMock).filter((url) => url === '/dashboard/indicators/forecast'),
    ).toHaveLength(2);
  });

  it('el período sale de la URL y el selector lo cambia (sólo K3, K4 y K9)', async () => {
    const fetchMock = mockApi(
      indicatorRoutes({ 'GET /dashboard/indicators/targets': () => jsonResponse(emptyTargets()) }),
    );
    renderWithProviders(<KpiGrid access={accessFor(['oportunidades.ver', 'metas.ver'])} />, {
      initialEntries: ['/?period=YEAR'],
    });

    const group = screen.getByRole('group', { name: 'Período' });
    expect(within(group).getByRole('button', { name: 'Año en curso' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() =>
      expect(dashboardRequests(fetchMock)).toEqual(
        expect.arrayContaining([
          '/dashboard/indicators/opportunities?period=YEAR',
          '/dashboard/indicators/targets?period=YEAR',
        ]),
      ),
    );

    await userEvent.click(within(group).getByRole('button', { name: 'Trimestre en curso' }));
    await waitFor(() =>
      expect(dashboardRequests(fetchMock)).toEqual(
        expect.arrayContaining([
          '/dashboard/indicators/opportunities?period=QUARTER',
          '/dashboard/indicators/targets?period=QUARTER',
        ]),
      ),
    );
  });

  it('RN-01.7: sin ningún permiso de fuente, aviso y cero peticiones', async () => {
    const fetchMock = mockApi(indicatorRoutes());
    renderWithProviders(<KpiGrid access={accessFor(['usuarios.ver', 'clientes.ver'])} />);

    expect(
      screen.getByText('Todavía no tienes indicadores comerciales asignados'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Período' })).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dashboardRequests(fetchMock)).toEqual([]);
  });
});
