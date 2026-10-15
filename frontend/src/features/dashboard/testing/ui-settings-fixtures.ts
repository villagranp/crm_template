import {
  DASHBOARD_BLOCK_KEYS,
  DASHBOARD_KPI_KEYS,
  type DashboardBlockKey,
  type DashboardKpiKey,
  type UiSettings,
} from '@/services/ui-settings';

/** `GET /me/ui-settings` de prueba: todo visible salvo lo indicado, con el orden dado. */
export function uiSettings(
  options: {
    blocks?: readonly DashboardBlockKey[];
    hiddenBlocks?: readonly DashboardBlockKey[];
    kpis?: readonly DashboardKpiKey[];
    hiddenKpis?: readonly DashboardKpiKey[];
    isCustomized?: boolean;
  } = {},
): UiSettings {
  const { blocks = DASHBOARD_BLOCK_KEYS, hiddenBlocks = [], kpis = DASHBOARD_KPI_KEYS } = options;
  const { hiddenKpis = [], isCustomized = false } = options;
  return {
    dashboard: {
      isCustomized,
      blocks: blocks.map((key) => ({ key, visible: !hiddenBlocks.includes(key) })),
      kpis: kpis.map((key) => ({ key, visible: !hiddenKpis.includes(key) })),
    },
    topbar: { search: false, fullscreen: true, notifications: false },
  };
}
