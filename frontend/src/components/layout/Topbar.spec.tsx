import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_UI_SETTINGS, type UiSettings } from '@/services/ui-settings';
import { useAuthStore } from '@/stores/auth.store';
import { jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { Topbar } from './Topbar';

function settingsWith(topbar: Partial<UiSettings['topbar']>): UiSettings {
  return { ...DEFAULT_UI_SETTINGS, topbar: { ...DEFAULT_UI_SETTINGS.topbar, ...topbar } };
}

function renderTopbar(settings: UiSettings | null) {
  mockApi({
    'GET /me/menu': () => jsonResponse([]),
    'GET /me/ui-settings': () =>
      settings ? jsonResponse(settings) : new Response('{}', { status: 500 }),
  });
  return renderWithProviders(<Topbar />);
}

// `hidden`: el botón sólo se ve desde `lg` por CSS y jsdom lo trata como oculto.
const fullscreenButton = () =>
  screen.queryByRole('button', { name: /pantalla completa/i, hidden: true });
const searchButton = () => screen.queryByRole('button', { name: 'Abrir búsqueda global' });
const notificationsButton = () => screen.queryByRole('button', { name: /^Notificaciones/ });

describe('Topbar según los parámetros de interfaz', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    useAuthStore.setState({
      status: 'authenticated',
      user: {
        id: 'u-1',
        displayName: 'Persona',
        email: 'p@example.test',
        roles: [],
        permissions: [],
      },
      passwordChangeRequired: false,
      errorMessage: null,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'fullscreenEnabled');
    useAuthStore.setState({ status: 'anonymous', user: null });
    vi.unstubAllGlobals();
  });

  it('con los valores sembrados muestra pantalla completa y oculta buscar y notificaciones', async () => {
    renderTopbar(DEFAULT_UI_SETTINGS);

    await waitFor(() => expect(fullscreenButton()).toBeInTheDocument());
    expect(searchButton()).not.toBeInTheDocument();
    expect(notificationsButton()).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Alternar modo claro y oscuro' }),
    ).toBeInTheDocument();
  });

  it('pinta buscar y notificaciones cuando el parámetro está activo', async () => {
    renderTopbar(settingsWith({ search: true, notifications: true }));

    expect(
      await screen.findByRole('button', { name: 'Abrir búsqueda global' }),
    ).toBeInTheDocument();
    expect(notificationsButton()).toBeInTheDocument();
  });

  it('oculta pantalla completa cuando el parámetro está apagado', async () => {
    renderTopbar(settingsWith({ fullscreen: false, search: true }));

    await screen.findByRole('button', { name: 'Abrir búsqueda global' });
    expect(fullscreenButton()).not.toBeInTheDocument();
  });

  it('con el parámetro activo, pantalla completa exige además un navegador compatible', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true });
    renderTopbar(settingsWith({ search: true }));

    await screen.findByRole('button', { name: 'Abrir búsqueda global' });
    expect(fullscreenButton()).not.toBeInTheDocument();
  });

  it('si la configuración falla usa los valores sembrados sin bloquear la barra', async () => {
    renderTopbar(null);

    expect(
      await screen.findByRole('button', { name: 'Alternar modo claro y oscuro' }),
    ).toBeInTheDocument();
    expect(fullscreenButton()).toBeInTheDocument();
    expect(searchButton()).not.toBeInTheDocument();
  });
});
