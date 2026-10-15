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
import { uiSettings } from '@/features/dashboard/testing/ui-settings-fixtures';
import type { MenuModule, Profile } from '@/services/access';
import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
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
    expect(screen.queryByText(/Tienes acceso a/)).not.toBeInTheDocument();
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
    expect(screen.queryByText(/Tienes acceso a/)).not.toBeInTheDocument();
    expect(dashboardRequests(fetchMock)).toEqual([]);
  });

  it('con todos los permisos compone indicadores, alertas, próximas visitas y actividad reciente', async () => {
    setSessionPermissions(ALL_SOURCE_PERMISSIONS);
    mockApi({ ...BASE_ROUTES, ...DASHBOARD_ROUTES });
    renderWithProviders(<HomePage />);

    expect(
      await within(await screen.findByRole('region', { name: 'Proyectos activos' })).findByText('42'),
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
      await within(await screen.findByRole('region', { name: 'Oportunidades abiertas' })).findByText('17'),
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

    const quickAccess = await screen.findByRole('region', { name: 'Accesos rápidos' });
    expect(await within(quickAccess).findByText(/no se pudo cargar tu menú/i)).toBeInTheDocument();
    expect(
      await within(await screen.findByRole('region', { name: 'Proyectos activos' })).findByText('42'),
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

/** `true` si `first` aparece antes que `second` en el documento. */
function isBefore(first: HTMLElement, second: HTMLElement): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('HomePage: composición configurable (Ajustes 1, PF-AJ1.3)', () => {
  const settingsRoute = (settings: ReturnType<typeof uiSettings>): Record<string, RouteHandler> => ({
    'GET /me/ui-settings': () => jsonResponse(settings),
  });

  it('AC-AJ1.6: respeta el orden configurado y no pinta ni pide un bloque oculto', async () => {
    setSessionPermissions(ALL_SOURCE_PERMISSIONS);
    const fetchMock = mockApi({
      ...BASE_ROUTES,
      ...DASHBOARD_ROUTES,
      ...settingsRoute(
        uiSettings({
          blocks: ['access', 'mine', 'kpis', 'hero', 'alerts', 'activity', 'safety-minute'],
          hiddenBlocks: ['alerts', 'hero'],
          isCustomized: true,
        }),
      ),
    });
    renderWithProviders(<HomePage />);

    const quickAccess = await screen.findByRole('region', { name: 'Accesos rápidos' });
    const indicators = await screen.findByRole('region', { name: 'Indicadores' });
    const mine = screen.getByRole('region', { name: 'Mi acceso' });
    expect(isBefore(quickAccess, mine)).toBe(true);
    expect(isBefore(mine, indicators)).toBe(true);

    expect(screen.queryByRole('region', { name: 'Alertas y pendientes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: /, Javier\.$/ })).not.toBeInTheDocument();
    expect(dashboardRequests(fetchMock).some((url) => url.startsWith('/dashboard/alerts'))).toBe(false);
  });

  it('un bloque con permiso pero oculto por la composición por defecto tampoco se pide', async () => {
    setSessionPermissions(ALL_SOURCE_PERMISSIONS);
    const fetchMock = mockApi({
      ...BASE_ROUTES,
      ...DASHBOARD_ROUTES,
      ...settingsRoute(uiSettings({ hiddenBlocks: ['activity'] })),
    });
    renderWithProviders(<HomePage />);

    expect(await screen.findByRole('region', { name: 'Alertas y pendientes' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Actividad reciente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Próximas visitas' })).not.toBeInTheDocument();
    expect(
      dashboardRequests(fetchMock).some(
        (url) => url.startsWith('/dashboard/recent-activity') || url.startsWith('/dashboard/upcoming-visits'),
      ),
    ).toBe(false);
  });

  it('AC-AJ1.3: indicadores en el orden configurado; un visible sin permiso no se pinta ni se pide', async () => {
    setSessionPermissions(ALL_SOURCE_PERMISSIONS.filter((permission) => permission !== 'forecast.ver'));
    const fetchMock = mockApi({
      ...BASE_ROUTES,
      ...DASHBOARD_ROUTES,
      ...settingsRoute(
        uiSettings({
          kpis: ['visits-pending', 'forecast', 'projects-active', 'opportunities-open', 'opportunities-lost'],
          hiddenKpis: ['opportunities-lost'],
        }),
      ),
    });
    renderWithProviders(<HomePage />);

    const visits = await screen.findByRole('region', { name: 'Visitas pendientes' });
    const projects = await screen.findByRole('region', { name: 'Proyectos activos' });
    expect(isBefore(visits, projects)).toBe(true);
    expect(screen.queryByRole('region', { name: 'Oportunidades perdidas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Forecast/ })).not.toBeInTheDocument();
    expect(
      dashboardRequests(fetchMock).some((url) => url.startsWith('/dashboard/indicators/forecast')),
    ).toBe(false);
  });

  it('un indicador oculto no se pide (K7 y K8 ocultos: sin /indicators/activities)', async () => {
    setSessionPermissions(ALL_SOURCE_PERMISSIONS);
    const fetchMock = mockApi({
      ...BASE_ROUTES,
      ...DASHBOARD_ROUTES,
      ...settingsRoute(uiSettings({ hiddenKpis: ['activities-pending', 'activities-overdue'] })),
    });
    renderWithProviders(<HomePage />);

    await within(await screen.findByRole('region', { name: 'Proyectos activos' })).findByText('42');
    await waitFor(() => expect(dashboardRequests(fetchMock).length).toBeGreaterThan(0));
    expect(screen.queryByRole('region', { name: 'Actividades pendientes' })).not.toBeInTheDocument();
    expect(
      dashboardRequests(fetchMock).some((url) => url.startsWith('/dashboard/indicators/activities')),
    ).toBe(false);
  });

  it('con todos los indicadores ocultos el bloque Indicadores no se pinta', async () => {
    setSessionPermissions(ALL_SOURCE_PERMISSIONS);
    mockApi({
      ...BASE_ROUTES,
      ...DASHBOARD_ROUTES,
      ...settingsRoute(
        uiSettings({
          hiddenKpis: [
            'projects-active',
            'opportunities-open',
            'opportunities-won',
            'opportunities-lost',
            'forecast',
            'visits-pending',
            'activities-pending',
            'activities-overdue',
            'targets',
          ],
        }),
      ),
    });
    renderWithProviders(<HomePage />);

    await screen.findByRole('region', { name: 'Accesos rápidos' });
    expect(screen.queryByRole('region', { name: 'Indicadores' })).not.toBeInTheDocument();
  });

  it('AC-AJ1.11: el minuto de seguridad aparece en su posición cuando hay mensaje hoy', async () => {
    mockApi({
      ...BASE_ROUTES,
      ...settingsRoute(
        uiSettings({ blocks: ['access', 'safety-minute', 'hero', 'mine', 'kpis', 'alerts', 'activity'] }),
      ),
      'GET /me/safety-minute': () =>
        jsonResponse({ safetyMinute: { displayDate: '2026-10-14', message: 'Casco puesto.' } }),
    });
    renderWithProviders(<HomePage />);

    const minute = await screen.findByRole('region', { name: 'Minuto de seguridad' });
    expect(minute).toHaveTextContent('Casco puesto.');
    expect(isBefore(screen.getByRole('region', { name: 'Accesos rápidos' }), minute)).toBe(true);
  });

  it('sin mensaje hoy no hay bloque ni hueco del minuto de seguridad', async () => {
    mockApi({
      ...BASE_ROUTES,
      ...settingsRoute(uiSettings()),
      'GET /me/safety-minute': () => jsonResponse({ safetyMinute: null }),
    });
    renderWithProviders(<HomePage />);

    await screen.findByRole('region', { name: 'Accesos rápidos' });
    expect(screen.queryByRole('region', { name: 'Minuto de seguridad' })).not.toBeInTheDocument();
  });

  it('AC-AJ1.5: sin nada visible, estado vacío con «Restablecer» que borra la preferencia', async () => {
    const fetchMock = mockApi({
      ...BASE_ROUTES,
      ...settingsRoute(
        uiSettings({
          hiddenBlocks: ['hero', 'mine', 'kpis', 'alerts', 'activity', 'access'],
          isCustomized: true,
        }),
      ),
      'GET /me/safety-minute': () => jsonResponse({ safetyMinute: null }),
      'DELETE /me/preferences/dashboard-cards': () => new Response(null, { status: 204 }),
    });
    const user = userEvent.setup();
    renderWithProviders(<HomePage />);

    expect(await screen.findByText('Tu panel no tiene bloques visibles')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restablecer' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, 'DELETE', '/me/preferences/dashboard-cards')).toHaveLength(1),
    );
  });

  it('AC-AJ1.5: si queda el minuto de seguridad (no ocultable) no hay estado vacío', async () => {
    mockApi({
      ...BASE_ROUTES,
      ...settingsRoute(
        uiSettings({
          hiddenBlocks: ['hero', 'mine', 'kpis', 'alerts', 'activity', 'access'],
          isCustomized: true,
        }),
      ),
      'GET /me/safety-minute': () =>
        jsonResponse({ safetyMinute: { displayDate: '2026-10-14', message: 'Casco puesto.' } }),
    });
    renderWithProviders(<HomePage />);

    expect(await screen.findByRole('region', { name: 'Minuto de seguridad' })).toBeInTheDocument();
    expect(screen.queryByText('Tu panel no tiene bloques visibles')).not.toBeInTheDocument();
  });

  it('si ui-settings falla, el panel usa el orden por defecto sin bloquearse', async () => {
    mockApi({ ...BASE_ROUTES, 'GET /me/ui-settings': () => errorResponse(500, 'INTERNAL_ERROR') });
    renderWithProviders(<HomePage />);

    expect(await screen.findByRole('region', { name: 'Accesos rápidos' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Mi acceso' })).toBeInTheDocument();
  });

  it('«Personalizar panel» abre el diálogo y devuelve el foco al botón al cerrarlo', async () => {
    setSessionPermissions(ALL_SOURCE_PERMISSIONS);
    mockApi({ ...BASE_ROUTES, ...DASHBOARD_ROUTES, ...settingsRoute(uiSettings()) });
    const user = userEvent.setup();
    renderWithProviders(<HomePage />);

    const trigger = screen.getByRole('button', { name: 'Personalizar panel' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Personalizar panel' });
    expect(await within(dialog).findByRole('list', { name: 'Bloques' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
