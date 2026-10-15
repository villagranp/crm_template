import { httpClient } from '@/services/api';
import type { DashboardComposition } from '@/services/ui-settings';
import type { ThemeMode } from '@/stores/ui.store';

/** `GET /me/preferences`: preferencias propias del usuario; `null` = sin preferencia guardada. */
export interface MyPreferences {
  theme: ThemeMode | null;
  dashboardCards: DashboardComposition | null;
}

export function fetchMyPreferences(): Promise<MyPreferences> {
  return httpClient.get<MyPreferences>('/me/preferences');
}

/** `PUT /me/preferences/theme`: guarda el modo de color del usuario (`light` o `dark`). */
export function saveThemePreference(value: ThemeMode): Promise<{ theme: ThemeMode }> {
  return httpClient.put<{ theme: ThemeMode }>('/me/preferences/theme', { body: { value } });
}
