import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetAuthProviderForTests, useAuthStore } from '@/stores/auth.store';
import { buildSession, callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { LoginPage } from './LoginPage';

function renderLogin() {
  return renderWithProviders(
    <Routes>
      <Route path="/acceso" element={<LoginPage />} />
      <Route path="/" element={<p>Pantalla de inicio</p>} />
      <Route path="/cambiar-contrasena" element={<p>Pantalla de cambio de contraseña</p>} />
    </Routes>,
    { initialEntries: ['/acceso'] },
  );
}

async function submitCredentials(email: string, password: string) {
  const user = userEvent.setup();
  if (email) {
    await user.type(screen.getByLabelText(/correo electrónico/i), email);
  }
  if (password) {
    await user.type(screen.getByLabelText(/^contraseña/i), password);
  }
  await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    resetAuthProviderForTests();
    useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false, errorMessage: null });
  });

  it('muestra el formulario y cómo recuperar el acceso sin flujo de correo', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument();
    expect(screen.getByText('¿Olvidaste tu contraseña? Pide al administrador que la restablezca.')).toBeInTheDocument();
  });

  it('valida los campos antes de llamar a la API', async () => {
    const fetchMock = mockApi({});
    renderLogin();

    await submitCredentials('', '');

    expect(await screen.findByText('Escribe tu correo electrónico.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument();
    expect(screen.getByLabelText(/correo electrónico/i)).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza un correo con formato inválido', async () => {
    const fetchMock = mockApi({});
    renderLogin();

    await submitCredentials('no-es-un-correo', 'cualquier cosa');

    expect(await screen.findByText('Escribe un correo electrónico válido.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('muestra un único mensaje genérico ante credenciales inválidas y vacía la contraseña', async () => {
    mockApi({ 'POST /auth/login': () => errorResponse(401, 'INVALID_CREDENTIALS') });
    renderLogin();

    await submitCredentials('persona@example.test', 'contraseña equivocada');

    expect(await screen.findByRole('alert')).toHaveTextContent('El correo o la contraseña no son correctos.');
    expect(screen.getByLabelText(/^contraseña/i)).toHaveValue('');
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it.each([
    [403, 'ACCOUNT_DISABLED', 'Tu cuenta está deshabilitada. Contacta al administrador del sistema.'],
    [429, 'TOO_MANY_REQUESTS', 'Demasiados intentos. Espera un minuto antes de volver a intentarlo.'],
    [400, 'VALIDATION_ERROR', 'Revisa el correo y la contraseña.'],
    [500, 'INTERNAL_ERROR', 'No se pudo iniciar sesión. Inténtalo de nuevo más tarde.'],
  ])('traduce la respuesta %i %s a un mensaje accionable', async (status, code, expectedMessage) => {
    mockApi({ 'POST /auth/login': () => errorResponse(status, code) });
    renderLogin();

    await submitCredentials('persona@example.test', 'una frase larga de prueba');

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedMessage);
  });

  it('envía las credenciales y entra a la aplicación', async () => {
    const fetchMock = mockApi({ 'POST /auth/login': () => jsonResponse(buildSession()) });
    renderLogin();

    await submitCredentials('persona@example.test', 'una frase larga de prueba');

    expect(await screen.findByText('Pantalla de inicio')).toBeInTheDocument();
    const [loginCall] = callsTo(fetchMock, 'POST', '/auth/login');
    expect(JSON.parse(String(loginCall?.body))).toEqual({
      email: 'persona@example.test',
      password: 'una frase larga de prueba',
    });
  });

  it('lleva al cambio de contraseña si la sesión lo exige', async () => {
    mockApi({ 'POST /auth/login': () => jsonResponse(buildSession({ passwordChangeRequired: true })) });
    renderLogin();

    await submitCredentials('persona@example.test', 'contraseña inicial');

    expect(await screen.findByText('Pantalla de cambio de contraseña')).toBeInTheDocument();
    expect(useAuthStore.getState().passwordChangeRequired).toBe(true);
  });
});
