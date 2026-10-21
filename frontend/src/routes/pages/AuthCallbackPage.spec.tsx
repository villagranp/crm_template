import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '@/config/env';
import { ApiError } from '@/services/api/api-error';
import { RETURN_PATH_STORAGE_KEY, saveReturnPath } from '@/services/auth';
import { useAuthStore } from '@/stores/auth.store';
import { renderWithProviders } from '@/test/render-with-providers';

import { AuthCallbackPage } from './AuthCallbackPage';

const USER = { id: 'u-1', displayName: 'Persona de Prueba', roles: ['usuario'], permissions: ['clientes.ver'] };

function renderCallback() {
  return renderWithProviders(
    <Routes>
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/" element={<p>Pantalla de inicio</p>} />
      <Route path="/clientes" element={<p>Pantalla de clientes</p>} />
      <Route path="/acceso" element={<p>Pantalla de acceso</p>} />
    </Routes>,
    { initialEntries: ['/auth/callback'] },
  );
}

function setStore(state: Partial<ReturnType<typeof useAuthStore.getState>>) {
  useAuthStore.setState({
    status: 'initializing',
    user: null,
    passwordChangeRequired: false,
    errorMessage: null,
    signInError: null,
    signedOutByUser: false,
    ...state,
  });
}

const previousProvider = env.VITE_AUTH_PROVIDER;
const originalSignIn = useAuthStore.getState().signIn;

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    env.VITE_AUTH_PROVIDER = 'entra';
    sessionStorage.clear();
    setStore({});
  });

  afterEach(() => {
    env.VITE_AUTH_PROVIDER = previousProvider;
    sessionStorage.clear();
    setStore({ status: 'anonymous', signIn: originalSignIn });
  });

  it('mientras MSAL procesa la respuesta muestra «Iniciando sesión…» y no navega', () => {
    renderCallback();

    expect(screen.getByRole('status')).toHaveTextContent('Iniciando sesión…');
    expect(screen.queryByText('Pantalla de inicio')).not.toBeInTheDocument();
  });

  it('al terminar con éxito vuelve a la ruta guardada antes de ir a Microsoft y la olvida', async () => {
    saveReturnPath('/clientes');
    renderCallback();

    act(() => setStore({ status: 'authenticated', user: USER }));

    expect(await screen.findByText('Pantalla de clientes')).toBeInTheDocument();
    expect(sessionStorage.getItem(RETURN_PATH_STORAGE_KEY)).toBeNull();
  });

  it('sin ruta guardada va al inicio', async () => {
    renderCallback();

    act(() => setStore({ status: 'authenticated', user: USER }));

    expect(await screen.findByText('Pantalla de inicio')).toBeInTheDocument();
  });

  it('una ruta externa manipulada en el almacenamiento se ignora y va al inicio', async () => {
    sessionStorage.setItem(RETURN_PATH_STORAGE_KEY, 'https://evil.example/robo');
    renderCallback();

    act(() => setStore({ status: 'authenticated', user: USER }));

    expect(await screen.findByText('Pantalla de inicio')).toBeInTheDocument();
    expect(window.location.hostname).not.toBe('evil.example');
  });

  it('si la sesión ya estaba lista al montar, navega una sola vez', async () => {
    saveReturnPath('/clientes');
    setStore({ status: 'authenticated', user: USER });

    renderCallback();

    expect(await screen.findByText('Pantalla de clientes')).toBeInTheDocument();
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
  ])('si falla con %s muestra el mensaje en español y un enlace a /acceso', (code, message) => {
    setStore({
      status: 'anonymous',
      signInError: new ApiError({ statusCode: 403, code, message: 'texto crudo del backend', details: [] }),
    });

    renderCallback();

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('texto crudo del backend')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al acceso' })).toHaveAttribute('href', '/acceso');
  });

  it('un 401 (cuenta suspendida, bloqueada o eliminada) dice que la cuenta no está habilitada', () => {
    setStore({
      status: 'anonymous',
      signInError: new ApiError({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'La cuenta no está habilitada',
        details: [],
      }),
    });

    renderCallback();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Tu cuenta no está habilitada en esta aplicación. Contacta al administrador.',
    );
  });

  it('«Usar otra cuenta» reinicia el flujo pidiendo a Microsoft que pregunte la cuenta', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    setStore({
      status: 'anonymous',
      signIn,
      signInError: new ApiError({ statusCode: 403, code: 'IDENTITY_NOT_LINKED', message: 'x', details: [] }),
    });
    renderCallback();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Usar otra cuenta' }));

    expect(signIn).toHaveBeenCalledWith(undefined, { selectAccount: true });
  });

  it('un error de MSAL desconocido muestra un mensaje genérico, nunca su texto', () => {
    setStore({ status: 'anonymous', signInError: new Error('AADSTS50011: reply url mismatch') });

    renderCallback();

    expect(screen.getByRole('alert')).toHaveTextContent(/No se pudo iniciar sesión con tu cuenta corporativa/);
    expect(screen.queryByText(/AADSTS/)).not.toBeInTheDocument();
  });

  it('abrir /auth/callback sin respuesta ni sesión también ofrece volver al acceso', () => {
    setStore({ status: 'anonymous' });

    renderCallback();

    expect(screen.getByRole('link', { name: 'Volver al acceso' })).toBeInTheDocument();
  });

  it('con el proveedor local la ruta no tiene sentido y lleva al acceso', () => {
    env.VITE_AUTH_PROVIDER = 'local';
    setStore({ status: 'anonymous' });

    renderCallback();

    expect(screen.getByText('Pantalla de acceso')).toBeInTheDocument();
  });
});
