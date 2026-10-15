import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { callsTo, deferred, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';

import { useThemePreferenceSync } from './use-theme-preference-sync';

function Probe() {
  useThemePreferenceSync();
  return null;
}

function renderProbe() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<Probe />, { wrapper });
}

const preferences = (theme: 'light' | 'dark' | null) => ({ theme, dashboardCards: null });
const PUT_THEME = '/me/preferences/theme';

describe('useThemePreferenceSync', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState({ themeMode: 'light', manualThemeChanges: 0 });
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'u-1', displayName: 'P', email: 'p@example.test', roles: [], permissions: [] },
      passwordChangeRequired: false,
      errorMessage: null,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    useAuthStore.setState({ status: 'anonymous', user: null });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('aplica el tema guardado en el servidor y lo escribe en localStorage', async () => {
    const fetchMock = mockApi({ 'GET /me/preferences': () => jsonResponse(preferences('dark')) });
    renderProbe();

    await waitFor(() => expect(useUiStore.getState().themeMode).toBe('dark'));
    expect(window.localStorage.getItem('app-theme')).toBe('dark');
    // Aplicar lo del servidor no es un cambio manual: no se vuelve a guardar.
    expect(callsTo(fetchMock, 'PUT', PUT_THEME)).toHaveLength(0);
    expect(useUiStore.getState().manualThemeChanges).toBe(0);
  });

  it('sin preferencia guardada conserva el tema local', async () => {
    const fetchMock = mockApi({ 'GET /me/preferences': () => jsonResponse(preferences(null)) });
    useUiStore.setState({ themeMode: 'dark' });
    renderProbe();

    await waitFor(() => expect(callsTo(fetchMock, 'GET', '/me/preferences')).toHaveLength(1));
    await act(async () => undefined);
    expect(useUiStore.getState().themeMode).toBe('dark');
  });

  it('no consulta sin sesión', async () => {
    useAuthStore.setState({ status: 'anonymous', user: null });
    const fetchMock = mockApi({});
    renderProbe();

    await act(async () => undefined);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un cambio manual se aplica al instante y lanza PUT con el valor nuevo', async () => {
    const fetchMock = mockApi({
      'GET /me/preferences': () => jsonResponse(preferences(null)),
      'PUT /me/preferences/theme': () => jsonResponse({ theme: 'dark' }),
    });
    renderProbe();

    act(() => useUiStore.getState().toggleThemeMode());

    expect(useUiStore.getState().themeMode).toBe('dark');
    await waitFor(() => expect(callsTo(fetchMock, 'PUT', PUT_THEME)).toHaveLength(1));
    const [call] = callsTo(fetchMock, 'PUT', PUT_THEME);
    expect(JSON.parse(String(call?.body))).toEqual({ value: 'dark' });
  });

  it('si el guardado falla el tema sigue aplicado y el siguiente cambio reintenta', async () => {
    let attempts = 0;
    const fetchMock = mockApi({
      'GET /me/preferences': () => jsonResponse(preferences(null)),
      'PUT /me/preferences/theme': () => {
        attempts += 1;
        return attempts === 1
          ? errorResponse(500, 'INTERNAL_ERROR')
          : jsonResponse({ theme: 'dark' });
      },
    });
    renderProbe();

    act(() => useUiStore.getState().toggleThemeMode()); // dark: el PUT falla
    await waitFor(() => expect(attempts).toBe(1));
    expect(useUiStore.getState().themeMode).toBe('dark');

    act(() => useUiStore.getState().toggleThemeMode()); // light
    await waitFor(() => expect(callsTo(fetchMock, 'PUT', PUT_THEME)).toHaveLength(2));
    expect(useUiStore.getState().themeMode).toBe('light');
  });

  it('la respuesta tardía del GET no pisa un cambio manual previo', async () => {
    const reply = deferred<Response>();
    mockApi({
      'GET /me/preferences': () => reply.promise,
      'PUT /me/preferences/theme': () => jsonResponse({ theme: 'dark' }),
    });
    renderProbe();

    act(() => useUiStore.getState().toggleThemeMode()); // light -> dark antes de que llegue el GET
    await act(async () => {
      reply.resolve(jsonResponse(preferences('light')));
    });

    await waitFor(() => expect(window.localStorage.getItem('app-theme')).toBe('dark'));
    expect(useUiStore.getState().themeMode).toBe('dark');
  });
});
