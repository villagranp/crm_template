import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import type { ApiError } from '@/services/api/api-error';

import {
  fetchUiSettings,
  resetDashboardComposition,
  saveDashboardComposition,
} from './ui-settings.api';
import {
  DEFAULT_UI_SETTINGS,
  type DashboardComposition,
  type UiSettings,
} from './ui-settings.types';

export const UI_SETTINGS_QUERY_KEY = ['me', 'ui-settings'] as const;

const UI_SETTINGS_STALE_TIME_MS = 5 * 60_000;

/**
 * Configuración de interfaz del usuario autenticado. No se consulta sin sesión. Mientras carga o si
 * falla, `settings` son los valores sembrados: nunca bloquea el panel ni la barra superior.
 */
export function useUiSettings() {
  const { isAuthenticated } = useAuth();

  const query = useQuery<UiSettings, ApiError>({
    queryKey: UI_SETTINGS_QUERY_KEY,
    queryFn: fetchUiSettings,
    enabled: isAuthenticated,
    staleTime: UI_SETTINGS_STALE_TIME_MS,
  });

  return {
    settings: query.data ?? DEFAULT_UI_SETTINGS,
    isLoaded: query.isSuccess,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

function useInvalidateUiSettings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: UI_SETTINGS_QUERY_KEY });
}

export function useSaveDashboardComposition() {
  const invalidate = useInvalidateUiSettings();
  return useMutation({
    mutationFn: (body: DashboardComposition) => saveDashboardComposition(body),
    onSuccess: invalidate,
  });
}

export function useResetDashboardComposition() {
  const invalidate = useInvalidateUiSettings();
  return useMutation({ mutationFn: resetDashboardComposition, onSuccess: invalidate });
}
