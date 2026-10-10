import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { MenuOption } from './menu-options.api';
import { MenuOptionsPage } from './MenuOptionsPage';

const ALL_PERMISSIONS = ['opciones.ver', 'opciones.crear', 'opciones.editar', 'opciones.eliminar'];
const MODULE = { id: 'm-1', key: 'administracion', name: 'Administración' };

function option(id: string, overrides: Partial<MenuOption> = {}): MenuOption {
  return {
    id,
    key: id,
    parentId: null,
    label: id,
    description: null,
    icon: null,
    kind: 'LINK',
    path: '/administracion/usuarios',
    sortOrder: 10,
    requiredPermissionId: null,
    requiredPermissionCode: null,
    isPublic: false,
    isSystem: false,
    isActive: true,
    module: MODULE,
    ...overrides,
  };
}

const SYSTEM = option('Usuarios', { isSystem: true, sortOrder: 10 });
const OWN = option('Propia', { sortOrder: 20 });

function signInWith(permissions: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'yo', displayName: 'Persona de Prueba', roles: ['ADMIN'], permissions },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: !query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false, errorMessage: null });
  vi.unstubAllGlobals();
});

describe('MenuOptionsPage', () => {
  it('pinta el árbol por módulo y no ofrece eliminar una opción de sistema', async () => {
    signInWith(ALL_PERMISSIONS);
    mockApi({ 'GET /menu-options': () => jsonResponse([SYSTEM, OWN]) });

    renderWithProviders(<MenuOptionsPage />);

    expect(await screen.findByRole('heading', { name: 'Administración' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar Usuarios' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar Propia' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir Usuarios' })).toBeDisabled();
  });

  it('sin permisos de gestión sólo muestra el árbol', async () => {
    signInWith(['opciones.ver']);
    mockApi({ 'GET /menu-options': () => jsonResponse([SYSTEM, OWN]) });

    renderWithProviders(<MenuOptionsPage />);

    await screen.findByRole('heading', { name: 'Administración' });
    expect(screen.queryByRole('button', { name: 'Nueva opción' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Eliminar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Subir/ })).not.toBeInTheDocument();
  });

  it('reordena con PUT /menu-options/order', async () => {
    const user = userEvent.setup();
    signInWith(ALL_PERMISSIONS);
    const fetchMock = mockApi({
      'GET /menu-options': () => jsonResponse([SYSTEM, OWN]),
      'PUT /menu-options/order': () => jsonResponse([SYSTEM, OWN]),
    });

    renderWithProviders(<MenuOptionsPage />);
    await user.click(await screen.findByRole('button', { name: 'Subir Propia' }));

    const [call] = callsTo(fetchMock, 'PUT', '/menu-options/order');
    expect(JSON.parse(String(call?.body))).toEqual({
      items: [
        { id: 'Propia', parentId: null, sortOrder: 10 },
        { id: 'Usuarios', parentId: null, sortOrder: 20 },
      ],
    });
  });

  it('muestra el motivo de un ciclo al reordenar', async () => {
    const user = userEvent.setup();
    signInWith(ALL_PERMISSIONS);
    mockApi({
      'GET /menu-options': () => jsonResponse([SYSTEM, OWN]),
      'PUT /menu-options/order': () => errorResponse(422, 'MENU_CYCLE'),
    });

    renderWithProviders(<MenuOptionsPage />);
    await user.click(await screen.findByRole('button', { name: 'Subir Propia' }));

    expect(
      await screen.findByText('Una opción no puede quedar dentro de sí misma ni de una de sus opciones hijas.'),
    ).toBeInTheDocument();
  });

  it('el alta traduce una ruta no registrada', async () => {
    const user = userEvent.setup();
    signInWith(ALL_PERMISSIONS);
    mockApi({
      'GET /menu-options': () => jsonResponse([SYSTEM]),
      'GET /modules': () => jsonResponse([{ ...MODULE, icon: null, sortOrder: 90, isSystem: true, isActive: true }]),
      'GET /menu-options/routes': () => jsonResponse([{ path: '/administracion/roles', label: 'Roles y permisos' }]),
      'POST /menu-options': () => errorResponse(422, 'ROUTE_NOT_REGISTERED'),
    });

    renderWithProviders(<MenuOptionsPage />);
    await user.click(await screen.findByRole('button', { name: 'Nueva opción' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva opción de menú' });

    await user.click(within(dialog).getByRole('combobox', { name: /módulo/i }));
    await user.click(await screen.findByRole('option', { name: 'Administración' }));
    await user.click(within(dialog).getByRole('textbox', { name: /clave/i }));
    await user.paste('ventas-cotizaciones');
    await user.click(within(dialog).getByRole('textbox', { name: /etiqueta/i }));
    await user.paste('Cotizaciones');
    await user.click(within(dialog).getByRole('combobox', { name: /pantalla/i }));
    await user.click(await screen.findByRole('option', { name: /Roles y permisos/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Crear opción' }));

    expect(await within(dialog).findByText('La ruta no corresponde a ninguna pantalla registrada.')).toBeInTheDocument();
  });
});
