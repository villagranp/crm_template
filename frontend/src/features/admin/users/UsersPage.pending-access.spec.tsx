import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '@/config/env';
import { useAuthStore } from '@/stores/auth.store';
import { jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { UserDetailDialog } from './components/UserDetailDialog';
import type { UserDetail, UserListItem } from './users.api';
import { UsersPage } from './UsersPage';

/**
 * ADR-027: usuarios recién creados con Entra ID, sin ningún acceso. Contrato del backend:
 * `GET /users?pendingAccess=true` y `UserListItemDto.pendingAccess`.
 */

const PERMISSIONS = ['usuarios.ver', 'usuarios.crear', 'roles.ver'];

const ACTIVE_USER: UserListItem = {
  id: 'u-1',
  email: 'ana@example.test',
  displayName: 'Ana Beltrán',
  jobTitle: null,
  employeeCode: null,
  country: null,
  status: 'ACTIVE',
  roles: ['administrador'],
  teams: [],
  pendingAccess: false,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const PENDING_USER: UserListItem = {
  ...ACTIVE_USER,
  id: 'u-9',
  email: 'nuevo@example.test',
  displayName: 'Nora Nueva',
  roles: [],
  pendingAccess: true,
};

const PENDING_DETAIL: UserDetail = {
  ...PENDING_USER,
  firstName: 'Nora',
  lastName: 'Nueva',
  phone: null,
  updatedAt: '2026-01-01T00:00:00Z',
  roles: [],
  directPermissions: [],
  directMenuOptions: [],
};

function page(data: UserListItem[], totalItems = data.length) {
  return { data, pagination: { page: 1, pageSize: 20, totalItems, totalPages: 1 } };
}

function signIn() {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'yo', displayName: 'Admin', roles: ['administrador'], permissions: PERMISSIONS },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

/** API de usuarios con un activo y uno pendiente de acceso. */
function mockUsersApi() {
  return mockApi({
    'GET /users': () => jsonResponse(page([ACTIVE_USER, PENDING_USER])),
    'GET /roles': () => jsonResponse({ data: [], pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 } }),
    'GET /users/u-9': () => jsonResponse(PENDING_DETAIL),
  });
}

function usersRequests(fetchMock: ReturnType<typeof mockApi>): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname.endsWith('/users'));
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
  signIn();
});

afterEach(() => {
  useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false });
});

