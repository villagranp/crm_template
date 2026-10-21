import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/components/layout/AppShell';
import { DEFAULT_UI_SETTINGS } from '@/services/ui-settings';
import { useAuthStore } from '@/stores/auth.store';
import { jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { HomePage } from './HomePage';

/**
 * ADR-027: quien entra por primera vez con Entra ID se crea sin roles. Su inicio no es un panel
 * roto ni un «Sin acceso» genérico: explica qué pasa y ofrece cerrar sesión.
 */

const PENDING_MESSAGE =
  'Tu cuenta fue creada. El administrador debe asignarte un rol para que puedas trabajar. Avísale.';
const originalSignOut = useAuthStore.getState().signOut;

function signInAs(roles: string[], permissions: string[], signOut = originalSignOut) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u-1', displayName: 'Nora Nueva', email: 'nora@example.test', roles, permissions },
    passwordChangeRequired: false,
    errorMessage: null,
    signOut,
  });
}

afterEach(() => {
  useAuthStore.setState({
    status: 'anonymous',
    user: null,
    passwordChangeRequired: false,
    errorMessage: null,
    signOut: originalSignOut,
  });
});

describe('HomePage: acceso pendiente', () => {
  it('sin roles ni permisos explica el estado y no pide nada al servidor', () => {
    const fetchMock = mockApi({});
    signInAs([], []);

    renderWithProviders(<HomePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Acceso pendiente' })).toBeInTheDocument();
    expect(screen.getByText(PENDING_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    // Un solo «Acceso pendiente»: un lector de pantalla no debe anunciarlo dos veces.
    expect(screen.getAllByText('Acceso pendiente')).toHaveLength(1);
    // Nada del panel: ni consultas de KPIs, alertas o minuto de seguridad, ni errores.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Panel de control')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Personalizar panel' })).not.toBeInTheDocument();
  });

  it('ofrece cerrar sesión', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    signInAs([], [], signOut);
    renderWithProviders(<HomePage />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(signOut).toHaveBeenCalledOnce();
  });

  it('ofrece volver a comprobar para cuando el administrador avise', () => {
    signInAs([], []);

    renderWithProviders(<HomePage />);

    expect(screen.getByRole('button', { name: 'Volver a comprobar' })).toBeEnabled();
  });

  it('con un rol deja de estar pendiente y muestra el panel de control', () => {
    mockApi({});
    signInAs(['usuario'], []);

    renderWithProviders(<HomePage />);

    expect(screen.getByRole('heading', { level: 1, name: /panel de control/i })).toBeInTheDocument();
    expect(screen.queryByText('Acceso pendiente')).not.toBeInTheDocument();
  });

  it('con un permiso directo, aunque no tenga roles, tampoco está pendiente', () => {
    mockApi({});
    signInAs([], ['clientes.ver']);

    renderWithProviders(<HomePage />);

    expect(screen.queryByText('Acceso pendiente')).not.toBeInTheDocument();
  });

  it('dentro del shell el menú vacío no produce errores', async () => {
    mockApi({
      'GET /me/menu': () => jsonResponse([]),
      'GET /me/ui-settings': () => jsonResponse(DEFAULT_UI_SETTINGS),
    });
    signInAs([], []);

    renderWithProviders(
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<HomePage />} />
        </Route>
      </Routes>,
    );

    expect(await screen.findByText(PENDING_MESSAGE)).toBeInTheDocument();
    expect(await screen.findAllByText(/no hay opciones asignadas a tu usuario todavía/i)).not.toHaveLength(0);
    expect(screen.queryByText(/no se pudo cargar el menú/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
