import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MenuModule, Profile } from '@/services/access';
import { useAuthStore } from '@/stores/auth.store';
import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
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
});
