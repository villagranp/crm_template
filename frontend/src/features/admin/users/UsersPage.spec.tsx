import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { UserDetail, UserListItem } from './users.api';
import { UsersPage } from './UsersPage';

const ALL_PERMISSIONS = [
  'usuarios.ver',
  'usuarios.crear',
  'usuarios.editar',
  'usuarios.exportar',
  'roles.ver',
];

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
  roles: [
    {
      id: 'r-admin',
      code: 'administrador',
      name: 'Administrador',
      isSystem: true,
      expiresAt: null,
    },
  ],
  directPermissions: [],
  directMenuOptions: [],
};

const ROLE_ADMIN = {
  id: 'r-admin',
  code: 'administrador',
  name: 'Administrador',
  isSystem: true,
  isActive: true,
  permissionCodes: ['usuarios.ver', 'usuarios.editar'],
};
const ROLE_USUARIO = {
  id: 'r-usuario',
  code: 'usuario',
  name: 'Usuario',
  isSystem: true,
  isActive: true,
  permissionCodes: [],
};
const ROLES = [ROLE_ADMIN];

/** Sesión tipo `gestor-accesos` (ADR-020): gestiona datos de usuarios, pero no es administrador. */
const GESTOR_PERMISSIONS = [
  'usuarios.ver',
  'usuarios.editar',
  'usuarios.crear',
  'roles.ver',
  'roles.editar',
  'permisos.ver',
  'opciones.ver',
  'opciones.configurar',
];
const GESTOR_ROLES = ['gestor-accesos'];
const ADMIN_ONLY_NOTE = 'La asignación de accesos es exclusiva del administrador (ADR-020).';

/** Usuario sin rol de administrador: el gestor sí puede editar sus datos. */
const PLAIN_USER: UserListItem = {
  ...USER,
  id: 'u-2',
  displayName: 'Bruno Cano',
  email: 'bruno@example.test',
  roles: ['usuario'],
};
const PLAIN_DETAIL: UserDetail = {
  ...DETAIL,
  ...PLAIN_USER,
  firstName: 'Bruno',
  lastName: 'Cano',
  roles: [{ id: 'r-usuario', code: 'usuario', name: 'Usuario', isSystem: true, expiresAt: null }],
};

function page<T>(data: T[]) {
  return { data, pagination: { page: 1, pageSize: 20, totalItems: data.length, totalPages: 1 } };
}

function signInWith(permissions: string[], roles: string[] = ['administrador']) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'yo', displayName: 'Persona de Prueba', roles, permissions },
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
  useAuthStore.setState({
    status: 'anonymous',
    user: null,
    passwordChangeRequired: false,
    errorMessage: null,
  });
  vi.unstubAllGlobals();
});

