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
    useAuthStore.setState({
      status: 'anonymous',
      user: null,
      passwordChangeRequired: false,
      errorMessage: null,
    });
  });

  it('muestra el formulario y cómo recuperar el acceso sin flujo de correo', () => {
    renderLogin();

    expect(
      screen.getByRole('heading', { level: 1, name: /bienvenido de nuevo/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /correo electrónico/i })).toBeRequired();
    expect(screen.getByLabelText(/^contraseña/i)).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toHaveAttribute(
      'type',
      'submit',
    );
    expect(
      screen.getByText('¿Olvidaste tu contraseña? Pide al administrador que la restablezca.'),
    ).toBeInTheDocument();
    // Sin flujo de recuperación ni "Recordarme": no se pinta un enlace ni un control sin función.
    expect(screen.queryByRole('link', { name: /olvidaste/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /recordarme/i })).not.toBeInTheDocument();
  });

  it('el panel de marca solo muestra el nombre y el pie dice © año Grupo AG', () => {
    renderLogin();

    // El panel es decorativo (aria-hidden): se busca por texto, no por rol.
    expect(screen.getAllByText('Mi Cliente AG').length).toBeGreaterThan(0);
    expect(screen.queryByText(/un solo acceso para trabajar/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Acceso por roles y permisos')).not.toBeInTheDocument();
    expect(screen.queryByText('Administración centralizada')).not.toBeInTheDocument();
    expect(screen.queryByText('Auditoría de cambios')).not.toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      `© ${new Date().getFullYear()} Grupo AG`,
    );
    // El formulario conserva sus textos funcionales.
    expect(screen.getByText(/introduce tu correo y contraseña/i)).toBeInTheDocument();
  });

  it('permite mostrar y ocultar la contraseña', async () => {
    const user = userEvent.setup();
    renderLogin();

    const password = screen.getByLabelText(/^contraseña/i);
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));

    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El correo o la contraseña no son correctos.',
    );
    expect(screen.getByLabelText(/^contraseña/i)).toHaveValue('');
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it.each([
    [
      403,
      'ACCOUNT_DISABLED',
      'Tu cuenta está deshabilitada. Contacta al administrador del sistema.',
    ],
    [
      429,
      'TOO_MANY_REQUESTS',
      'Demasiados intentos. Espera un minuto antes de volver a intentarlo.',
    ],
    [400, 'VALIDATION_ERROR', 'Revisa el correo y la contraseña.'],
    [500, 'INTERNAL_ERROR', 'No se pudo iniciar sesión. Inténtalo de nuevo más tarde.'],
  ])(
    'traduce la respuesta %i %s a un mensaje accionable',
    async (status, code, expectedMessage) => {
      mockApi({ 'POST /auth/login': () => errorResponse(status, code) });
      renderLogin();

      await submitCredentials('persona@example.test', 'una frase larga de prueba');

      expect(await screen.findByRole('alert')).toHaveTextContent(expectedMessage);
    },
  );

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
    mockApi({
      'POST /auth/login': () => jsonResponse(buildSession({ passwordChangeRequired: true })),
    });
    renderLogin();

    await submitCredentials('persona@example.test', 'contraseña inicial');

    expect(await screen.findByText('Pantalla de cambio de contraseña')).toBeInTheDocument();
    expect(useAuthStore.getState().passwordChangeRequired).toBe(true);
  });
});
