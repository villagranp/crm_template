import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import SearchIcon from '@mui/icons-material/Search';
import {
  AppBar,
  Badge,
  Box,
  ButtonBase,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useState, type MouseEvent } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';

import { BrandLogo } from '@/components/layout/BrandLogo';
import { activeModuleKey, firstNavigablePath } from '@/components/layout/menu-navigation';
import { useFullscreen } from '@/components/layout/use-fullscreen';
import { UserAvatar } from '@/components/layout/UserAvatar';
import { env } from '@/config/env';
import { useAuth } from '@/hooks/use-auth';
import { useMenu } from '@/hooks/use-menu';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { useUiStore } from '@/stores/ui.store';
import { brandIdentity, duration, easing, fontSizes, layout } from '@/theme/tokens';

interface TopbarProps {
  notificationCount?: number;
}

/** Botón de icono del topbar (`.icon-btn`): gris apagado que se aviva al pasar. */
const topbarIconSx = {
  color: 'text.secondary',
  borderRadius: `${layout.radiusIcon}px`,
  '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
} as const;

/**
 * Píldoras de módulo (≥ lg). Salen de `GET /me/menu`: un módulo por píldora,
 * que lleva a la primera opción navegable del módulo. La activa es la del
 * módulo que contiene la ruta actual.
 */
