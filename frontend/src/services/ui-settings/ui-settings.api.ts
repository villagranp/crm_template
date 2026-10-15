import { httpClient } from '@/services/api';

import type { DashboardComposition, UiSettings } from './ui-settings.types';

export function fetchUiSettings(): Promise<UiSettings> {
  return httpClient.get<UiSettings>('/me/ui-settings');
}

/** `PUT /me/preferences/dashboard-cards`: guarda la composición completa del usuario. */
export function saveDashboardComposition(body: DashboardComposition): Promise<DashboardComposition> {
  return httpClient.put<DashboardComposition>('/me/preferences/dashboard-cards', { body });
}

/** `DELETE /me/preferences/dashboard-cards` (`204`): vuelve a la composición por defecto. */
export function resetDashboardComposition(): Promise<void> {
  return httpClient.delete<void>('/me/preferences/dashboard-cards');
}
