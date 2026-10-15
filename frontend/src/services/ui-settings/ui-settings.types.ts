/** Claves cerradas de bloque y de indicador del panel de Inicio (Ajustes 1, RN-AJ1.2). */
export const DASHBOARD_BLOCK_KEYS = [
  'safety-minute',
  'hero',
  'mine',
  'kpis',
  'alerts',
  'activity',
  'access',
] as const;

export const DASHBOARD_KPI_KEYS = [
  'projects-active',
  'opportunities-open',
  'opportunities-won',
  'opportunities-lost',
  'forecast',
  'visits-pending',
  'activities-pending',
  'activities-overdue',
  'targets',
] as const;

export type DashboardBlockKey = (typeof DASHBOARD_BLOCK_KEYS)[number];
export type DashboardKpiKey = (typeof DASHBOARD_KPI_KEYS)[number];

export interface DashboardCardEntry<TKey extends string> {
  key: TKey;
  visible: boolean;
}

/** Composición del panel de Inicio: el orden del arreglo es el orden de pantalla. */
export interface DashboardComposition {
  blocks: DashboardCardEntry<DashboardBlockKey>[];
  kpis: DashboardCardEntry<DashboardKpiKey>[];
}

/** `GET /me/ui-settings`: composición efectiva del usuario y botones de la barra superior. */
export interface UiSettings {
  dashboard: DashboardComposition & {
    /** `true` si viene de la preferencia del usuario (habilita «Restablecer»). */
    isCustomized: boolean;
  };
  topbar: {
    search: boolean;
    fullscreen: boolean;
    notifications: boolean;
  };
}

/**
 * Valores sembrados (RN-AJ1.6, D-AJ1.4): se usan mientras carga la configuración o si falla,
 * para que el panel y la barra superior no parpadeen ni se bloqueen.
 */
export const DEFAULT_UI_SETTINGS: UiSettings = {
  dashboard: {
    isCustomized: false,
    blocks: DASHBOARD_BLOCK_KEYS.map((key) => ({ key, visible: true })),
    kpis: DASHBOARD_KPI_KEYS.map((key) => ({ key, visible: true })),
  },
  topbar: { search: false, fullscreen: true, notifications: false },
};