function ModuleNav() {
  const { data } = useMenu();
  const { pathname } = useLocation();
  const modules = (data ?? [])
    .map((module) => ({ module, path: firstNavigablePath(module.options) }))
    .filter(
      (entry): entry is { module: (typeof entry)['module']; path: string } => entry.path !== null,
    );

  if (modules.length === 0) {
    return null;
  }

  const activeKey = activeModuleKey(data ?? [], pathname);

  return (
    <Box
      component="nav"
      aria-label="Módulos"
      sx={{
        display: { xs: 'none', lg: 'flex' },
        alignItems: 'center',
        gap: 0.5,
        ml: 1,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {modules.map(({ module, path }) => {
        const isActive = module.key === activeKey;
        return (
          <ButtonBase
            key={module.key}
            component={RouterLink}
            to={path}
            aria-current={isActive ? 'true' : undefined}
            sx={{
              px: 1.5,
              minHeight: layout.pillHeight,
              borderRadius: `${layout.radiusSm}px`,
              fontSize: fontSizes.topnav,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              color: isActive ? 'primary.contrastText' : 'text.secondary',
              bgcolor: isActive ? 'primary.main' : 'transparent',
              transition: `background-color ${duration.hover}ms ease, color ${duration.hover}ms ease`,
              '&:hover': isActive ? {} : { bgcolor: 'action.hover', color: 'text.primary' },
            }}
          >
            {module.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  const open = (event: MouseEvent<HTMLElement>): void => setAnchor(event.currentTarget);
  const close = (): void => setAnchor(null);
  const handleSignOut = (): void => {
    close();
    void signOut();
  };

  return (
    <>
      <IconButton
        onClick={open}
        aria-label="Menú de usuario"
        aria-haspopup="true"
        aria-expanded={anchor ? 'true' : undefined}
        sx={{
          ml: 0.5,
          p: 0,
          borderRadius: '50%',
          width: layout.avatarSize,
          height: layout.avatarSize,
        }}
      >
        <UserAvatar displayName={user?.displayName} />
      </IconButton>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        <Box sx={{ px: 2, py: 1.5, minWidth: 220 }}>
          <Typography variant="subtitle1">{user?.displayName}</Typography>
          <Typography variant="caption" color="text.secondary">
            {user?.email}
          </Typography>
        </Box>
        <Divider />
        {/* Sólo con credencial local: con Entra ID la contraseña se cambia en Microsoft. */}
        {env.VITE_AUTH_PROVIDER === 'local' ? (
          <MenuItem component={RouterLink} to={ROUTE_PATHS.changePassword} onClick={close}>
            <ListItemIcon>
              <KeyOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Cambiar contraseña</ListItemText>
          </MenuItem>
        ) : null}
        <MenuItem onClick={handleSignOut}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Cerrar sesión</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

/**
 * Barra superior del shell (`.topbar` del prototipo).
 *
 * Desde `md` el bloque del logo mide lo mismo que el sidebar (268 px, o 76 px
 * minificado con la marca cuadrada) para que el logo quede alineado con los
 * iconos del menú. Desde `lg` aparecen las píldoras de módulo y el botón de
 * pantalla completa. En móvil el botón de menú abre el cajón lateral; en
 * escritorio alterna el modo minificado.
 *
 * Sólo se pintan controles con función real (decisión del responsable,
 * 2026-10-09): sin idioma, aplicaciones, mensajes ni contadores ficticios.
 */
export function Topbar({ notificationCount = 0 }: TopbarProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { isAuthenticated } = useAuth();
  const themeMode = useUiStore((state) => state.themeMode);
  const toggleThemeMode = useUiStore((state) => state.toggleThemeMode);
  const sidebarMini = useUiStore((state) => state.sidebarMini);
  const toggleSidebarMini = useUiStore((state) => state.toggleSidebarMini);
  const setSidebarOpenMobile = useUiStore((state) => state.setSidebarOpenMobile);
  const sidebarOpenMobile = useUiStore((state) => state.sidebarOpenMobile);
  const fullscreen = useFullscreen();

  const mini = isDesktop && sidebarMini;

  const handleMenuButton = (): void => {
    if (isDesktop) {
      toggleSidebarMini();
      return;
    }
    setSidebarOpenMobile(!sidebarOpenMobile);
  };

  return (
    <AppBar
      position="sticky"
      sx={{
        top: 0,
        backgroundColor: 'background.paper',
        color: 'text.primary',
        borderBottom: 1,
        borderColor: 'divider',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <Toolbar
        disableGutters
        sx={{
          minHeight: { xs: `${layout.topbarHeight}px`, md: `${layout.topbarHeightDesktop}px` },
          gap: 0.25,
          pl: (t) => ({ xs: `calc(${t.spacing(1)} + env(safe-area-inset-left, 0px))`, md: 0 }),
          pr: (t) => ({ xs: `calc(${t.spacing(1)} + env(safe-area-inset-right, 0px))`, lg: 2 }),
        }}
      >
        {/* Bloque de marca: en escritorio ocupa exactamente el carril del sidebar. */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            width: { md: mini ? layout.sidebarWidthMini : layout.sidebarWidthDesktop },
            justifyContent: { md: mini ? 'center' : 'flex-start' },
            pl: { xs: 0.5, md: mini ? 0 : 2.75 },
            pr: { xs: 0.5, md: 0 },
            transition: `width ${duration.drawer}ms ${easing.inOut}`,
          }}
        >
          <Box
            component={RouterLink}
            to={ROUTE_PATHS.home}
            aria-label={`${brandIdentity.productName}: ir al inicio`}
            sx={{ display: 'flex', alignItems: 'center', borderRadius: `${layout.radiusSm}px` }}
          >
            {mini ? <BrandLogo variant="mark" /> : <BrandLogo height={layout.topbarLogoHeight} />}
          </Box>
        </Box>

        <IconButton
          onClick={handleMenuButton}
          aria-label="Contraer o expandir el menú lateral"
          sx={topbarIconSx}
        >
          <MenuIcon />
        </IconButton>

        {isAuthenticated ? <ModuleNav /> : null}

        <Box sx={{ flexGrow: 1 }} />

        {fullscreen.supported ? (
          <Tooltip title={fullscreen.active ? 'Salir de pantalla completa' : 'Pantalla completa'}>
            <IconButton
              onClick={fullscreen.toggle}
              aria-label={fullscreen.active ? 'Salir de pantalla completa' : 'Pantalla completa'}
              aria-pressed={fullscreen.active}
              sx={{ ...topbarIconSx, display: { xs: 'none', lg: 'inline-flex' } }}
            >
              {fullscreen.active ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Tooltip>
        ) : null}

        <Tooltip title={themeMode === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}>
          <IconButton
            onClick={toggleThemeMode}
            aria-label="Alternar modo claro y oscuro"
            sx={topbarIconSx}
          >
            {themeMode === 'dark' ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
          </IconButton>
        </Tooltip>

        <Tooltip title="Buscar">
          <IconButton aria-label="Abrir búsqueda global" sx={topbarIconSx}>
            <SearchIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Notificaciones">
          <IconButton
            aria-label={
              notificationCount > 0
                ? `Notificaciones, ${notificationCount} sin leer`
                : 'Notificaciones, ninguna sin leer'
            }
            sx={topbarIconSx}
          >
            {/* Sin notificaciones no se pinta el globo: un "0" en rojo llama la
                atención para decir que no pasa nada. */}
            {notificationCount > 0 ? (
              <Badge badgeContent={notificationCount} color="error" max={99}>
                <NotificationsNoneOutlinedIcon />
              </Badge>
            ) : (
              <NotificationsNoneOutlinedIcon />
            )}
          </IconButton>
        </Tooltip>

        {isAuthenticated ? <UserMenu /> : null}
      </Toolbar>
    </AppBar>
  );
}
