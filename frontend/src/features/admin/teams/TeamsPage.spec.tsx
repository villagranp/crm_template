import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { Team } from './teams.api';
import { TeamsPage } from './TeamsPage';

const ALL_PERMISSIONS = ['equipos.ver', 'equipos.crear', 'equipos.editar', 'equipos.eliminar', 'usuarios.ver'];

const TEAM: Team = {
  id: 'team-1',
  code: 'ventas',
  name: 'Ventas',
  description: null,
  parentId: null,
  parentName: null,
  manager: null,
  isActive: true,
  memberCount: 0,
  childCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function page(data: Team[]) {
  return { data, pagination: { page: 1, pageSize: 20, totalItems: data.length, totalPages: 1 } };
}

function signInWith(permissions: string[], roles: string[] = ['administrador']) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'user-1', displayName: 'Persona de Prueba', roles, permissions },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

/** jsdom no implementa `matchMedia`: pantalla ancha (vista de tabla). */
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
});

describe('TeamsPage', () => {
  it('lista los equipos y muestra las acciones con todos los permisos', async () => {
    signInWith(ALL_PERMISSIONS);
    mockApi({ 'GET /teams': () => jsonResponse(page([TEAM])) });

    renderWithProviders(<TeamsPage />);

    const table = await screen.findByRole('table', { name: 'Equipos' });
    expect(within(table).getByText('Ventas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo equipo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Ventas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Miembros de Ventas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar Ventas' })).toBeInTheDocument();
  });

  it('oculta crear, editar y eliminar sin permisos', async () => {
    signInWith(['equipos.ver']);
    mockApi({ 'GET /teams': () => jsonResponse(page([TEAM])) });

    renderWithProviders(<TeamsPage />);

    await screen.findByRole('table', { name: 'Equipos' });
    expect(screen.queryByRole('button', { name: 'Nuevo equipo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Ventas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar Ventas' })).not.toBeInTheDocument();
  });

  it('valida el formulario y envía el alta', async () => {
    signInWith(ALL_PERMISSIONS);
    const fetchMock = mockApi({
      'GET /teams': () => jsonResponse(page([TEAM])),
      'POST /teams': () => jsonResponse({ ...TEAM, id: 'team-2', code: 'norte', name: 'Norte', members: [] }, 201),
    });
    const user = userEvent.setup();
    // Pegar en vez de teclear: en jsdom cada pulsación re-renderiza el diálogo
    // de MUI y la prueba superaba el límite de tiempo con la suite completa.
    const fill = async (field: HTMLElement, value: string) => {
      await user.click(field);
      await user.paste(value);
    };
    renderWithProviders(<TeamsPage />);

    await user.click(await screen.findByRole('button', { name: 'Nuevo equipo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo equipo' });
    await fill(within(dialog).getByLabelText(/código/i), 'con espacios');
    await user.click(within(dialog).getByRole('button', { name: 'Crear equipo' }));

    expect(await within(dialog).findByText(/sin espacios/i)).toBeInTheDocument();
    expect(within(dialog).getByText('Escribe un nombre.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/teams')).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText(/código/i));
    await fill(within(dialog).getByLabelText(/código/i), 'norte');
    await fill(within(dialog).getByLabelText(/nombre/i), 'Norte');
    await user.click(within(dialog).getByRole('button', { name: 'Crear equipo' }));

    await waitFor(() => expect(callsTo(fetchMock, 'POST', '/teams')).toHaveLength(1));
    expect(JSON.parse(String(callsTo(fetchMock, 'POST', '/teams')[0]?.body))).toEqual({
      code: 'norte',
      name: 'Norte',
      description: null,
      parentId: null,
      managerId: null,
      isActive: true,
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuevo equipo' })).not.toBeInTheDocument());
  });

  it('traduce un código repetido (409) a un mensaje propio', async () => {
    signInWith(ALL_PERMISSIONS);
    mockApi({
      'GET /teams': () => jsonResponse(page([TEAM])),
      'POST /teams': () => errorResponse(409, 'RESOURCE_CONFLICT'),
    });
    const user = userEvent.setup();
    renderWithProviders(<TeamsPage />);

    await user.click(await screen.findByRole('button', { name: 'Nuevo equipo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo equipo' });
    await user.type(within(dialog).getByLabelText(/código/i), 'ventas');
    await user.type(within(dialog).getByLabelText(/nombre/i), 'Ventas');
    await user.click(within(dialog).getByRole('button', { name: 'Crear equipo' }));

    expect(await within(dialog).findByText(/ya existe un equipo con ese código/i)).toBeInTheDocument();
  });

  it('muestra el motivo de HAS_CHILDREN al eliminar', async () => {
    signInWith(ALL_PERMISSIONS);
    mockApi({
      'GET /teams': () => jsonResponse(page([TEAM])),
      'DELETE /teams/team-1': () => errorResponse(409, 'HAS_CHILDREN'),
    });
    const user = userEvent.setup();
    renderWithProviders(<TeamsPage />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar Ventas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar equipo' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialog).findByText(/tiene miembros o subequipos/i)).toBeInTheDocument();
  });

  it('el formulario de edición no permite cambiar el código y traduce TEAM_CYCLE', async () => {
    signInWith(ALL_PERMISSIONS);
    mockApi({
      'GET /teams': () => jsonResponse(page([TEAM])),
      'PATCH /teams/team-1': () => errorResponse(422, 'TEAM_CYCLE'),
    });
    const user = userEvent.setup();
    renderWithProviders(<TeamsPage />);

    await user.click(await screen.findByRole('button', { name: 'Editar Ventas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar equipo Ventas' });
    expect(within(dialog).getByLabelText(/código/i)).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/no puede depender de sí mismo/i);
  });

  it('edita miembros y marca el equipo principal', async () => {
    signInWith(ALL_PERMISSIONS);
    const detail = {
      ...TEAM,
      memberCount: 1,
      members: [{ userId: 'u-1', displayName: 'Ana', email: 'ana@example.test', isPrimary: false }],
    };
    const fetchMock = mockApi({
      'GET /teams': () => jsonResponse(page([TEAM])),
      'GET /teams/team-1': () => jsonResponse(detail),
      'PUT /teams/team-1/members': () => jsonResponse(detail),
    });
    const user = userEvent.setup();
    renderWithProviders(<TeamsPage />);

    await user.click(await screen.findByRole('button', { name: 'Miembros de Ventas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Miembros de Ventas' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'Equipo principal' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar miembros' }));

    await waitFor(() => expect(callsTo(fetchMock, 'PUT', '/teams/team-1/members')).toHaveLength(1));
    expect(JSON.parse(String(callsTo(fetchMock, 'PUT', '/teams/team-1/members')[0]?.body))).toEqual({
      members: [{ userId: 'u-1', isPrimary: true }],
    });
  });

  it('pinta la jerarquía sangrada', async () => {
    signInWith(['equipos.ver']);
    const child = { ...TEAM, id: 'team-2', code: 'norte', name: 'Norte', parentId: 'team-1', parentName: 'Ventas' };
    mockApi({ 'GET /teams': () => jsonResponse(page([TEAM, child])) });
    const user = userEvent.setup();
    renderWithProviders(<TeamsPage />);

    await user.click(await screen.findByRole('button', { name: 'Jerarquía' }));
    const tree = await screen.findByRole('list', { name: 'Jerarquía de equipos' });
    const items = within(tree).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Ventas'),
      expect.stringContaining('Norte'),
    ]);
  });
  describe('07 RN-07.45: miembros, responsable, padre y eliminar con hijos son del administrador', () => {
    const GESTOR = ['gestor-accesos'];
    const POPULATED: Team = {
      ...TEAM,
      id: 'team-2',
      code: 'norte',
      name: 'Norte',
      memberCount: 3,
      parentId: 'team-1',
      parentName: 'Ventas',
      manager: { id: 'u-1', displayName: 'Ana' },
    };

    it('un no administrador no ve Miembros ni Eliminar en equipos con miembros o subequipos', async () => {
      signInWith(ALL_PERMISSIONS, GESTOR);
      mockApi({ 'GET /teams': () => jsonResponse(page([TEAM, POPULATED])) });

      renderWithProviders(<TeamsPage />);

      await screen.findByRole('table', { name: 'Equipos' });
      expect(screen.getByRole('button', { name: 'Editar Norte' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Miembros de Norte' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Miembros de Ventas' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Eliminar Norte' })).not.toBeInTheDocument();
      // Un equipo vacío sí lo puede eliminar con equipos.eliminar.
      expect(screen.getByRole('button', { name: 'Eliminar Ventas' })).toBeInTheDocument();
    });

    it('un administrador ve Miembros y Eliminar también en equipos con miembros', async () => {
      signInWith(ALL_PERMISSIONS);
      mockApi({ 'GET /teams': () => jsonResponse(page([POPULATED])) });

      renderWithProviders(<TeamsPage />);

      await screen.findByRole('table', { name: 'Equipos' });
      expect(screen.getByRole('button', { name: 'Miembros de Norte' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Eliminar Norte' })).toBeInTheDocument();
    });

    it('a un no administrador responsable y padre le aparecen deshabilitados y la edición no los envía', async () => {
      signInWith(ALL_PERMISSIONS, GESTOR);
      const fetchMock = mockApi({
        'GET /teams': () => jsonResponse(page([TEAM, POPULATED])),
        'PATCH /teams/team-2': () => jsonResponse({ ...POPULATED, members: [] }),
      });
      const user = userEvent.setup();
      renderWithProviders(<TeamsPage />);

      await user.click(await screen.findByRole('button', { name: 'Editar Norte' }));
      const dialog = await screen.findByRole('dialog', { name: 'Editar equipo Norte' });
      expect(within(dialog).getByRole('combobox', { name: /equipo padre/i })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect(within(dialog).getByLabelText(/responsable/i)).toBeDisabled();
      expect(
        within(dialog).getAllByText(/Sólo un administrador puede fijar o cambiar el responsable y el equipo padre/),
      ).toHaveLength(2);

      const name = within(dialog).getByLabelText(/nombre/i);
      await user.clear(name);
      await user.click(name);
      await user.paste('Norte y Centro');
      await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

      await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/teams/team-2')).toHaveLength(1));
      expect(JSON.parse(String(callsTo(fetchMock, 'PATCH', '/teams/team-2')[0]?.body))).toEqual({
        name: 'Norte y Centro',
        description: null,
      });
    });

    it('traduce 403 ADMIN_ONLY al eliminar', async () => {
      signInWith(ALL_PERMISSIONS, GESTOR);
      mockApi({
        'GET /teams': () => jsonResponse(page([TEAM])),
        'DELETE /teams/team-1': () => errorResponse(403, 'ADMIN_ONLY'),
      });
      const user = userEvent.setup();
      renderWithProviders(<TeamsPage />);

      await user.click(await screen.findByRole('button', { name: 'Eliminar Ventas' }));
      const dialog = await screen.findByRole('dialog', { name: 'Eliminar equipo' });
      await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

      expect(
        await within(dialog).findByText(
          'Sólo un administrador puede eliminar un equipo con miembros o subequipos (ADR-020).',
        ),
      ).toBeInTheDocument();
    });

    it('traduce 403 ADMIN_ONLY al guardar el formulario', async () => {
      signInWith(ALL_PERMISSIONS, GESTOR);
      mockApi({
        'GET /teams': () => jsonResponse(page([TEAM])),
        'PATCH /teams/team-1': () => errorResponse(403, 'ADMIN_ONLY'),
      });
      const user = userEvent.setup();
      renderWithProviders(<TeamsPage />);

      await user.click(await screen.findByRole('button', { name: 'Editar Ventas' }));
      const dialog = await screen.findByRole('dialog', { name: 'Editar equipo Ventas' });
      await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Sólo un administrador puede fijar o cambiar el responsable o el equipo padre, o activar o desactivar un equipo con miembros o subequipos (ADR-020).',
      );
    });
  });

  describe('D1 (decisión del responsable 2026-10-14): activar o desactivar un equipo con miembros o subequipos es del administrador', () => {
    const GESTOR = ['gestor-accesos'];
    const ACTIVE_NOTE =
      'El equipo tiene miembros o subequipos: sólo un administrador puede activarlo o desactivarlo (ADR-020).';
    const WITH_MEMBERS: Team = { ...TEAM, id: 'team-3', code: 'sur', name: 'Sur', memberCount: 2 };
    const WITH_CHILDREN: Team = { ...TEAM, id: 'team-4', code: 'centro', name: 'Centro', childCount: 1 };

    async function openEditor(team: Team) {
      const user = userEvent.setup();
      renderWithProviders(<TeamsPage />);
      await user.click(await screen.findByRole('button', { name: `Editar ${team.name}` }));
      const dialog = await screen.findByRole('dialog', { name: `Editar equipo ${team.name}` });
      return { user, dialog };
    }

    it.each([
      ['miembros', WITH_MEMBERS],
      ['subequipos', WITH_CHILDREN],
    ])('a un no administrador el interruptor Activo de un equipo con %s le aparece deshabilitado y explicado', async (_label, team) => {
      signInWith(ALL_PERMISSIONS, GESTOR);
      mockApi({ 'GET /teams': () => jsonResponse(page([team])) });

      const { dialog } = await openEditor(team);

      const toggle = within(dialog).getByRole('checkbox', { name: 'Activo' });
      expect(toggle).toBeDisabled();
      expect(toggle).toHaveAccessibleDescription(ACTIVE_NOTE);
    });

    it('un no administrador activa o desactiva un equipo vacío y sólo se envía isActive si cambia', async () => {
      signInWith(ALL_PERMISSIONS, GESTOR);
      const fetchMock = mockApi({
        'GET /teams': () => jsonResponse(page([TEAM])),
        'PATCH /teams/team-1': () => jsonResponse({ ...TEAM, isActive: false, members: [] }),
      });

      const { user, dialog } = await openEditor(TEAM);
      const toggle = within(dialog).getByRole('checkbox', { name: 'Activo' });
      expect(toggle).toBeEnabled();
      expect(within(dialog).queryByText(ACTIVE_NOTE)).not.toBeInTheDocument();

      await user.click(toggle);
      await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

      await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/teams/team-1')).toHaveLength(1));
      expect(JSON.parse(String(callsTo(fetchMock, 'PATCH', '/teams/team-1')[0]?.body))).toEqual({
        name: 'Ventas',
        description: null,
        isActive: false,
      });
    });

    it('un administrador puede desactivar un equipo con miembros', async () => {
      signInWith(ALL_PERMISSIONS);
      const fetchMock = mockApi({
        'GET /teams': () => jsonResponse(page([WITH_MEMBERS])),
        'PATCH /teams/team-3': () => jsonResponse({ ...WITH_MEMBERS, isActive: false, members: [] }),
      });

      const { user, dialog } = await openEditor(WITH_MEMBERS);
      const toggle = within(dialog).getByRole('checkbox', { name: 'Activo' });
      expect(toggle).toBeEnabled();
      expect(within(dialog).queryByText(ACTIVE_NOTE)).not.toBeInTheDocument();

      await user.click(toggle);
      await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

      await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/teams/team-3')).toHaveLength(1));
      expect(JSON.parse(String(callsTo(fetchMock, 'PATCH', '/teams/team-3')[0]?.body))).toMatchObject({
        isActive: false,
      });
    });
  });
});
