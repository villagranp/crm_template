import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { resolveDashboardAccess } from '../dashboard.permissions';
import { resetSession, setSessionPermissions } from '../testing/dashboard-fixtures';
import { uiSettings } from '../testing/ui-settings-fixtures';
import { DashboardCustomizeDialog } from './DashboardCustomizeDialog';

afterEach(resetSession);

function accessFor(...permissions: string[]) {
  setSessionPermissions(permissions);
  const granted = new Set(permissions);
  return resolveDashboardAccess((permission) => granted.has(permission));
}

function bodyOf(init: RequestInit) {
  return JSON.parse(String(init.body)) as {
    blocks: { key: string; visible: boolean }[];
    kpis: { key: string; visible: boolean }[];
  };
}

const SAVE = 'PUT /me/preferences/dashboard-cards';
const RESET = 'DELETE /me/preferences/dashboard-cards';
const PREFERENCE_PATH = '/me/preferences/dashboard-cards';

async function openDialog(permissions: string[]) {
  const onClose = vi.fn();
  const access = accessFor(...permissions);
  renderWithProviders(<DashboardCustomizeDialog open onClose={onClose} access={access} />);
  await screen.findByRole('list', { name: 'Bloques' });
  return { onClose };
}

describe('DashboardCustomizeDialog (PF-AJ1.4)', () => {
  it('AC-AJ1.1: sólo lista lo permitido y el minuto de seguridad va sin interruptor, con su nota', async () => {
    mockApi({ 'GET /me/ui-settings': () => jsonResponse(uiSettings()) });
    await openDialog(['forecast.ver', 'metas.ver']);

    const blocks = screen.getByRole('list', { name: 'Bloques' });
    expect(within(blocks).getAllByRole('listitem')).toHaveLength(5);
    expect(within(blocks).queryByText('Alertas y pendientes')).not.toBeInTheDocument();
    expect(within(blocks).getByText('Mensaje institucional: siempre visible')).toBeInTheDocument();
    expect(
      within(blocks).queryByRole('checkbox', { name: 'Visible: Minuto de seguridad' }),
    ).not.toBeInTheDocument();
    expect(within(blocks).getByRole('button', { name: 'Bajar Minuto de seguridad' })).toBeEnabled();
    expect(within(blocks).getByRole('checkbox', { name: 'Visible: Saludo' })).toBeChecked();

    const kpis = screen.getByRole('list', { name: 'Indicadores' });
    expect(within(kpis).getAllByRole('listitem')).toHaveLength(2);
    expect(within(kpis).getByText('Forecast')).toBeInTheDocument();
    expect(within(kpis).queryByText('Proyectos activos')).not.toBeInTheDocument();
  });

  it('AC-AJ1.2: oculta, reordena y guarda la lista COMPLETA conservando las claves sin acceso', async () => {
    const fetchMock = mockApi({
      'GET /me/ui-settings': () => jsonResponse(uiSettings()),
      [SAVE]: (init) => jsonResponse(bodyOf(init)),
    });
    const user = userEvent.setup();
    const { onClose } = await openDialog(['forecast.ver', 'metas.ver']);

    await user.click(screen.getByRole('checkbox', { name: 'Visible: Saludo' }));
    await user.click(screen.getByRole('button', { name: 'Subir Metas y cumplimiento' }));
    expect(screen.getByRole('button', { name: 'Subir Metas y cumplimiento' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bajar Metas y cumplimiento' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [call] = callsTo(fetchMock, 'PUT', PREFERENCE_PATH);
    const body = bodyOf(call as RequestInit);
    const kpiKeys = body.kpis.map((entry) => entry.key);
    expect(body.blocks).toHaveLength(7);
    expect(body.blocks.find((entry) => entry.key === 'hero')?.visible).toBe(false);
    expect(body.blocks.find((entry) => entry.key === 'alerts')).toEqual({
      key: 'alerts',
      visible: true,
    });
    expect(body.kpis).toHaveLength(9);
    expect(kpiKeys.indexOf('targets')).toBeLessThan(kpiKeys.indexOf('forecast'));
    expect(body.kpis.find((entry) => entry.key === 'projects-active')).toEqual({
      key: 'projects-active',
      visible: true,
    });
  });

  it('sin cambios no se puede guardar', async () => {
    mockApi({ 'GET /me/ui-settings': () => jsonResponse(uiSettings()) });
    await openDialog(['forecast.ver']);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('AC-AJ1.7: «Restablecer» pide confirmación y borra la preferencia', async () => {
    const fetchMock = mockApi({
      'GET /me/ui-settings': () => jsonResponse(uiSettings({ isCustomized: true })),
      [RESET]: () => new Response(null, { status: 204 }),
    });
    const user = userEvent.setup();
    const { onClose } = await openDialog(['forecast.ver']);

    await user.click(screen.getByRole('button', { name: 'Restablecer' }));
    expect(callsTo(fetchMock, 'DELETE', PREFERENCE_PATH)).toHaveLength(0);

    const confirm = await screen.findByRole('dialog', { name: 'Restablecer el panel' });
    await user.click(within(confirm).getByRole('button', { name: 'Restablecer' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(callsTo(fetchMock, 'DELETE', PREFERENCE_PATH)).toHaveLength(1);
  });

  it('cancelar la confirmación no restablece nada', async () => {
    const fetchMock = mockApi({
      'GET /me/ui-settings': () => jsonResponse(uiSettings({ isCustomized: true })),
    });
    const user = userEvent.setup();
    await openDialog(['forecast.ver']);

    await user.click(screen.getByRole('button', { name: 'Restablecer' }));
    const confirm = await screen.findByRole('dialog', { name: 'Restablecer el panel' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));

    expect(callsTo(fetchMock, 'DELETE', PREFERENCE_PATH)).toHaveLength(0);
  });

  it('sin personalización no existe «Restablecer»', async () => {
    mockApi({ 'GET /me/ui-settings': () => jsonResponse(uiSettings({ isCustomized: false })) });
    await openDialog(['forecast.ver']);
    expect(screen.queryByRole('button', { name: 'Restablecer' })).not.toBeInTheDocument();
  });

  it('AC-AJ1.4: un 422 INVALID_DASHBOARD_CARDS se muestra con un mensaje útil y no cierra', async () => {
    mockApi({
      'GET /me/ui-settings': () => jsonResponse(uiSettings()),
      [SAVE]: () => errorResponse(422, 'INVALID_DASHBOARD_CARDS', [{ issue: 'unknown_key' }]),
    });
    const user = userEvent.setup();
    const { onClose } = await openDialog(['forecast.ver']);

    await user.click(screen.getByRole('checkbox', { name: 'Visible: Saludo' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/la composición del panel no es válida/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('si la configuración no carga, avisa y no permite guardar', async () => {
    mockApi({ 'GET /me/ui-settings': () => errorResponse(500, 'INTERNAL_ERROR') });
    const access = accessFor('forecast.ver');
    renderWithProviders(<DashboardCustomizeDialog open onClose={vi.fn()} access={access} />);

    expect(await screen.findByText(/no se pudo cargar tu configuración/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });
});