describe('UsersPage', () => {
  it('lista usuarios y muestra las acciones con todos los permisos', async () => {
    signInWith(ALL_PERMISSIONS);
    mockApi({
      'GET /users': () => jsonResponse(page([USER])),
      'GET /roles': () => jsonResponse(page(ROLES)),
    });

    renderWithProviders(<UsersPage />);

    const table = await screen.findByRole('table', { name: 'Usuarios' });
    expect(within(table).getByText('Ana Beltrán')).toBeInTheDocument();
    expect(within(table).getByText('Activo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo usuario' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeInTheDocument();
  });

  it('los chips de estado muestran el total de la API y filtran la tabla en el servidor', async () => {
    const user = userEvent.setup();
    signInWith(ALL_PERMISSIONS);
    const fetchMock = mockApi({
      'GET /users': () =>
        jsonResponse({
          ...page([USER]),
          pagination: { page: 1, pageSize: 20, totalItems: 7, totalPages: 1 },
        }),
      'GET /roles': () => jsonResponse(page(ROLES)),
    });

    renderWithProviders(<UsersPage />);

    const filters = await screen.findByRole('group', { name: 'Filtrar por estado' });
    const active = await within(filters).findByRole('button', { name: 'Activo, 7' });
    expect(within(filters).getByRole('button', { name: 'Todos, 7' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/^7 registros · /)).toBeInTheDocument();

    await user.click(active);

    expect(active).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      const listCalls = fetchMock.mock.calls
        .map(([input]) => new URL(String(input), 'http://localhost'))
        .filter(
          (url) => url.pathname.endsWith('/users') && url.searchParams.get('pageSize') !== '1',
        );
      expect(listCalls.at(-1)?.searchParams.get('status')).toBe('ACTIVE');
    });
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
    const fetchMock = mockApi({
      'GET /users': () => jsonResponse(page([])),
      'GET /roles': () => jsonResponse(page(ROLES)),
    });

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

    expect(
      await within(dialog).findByText('Ya existe un usuario con ese correo.'),
    ).toBeInTheDocument();
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
    await user.type(
      within(confirm).getByRole('textbox', { name: /motivo/i }),
      'Revisión de seguridad pendiente',
    );
    await user.click(within(confirm).getByRole('button', { name: 'Suspender' }));

    expect(
      await within(confirm).findByText(
        'Debe quedar al menos un administrador activo. Asigna el rol a otra persona antes.',
      ),
    ).toBeInTheDocument();
  });

  it('sin usuarios.editar el detalle no ofrece acciones', async () => {
    const user = userEvent.setup();
    signInWith(['usuarios.ver']);
    mockApi({
      'GET /users': () => jsonResponse(page([USER])),
      'GET /users/u-1': () => jsonResponse(DETAIL),
    });

    renderWithProviders(<UsersPage />);
    await user.click(await screen.findByRole('button', { name: 'Ver Ana Beltrán' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ana Beltrán' });
    await waitFor(() => expect(within(dialog).getByText('ana@example.test')).toBeInTheDocument());
    expect(within(dialog).queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Editar datos' })).not.toBeInTheDocument();
  });

  describe('ADR-020: la asignación de accesos es del administrador', () => {
    it('un no administrador no ve los editores de roles ni de excepciones', async () => {
      const user = userEvent.setup();
      signInWith(GESTOR_PERMISSIONS, GESTOR_ROLES);
      const fetchMock = mockApi({
        'GET /users': () => jsonResponse(page([PLAIN_USER])),
        'GET /roles': () => jsonResponse(page([ROLE_ADMIN, ROLE_USUARIO])),
        'GET /users/u-2': () => jsonResponse(PLAIN_DETAIL),
      });

      renderWithProviders(<UsersPage />);
      await user.click(await screen.findByRole('button', { name: 'Ver Bruno Cano' }));
      const dialog = await screen.findByRole('dialog', { name: 'Bruno Cano' });

      // Los datos de un no administrador sí los gestiona.
      expect(
        await within(dialog).findByRole('button', { name: 'Editar datos' }),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Suspender' })).toBeInTheDocument();
      // Restablecer la contraseña de cualquiera es del administrador (ADR-020).
      expect(
        within(dialog).queryByRole('button', { name: 'Restablecer contraseña' }),
      ).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole('tab', { name: 'Roles' }));
      expect(within(dialog).getByText(ADMIN_ONLY_NOTE)).toBeInTheDocument();
      expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Guardar roles' }),
      ).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole('tab', { name: 'Excepciones' }));
      expect(within(dialog).getByText(ADMIN_ONLY_NOTE)).toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Añadir excepción' }),
      ).not.toBeInTheDocument();
      // Ni siquiera se piden los catálogos para asignar.
      expect(callsTo(fetchMock, 'GET', '/permissions')).toHaveLength(0);
      expect(callsTo(fetchMock, 'GET', '/menu-options')).toHaveLength(0);
    });

    it('un no administrador no puede editar, suspender ni restablecer a un administrador', async () => {
      const user = userEvent.setup();
      signInWith(GESTOR_PERMISSIONS, GESTOR_ROLES);
      mockApi({
        'GET /users': () => jsonResponse(page([USER])),
        'GET /users/u-1': () => jsonResponse(DETAIL),
      });

      renderWithProviders(<UsersPage />);
      await user.click(await screen.findByRole('button', { name: 'Ver Ana Beltrán' }));
      const dialog = await screen.findByRole('dialog', { name: 'Ana Beltrán' });

      expect(
        await within(dialog).findByText(
          'Sólo un administrador puede modificar a otro administrador (ADR-020).',
        ),
      ).toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Editar datos' }),
      ).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Reactivar' })).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Restablecer contraseña' }),
      ).not.toBeInTheDocument();
    });

    it('en el alta, un no administrador sólo puede elegir roles sin permisos', async () => {
      const user = userEvent.setup();
      signInWith(GESTOR_PERMISSIONS, GESTOR_ROLES);
      mockApi({
        'GET /users': () => jsonResponse(page([])),
        'GET /roles': () => jsonResponse(page([ROLE_ADMIN, ROLE_USUARIO])),
      });

      renderWithProviders(<UsersPage />);
      await user.click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
      const dialog = await screen.findByRole('dialog', { name: 'Nuevo usuario' });

      expect(await within(dialog).findByRole('checkbox', { name: 'Usuario' })).toBeInTheDocument();
      expect(
        within(dialog).queryByRole('checkbox', { name: 'Administrador' }),
      ).not.toBeInTheDocument();
      expect(within(dialog).getByText(/Sólo puedes dar roles sin permisos/)).toBeInTheDocument();
    });

    it('un administrador sigue viendo todos los editores y todos los roles', async () => {
      const user = userEvent.setup();
      signInWith(GESTOR_PERMISSIONS);
      mockApi({
        'GET /users': () => jsonResponse(page([USER])),
        'GET /roles': () => jsonResponse(page([ROLE_ADMIN, ROLE_USUARIO])),
        'GET /users/u-1': () => jsonResponse(DETAIL),
        'GET /permissions': () => jsonResponse([]),
        'GET /menu-options': () => jsonResponse([]),
      });

      renderWithProviders(<UsersPage />);
      await user.click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
      const form = await screen.findByRole('dialog', { name: 'Nuevo usuario' });
      expect(
        await within(form).findByRole('checkbox', { name: 'Administrador' }),
      ).toBeInTheDocument();
      expect(within(form).getByRole('checkbox', { name: 'Usuario' })).toBeInTheDocument();
      expect(
        within(form).queryByText(/Sólo puedes dar roles sin permisos/),
      ).not.toBeInTheDocument();
      await user.click(within(form).getByRole('button', { name: 'Cancelar' }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Nuevo usuario' })).not.toBeInTheDocument(),
      );

      await user.click(screen.getByRole('button', { name: 'Ver Ana Beltrán' }));
      const dialog = await screen.findByRole('dialog', { name: 'Ana Beltrán' });
      expect(
        await within(dialog).findByRole('button', { name: 'Editar datos' }),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Suspender' })).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', { name: 'Restablecer contraseña' }),
      ).toBeInTheDocument();

      await user.click(within(dialog).getByRole('tab', { name: 'Roles' }));
      expect(
        await within(dialog).findByRole('checkbox', { name: 'Administrador (sistema)' }),
      ).toBeChecked();
      expect(within(dialog).getByRole('button', { name: 'Guardar roles' })).toBeInTheDocument();
      expect(within(dialog).queryByText(ADMIN_ONLY_NOTE)).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole('tab', { name: 'Excepciones' }));
      expect(within(dialog).getAllByRole('button', { name: 'Añadir excepción' })).toHaveLength(2);
      expect(within(dialog).queryByText(ADMIN_ONLY_NOTE)).not.toBeInTheDocument();
    });

    it('un 403 ADMIN_ONLY del backend muestra su mensaje', async () => {
      const user = userEvent.setup();
      signInWith(GESTOR_PERMISSIONS);
      mockApi({
        'GET /users': () => jsonResponse(page([PLAIN_USER])),
        'GET /roles': () => jsonResponse(page([ROLE_ADMIN, ROLE_USUARIO])),
        'GET /users/u-2': () => jsonResponse(PLAIN_DETAIL),
        'PUT /users/u-2/roles': () => errorResponse(403, 'ADMIN_ONLY'),
      });

      renderWithProviders(<UsersPage />);
      await user.click(await screen.findByRole('button', { name: 'Ver Bruno Cano' }));
      const dialog = await screen.findByRole('dialog', { name: 'Bruno Cano' });
      await user.click(await within(dialog).findByRole('tab', { name: 'Roles' }));
      await user.click(
        await within(dialog).findByRole('checkbox', { name: 'Administrador (sistema)' }),
      );
      await user.click(within(dialog).getByRole('button', { name: 'Guardar roles' }));

      expect(
        await within(dialog).findByText('Sólo un administrador puede asignar o modificar accesos.'),
      ).toBeInTheDocument();
    });
  });
});
