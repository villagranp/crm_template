import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { Permission, Role } from './roles.api';
import { RolesPage } from './RolesPage';

const ALL_PERMISSIONS = ['roles.ver', 'roles.crear', 'roles.editar', 'roles.eliminar', 'permisos.ver', 'opciones.ver', 'opciones.configurar'];

function role(overrides: Partial<Role> = {}): Role {
  return {
    id: 'r-1',
    code: 'supervisor',
    name: 'Supervisor',
    description: null,
    dataScope: 'TEAM',
    isSystem: false,
    isActive: true,
    permissionCodes: ['usuarios.ver'],
    menuOptionIds: [],
    userCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const SYSTEM = role({ id: 'r-sys', code: 'administrador', name: 'Administrador', isSystem: true });
const PERMISSIONS: Permission[] = [
  { id: 'p-1', code: 'usuarios.ver', resource: 'usuarios', action: 'ver', name: 'Ver usuarios', moduleKey: 'administracion' },
  { id: 'p-2', code: 'usuarios.crear', resource: 'usuarios', action: 'crear', name: 'Crear usuarios', moduleKey: 'administracion' },
];

function page<T>(data: T[]) {
  return { data, pagination: { page: 1, pageSize: 20, totalItems: data.length, totalPages: 1 } };
}

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

describe('RolesPage', () => {
  it('no ofrece eliminar un rol de sistema y sí uno propio', async () => {
    signInWith(ALL_PERMISSIONS);
    mockApi({ 'GET /roles': () => jsonResponse(page([SYSTEM, role()])) });

    renderWithProviders(<RolesPage />);

    await screen.findByRole('table', { name: 'Roles' });
    expect(screen.queryByRole('button', { name: 'Eliminar Administrador' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar Supervisor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicar Administrador' })).toBeInTheDocument();
  });

  it('sin permisos de gestión sólo permite ver', async () => {
    signInWith(['roles.ver']);
    mockApi({ 'GET /roles': () => jsonResponse(page([role()])) });

    renderWithProviders(<RolesPage />);

    await screen.findByRole('table', { name: 'Roles' });
    expect(screen.queryByRole('button', { name: 'Nuevo rol' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicar Supervisor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar Supervisor' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver Supervisor' })).toBeInTheDocument();
  });

  it('un rol de sistema se ve en solo lectura con la opción de duplicar', async () => {
    const user = userEvent.setup();
    signInWith(ALL_PERMISSIONS);
    mockApi({
      'GET /roles': () => jsonResponse(page([SYSTEM])),
      'GET /roles/r-sys': () => jsonResponse(SYSTEM),
      'GET /permissions': () => jsonResponse(PERMISSIONS),
    });

    renderWithProviders(<RolesPage />);
    await user.click(await screen.findByRole('button', { name: 'Ver Administrador' }));
    const dialog = await screen.findByRole('dialog', { name: 'Administrador' });

    expect(await within(dialog).findByText(/Rol del sistema/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Duplicar' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: 'Permisos' }));
    const checkbox = await within(dialog).findByRole('checkbox', { name: 'usuarios.ver' });
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Guardar permisos' })).not.toBeInTheDocument();
  });

  it('guarda la matriz de permisos de un rol propio con los ids', async () => {
    const user = userEvent.setup();
    signInWith(ALL_PERMISSIONS);
    const own = role();
    const fetchMock = mockApi({
      'GET /roles': () => jsonResponse(page([own])),
      'GET /roles/r-1': () => jsonResponse(own),
      'GET /permissions': () => jsonResponse(PERMISSIONS),
      'PUT /roles/r-1/permissions': () => jsonResponse(own),
    });

    renderWithProviders(<RolesPage />);
    await user.click(await screen.findByRole('button', { name: 'Ver Supervisor' }));
    const dialog = await screen.findByRole('dialog', { name: 'Supervisor' });
    await user.click(within(dialog).getByRole('tab', { name: 'Permisos' }));
    await user.click(await within(dialog).findByRole('checkbox', { name: 'usuarios.crear' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar permisos' }));

    const [call] = callsTo(fetchMock, 'PUT', '/roles/r-1/permissions');
    expect(JSON.parse(String(call?.body))).toEqual({ ids: ['p-1', 'p-2'] });
  });

  it('eliminar un rol en uso muestra el motivo', async () => {
    const user = userEvent.setup();
    signInWith(ALL_PERMISSIONS);
    mockApi({
      'GET /roles': () => jsonResponse(page([role({ userCount: 2 })])),
      'DELETE /roles/r-1': () => errorResponse(409, 'ROLE_IN_USE'),
    });

    renderWithProviders(<RolesPage />);
    await user.click(await screen.findByRole('button', { name: 'Eliminar Supervisor' }));
    const confirm = await screen.findByRole('dialog', { name: 'Eliminar rol' });
    await user.click(within(confirm).getByRole('button', { name: 'Eliminar' }));

    expect(
      await within(confirm).findByText('El rol tiene usuarios asignados. Reasígnalos antes de eliminarlo.'),
    ).toBeInTheDocument();
  });

  it('el alta valida el código antes de enviar', async () => {
    const user = userEvent.setup();
    signInWith(ALL_PERMISSIONS);
    const fetchMock = mockApi({ 'GET /roles': () => jsonResponse(page([])) });

    renderWithProviders(<RolesPage />);
    await user.click(await screen.findByRole('button', { name: 'Nuevo rol' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo rol' });
    await user.type(within(dialog).getByRole('textbox', { name: /código/i }), 'Con Espacios');
    await user.type(within(dialog).getByRole('textbox', { name: /nombre/i }), 'Rol');
    await user.click(within(dialog).getByRole('button', { name: 'Crear rol' }));

    expect(await within(dialog).findByText(/Minúsculas, números y guiones/)).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/roles')).toHaveLength(0);
  });
});
