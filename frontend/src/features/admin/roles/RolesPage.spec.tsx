import { screen, waitFor, within } from '@testing-library/react';
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

/** Sesión tipo `gestor-accesos` (ADR-020): tiene roles.editar y opciones.configurar, pero no es administrador. */
const GESTOR_PERMISSIONS = ['usuarios.ver', 'usuarios.editar', 'usuarios.crear', 'roles.ver', 'roles.editar', 'permisos.ver', 'opciones.ver', 'opciones.configurar'];
const GESTOR_ROLES = ['gestor-accesos'];
const ADMIN_ONLY_NOTE = 'La asignación de accesos es exclusiva del administrador (ADR-020).';

function signInWith(permissions: string[], roles: string[] = ['administrador']) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'yo', displayName: 'Persona de Prueba', roles, permissions },
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

  describe('ADR-020: lo que concede un rol es del administrador', () => {
    it('un no administrador no puede crear ni duplicar roles y ve la nota', async () => {
      signInWith([...GESTOR_PERMISSIONS, 'roles.crear', 'roles.eliminar'], GESTOR_ROLES);
      mockApi({ 'GET /roles': () => jsonResponse(page([SYSTEM, role()])) });

      renderWithProviders(<RolesPage />);

      await screen.findByRole('table', { name: 'Roles' });
      expect(screen.getByText(ADMIN_ONLY_NOTE, { exact: false })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Nuevo rol' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Duplicar Supervisor' })).not.toBeInTheDocument();
      // Eliminar sigue gobernado por su permiso normal.
      expect(screen.getByRole('button', { name: 'Eliminar Supervisor' })).toBeInTheDocument();
    });

    it('un no administrador ve la matriz y las opciones en solo lectura; sí edita nombre y descripción', async () => {
      const user = userEvent.setup();
      signInWith(GESTOR_PERMISSIONS, GESTOR_ROLES);
      const own = role();
      const fetchMock = mockApi({
        'GET /roles': () => jsonResponse(page([own])),
        'GET /roles/r-1': () => jsonResponse(own),
        'GET /permissions': () => jsonResponse(PERMISSIONS),
        'GET /menu-options': () => jsonResponse([]),
        'PATCH /roles/r-1': () => jsonResponse(own),
      });

      renderWithProviders(<RolesPage />);
      await user.click(await screen.findByRole('button', { name: 'Ver Supervisor' }));
      const dialog = await screen.findByRole('dialog', { name: 'Supervisor' });

      await user.click(within(dialog).getByRole('tab', { name: 'Permisos' }));
      expect(await within(dialog).findByRole('checkbox', { name: 'usuarios.crear' })).toBeDisabled();
      expect(within(dialog).getByText(ADMIN_ONLY_NOTE)).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Guardar permisos' })).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole('tab', { name: 'Opciones de menú' }));
      expect(await within(dialog).findByText(ADMIN_ONLY_NOTE)).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Guardar opciones' })).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole('tab', { name: 'Datos' }));
      await user.click(within(dialog).getByRole('button', { name: 'Editar' }));
      const form = await screen.findByRole('dialog', { name: 'Editar rol' });
      expect(within(form).getByText('Sólo un administrador puede cambiar el alcance (ADR-020).')).toBeInTheDocument();
      await user.click(within(form).getByRole('button', { name: 'Guardar cambios' }));

      await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/roles/r-1')).toHaveLength(1));
      const [call] = callsTo(fetchMock, 'PATCH', '/roles/r-1');
      const body = JSON.parse(String(call?.body)) as Record<string, unknown>;
      expect(body.name).toBe('Supervisor');
      expect(body).not.toHaveProperty('dataScope');
      expect(body).not.toHaveProperty('isActive');
    });

    it('un administrador sigue pudiendo crear, duplicar y editar lo que concede un rol', async () => {
      const user = userEvent.setup();
      signInWith(ALL_PERMISSIONS);
      const own = role();
      mockApi({
        'GET /roles': () => jsonResponse(page([own])),
        'GET /roles/r-1': () => jsonResponse(own),
        'GET /permissions': () => jsonResponse(PERMISSIONS),
        'GET /menu-options': () => jsonResponse([]),
      });

      renderWithProviders(<RolesPage />);
      await screen.findByRole('table', { name: 'Roles' });
      expect(screen.queryByText(ADMIN_ONLY_NOTE, { exact: false })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Nuevo rol' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Duplicar Supervisor' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Ver Supervisor' }));
      const dialog = await screen.findByRole('dialog', { name: 'Supervisor' });
      await user.click(within(dialog).getByRole('tab', { name: 'Permisos' }));
      expect(await within(dialog).findByRole('checkbox', { name: 'usuarios.crear' })).toBeEnabled();
      expect(within(dialog).getByRole('button', { name: 'Guardar permisos' })).toBeInTheDocument();
      await user.click(within(dialog).getByRole('tab', { name: 'Opciones de menú' }));
      expect(await within(dialog).findByRole('button', { name: 'Guardar opciones' })).toBeInTheDocument();
    });

    it('un 403 ADMIN_ONLY al guardar la matriz muestra su mensaje', async () => {
      const user = userEvent.setup();
      signInWith(ALL_PERMISSIONS);
      const own = role();
      mockApi({
        'GET /roles': () => jsonResponse(page([own])),
        'GET /roles/r-1': () => jsonResponse(own),
        'GET /permissions': () => jsonResponse(PERMISSIONS),
        'PUT /roles/r-1/permissions': () => errorResponse(403, 'ADMIN_ONLY'),
      });

      renderWithProviders(<RolesPage />);
      await user.click(await screen.findByRole('button', { name: 'Ver Supervisor' }));
      const dialog = await screen.findByRole('dialog', { name: 'Supervisor' });
      await user.click(within(dialog).getByRole('tab', { name: 'Permisos' }));
      await user.click(await within(dialog).findByRole('checkbox', { name: 'usuarios.crear' }));
      await user.click(within(dialog).getByRole('button', { name: 'Guardar permisos' }));

      expect(await within(dialog).findByText('Sólo un administrador puede asignar o modificar accesos.')).toBeInTheDocument();
    });
  });
});
