import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '@/hooks/use-auth';
import { queryClient } from '@/services/api/query-client';
import { MY_PREFERENCES_QUERY_KEY, useThemePreferenceSync } from '@/services/preferences/use-theme-preference-sync';
import { UI_SETTINGS_QUERY_KEY, useUiSettings } from '@/services/ui-settings';
import { jsonResponse, mockApi } from '@/test/api-mocks';

import { useAuthStore } from './auth.store';
import { useUiStore } from './ui.store';

/** Imita el shell: sólo existe con sesión, así que se desmonta al cerrarla. */
function Panel() {
  useThemePreferenceSync();
  const { settings } = useUiSettings();
  return <p>{settings.dashboard.isCustomized ? 'panel personalizado' : 'panel por defecto'}</p>;
}

function Shell() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Panel /> : <p>sin sesión</p>;
}

const userOf = (id: string) => ({ id, displayName: id, email: `${id}@example.test`, roles: [], permissions: [] });
const authenticate = (id: string) =>
  useAuthStore.setState({ status: 'authenticated', user: userOf(id), passwordChangeRequired: false, errorMessage: null });

const uiSettings = (isCustomized: boolean) => ({
  dashboard: { isCustomized, blocks: [], kpis: [] },
  topbar: { search: false, fullscreen: false, notifications: false },
});

describe('aislamiento de la caché entre usuarios', () => {
  beforeEach(() => {
    window.localStorage.clear();
    queryClient.clear();
    useUiStore.setState({ themeMode: 'light', manualThemeChanges: 0 });
    useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false, errorMessage: null });
  });

  afterEach(() => {
    useAuthStore.setState({ status: 'anonymous', user: null, signedOutByUser: false });
    queryClient.clear();
    vi.unstubAllGlobals();
  });

  it('A con tema oscuro y panel personalizado cierra sesión y B ve lo suyo, sin recargar', async () => {
    let current: 'A' | 'B' = 'A';
    mockApi({
      'GET /me/preferences': () =>
        jsonResponse({ theme: current === 'A' ? 'dark' : 'light', dashboardCards: null }),
      'GET /me/ui-settings': () => jsonResponse(uiSettings(current === 'A')),
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Shell />
      </QueryClientProvider>,
    );

    act(() => authenticate('user-a'));
    expect(await screen.findByText('panel personalizado')).toBeInTheDocument();
    await waitFor(() => expect(useUiStore.getState().themeMode).toBe('dark'));

    act(() => useAuthStore.setState({ status: 'anonymous', user: null, signedOutByUser: true }));
    expect(screen.getByText('sin sesión')).toBeInTheDocument();
    expect(queryClient.getQueryData(MY_PREFERENCES_QUERY_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(UI_SETTINGS_QUERY_KEY)).toBeUndefined();

    current = 'B';
    act(() => authenticate('user-b'));
    expect(await screen.findByText('panel por defecto')).toBeInTheDocument();
    await waitFor(() => expect(useUiStore.getState().themeMode).toBe('light'));
  });

  it('vacía la caché también cuando otro usuario entra sin pasar por anónimo', () => {
    authenticate('user-a');
    queryClient.setQueryData(['me', 'profile'], { id: 'user-a' });
    queryClient.setQueryData(['dashboard', 'projects'], { total: 1 });

    authenticate('user-b');

    expect(queryClient.getQueryData(['me', 'profile'])).toBeUndefined();
    expect(queryClient.getQueryData(['dashboard', 'projects'])).toBeUndefined();
  });

  it('una sesión caducada (a anónimo sin cierre voluntario) también vacía la caché', () => {
    authenticate('user-a');
    queryClient.setQueryData(['me', 'menu'], [{ id: 'm-1' }]);

    useAuthStore.setState({ status: 'anonymous', user: null });

    expect(queryClient.getQueryData(['me', 'menu'])).toBeUndefined();
  });

  it('renovar la sesión del mismo usuario no toca la caché', () => {
    authenticate('user-a');
    queryClient.setQueryData(['me', 'profile'], { id: 'user-a' });

    authenticate('user-a');
    useAuthStore.setState({ passwordChangeRequired: false });

    expect(queryClient.getQueryData(['me', 'profile'])).toEqual({ id: 'user-a' });
  });
});
