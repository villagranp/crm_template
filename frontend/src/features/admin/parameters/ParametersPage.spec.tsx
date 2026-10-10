import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { ParameterGroup, SystemParameter } from './parameters.api';
import { ParametersPage } from './ParametersPage';

function parameter(overrides: Partial<SystemParameter>): SystemParameter {
  return {
    key: 'app.nombre',
    value: 'Aplicación',
    type: 'STRING',
    group: 'general',
    name: 'Nombre de la aplicación',
    description: null,
    isPublic: true,
    isSystem: true,
    requiresConfigurePermission: false,
    updatedAt: '2026-10-08T10:00:00.000Z',
    ...overrides,
  };
}

const LOCKOUT = parameter({
  key: 'seguridad.minutos_bloqueo',
  value: '15',
  type: 'NUMBER',
  group: 'seguridad',
  name: 'Minutos de bloqueo',
  isPublic: false,
  requiresConfigurePermission: true,
});

const GROUPS: ParameterGroup[] = [
  { group: 'general', parameters: [parameter({})] },
  { group: 'seguridad', parameters: [LOCKOUT] },
];

function signInWith(permissions: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'user-1', displayName: 'Persona de Prueba', roles: ['ADMIN'], permissions },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

afterEach(() => {
  useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false, errorMessage: null });
});

describe('ParametersPage', () => {
  it('muestra los parámetros agrupados, en sólo lectura sin parametros.editar', async () => {
    signInWith(['parametros.ver']);
    mockApi({ 'GET /parameters': () => jsonResponse({ data: GROUPS }) });

    renderWithProviders(<ParametersPage />);

    const security = await screen.findByRole('region', { name: 'Seguridad' });
    expect(within(security).getByText('Minutos de bloqueo')).toBeInTheDocument();
    expect(within(security).getByLabelText('Valor de Minutos de bloqueo')).toHaveTextContent('15');
    expect(screen.getByRole('region', { name: 'General' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
  });

  it('con parametros.editar sin parametros.configurar, los de seguridad quedan bloqueados', async () => {
    signInWith(['parametros.ver', 'parametros.editar']);
    mockApi({ 'GET /parameters': () => jsonResponse({ data: GROUPS }) });

    renderWithProviders(<ParametersPage />);

    expect(await screen.findByRole('button', { name: 'Editar Nombre de la aplicación' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Minutos de bloqueo' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Sólo lectura: requiere permiso de configuración')).toBeInTheDocument();
  });

  it('valida el rango en el cliente y guarda un valor válido', async () => {
    signInWith(['parametros.ver', 'parametros.editar', 'parametros.configurar']);
    const fetchMock = mockApi({
      'GET /parameters': () => jsonResponse({ data: GROUPS }),
      'PATCH /parameters/seguridad.minutos_bloqueo': () => jsonResponse({ ...LOCKOUT, value: '30' }),
    });
    const user = userEvent.setup();

    renderWithProviders(<ParametersPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar Minutos de bloqueo' }));

    const dialog = screen.getByRole('dialog', { name: 'Editar «Minutos de bloqueo»' });
    const input = within(dialog).getByLabelText('Valor');
    await user.clear(input);
    await user.type(input, '0');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await within(dialog).findByText('Debe estar entre 1 y 1440.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'PATCH', '/parameters/seguridad.minutos_bloqueo')).toHaveLength(0);

    await user.clear(input);
    await user.type(input, '30');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [patch] = callsTo(fetchMock, 'PATCH', '/parameters/seguridad.minutos_bloqueo');
    expect(JSON.parse(String(patch?.body))).toEqual({ value: '30' });
  });

  it('muestra el 422 del servidor con su motivo', async () => {
    signInWith(['parametros.ver', 'parametros.editar']);
    mockApi({
      'GET /parameters': () => jsonResponse({ data: GROUPS }),
      'PATCH /parameters/app.nombre': () =>
        errorResponse(422, 'INVALID_PARAMETER_VALUE', [{ field: 'value', issue: 'Debe tener entre 1 y 1000 caracteres' }]),
    });
    const user = userEvent.setup();

    renderWithProviders(<ParametersPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar Nombre de la aplicación' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Valor'), ' nuevo');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(
      await within(dialog).findByText(/El valor no es válido para el tipo de este parámetro\. Debe tener entre 1 y 1000 caracteres/),
    ).toBeInTheDocument();
  });

  it('un error de carga se puede reintentar', async () => {
    signInWith(['parametros.ver']);
    mockApi({ 'GET /parameters': () => errorResponse(403, 'PERMISSION_DENIED') });

    renderWithProviders(<ParametersPage />);

    expect(await screen.findByText('No tienes permiso para realizar esta acción.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
