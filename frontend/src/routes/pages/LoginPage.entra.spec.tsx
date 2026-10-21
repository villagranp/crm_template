import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RequireAuth } from '@/components/layout/RequireAuth';
import { env } from '@/config/env';
import { ApiError } from '@/services/api/api-error';
import { readReturnPath, RETURN_PATH_STORAGE_KEY } from '@/services/auth';
import { useAuthStore } from '@/stores/auth.store';
import { lightTheme } from '@/theme';

import { LoginPage } from './LoginPage';

/** LoginPage con VITE_AUTH_PROVIDER=entra: sólo «Continuar», sin credenciales ni contraseña local. */

const previousProvider = env.VITE_AUTH_PROVIDER;
const originalSignIn = useAuthStore.getState().signIn;

function resetStore(state: Partial<ReturnType<typeof useAuthStore.getState>> = {}) {
  useAuthStore.setState({
    status: 'anonymous',
    user: null,
    passwordChangeRequired: false,
    errorMessage: null,
    signInError: null,
    signedOutByUser: false,
    signIn: originalSignIn,
    ...state,
  });
}

function renderApp(initialEntries: Parameters<typeof MemoryRouter>[0]['initialEntries']) {
  return render(
    <ThemeProvider theme={lightTheme}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/acceso" element={<LoginPage />} />
          <Route
            path="/clientes"
            element={
              <RequireAuth>
                <p>Pantalla de clientes</p>
              </RequireAuth>
            }
          />
          <Route path="/" element={<p>Pantalla de inicio</p>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('LoginPage con Entra ID', () => {
  beforeEach(() => {
    env.VITE_AUTH_PROVIDER = 'entra';
    sessionStorage.clear();
    resetStore();
  });

  afterEach(() => {
    env.VITE_AUTH_PROVIDER = previousProvider;
    sessionStorage.clear();
    resetStore();
  });

  it('ofrece sólo «Continuar»: sin correo, contraseña ni recuperación local', () => {
    renderApp(['/acceso']);

    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled();
    expect(screen.queryByLabelText(/correo electrónico/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^contraseña/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /iniciar sesión/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/olvidaste tu contraseña/i)).not.toBeInTheDocument();
    expect(screen.getByText(/cuenta corporativa/i)).toBeInTheDocument();
  });

  it('«Continuar» inicia el flujo sin enviar credenciales', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    resetStore({ signIn });
    renderApp(['/acceso']);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Continuar' }));

    expect(signIn).toHaveBeenCalledOnce();
    // Sin rechazo previo no hay prompt: se reutiliza la sesión de Microsoft (SSO).
    expect(signIn).toHaveBeenCalledWith(undefined, undefined);
  });

  it('tras un rechazo previo «Continuar» pide elegir cuenta, para no recibir siempre la misma', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    resetStore({
      signIn,
      signInError: new ApiError({ statusCode: 403, code: 'IDENTITY_NOT_LINKED', message: 'x', details: [] }),
    });
    renderApp(['/acceso']);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Continuar' }));

    expect(signIn).toHaveBeenCalledWith(undefined, { selectAccount: true });
  });

  it('guarda la ruta pedida ANTES de redirigir a Microsoft', async () => {
    let storedWhenSignInStarted: string | null = 'sin llamar';
    const signIn = vi.fn(() => {
      storedWhenSignInStarted = readReturnPath();
      return Promise.resolve();
    });
    resetStore({ signIn });
    // Acceso directo a una ruta protegida: RequireAuth lleva a /acceso recordando de dónde venía.
    renderApp(['/clientes']);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Continuar' }));

    expect(storedWhenSignInStarted).toBe('/clientes');
  });

  it('sin ruta pedida no deja ninguna ruta de retorno vieja', async () => {
    sessionStorage.setItem(RETURN_PATH_STORAGE_KEY, '/ruta-de-otra-sesion');
    resetStore({ signIn: vi.fn().mockResolvedValue(undefined) });
    renderApp(['/acceso']);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Continuar' }));

    expect(readReturnPath()).toBeNull();
  });

  it('tras un cierre de sesión voluntario no restaura la ruta anterior', async () => {
    sessionStorage.setItem(RETURN_PATH_STORAGE_KEY, '/clientes');
    resetStore({ signedOutByUser: true, signIn: vi.fn().mockResolvedValue(undefined) });
    // RequireAuth no pasa `from` tras un cierre voluntario.
    renderApp(['/clientes']);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Continuar' }));

    expect(readReturnPath()).toBeNull();
  });

  it('una ruta de retorno externa en el estado de navegación no se guarda', async () => {
    resetStore({ signIn: vi.fn().mockResolvedValue(undefined) });
    renderApp([{ pathname: '/acceso', state: { from: '//evil.example/robo' } }]);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Continuar' }));

    expect(readReturnPath()).toBeNull();
  });

  it.each([
    [
      'IDENTITY_NOT_LINKED',
      'Tu cuenta existe pero aún no está vinculada con tu identidad corporativa. Contacta al administrador.',
    ],
    [
      'IDENTITY_INCOMPLETE',
      'Tu identidad corporativa no trae un correo utilizable. Contacta al administrador.',
    ],
    ['SSO_PROVISIONING_DISABLED', 'El alta automática está desactivada. Contacta al administrador.'],
    [
      'IDENTITY_DOMAIN_NOT_ALLOWED',
      'Tu correo no pertenece a un dominio autorizado. Contacta al administrador.',
    ],
  ])('muestra en el formulario el mensaje traducido de %s', (code, message) => {
    resetStore({
      signInError: new ApiError({ statusCode: 403, code, message: 'texto crudo del backend', details: [] }),
    });

    renderApp(['/acceso']);

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('texto crudo del backend')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled();
  });

  it('un fallo del proveedor (estado error) muestra el aviso genérico', () => {
    resetStore({ status: 'error', errorMessage: 'detalle interno de MSAL' });

    renderApp(['/acceso']);

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo iniciar sesión. Contacta al administrador del sistema.');
    expect(screen.queryByText('detalle interno de MSAL')).not.toBeInTheDocument();
  });

  it('con sesión iniciada sale del acceso', () => {
    resetStore({
      status: 'authenticated',
      user: { id: 'u-1', displayName: 'Persona', roles: ['usuario'], permissions: [] },
    });

    renderApp(['/acceso']);

    expect(screen.getByText('Pantalla de inicio')).toBeInTheDocument();
  });
});
