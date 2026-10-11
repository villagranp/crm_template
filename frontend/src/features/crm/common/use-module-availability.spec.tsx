import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MenuModule, MenuOptionNode } from '@/services/access';
import { useAuthStore } from '@/stores/auth.store';
import { callsTo, deferred, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { CRM_MODULE_OPTION_KEYS, menuHasOption, useModuleAvailability } from './use-module-availability';

function option(key: string, children: MenuOptionNode[] = []): MenuOptionNode {
  return { id: `o-${key}`, key, label: key, icon: null, path: `/${key}`, order: 10, requiredPermission: null, children };
}

function module(key: string, options: MenuOptionNode[]): MenuModule {
  return { key, label: key, icon: null, order: 10, isSystem: false, options };
}

const MENU_WITH_PROJECTS: MenuModule[] = [
  module('clientes', [option('clientes-buscar')]),
  module('proyectos', [option('proyectos-buscar')]),
];

function signIn(): void {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u-1', displayName: 'Ana', email: 'ana@example.test', roles: ['asesor'], permissions: ['clientes.ver'] },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

describe('menuHasOption', () => {
  it('encuentra la opción a cualquier profundidad del árbol', () => {
    const nested = [module('actividad-comercial', [{ ...option('grupo', [option('actividad-actividades')]), path: null }])];

    expect(menuHasOption(nested, CRM_MODULE_OPTION_KEYS.activities)).toBe(true);
    expect(menuHasOption(nested, CRM_MODULE_OPTION_KEYS.projects)).toBe(false);
  });

  it('sin menú no hay módulos disponibles', () => {
    expect(menuHasOption(undefined, CRM_MODULE_OPTION_KEYS.projects)).toBe(false);
    expect(menuHasOption([], CRM_MODULE_OPTION_KEYS.projects)).toBe(false);
  });
});

/** Pinta el estado del hook para observarlo como lo vería una pantalla. */
function Probe({ optionKey }: { optionKey: string }) {
  const availability = useModuleAvailability(optionKey);
  return <output aria-label="disponibilidad">{availability.status}</output>;
}

function status(): string | null {
  return screen.getByRole('status', { name: 'disponibilidad' }).textContent;
}

describe('useModuleAvailability (D-02.10)', () => {
  beforeEach(signIn);

  afterEach(() => {
    useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false, errorMessage: null });
  });

  it('está cargando mientras llega el menú y disponible si contiene la opción del módulo', async () => {
    const menu = deferred<Response>();
    mockApi({ 'GET /me/menu': () => menu.promise });

    renderWithProviders(<Probe optionKey={CRM_MODULE_OPTION_KEYS.projects} />);
    expect(status()).toBe('loading');

    menu.resolve(jsonResponse(MENU_WITH_PROJECTS));
    expect(await screen.findByText('available')).toBeInTheDocument();
  });

  it('no está disponible si el menú no trae la opción (módulo sin entregar o sin permiso)', async () => {
    const fetchMock = mockApi({ 'GET /me/menu': () => jsonResponse(MENU_WITH_PROJECTS) });

    renderWithProviders(<Probe optionKey={CRM_MODULE_OPTION_KEYS.activities} />);

    expect(await screen.findByText('unavailable')).toBeInTheDocument();
    // Sólo se consulta el menú: nunca la API del otro módulo.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(callsTo(fetchMock, 'GET', '/me/menu')).toHaveLength(1);
  });

  it('si el menú falla, el módulo se considera no disponible', async () => {
    mockApi({ 'GET /me/menu': () => errorResponse(500, 'INTERNAL_ERROR') });

    renderWithProviders(<Probe optionKey={CRM_MODULE_OPTION_KEYS.projects} />);

    expect(await screen.findByText('unavailable')).toBeInTheDocument();
  });

  it('sin sesión no consulta el menú ni se queda cargando', () => {
    useAuthStore.setState({ status: 'anonymous', user: null });
    const fetchMock = mockApi({});

    renderWithProviders(<Probe optionKey={CRM_MODULE_OPTION_KEYS.projects} />);

    expect(status()).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
