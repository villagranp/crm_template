import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { PasswordChangeGate } from '@/components/layout/PasswordChangeGate';
import { resetAuthProviderForTests, useAuthStore } from '@/stores/auth.store';
import { buildSession, callsTo, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { ChangePasswordPage } from './ChangePasswordPage';

const CURRENT_PASSWORD = 'contraseña inicial';
const NEW_PASSWORD = 'mi frase personal larga';

/** Arranca la sesión real (refresh → store) para que el cliente HTTP lleve el token. */
async function startSession(passwordChangeRequired: boolean, changeHandler?: RouteHandler) {
  const fetchMock = mockApi({
    'POST /auth/refresh': () => jsonResponse(buildSession({ passwordChangeRequired })),
    'POST /auth/logout': () => new Response(null, { status: 204 }),
    ...(changeHandler ? { 'POST /auth/password/change': changeHandler } : {}),
  });
  await act(() => useAuthStore.getState().initialize());
  return fetchMock;
}

function renderChangePassword() {
  return renderWithProviders(
    <Routes>
      <Route path="/cambiar-contrasena" element={<ChangePasswordPage />} />
      <Route
        path="/"
        element={
          <PasswordChangeGate>
            <p>Pantalla de inicio</p>
          </PasswordChangeGate>
        }
      />
    </Routes>,
    { initialEntries: ['/cambiar-contrasena'] },
  );
}

async function fillForm(values: { current: string; next: string; confirmation: string }) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^contraseña actual/i), values.current);
  await user.type(screen.getByLabelText(/^nueva contraseña/i), values.next);
  await user.type(screen.getByLabelText(/^repite la nueva contraseña/i), values.confirmation);
  await user.click(screen.getByRole('button', { name: /guardar contraseña/i }));
}

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    resetAuthProviderForTests();
    useAuthStore.setState({ status: 'initializing', user: null, passwordChangeRequired: false, errorMessage: null });
  });

  it('explica el cambio obligatorio y ofrece cerrar sesión en lugar de cancelar', async () => {
    await startSession(true);
    renderChangePassword();

    expect(screen.getByText('Debes establecer una contraseña personal antes de continuar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /cancelar/i })).not.toBeInTheDocument();
  });

  it('en el cambio voluntario no muestra el aviso y permite cancelar', async () => {
    await startSession(false);
    renderChangePassword();

    expect(screen.queryByText('Debes establecer una contraseña personal antes de continuar')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cancelar/i })).toHaveAttribute('href', '/');
  });

  it('aplica la longitud mínima y exige que la confirmación coincida antes de enviar', async () => {
    const fetchMock = await startSession(true);
    renderChangePassword();

    await fillForm({ current: CURRENT_PASSWORD, next: 'corta', confirmation: 'distinta' });

    expect(await screen.findByText('Usa al menos 12 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/auth/password/change')).toHaveLength(0);
  });

  it('marca la contraseña actual incorrecta sin cerrar la sesión', async () => {
    await startSession(true, () => errorResponse(422, 'INVALID_CURRENT_PASSWORD'));
    renderChangePassword();

    await fillForm({ current: 'no es la actual', next: NEW_PASSWORD, confirmation: NEW_PASSWORD });

    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^contraseña actual/i)).toHaveAttribute('aria-invalid', 'true');
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('muestra los motivos de rechazo de la política que envía el servidor', async () => {
    await startSession(true, () =>
      errorResponse(422, 'PASSWORD_POLICY_VIOLATION', [
        { field: 'newPassword', issue: 'La contraseña es demasiado común.' },
      ]),
    );
    renderChangePassword();

    await fillForm({ current: CURRENT_PASSWORD, next: 'contraseña123', confirmation: 'contraseña123' });

    expect(await screen.findByText('La nueva contraseña no cumple la política de contraseñas.')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('La contraseña es demasiado común.');
    expect(screen.getByLabelText(/^nueva contraseña/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('guarda la contraseña, adopta la sesión nueva y entra a la aplicación', async () => {
    const fetchMock = await startSession(true, () =>
      jsonResponse(buildSession({ accessToken: 'access-token-after-change', passwordChangeRequired: false })),
    );
    renderChangePassword();

    await fillForm({ current: CURRENT_PASSWORD, next: NEW_PASSWORD, confirmation: NEW_PASSWORD });

    expect(await screen.findByText('Pantalla de inicio')).toBeInTheDocument();
    expect(useAuthStore.getState().passwordChangeRequired).toBe(false);
    const [changeCall] = callsTo(fetchMock, 'POST', '/auth/password/change');
    expect(JSON.parse(String(changeCall?.body))).toEqual({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD });
    expect((changeCall?.headers as Headers).get('Authorization')).toBe('Bearer access-token-1');
  });
});

describe('PasswordChangeGate', () => {
  it('lleva cualquier ruta a la pantalla de cambio mientras esté pendiente', () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'user-1', displayName: 'Persona de Prueba', roles: [], permissions: [] },
      passwordChangeRequired: true,
    });

    renderWithProviders(
      <Routes>
        <Route path="/cambiar-contrasena" element={<p>Pantalla de cambio</p>} />
        <Route
          path="/cualquier-ruta"
          element={
            <PasswordChangeGate>
              <p>Pantalla protegida</p>
            </PasswordChangeGate>
          }
        />
      </Routes>,
      { initialEntries: ['/cualquier-ruta'] },
    );

    expect(screen.getByText('Pantalla de cambio')).toBeInTheDocument();
    expect(screen.queryByText('Pantalla protegida')).not.toBeInTheDocument();
  });
});
