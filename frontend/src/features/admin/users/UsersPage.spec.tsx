import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { UserDetailDialog } from './components/UserDetailDialog';
import { UserFormDialog } from './components/UserFormDialog';
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
  employeeCode: null,
  country: null,
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
  describe('07 E.1: código de colaborador, país y estados', () => {
    /** Rellenan el alta completa (seis campos, selectores y equipos): más que el límite por defecto con la suite en paralelo. */
    const FORM_FLOW_TIMEOUT_MS = 60_000;
    const GUATEMALA = { id: 'c-gt', isoCode: 'GT', name: 'Guatemala' };
    const HONDURAS = { id: 'c-hn', isoCode: 'HN', name: 'Honduras' };
    const FORM_OPTIONS = { countries: [GUATEMALA, HONDURAS] };
    const ADMIN_PERMISSIONS = [...ALL_PERMISSIONS, 'clientes.ver'];
    const COMMERCIAL_ROLE = {
      id: 'r-asesor',
      code: 'asesor',
      name: 'Asesor',
      isSystem: true,
      isActive: true,
      permissionCodes: ['clientes.ver', 'proyectos.ver'],
    };

    async function fill(
      user: ReturnType<typeof userEvent.setup>,
      field: HTMLElement,
      value: string,
    ) {
      await user.click(field);
      await user.paste(value);
    }

    it('muestra Código y País y presenta los estados Activo, Inactivo, Bloqueado temporalmente e Invitado', async () => {
      signInWith(['usuarios.ver']);
      mockApi({
        'GET /users': () =>
          jsonResponse(
            page([
              { ...USER, employeeCode: 'E-001', country: GUATEMALA },
              { ...PLAIN_USER, status: 'SUSPENDED' },
              { ...PLAIN_USER, id: 'u-3', displayName: 'Carla', status: 'LOCKED' },
              { ...PLAIN_USER, id: 'u-4', displayName: 'Diego', status: 'INVITED' },
            ]),
          ),
      });

      renderWithProviders(<UsersPage />);

      const table = await screen.findByRole('table', { name: 'Usuarios' });
      expect(within(table).getByRole('columnheader', { name: 'Código' })).toBeInTheDocument();
      expect(within(table).getByRole('columnheader', { name: 'País' })).toBeInTheDocument();
      expect(within(table).getByText('E-001')).toBeInTheDocument();
      expect(within(table).getByText('Guatemala (GT)')).toBeInTheDocument();
      expect(within(table).getByText('Activo')).toBeInTheDocument();
      expect(within(table).getByText('Inactivo')).toBeInTheDocument();
      expect(within(table).getByText('Bloqueado temporalmente')).toBeInTheDocument();
      expect(within(table).getByText('Invitado')).toBeInTheDocument();
      expect(
        screen.getByRole('searchbox', { name: 'Buscar por nombre, correo o código' }),
      ).toBeInTheDocument();
      // Sin acceso a la lista de países no se ofrece el filtro.
      expect(
        screen.queryByRole('combobox', { name: 'País' }),
      ).not.toBeInTheDocument();
    });

    it('filtra por país en el servidor', async () => {
      const user = userEvent.setup();
      signInWith(ADMIN_PERMISSIONS);
      const fetchMock = mockApi({
        'GET /users': () => jsonResponse(page([USER])),
        'GET /roles': () => jsonResponse(page(ROLES)),
        'GET /customers/form-options': () => jsonResponse(FORM_OPTIONS),
      });

      renderWithProviders(<UsersPage />);

      await user.click(await screen.findByRole('combobox', { name: 'País' }));
      await user.click(await screen.findByRole('option', { name: 'Honduras' }));

      await waitFor(() => {
        const listCalls = fetchMock.mock.calls
          .map(([input]) => new URL(String(input), 'http://localhost'))
          .filter(
            (url) => url.pathname.endsWith('/users') && url.searchParams.get('pageSize') !== '1',
          );
        expect(listCalls.at(-1)?.searchParams.get('countryId')).toBe('c-hn');
      });
    });

    it('un administrador da de alta con código (en mayúsculas), país y equipo principal', async () => {
      const user = userEvent.setup();
      signInWith([...ADMIN_PERMISSIONS, 'equipos.ver', 'equipos.editar']);
      const fetchMock = mockApi({
        'GET /roles': () => jsonResponse(page([ROLE_USUARIO])),
        'GET /customers/form-options': () => jsonResponse(FORM_OPTIONS),
        'GET /teams': () =>
          jsonResponse(
            page([
              { id: 't-1', code: 'norte', name: 'Norte', isActive: true },
              { id: 't-2', code: 'sur', name: 'Sur', isActive: true },
            ]),
          ),
        'POST /users': () => jsonResponse({ ...USER, id: 'u-9' }, 201),
        'GET /users/u-9': () => jsonResponse(DETAIL),
      });

      renderWithProviders(<UserFormDialog open user={null} onClose={() => undefined} />);
      const dialog = await screen.findByRole('dialog', { name: 'Nuevo usuario' });
      await fill(user, within(dialog).getByRole('textbox', { name: /correo/i }), 'eva@example.test');
      await fill(user, within(dialog).getByRole('textbox', { name: /^nombre/i }), 'Eva');
      await fill(user, within(dialog).getByRole('textbox', { name: /apellidos/i }), 'Luna');
      await fill(
        user,
        within(dialog).getByRole('textbox', { name: /código de colaborador/i }),
        ' e-001 ',
      );
      await user.click(within(dialog).getByRole('combobox', { name: /país/i }));
      await user.click(await screen.findByRole('option', { name: 'Guatemala (GT)' }));
      await user.click(await within(dialog).findByRole('checkbox', { name: 'Usuario' }));
      await user.click(within(dialog).getByRole('combobox', { name: /añadir equipo/i }));
      await user.click(await screen.findByRole('option', { name: 'Norte (norte)' }));
      await user.click(within(dialog).getByRole('combobox', { name: /añadir equipo/i }));
      await user.click(await screen.findByRole('option', { name: 'Sur (sur)' }));
      await user.click(within(dialog).getByRole('radio', { name: 'Sur' }));
      await user.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));

      await waitFor(() => expect(callsTo(fetchMock, 'POST', '/users')).toHaveLength(1));
      expect(JSON.parse(String(callsTo(fetchMock, 'POST', '/users')[0]?.body))).toEqual({
        email: 'eva@example.test',
        firstName: 'Eva',
        lastName: 'Luna',
        roleIds: ['r-usuario'],
        employeeCode: 'E-001',
        countryId: 'c-gt',
        // El backend marca como principal el primero.
        teamIds: ['t-2', 't-1'],
      });
    }, FORM_FLOW_TIMEOUT_MS);

    it('a un no administrador el país le aparece deshabilitado con la explicación y no se envía', async () => {
      const user = userEvent.setup();
      signInWith([...GESTOR_PERMISSIONS, 'clientes.ver', 'equipos.editar'], GESTOR_ROLES);
      const fetchMock = mockApi({
        'GET /roles': () => jsonResponse(page([ROLE_USUARIO])),
        'POST /users': () => jsonResponse({ ...USER, id: 'u-9' }, 201),
        'GET /users/u-9': () => jsonResponse(PLAIN_DETAIL),
      });

      renderWithProviders(<UserFormDialog open user={null} onClose={() => undefined} />);
      const dialog = await screen.findByRole('dialog', { name: 'Nuevo usuario' });

      expect(within(dialog).getByRole('combobox', { name: /país/i })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect(
        within(dialog).getByText(/Sólo un administrador puede asignar o cambiar el país/),
      ).toBeInTheDocument();
      expect(within(dialog).getByText(/Sólo un administrador puede asignar equipos/)).toBeInTheDocument();
      expect(
        within(dialog).queryByRole('combobox', { name: /añadir equipo/i }),
      ).not.toBeInTheDocument();

      await fill(user, within(dialog).getByRole('textbox', { name: /correo/i }), 'eva@example.test');
      await fill(user, within(dialog).getByRole('textbox', { name: /^nombre/i }), 'Eva');
      await fill(user, within(dialog).getByRole('textbox', { name: /apellidos/i }), 'Luna');
      await fill(
        user,
        within(dialog).getByRole('textbox', { name: /código de colaborador/i }),
        'E-002',
      );
      await user.click(await within(dialog).findByRole('checkbox', { name: 'Usuario' }));
      await user.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));

      await waitFor(() => expect(callsTo(fetchMock, 'POST', '/users')).toHaveLength(1));
      const body = JSON.parse(String(callsTo(fetchMock, 'POST', '/users')[0]?.body)) as Record<
        string,
        unknown
      >;
      expect(body).toMatchObject({ employeeCode: 'E-002' });
      expect(body).not.toHaveProperty('countryId');
      expect(body).not.toHaveProperty('teamIds');
    }, FORM_FLOW_TIMEOUT_MS);

    it('traduce el conflicto de código de colaborador y avisa del perfil comercial', async () => {
      const user = userEvent.setup();
      signInWith(ADMIN_PERMISSIONS);
      mockApi({
        'GET /roles': () => jsonResponse(page([COMMERCIAL_ROLE])),
        'GET /customers/form-options': () => jsonResponse(FORM_OPTIONS),
        'POST /users': () =>
          errorResponse(409, 'RESOURCE_CONFLICT', [{ field: 'employeeCode', issue: 'duplicated' }]),
      });

      renderWithProviders(<UserFormDialog open user={null} onClose={() => undefined} />);
      const dialog = await screen.findByRole('dialog', { name: 'Nuevo usuario' });
      await fill(user, within(dialog).getByRole('textbox', { name: /correo/i }), 'eva@example.test');
      await fill(user, within(dialog).getByRole('textbox', { name: /^nombre/i }), 'Eva');
      await fill(user, within(dialog).getByRole('textbox', { name: /apellidos/i }), 'Luna');
      await user.click(await within(dialog).findByRole('checkbox', { name: 'Asesor' }));

      expect(
        within(dialog).getByText(/Los roles comerciales exigen código de colaborador y país/),
      ).toBeInTheDocument();

      await fill(
        user,
        within(dialog).getByRole('textbox', { name: /código de colaborador/i }),
        'E-001',
      );
      await user.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));

      expect(
        await within(dialog).findByText('Ya existe un usuario con ese código de colaborador.'),
      ).toBeInTheDocument();
    }, FORM_FLOW_TIMEOUT_MS);

    it('al asignar un rol comercial sin perfil completo muestra CRM_PROFILE_INCOMPLETE', async () => {
      const user = userEvent.setup();
      signInWith(ADMIN_PERMISSIONS);
      mockApi({
        'GET /users': () => jsonResponse(page([PLAIN_USER])),
        'GET /roles': () => jsonResponse(page([ROLE_USUARIO, COMMERCIAL_ROLE])),
        'GET /users/u-2': () => jsonResponse(PLAIN_DETAIL),
        'PUT /users/u-2/roles': () =>
          errorResponse(422, 'CRM_PROFILE_INCOMPLETE', [{ field: 'employeeCode', issue: 'required' }]),
      });

      renderWithProviders(<UsersPage />);
      await user.click(await screen.findByRole('button', { name: 'Ver Bruno Cano' }));
      const dialog = await screen.findByRole('dialog', { name: 'Bruno Cano' });
      await user.click(await within(dialog).findByRole('tab', { name: 'Roles' }));
      await user.click(await within(dialog).findByRole('checkbox', { name: 'Asesor (sistema)' }));
      expect(
        within(dialog).getByText(/Los roles comerciales exigen código de colaborador y país/),
      ).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Guardar roles' }));

      expect(
        await within(dialog).findByText(
          'Para asignar un rol comercial el usuario necesita código de colaborador y país.',
        ),
      ).toBeInTheDocument();
    }, FORM_FLOW_TIMEOUT_MS);

    it('el detalle muestra código de colaborador y país', async () => {
      const user = userEvent.setup();
      signInWith(['usuarios.ver']);
      const detail: UserDetail = { ...PLAIN_DETAIL, employeeCode: 'E-010', country: GUATEMALA };
      mockApi({
        'GET /users': () => jsonResponse(page([PLAIN_USER])),
        'GET /users/u-2': () => jsonResponse(detail),
      });

      renderWithProviders(<UsersPage />);
      await user.click(await screen.findByRole('button', { name: 'Ver Bruno Cano' }));
      const dialog = await screen.findByRole('dialog', { name: 'Bruno Cano' });
      expect(await within(dialog).findByText('Guatemala (GT)')).toBeInTheDocument();
      expect(within(dialog).getByText('E-010')).toBeInTheDocument();
    });

    it('un no administrador edita el código sin enviar el país', async () => {
      const user = userEvent.setup();
      signInWith(GESTOR_PERMISSIONS, GESTOR_ROLES);
      const detail: UserDetail = { ...PLAIN_DETAIL, employeeCode: 'E-010', country: GUATEMALA };
      const fetchMock = mockApi({ 'PATCH /users/u-2': () => jsonResponse(detail) });

      renderWithProviders(<UserFormDialog open user={detail} onClose={() => undefined} />);

      const form = await screen.findByRole('dialog', { name: 'Editar Bruno Cano' });
      expect(within(form).getByRole('combobox', { name: /país/i })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect(within(form).getByRole('combobox', { name: /país/i })).toHaveTextContent(
        'Guatemala (GT)',
      );
      const code = within(form).getByRole('textbox', { name: /código de colaborador/i });
      await user.clear(code);
      await fill(user, code, 'e-011');
      await user.click(within(form).getByRole('button', { name: 'Guardar cambios' }));

      await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/users/u-2')).toHaveLength(1));
      const body = JSON.parse(String(callsTo(fetchMock, 'PATCH', '/users/u-2')[0]?.body)) as Record<
        string,
        unknown
      >;
      expect(body).toMatchObject({ employeeCode: 'E-011' });
      expect(body).not.toHaveProperty('countryId');
    });

    it('PF-07.3: suspender deja al usuario «Inactivo»', async () => {
      const user = userEvent.setup();
      signInWith(ALL_PERMISSIONS);
      let current: UserDetail = { ...PLAIN_DETAIL };
      const fetchMock = mockApi({
        'GET /users': () => jsonResponse(page([PLAIN_USER])),
        'GET /users/u-2': () => jsonResponse(current),
        'POST /users/u-2/suspend': () => {
          current = { ...current, status: 'SUSPENDED' };
          return jsonResponse(current);
        },
      });

      renderWithProviders(<UserDetailDialog userId="u-2" onClose={() => undefined} />);
      const dialog = await screen.findByRole('dialog', { name: 'Bruno Cano' });
      await user.click(await within(dialog).findByRole('button', { name: 'Suspender' }));
      const confirm = await screen.findByRole('dialog', { name: 'Suspender usuario' });
      expect(within(confirm).getByText(/quedará «Inactivo»/)).toBeInTheDocument();
      await fill(
        user,
        within(confirm).getByRole('textbox', { name: /motivo/i }),
        'Baja temporal por licencia',
      );
      await user.click(within(confirm).getByRole('button', { name: 'Suspender' }));

      expect(
        await within(dialog).findByText('Usuario suspendido. Sus sesiones se cerraron.'),
      ).toBeInTheDocument();
      expect(await within(dialog).findByText('Inactivo')).toBeInTheDocument();
      expect(
        JSON.parse(String(callsTo(fetchMock, 'POST', '/users/u-2/suspend')[0]?.body)),
      ).toEqual({ reason: 'Baja temporal por licencia' });
    }, FORM_FLOW_TIMEOUT_MS);

    it('PF-07.3: reactivar devuelve a «Activo» a un usuario «Inactivo»', async () => {
      const user = userEvent.setup();
      signInWith(ALL_PERMISSIONS);
      let current: UserDetail = { ...PLAIN_DETAIL, status: 'SUSPENDED' };
      mockApi({
        'GET /users/u-2': () => jsonResponse(current),
        'POST /users/u-2/reactivate': () => {
          current = { ...current, status: 'ACTIVE' };
          return jsonResponse(current);
        },
      });

      renderWithProviders(<UserDetailDialog userId="u-2" onClose={() => undefined} />);
      const dialog = await screen.findByRole('dialog', { name: 'Bruno Cano' });
      expect(await within(dialog).findByText('Inactivo')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Reactivar' }));
      const reactivate = await screen.findByRole('dialog', { name: 'Reactivar usuario' });
      await fill(
        user,
        within(reactivate).getByRole('textbox', { name: /motivo/i }),
        'Vuelve de su licencia',
      );
      await user.click(within(reactivate).getByRole('button', { name: 'Reactivar' }));

      expect(await within(dialog).findByText('Usuario reactivado.')).toBeInTheDocument();
      expect(await within(dialog).findByText('Activo')).toBeInTheDocument();
    }, FORM_FLOW_TIMEOUT_MS);
  });
});
