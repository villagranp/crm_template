import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PersonIcon from '@mui/icons-material/Person';
import SearchIcon from '@mui/icons-material/Search';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
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
import { Link as RouterLink } from 'react-router-dom';

import { BrandLogo } from '@/components/layout/BrandLogo';
import { useAuth } from '@/hooks/use-auth';
import { useUiStore } from '@/stores/ui.store';
import { layout } from '@/theme/tokens';

interface TopbarProps {
  notificationCount?: number;
}

function initialsOf(displayName: string | undefined): string {
  if (!displayName) {
    return '?';
  }
  return displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/**
 * Barra superior del shell.
 *
 * En móvil el botón de menú abre el cajón lateral; en escritorio alterna el
 * modo minificado del sidebar, igual que el CRM original.
 */
export function Topbar({ notificationCount = 0 }: TopbarProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { user, isAuthenticated, signOut } = useAuth();
  const themeMode = useUiStore((state) => state.themeMode);
  const toggleThemeMode = useUiStore((state) => state.toggleThemeMode);
  const toggleSidebarMini = useUiStore((state) => state.toggleSidebarMini);
  const setSidebarOpenMobile = useUiStore((state) => state.setSidebarOpenMobile);
  const sidebarOpenMobile = useUiStore((state) => state.sidebarOpenMobile);

  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);

  const handleMenuButton = (): void => {
    if (isDesktop) {
      toggleSidebarMini();
      return;
    }
    setSidebarOpenMobile(!sidebarOpenMobile);
  };

  const openUserMenu = (event: MouseEvent<HTMLElement>): void => setUserMenuAnchor(event.currentTarget);
  const closeUserMenu = (): void => setUserMenuAnchor(null);

  const handleSignOut = (): void => {
    closeUserMenu();
    void signOut();
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
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
        sx={{
          minHeight: { xs: `${layout.topbarHeight}px`, lg: `${layout.topbarHeightDesktop}px` },
          gap: 1,
          px: { xs: 1.5, lg: 3 },
        }}
      >
        <IconButton onClick={handleMenuButton} aria-label="Contraer o expandir el menú lateral" edge="start">
          <MenuIcon />
        </IconButton>

        <Box component={RouterLink} to="/" sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
          <BrandLogo />
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title="Buscar">
          <IconButton aria-label="Abrir búsqueda global">
            <SearchIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title={themeMode === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}>
          <IconButton onClick={toggleThemeMode} aria-label="Alternar modo claro y oscuro">
            {themeMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Tooltip>

        <Tooltip title="Notificaciones">
          <IconButton
            aria-label={
              notificationCount > 0 ? `Notificaciones, ${notificationCount} sin leer` : 'Notificaciones, ninguna sin leer'
            }
          >
            {notificationCount > 0 ? (
              <Badge badgeContent={notificationCount} color="error" max={99}>
                <NotificationsIcon />
              </Badge>
            ) : (
              <NotificationsIcon />
            )}
          </IconButton>
        </Tooltip>

        {isAuthenticated ? (
          <>
            <IconButton onClick={openUserMenu} aria-label="Menú de usuario" aria-haspopup="true" sx={{ ml: 0.5 }}>
              <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: '0.8125rem', fontWeight: 600 }}>
                {initialsOf(user?.displayName)}
              </Avatar>
            </IconButton>

            <Menu anchorEl={userMenuAnchor} open={Boolean(userMenuAnchor)} onClose={closeUserMenu}>
              <Box sx={{ px: 2, py: 1.5, minWidth: 220 }}>
                <Typography variant="subtitle1">{user?.displayName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {user?.email}
                </Typography>
              </Box>
              <Divider />
              <MenuItem component={RouterLink} to="/perfil" onClick={closeUserMenu}>
                <ListItemIcon>
                  <PersonIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Mi perfil</ListItemText>
              </MenuItem>
              <MenuItem onClick={handleSignOut}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Cerrar sesión</ListItemText>
              </MenuItem>
            </Menu>
          </>
        ) : null}
      </Toolbar>
    </AppBar>
  );
}