describe('Usuarios: pendientes de acceso', () => {
  it('marca en la fila a quien no tiene acceso y no a quien sí lo tiene', async () => {
    mockUsersApi();

    renderWithProviders(<UsersPage />);

    const table = await screen.findByRole('table', { name: 'Usuarios' });
    const pendingRow = within(table).getByText('Nora Nueva').closest('tr');
    const activeRow = within(table).getByText('Ana Beltrán').closest('tr');
    expect(pendingRow).not.toBeNull();
    expect(activeRow).not.toBeNull();
    expect(within(pendingRow as HTMLElement).getByText('Pendiente de acceso')).toBeInTheDocument();
    expect(within(activeRow as HTMLElement).queryByText('Pendiente de acceso')).not.toBeInTheDocument();
  });

  it('el chip muestra el total de la API y filtra en el servidor con pendingAccess=true', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      'GET /users': () => jsonResponse(page([PENDING_USER], 3)),
      'GET /roles': () => jsonResponse({ data: [], pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 } }),
    });

    renderWithProviders(<UsersPage />);

    const group = await screen.findByRole('group', { name: 'Filtrar por acceso' });
    const chip = await within(group).findByRole('button', { name: 'Pendientes de acceso, 3' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    await user.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      const listCalls = usersRequests(fetchMock).filter(
        (url) => url.searchParams.get('pageSize') !== '1',
      );
      expect(listCalls.at(-1)?.searchParams.get('pendingAccess')).toBe('true');
    });

    // Es un interruptor: pulsarlo otra vez quita el filtro.
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => {
      const listCalls = usersRequests(fetchMock).filter(
        (url) => url.searchParams.get('pageSize') !== '1',
      );
      expect(listCalls.at(-1)?.searchParams.has('pendingAccess')).toBe(false);
    });
  });

  it('el contador pide el total con una sola fila y el filtro activo', async () => {
    const fetchMock = mockUsersApi();

    renderWithProviders(<UsersPage />);
    await screen.findByRole('table', { name: 'Usuarios' });

    await waitFor(() => {
      const counting = usersRequests(fetchMock).filter(
        (url) =>
          url.searchParams.get('pageSize') === '1' && url.searchParams.get('pendingAccess') === 'true',
      );
      expect(counting.length).toBeGreaterThan(0);
    });
  });

  it('el detalle indica que la cuenta está pendiente de acceso', async () => {
    mockUsersApi();

    renderWithProviders(<UserDetailDialog userId="u-9" onClose={() => undefined} />);

    const dialog = await screen.findByRole('dialog', { name: 'Nora Nueva' });
    expect(await within(dialog).findByText('Pendiente de acceso')).toBeInTheDocument();
    expect(within(dialog).getByText(/aún no tiene ningún acceso/i)).toBeInTheDocument();
  });

  it('el detalle de un usuario que no está en la página de la lista usa el pendingAccess del propio detalle', async () => {
    // La lista sólo trae a Ana: Nora (u-9) no está en la página actual.
    mockApi({
      'GET /users': () => jsonResponse(page([ACTIVE_USER])),
      'GET /users/u-9': () => jsonResponse(PENDING_DETAIL),
    });

    renderWithProviders(<UserDetailDialog userId="u-9" onClose={() => undefined} />);

    const dialog = await screen.findByRole('dialog', { name: 'Nora Nueva' });
    expect(await within(dialog).findByText('Pendiente de acceso')).toBeInTheDocument();
  });

  it('el detalle no marca a quien ya tiene acceso', async () => {
    mockApi({ 'GET /users/u-9': () => jsonResponse({ ...PENDING_DETAIL, pendingAccess: false }) });

    renderWithProviders(<UserDetailDialog userId="u-9" onClose={() => undefined} />);

    const dialog = await screen.findByRole('dialog', { name: 'Nora Nueva' });
    await within(dialog).findByText('nuevo@example.test');
    expect(within(dialog).queryByText('Pendiente de acceso')).not.toBeInTheDocument();
  });
});

describe('Alta de usuario: texto según el proveedor de autenticación', () => {
  const previousProvider = env.VITE_AUTH_PROVIDER;
  const ROLE = {
    id: 'r-1',
    code: 'usuario',
    name: 'Usuario',
    isSystem: true,
    isActive: true,
    permissionCodes: [],
  };

  afterEach(() => {
    env.VITE_AUTH_PROVIDER = previousProvider;
  });

  async function openCreateDialog() {
    mockApi({
      'GET /users': () => jsonResponse(page([])),
      'GET /roles': () =>
        jsonResponse({ data: [ROLE], pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } }),
    });
    renderWithProviders(<UsersPage />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
    return screen.findByRole('dialog', { name: 'Nuevo usuario' });
  }

  it('con el proveedor local dice que nace como Invitado y cambia la contraseña inicial', async () => {
    env.VITE_AUTH_PROVIDER = 'local';

    const dialog = await openCreateDialog();

    expect(
      await within(dialog).findByText('Nace como «Invitado» y debe cambiar la contraseña inicial al entrar.'),
    ).toBeInTheDocument();
  });

  it('con Entra ID explica que debe vincularse la identidad y no habla de contraseña', async () => {
    env.VITE_AUTH_PROVIDER = 'entra';

    const dialog = await openCreateDialog();

    expect(
      await within(dialog).findByText(
        'La persona entrará con su cuenta corporativa. El administrador debe vincular su identidad antes de que pueda entrar; hasta entonces recibirá un aviso de cuenta no vinculada.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/contraseña inicial/i)).not.toBeInTheDocument();
  });
});
