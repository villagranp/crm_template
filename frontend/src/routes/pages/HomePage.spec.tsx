import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  activityIndicators,
  ALL_SOURCE_PERMISSIONS,
  alertsPage,
  alertsSummary,
  dashboardAlert,
  dashboardRequests,
  forecastIndicators,
  opportunityIndicators,
  projectIndicators,
  recentActivityItem,
  recentActivityPage,
  setSessionPermissions,
  targetIndicators,
  upcomingVisit,
  upcomingVisitsPage,
  visitIndicators,
} from '@/features/dashboard/testing/dashboard-fixtures';
import type { MenuModule, Profile } from '@/services/access';
import { useAuthStore } from '@/stores/auth.store';
import { errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { HomePage } from './HomePage';

const PROFILE: Profile = {
  id: 'u-1',
  displayName: 'Javier Rosas',
  email: 'javier@example.test',
  roles: ['administrador'],
  permissions: ['usuarios.ver', 'roles.ver', 'auditoria.ver'],
  teams: [{ id: 't-1', name: 'Dirección comercial' }],
  dataScope: 'ORGANIZATION',
};

const MENU: MenuModule[] = [
  {
    key: 'inicio',
    label: 'Inicio',
    icon: 'dashboard',
    order: 10,
    isSystem: false,
    options: [
      {
        id: 'o-1',
        key: 'inicio',
        label: 'Panel de control',
        icon: 'dashboard',
        path: '/',
        order: 10,
        requiredPermission: null,
        children: [],
      },
    ],
  },
  {
    key: 'administracion',
    label: 'Administración',
    icon: 'settings',
    order: 90,
    isSystem: true,
    options: [
      {
        id: 'o-2',
        key: 'usuarios',
        label: 'Usuarios',
        icon: 'manage_accounts',
        path: '/administracion/usuarios',
        order: 10,
        requiredPermission: 'usuarios.ver',
        children: [],
      },
      {
        id: 'o-3',
        key: 'auditoria',
        label: 'Auditoría',
        icon: 'history',
        path: '/administracion/auditoria',
        order: 20,
        requiredPermission: 'auditoria.ver',
        children: [],
      },
    ],
  },
];

beforeEach(() => {
  useAuthStore.setState({
    status: 'authenticated',
    user: {
      id: 'u-1',
      displayName: 'Javier Rosas',
      email: 'javier@example.test',
      roles: ['administrador'],
      permissions: [],
    },
    passwordChangeRequired: false,
    errorMessage: null,
  });
});

afterEach(() => {
  useAuthStore.setState({
    status: 'anonymous',
    user: null,
    passwordChangeRequired: false,
    errorMessage: null,
  });
});

describe('HomePage', () => {
  it('saluda por nombre y muestra sólo datos reales del perfil', async () => {
    mockApi({
      'GET /me': () => jsonResponse(PROFILE),
      'GET /me/menu': () => jsonResponse(MENU),
      'GET /health': () => jsonResponse({ status: 'ok' }),
    });
    renderWithProviders(<HomePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /panel de control/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: /, Javier\.$/ }),
    ).toBeInTheDocument();

    const roles = await screen.findByRole('region', { name: 'Roles asignados' });
    expect(within(roles).getByText('1')).toBeInTheDocument();
    expect(within(roles).getByText('administrador')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Permisos efectivos' })).getByText('3'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Alcance de datos' })).getByText('Organización'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Equipos' })).getByText('Dirección comercial'),
    ).toBeInTheDocument();
  });

  it('los accesos rápidos salen del menú concedido, sin el propio panel', async () => {
    mockApi({
      'GET /me': () => jsonResponse(PROFILE),
      'GET /me/menu': () => jsonResponse(MENU),
      'GET /health': () => jsonResponse({ status: 'ok' }),
    });
    renderWithProviders(<HomePage />);

    const quickAccess = await screen.findByRole('region', { name: 'Accesos rápidos' });
    expect(await within(quickAccess).findByRole('link', { name: /usuarios/i })).toHaveAttribute(
      'href',
      '/administracion/usuarios',
    );
    expect(within(quickAccess).getByRole('link', { name: /auditoría/i })).toHaveAttribute(
      'href',
      '/administracion/auditoria',
    );
    expect(
      within(quickAccess).queryByRole('link', { name: /panel de control/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Tienes acceso a/)).toHaveTextContent(
      'Tienes acceso a 2 opciones en 1 módulo',
    );
  });

  it('avisa sin romper la página si el perfil no se puede cargar', async () => {
    mockApi({
      'GET /me': () => errorResponse(500, 'INTERNAL_ERROR'),
      'GET /me/menu': () => jsonResponse([]),
      'GET /health': () => jsonResponse({ status: 'ok' }),
    });
    renderWithProviders(<HomePage />);

    expect(await screen.findByText(/no se pudo cargar tu perfil/i)).toBeInTheDocument();
    expect(await screen.findByText(/todavía no tienes opciones asignadas/i)).toBeInTheDocument();
  });

  it('PF-01.2: "Mi acceso" conserva roles, permisos, alcance (COUNTRY → "País") y equipos', async () => {
    mockApi({
      ...BASE_ROUTES,
      'GET /me': () => jsonResponse({ ...PROFILE, dataScope: 'COUNTRY', teams: [] }),
    });
    renderWithProviders(<HomePage />);

    const mine = await screen.findByRole('region', { name: 'Mi acceso' });
    expect(await within(mine).findByRole('region', { name: 'Alcance de datos' })).toHaveTextContent(
      'País',
    );
    expect(within(mine).getByRole('region', { name: 'Roles asignados' })).toHaveTextContent(
      'administrador',
    );
    expect(within(mine).getByRole('region', { name: 'Permisos efectivos' })).toHaveTextContent('3');
    expect(within(mine).getByRole('region', { name: 'Equipos' })).toHaveTextContent(
      'No perteneces a ningún equipo',
    );
    expect(screen.getByText('Ámbito: País')).toBeInTheDocument();
  });

  it('PF-01.6: sin permisos comerciales, aviso y ninguna petición a /dashboard/*', async () => {
    const fetchMock = mockApi(BASE_ROUTES);
    renderWithProviders(<HomePage />);

    expect(
      await screen.findByText('Todavía no tienes indicadores comerciales asignados'),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Accesos rápidos' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Mi acceso' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Alertas y pendientes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Actividad reciente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Próximas visitas' })).not.toBeInTheDocument();
    expect(await screen.findByText(/Tienes acceso a/)).toHaveTextContent(
      'Tienes acceso a 2 opciones',
    );
    expect(dashboardRequests(fetchMock)).toEqual([]);
  });

  it('con todos los permisos compone indicadores, alertas, próximas visitas y actividad reciente', async () => {
    setSessionPermissions(ALL_SOURCE_PERMISSIONS);
    mockApi({ ...BASE_ROUTES, ...DASHBOARD_ROUTES });
    renderWithProviders(<HomePage />);

    expect(
      await within(screen.getByRole('region', { name: 'Proyectos activos' })).findByText('42'),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Metas y cumplimiento' })).toBeInTheDocument();
    expect(
      await within(screen.getByRole('region', { name: 'Alertas y pendientes' })).findByText(
        'Proyecto PRY-2026-00042 sin actualizaciones desde hace 31 días',
      ),
    ).toBeInTheDocument();
    expect(
      await within(screen.getByRole('region', { name: 'Próximas visitas' })).findByText(
        'Recordatorio',
      ),
    ).toBeInTheDocument();
    expect(
      await within(screen.getByRole('region', { name: 'Actividad reciente' })).findByText(
        'Contactado → Cotizando',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Todavía no tienes indicadores comerciales asignados'),
    ).not.toBeInTheDocument();
  });

  it('PF-01.4: sin proyectos.ver no hay tarjeta K1 ni petición a /dashboard/indicators/projects', async () => {
    setSessionPermissions(
      ALL_SOURCE_PERMISSIONS.filter((permission) => permission !== 'proyectos.ver'),
    );
    const fetchMock = mockApi({ ...BASE_ROUTES, ...DASHBOARD_ROUTES });
    renderWithProviders(<HomePage />);

    expect(
      await within(screen.getByRole('region', { name: 'Oportunidades abiertas' })).findByText('17'),
    ).toBeInTheDocument();
    await waitFor(() => expect(dashboardRequests(fetchMock).length).toBeGreaterThan(0));
    expect(screen.queryByRole('region', { name: 'Proyectos activos' })).not.toBeInTheDocument();
    expect(
      dashboardRequests(fetchMock).some((url) => url.startsWith('/dashboard/indicators/projects')),
    ).toBe(false);
  });

  it('PF-01.7: si /me/menu falla, los accesos muestran el error con reintento y los indicadores cargan', async () => {
    setSessionPermissions(['proyectos.ver']);
    let menuCalls = 0;
    mockApi({
      ...BASE_ROUTES,
      ...DASHBOARD_ROUTES,
      'GET /me/menu': () => {
        menuCalls += 1;
        return menuCalls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : jsonResponse(MENU);
      },
    });
    renderWithProviders(<HomePage />);

    const quickAccess = screen.getByRole('region', { name: 'Accesos rápidos' });
    expect(await within(quickAccess).findByText(/no se pudo cargar tu menú/i)).toBeInTheDocument();
    expect(
      await within(screen.getByRole('region', { name: 'Proyectos activos' })).findByText('42'),
    ).toBeInTheDocument();

    await userEvent.click(within(quickAccess).getByRole('button', { name: 'Reintentar' }));
    expect(await within(quickAccess).findByRole('link', { name: /usuarios/i })).toBeInTheDocument();
  });
});

const BASE_ROUTES: Record<string, RouteHandler> = {
  'GET /me': () => jsonResponse(PROFILE),
  'GET /me/menu': () => jsonResponse(MENU),
  'GET /health': () => jsonResponse({ status: 'ok' }),
};

const DASHBOARD_ROUTES: Record<string, RouteHandler> = {
  'GET /dashboard/indicators/projects': () => jsonResponse(projectIndicators()),
  'GET /dashboard/indicators/opportunities': () => jsonResponse(opportunityIndicators()),
  'GET /dashboard/indicators/forecast': () => jsonResponse(forecastIndicators()),
  'GET /dashboard/indicators/visits': () => jsonResponse(visitIndicators()),
  'GET /dashboard/indicators/activities': () => jsonResponse(activityIndicators()),
  'GET /dashboard/indicators/targets': () => jsonResponse(targetIndicators()),
  'GET /dashboard/upcoming-visits': () =>
    jsonResponse(upcomingVisitsPage([upcomingVisit({ reminderDue: true })])),
  'GET /dashboard/recent-activity': () => jsonResponse(recentActivityPage([recentActivityItem()])),
  'GET /dashboard/alerts': () => jsonResponse(alertsPage([dashboardAlert()])),
  'GET /dashboard/alerts/summary': () => jsonResponse(alertsSummary()),
};
