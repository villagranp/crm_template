import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { AuthenticationSettings } from '../parameters.api';
import { AuthenticationSettingsCard } from './AuthenticationSettingsCard';

const KEYS = [
  'seguridad.intentos_fallidos_maximos',
  'seguridad.minutos_bloqueo',
  'seguridad.dias_caducidad_password',
];

function settings(overrides: Partial<AuthenticationSettings>): AuthenticationSettings {
  return { provider: 'local', localLoginEnabled: true, securityParameterKeys: KEYS, ...overrides };
}

describe('AuthenticationSettingsCard (PF-07.14, AC-07.31)', () => {
  it('muestra el proveedor local en sólo lectura, sin ningún control para cambiarlo', async () => {
    mockApi({ 'GET /parameters/authentication': () => jsonResponse(settings({})) });

    renderWithProviders(
      <AuthenticationSettingsCard>
        <p>Parámetros de inicio de sesión</p>
      </AuthenticationSettingsCard>,
    );

    expect(
      await screen.findByLabelText('Proveedor vigente: Local (usuario y contraseña)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Parámetros de inicio de sesión')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/no aplican/)).not.toBeInTheDocument();
  });

  it('con Microsoft Entra ID avisa de que los parámetros locales no aplican', async () => {
    mockApi({
      'GET /parameters/authentication': () =>
        jsonResponse(settings({ provider: 'entra', localLoginEnabled: false })),
    });

    renderWithProviders(<AuthenticationSettingsCard />);

    expect(
      await screen.findByLabelText('Proveedor vigente: Microsoft Entra ID'),
    ).toBeInTheDocument();
    expect(screen.getByText(/los parámetros de abajo no aplican/)).toBeInTheDocument();
  });

  it('un error se muestra traducido y se puede reintentar', async () => {
    const fetchMock = mockApi({
      'GET /parameters/authentication': () => errorResponse(403, 'PERMISSION_DENIED'),
    });
    const user = userEvent.setup();

    renderWithProviders(<AuthenticationSettingsCard />);

    expect(
      await screen.findByText(/No tienes permiso para realizar esta acción\./),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(callsTo(fetchMock, 'GET', '/parameters/authentication')).toHaveLength(2);
  });
});
