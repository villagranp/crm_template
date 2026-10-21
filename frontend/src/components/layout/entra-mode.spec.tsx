import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { env } from '@/config/env';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { useAuthStore } from '@/stores/auth.store';
import { jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { PasswordChangeGate } from './PasswordChangeGate';
import { RequireLocalAuth } from './RequireLocalAuth';
import { Topbar } from './Topbar';

/**
 * Con VITE_AUTH_PROVIDER=entra la contraseña la gestiona Microsoft: ningún flujo de contraseña
 * local debe asomar (menú de usuario, guardia de cambio obligatorio, pantalla de cambio).
 */

const previousProvider = env.VITE_AUTH_PROVIDER;

const USER = { id: 'u-1', displayName: 'Persona', email: 'p@example.test', roles: ['usuario'], permissions: [] };

function signedIn(passwordChangeRequired = false) {
  useAuthStore.setState({
    status: 'authenticated',
    user: USER,
    passwordChangeRequired,
    errorMessage: null,
  });
}

describe('flujos de contraseña local según el proveedor', () => {
  beforeEach(() => {
    mockApi({
      'GET /me/menu': () => jsonResponse([]),
      'GET /me/ui-settings': () => new Response('{}', { status: 500 }),
    });
  });

  afterEach(() => {
    env.VITE_AUTH_PROVIDER = previousProvider;
    useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false });
  });

  describe('PasswordChangeGate', () => {
    function renderGate() {
      return renderWithProviders(
        <Routes>
          <Route
            path="/"
            element={
              <PasswordChangeGate>
                <p>Contenido del shell</p>
              </PasswordChangeGate>
            }
          />
          <Route path={ROUTE_PATHS.changePassword} element={<p>Pantalla de cambio de contraseña</p>} />
        </Routes>,
      );
    }

    it('con el proveedor local lleva al cambio obligatorio', () => {
      env.VITE_AUTH_PROVIDER = 'local';
      signedIn(true);

      renderGate();

      expect(screen.getByText('Pantalla de cambio de contraseña')).toBeInTheDocument();
    });

    it('con Entra ID nunca lleva al cambio de contraseña, aunque el estado lo pida', () => {
      env.VITE_AUTH_PROVIDER = 'entra';
      signedIn(true);

      renderGate();

      expect(screen.getByText('Contenido del shell')).toBeInTheDocument();
    });
  });

  describe('RequireLocalAuth', () => {
    function renderGuarded() {
      return renderWithProviders(
        <Routes>
          <Route
            path={ROUTE_PATHS.changePassword}
            element={
              <RequireLocalAuth>
                <p>Formulario de contraseña</p>
              </RequireLocalAuth>
            }
          />
          <Route path="/" element={<p>Pantalla de inicio</p>} />
        </Routes>,
        { initialEntries: [ROUTE_PATHS.changePassword] },
      );
    }

    it('con el proveedor local muestra la pantalla', () => {
      env.VITE_AUTH_PROVIDER = 'local';

      renderGuarded();

      expect(screen.getByText('Formulario de contraseña')).toBeInTheDocument();
    });

    it('con Entra ID la pantalla no existe: vuelve al inicio', () => {
      env.VITE_AUTH_PROVIDER = 'entra';

      renderGuarded();

      expect(screen.getByText('Pantalla de inicio')).toBeInTheDocument();
      expect(screen.queryByText('Formulario de contraseña')).not.toBeInTheDocument();
    });
  });

  describe('menú de usuario', () => {
    async function openUserMenu() {
      const { default: userEvent } = await import('@testing-library/user-event');
      renderWithProviders(<Topbar />);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Menú de usuario' }));
    }

    it('con el proveedor local ofrece «Cambiar contraseña»', async () => {
      env.VITE_AUTH_PROVIDER = 'local';
      signedIn();

      await openUserMenu();

      expect(await screen.findByRole('menuitem', { name: 'Cambiar contraseña' })).toBeInTheDocument();
    });

    it('con Entra ID oculta «Cambiar contraseña» y conserva «Cerrar sesión»', async () => {
      env.VITE_AUTH_PROVIDER = 'entra';
      signedIn();

      await openUserMenu();

      expect(await screen.findByRole('menuitem', { name: 'Cerrar sesión' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Cambiar contraseña' })).not.toBeInTheDocument();
    });
  });
});
