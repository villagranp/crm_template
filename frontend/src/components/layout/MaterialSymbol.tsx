import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CallOutlinedIcon from '@mui/icons-material/CallOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CurrencyExchangeOutlinedIcon from '@mui/icons-material/CurrencyExchangeOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
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
  // CRM: Reportes (módulo `reportes` y opciones `reportes-dashboard` / `reportes-embudo`, 05 H.3),
  // Integraciones (`upload_file`: carga masiva, 06 §E) y catálogos del CRM
  // (crm-access.ts), que el Panel de control muestra en sus accesos (01 §E.6). Los de Actividad comercial, más abajo.
  bar_chart: BarChartOutlinedIcon,
  insights: InsightsOutlinedIcon,
  filter_alt: FilterAltOutlinedIcon,
  upload_file: UploadFileOutlinedIcon,
  currency_exchange: CurrencyExchangeOutlinedIcon,
  category: CategoryOutlinedIcon,
  swap_horiz: SwapHorizOutlinedIcon,
  chevron_right: ChevronRightIcon,
  // Actividad comercial: módulo `actividad-comercial` y opciones `actividad-*`
  // (backend/prisma/seed/crm-access.ts; `history` ya estaba) e iconos por tipo (04 §L.4).
  event_note: EventNoteOutlinedIcon,
  calendar_month: CalendarMonthOutlinedIcon,
  pending_actions: PendingActionsOutlinedIcon,
  track_changes: TrackChangesOutlinedIcon,
  location_on: LocationOnOutlinedIcon,
  task_alt: TaskAltOutlinedIcon,
  call: CallOutlinedIcon,
  mail: MailOutlinedIcon,
  event_repeat: EventRepeatOutlinedIcon,
  event_busy: EventBusyOutlinedIcon,
  attach_file: AttachFileOutlinedIcon,
  view_list: ViewListOutlinedIcon,
};

export function MaterialSymbol({ name, size = 22 }: MaterialSymbolProps) {
  const Icon = ICON_REGISTRY[name] ?? ChevronRightIcon;

  return <Icon aria-hidden="true" sx={{ fontSize: size }} />;
}
