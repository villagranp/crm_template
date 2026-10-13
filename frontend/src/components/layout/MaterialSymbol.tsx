import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
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
 * Se usa la variante con contorno (`Outlined`), igual que el prototipo
 * (`material-symbols-sharp` con `FILL 0`).
 *
 * El icono es decorativo (`aria-hidden`): la etiqueta accesible la pone siempre
 * el control que lo contiene.
 */
const ICON_REGISTRY: Record<string, SvgIconComponent> = {
  dashboard: DashboardOutlinedIcon,
  settings: SettingsOutlinedIcon,
  manage_accounts: ManageAccountsOutlinedIcon,
  admin_panel_settings: AdminPanelSettingsOutlinedIcon,
  list_alt: ListAltOutlinedIcon,
  groups: GroupsOutlinedIcon,
  inventory_2: Inventory2OutlinedIcon,
  tune: TuneOutlinedIcon,
  fact_check: FactCheckOutlinedIcon,
  history: HistoryOutlinedIcon,
  // CRM: módulo y opción `clientes-buscar` (backend/prisma/seed/crm-access.ts).
  business: BusinessOutlinedIcon,
  // CRM: módulo `proyectos` y sus opciones (`proyectos-equipo` usa `groups`, ya registrado).
  apartment: ApartmentOutlinedIcon,
  handshake: HandshakeOutlinedIcon,
  trending_up: TrendingUpOutlinedIcon,
  // CRM: opción `integraciones-clientes` (carga masiva de clientes, 06 §E).
  upload_file: UploadFileOutlinedIcon,
  chevron_right: ChevronRightIcon,
};

export function MaterialSymbol({ name, size = 22 }: MaterialSymbolProps) {
  const Icon = ICON_REGISTRY[name] ?? ChevronRightIcon;

  return <Icon aria-hidden="true" sx={{ fontSize: size }} />;
}
