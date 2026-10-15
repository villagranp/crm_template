import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/hooks/use-auth';
import type { ApiError } from '@/services/api/api-error';
import { useUiStore } from '@/stores/ui.store';

import { fetchMyPreferences, saveThemePreference, type MyPreferences } from './preferences.api';

export const MY_PREFERENCES_QUERY_KEY = ['me', 'preferences'] as const;

/**
 * Tema por usuario (Ajustes 1, RN-AJ1.17). Se monta en el shell autenticado.
 *
 * - Al cargar la sesión lee `GET /me/preferences`; si trae `theme`, lo aplica y lo escribe en
 *   `localStorage` (así la pantalla de acceso arranca con el mismo tema). Sin preferencia guardada
 *   no toca nada: sigue valiendo `localStorage` y, si no hay, `prefers-color-scheme`.
 * - Si el usuario cambió el tema con el botón antes de que llegue la respuesta, esa respuesta se
 *   descarta: el cambio manual es más reciente que lo guardado.
 * - Cada cambio manual lanza `PUT /me/preferences/theme` sin bloquear. Si falla, el tema queda
 *   aplicado en local, sólo se avisa en la consola de desarrollo y el siguiente cambio reintenta.
 */
export function useThemePreferenceSync(): void {
  const { isAuthenticated } = useAuth();
  const manualThemeChanges = useUiStore((state) => state.manualThemeChanges);
  const setThemeMode = useUiStore((state) => state.setThemeMode);

  // Cambios manuales al montar (referencia para descartar la respuesta tardía) y ya enviados.
  const changesAtMount = useRef(manualThemeChanges);
  const handledChanges = useRef(manualThemeChanges);
  const serverThemeApplied = useRef(false);
  const lastSave = useRef<Promise<unknown>>(Promise.resolve());

  const preferences = useQuery<MyPreferences, ApiError>({
    queryKey: MY_PREFERENCES_QUERY_KEY,
    queryFn: fetchMyPreferences,
    enabled: isAuthenticated,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // Aplicar la preferencia del servidor, una sola vez por montaje y sólo si no hubo cambio manual.
  useEffect(() => {
    if (!preferences.data || serverThemeApplied.current) {
      return;
    }
    serverThemeApplied.current = true;
    const manualChangeHappened = useUiStore.getState().manualThemeChanges !== changesAtMount.current;
    if (preferences.data.theme && !manualChangeHappened) {
      setThemeMode(preferences.data.theme);
    }
  }, [preferences.data, setThemeMode]);

  // Guardar cada cambio manual, en orden y sin bloquear la interfaz.
  useEffect(() => {
    if (manualThemeChanges === handledChanges.current) {
      return;
    }
    handledChanges.current = manualThemeChanges;
    if (!isAuthenticated) {
      return;
    }
    const value = useUiStore.getState().themeMode;
    lastSave.current = lastSave.current.then(() =>
      saveThemePreference(value).catch((error: unknown) => {
        if (import.meta.env.DEV) {
          console.warn('No se pudo guardar el tema del usuario; se reintentará en el siguiente cambio.', error);
        }
      }),
    );
  }, [manualThemeChanges, isAuthenticated]);
}
