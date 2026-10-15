import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { resetSession, setSessionPermissions } from '@/features/dashboard/testing/dashboard-fixtures';
import { uiSettings } from '@/features/dashboard/testing/ui-settings-fixtures';
import { useUiSettings } from '@/services/ui-settings';
import { callsTo, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { useUpdateParameter } from './parameters.queries';

function Probe({ parameterKey }: { parameterKey: string }) {
  useUiSettings();
  const update = useUpdateParameter();
  return (
    <button type="button" onClick={() => update.mutate({ key: parameterKey, value: 'true' })}>
      Guardar
    </button>
  );
}

afterEach(resetSession);

describe('useUpdateParameter e invalidación de ui-settings', () => {
  it('guardar un parámetro ui.* vuelve a pedir GET /me/ui-settings', async () => {
    setSessionPermissions([]);
    const fetchMock = mockApi({
      'GET /me/ui-settings': () => jsonResponse(uiSettings()),
      'GET /parameters': () => jsonResponse({ data: [] }),
      'PATCH /parameters/ui.barra_superior.buscar': () => jsonResponse({}),
    });
    renderWithProviders(<Probe parameterKey="ui.barra_superior.buscar" />);
    await waitFor(() => expect(callsTo(fetchMock, 'GET', '/me/ui-settings')).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(callsTo(fetchMock, 'GET', '/me/ui-settings')).toHaveLength(2));
  });

  it('guardar un parámetro que no es ui.* no toca ui-settings', async () => {
    setSessionPermissions([]);
    const fetchMock = mockApi({
      'GET /me/ui-settings': () => jsonResponse(uiSettings()),
      'PATCH /parameters/crm.alertas.dias': () => jsonResponse({}),
    });
    renderWithProviders(<Probe parameterKey="crm.alertas.dias" />);
    await waitFor(() => expect(callsTo(fetchMock, 'GET', '/me/ui-settings')).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/parameters/crm.alertas.dias')).toHaveLength(1));

    expect(callsTo(fetchMock, 'GET', '/me/ui-settings')).toHaveLength(1);
  });
});
