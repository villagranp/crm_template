import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { UserTeamsPanel } from './UserTeamsPanel';

const TEAMS_PAGE = {
  data: [
    { id: 't-1', code: 'norte', name: 'Norte', isActive: true },
    { id: 't-2', code: 'sur', name: 'Sur', isActive: true },
    { id: 't-3', code: 'viejo', name: 'Viejo', isActive: false },
  ],
  pagination: { page: 1, pageSize: 100, totalItems: 3, totalPages: 1 },
};

const USER = { id: 'u-1', teams: [{ id: 't-1', name: 'Norte', isPrimary: true }] };

function signInWith(permissions: string[], roles: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'yo', displayName: 'Persona de Prueba', roles, permissions },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

afterEach(() => {
  useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false, errorMessage: null });
});

describe('UserTeamsPanel', () => {
  it('un administrador añade un equipo, lo marca como principal y guarda con PUT /users/{id}/teams', async () => {
    const user = userEvent.setup();
    signInWith(['equipos.ver', 'equipos.editar'], ['administrador']);
    const fetchMock = mockApi({
      'GET /teams': () => jsonResponse(TEAMS_PAGE),
      'PUT /users/u-1/teams': () =>
        jsonResponse({
          teams: [
            { id: 't-1', name: 'Norte', isPrimary: false },
            { id: 't-2', name: 'Sur', isPrimary: true },
          ],
        }),
    });

    renderWithProviders(<UserTeamsPanel user={USER} />);

    const save = screen.getByRole('button', { name: 'Guardar equipos' });
    expect(save).toBeDisabled();
    await user.click(screen.getByRole('combobox', { name: /añadir equipo/i }));
    // Los equipos inactivos y los ya elegidos no se ofrecen.
    expect(await screen.findByRole('option', { name: 'Sur (sur)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Viejo (viejo)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Norte (norte)' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Sur (sur)' }));
    await user.click(screen.getByRole('radio', { name: 'Sur' }));
    await user.click(save);

    await waitFor(() => expect(callsTo(fetchMock, 'PUT', '/users/u-1/teams')).toHaveLength(1));
    expect(JSON.parse(String(callsTo(fetchMock, 'PUT', '/users/u-1/teams')[0]?.body))).toEqual({
      teams: [
        { teamId: 't-1', isPrimary: false },
        { teamId: 't-2', isPrimary: true },
      ],
    });
    expect(await screen.findByText('Equipos actualizados.')).toBeInTheDocument();
  });

  it('al quitar el principal pasa a serlo el primero que queda; se puede dejar sin equipos', async () => {
    const user = userEvent.setup();
    signInWith(['equipos.ver', 'equipos.editar'], ['administrador']);
    const fetchMock = mockApi({
      'GET /teams': () => jsonResponse(TEAMS_PAGE),
      'PUT /users/u-1/teams': () => jsonResponse({ teams: [] }),
    });
    const twoTeams = {
      id: 'u-1',
      teams: [
        { id: 't-1', name: 'Norte', isPrimary: true },
        { id: 't-2', name: 'Sur', isPrimary: false },
      ],
    };

    renderWithProviders(<UserTeamsPanel user={twoTeams} />);

    await user.click(screen.getByRole('button', { name: 'Quitar Norte' }));
    const list = screen.getByRole('list', { name: 'Equipos del usuario' });
    expect(within(list).getByRole('radio', { name: 'Sur (principal)' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Quitar Sur' }));
    expect(screen.getByText('Sin equipo.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar equipos' }));

    await waitFor(() => expect(callsTo(fetchMock, 'PUT', '/users/u-1/teams')).toHaveLength(1));
    expect(JSON.parse(String(callsTo(fetchMock, 'PUT', '/users/u-1/teams')[0]?.body))).toEqual({ teams: [] });
  });

  it('traduce 403 ADMIN_ONLY', async () => {
    const user = userEvent.setup();
    signInWith(['equipos.ver', 'equipos.editar'], ['administrador']);
    mockApi({
      'GET /teams': () => jsonResponse(TEAMS_PAGE),
      'PUT /users/u-1/teams': () => errorResponse(403, 'ADMIN_ONLY'),
    });

    renderWithProviders(<UserTeamsPanel user={USER} />);
    await user.click(screen.getByRole('button', { name: 'Quitar Norte' }));
    await user.click(screen.getByRole('button', { name: 'Guardar equipos' }));

    expect(
      await screen.findByText('Sólo un administrador puede cambiar los equipos de un usuario.'),
    ).toBeInTheDocument();
  });

  it('un no administrador con equipos.editar sólo ve los equipos, con la explicación', () => {
    signInWith(['equipos.ver', 'equipos.editar'], ['gestor-accesos']);
    const fetchMock = mockApi({});

    renderWithProviders(<UserTeamsPanel user={USER} />);

    expect(screen.getByText('Norte (principal)')).toBeInTheDocument();
    expect(screen.getByText(/Sólo un administrador puede asignar equipos/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar equipos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /añadir equipo/i })).not.toBeInTheDocument();
    expect(callsTo(fetchMock, 'GET', '/teams')).toHaveLength(0);
  });

  it('un administrador sin equipos.editar sólo ve los equipos', () => {
    signInWith(['usuarios.ver'], ['administrador']);
    mockApi({});

    renderWithProviders(<UserTeamsPanel user={{ id: 'u-1', teams: [] }} />);

    expect(screen.getByText('Sin equipo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar equipos' })).not.toBeInTheDocument();
  });
});
