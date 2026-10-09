import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { UserDetail, UserListItem } from './users.api';
import { UsersPage } from './UsersPage';

const ALL_PERMISSIONS = ['usuarios.ver', 'usuarios.crear', 'usuarios.editar', 'usuarios.exportar', 'roles.ver'];

const USER: UserListItem = {
  id: 'u-1',
  email: 'ana@example.test',
  displayName: 'Ana Beltrán',
  jobTitle: null,
  status: 'ACTIVE',
  roles: ['administrador'],
  teams: [],
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const DETAIL: UserDetail = {
  ...USER,
  firstName: 'Ana',
  lastName: 'Beltrán',
  phone: null,
  updatedAt: '2026-01-01T00:00:00Z',
  roles: [{ id: 'r-admin', code: 'administrador', name: 'Administrador', isSystem: true, expiresAt: null }],
  directPermissions: [],
  directMenuOptions: [],
};

const ROLES = [{ id: 'r-admin', code: 'administrador', name: 'Administrador', isSystem: true, isActive: true }];

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

function simulateWideScreen() {
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
}

beforeEach(() => {
  simulateWideScreen();
});

afterEach(() => {
  useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false, errorMessage: null });
  vi.unstubAllGlobals();
});

describe('UsersPage', () => {
  it('lista usuarios y muestra las acciones con todos los permisos', async () => {
    signInWith(ALL_PERMISSIONS);
    mockApi({ 'GET /users': () => jsonResponse(page([USER])), 'GET /roles': () => jsonResponse(page(ROLES)) });

    renderWithProviders(<UsersPage />);

    const table = await screen.findByRole('table', { name: 'Usuarios' });
    expect(within(table).getByText('Ana Beltrán')).toBeInTheDocument();
    expect(within(table).getByText('Activo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo usuario' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeInTheDocument();
  });

  it('oculta alta y exportación sin sus permisos', async () => {
    signInWith(['usuarios.ver']);
    mockApi({ 'GET /users': () => jsonResponse(page([USER])) });

    renderWithProviders(<UsersPage />);

    await screen.findByRole('table', { name: 'Usuarios' });
    expect(screen.queryByRole('button', { name: 'Nuevo usuario' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
  });

  it('el alta valida en el cliente y no envía sin rol', async () => {
    const user = userEvent.setup();
    signInWith(ALL_PERMISSIONS);
    const fetchMock = mockApi({ 'GET /users': () => jsonResponse(page([])), 'GET /roles': () => jsonResponse(page(ROLES)) });

    renderWithProviders(<UsersPage />);
    await user.click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo usuario' });
    await user.type(within(dialog).getByRole('textbox', { name: /correo/i }), 'no-es-correo');
    await user.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));

    expect(await within(dialog).findByText('Escribe un correo válido.')).toBeInTheDocument();
    expect(within(dialog).getByText('Elige al menos un rol.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/users')).toHaveLength(0);
  });

  it('traduce un correo repetido (409) a un mensaje propio', async () => {
    const user = userEvent.setup();
    signInWith(ALL_PERMISSIONS);
    mockApi({
      'GET /users': () => jsonResponse(page([])),
      'GET /roles': () => jsonResponse(page(ROLES)),
      'POST /users': () => errorResponse(409, 'RESOURCE_CONFLICT'),
    });

    renderWithProviders(<UsersPage />);
    await user.click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo usuario' });
    await user.type(within(dialog).getByRole('textbox', { name: /correo/i }), 'ana@example.test');
    await user.type(within(dialog).getByRole('textbox', { name: /^nombre/i }), 'Ana');
    await user.type(within(dialog).getByRole('textbox', { name: /apellidos/i }), 'Beltrán');
    await user.click(await within(dialog).findByRole('checkbox', { name: 'Administrador' }));
    await user.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));

    expect(await within(dialog).findByText('Ya existe un usuario con ese correo.')).toBeInTheDocument();
  });

  it('suspender muestra el error del último administrador', async () => {
    const user = userEvent.setup();
    signInWith(ALL_PERMISSIONS);
    mockApi({
      'GET /users': () => jsonResponse(page([USER])),
      'GET /roles': () => jsonResponse(page(ROLES)),
      'GET /users/u-1': () => jsonResponse(DETAIL),
      'POST /users/u-1/suspend': () => errorResponse(409, 'LAST_ADMIN'),
    });

    renderWithProviders(<UsersPage />);
    await user.click(await screen.findByRole('button', { name: 'Ver Ana Beltrán' }));
    await user.click(await screen.findByRole('button', { name: 'Suspender' }));
    const confirm = await screen.findByRole('dialog', { name: 'Suspender usuario' });
    await user.type(within(confirm).getByRole('textbox', { name: /motivo/i }), 'Revisión de seguridad pendiente');
    await user.click(within(confirm).getByRole('button', { name: 'Suspender' }));

    expect(
      await within(confirm).findByText('Debe quedar al menos un administrador activo. Asigna el rol a otra persona antes.'),
    ).toBeInTheDocument();
  });

  it('sin usuarios.editar el detalle no ofrece acciones', async () => {
    const user = userEvent.setup();
    signInWith(['usuarios.ver']);
    mockApi({ 'GET /users': () => jsonResponse(page([USER])), 'GET /users/u-1': () => jsonResponse(DETAIL) });

    renderWithProviders(<UsersPage />);
    await user.click(await screen.findByRole('button', { name: 'Ver Ana Beltrán' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ana Beltrán' });
    await waitFor(() => expect(within(dialog).getByText('ana@example.test')).toBeInTheDocument());
    expect(within(dialog).queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Editar datos' })).not.toBeInTheDocument();
  });
});
