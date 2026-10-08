import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import GroupsIcon from '@mui/icons-material/Groups';
import HistoryIcon from '@mui/icons-material/History';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ListAltIcon from '@mui/icons-material/ListAlt';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import SettingsIcon from '@mui/icons-material/Settings';
import TuneIcon from '@mui/icons-material/Tune';
import type { SvgIconComponent } from '@mui/icons-material';

interface MaterialSymbolProps {
  /** Nombre del icono tal como se guarda en `MenuOption.icon` en la base de datos. */
  name: string;
  size?: number;
}

/**
 * Icono de una opción de menú, resuelto por nombre.
 *
 * Las opciones guardan el nombre del icono como texto en la base de datos, así
 * que hay que resolverlo en tiempo de ejecución. Se hace con un registro
 * explícito en lugar de con la fuente completa de Material Symbols: esa fuente
 * pesa ~3 MB y se descargaría entera para pintar diez iconos. Cada icono de
 * este registro añade en torno a 1 kB al bundle.
 *
 * **Para usar un icono nuevo hay que añadirlo aquí.** Es el precio de no
 * arrastrar 3 MB; un nombre desconocido no rompe nada, cae en el icono por
 * defecto. Los nombres son los de Material Symbols en snake_case, para que la
 * base de datos siga siendo legible y portable.
 *
 * El icono es decorativo (`aria-hidden`): la etiqueta accesible la pone siempre
 * el control que lo contiene.
 */
const ICON_REGISTRY: Record<string, SvgIconComponent> = {
  dashboard: DashboardIcon,
  settings: SettingsIcon,
  manage_accounts: ManageAccountsIcon,
  admin_panel_settings: AdminPanelSettingsIcon,
  list_alt: ListAltIcon,
  groups: GroupsIcon,
  inventory_2: Inventory2Icon,
  tune: TuneIcon,
  fact_check: FactCheckIcon,
  history: HistoryIcon,
  chevron_right: ChevronRightIcon,
};

export function MaterialSymbol({ name, size = 22 }: MaterialSymbolProps) {
  const Icon = ICON_REGISTRY[name] ?? ChevronRightIcon;

  return <Icon aria-hidden="true" sx={{ fontSize: size }} />;
}
