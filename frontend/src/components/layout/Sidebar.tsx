import { Box, Drawer, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';

import { SidebarNav } from '@/components/layout/SidebarNav';
import { UserAvatar } from '@/components/layout/UserAvatar';
import { useAuth } from '@/hooks/use-auth';
import { useUiStore } from '@/stores/ui.store';
import { duration, easing, fontSizes, layout } from '@/theme/tokens';

/**
 * Tarjeta del usuario fija al pie del menú (`.sidebar-footer`). Es informativa:
 * las acciones de cuenta viven en el menú del avatar del topbar.
 */
function SidebarUserCard({ mini }: { mini: boolean }) {
  const { user } = useAuth();
  if (!user) {
    return null;
  }

  const card = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: mini ? 'center' : 'flex-start',
        gap: 1.25,
        px: mini ? 0 : 1.5,
        pt: 1.5,
        pb: (t) => `calc(${t.spacing(1.5)} + env(safe-area-inset-bottom, 0px))`,
        borderTop: 1,
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      <UserAvatar displayName={user.displayName} size={layout.avatarSizeSm} />
      {mini ? null : (
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: fontSizes.subnav, fontWeight: 600, lineHeight: 1.25 }}>
            {user.displayName}
          </Typography>
          <Typography noWrap sx={{ fontSize: fontSizes.caption, color: 'text.secondary' }}>
            {user.email}
          </Typography>
        </Box>
      )}
    </Box>
  );

  return mini ? (
    <Tooltip title={user.displayName} placement="right">
      {card}
    </Tooltip>
  ) : (
    card
  );
}

function SidebarContent({ mini, onNavigate }: { mini: boolean; onNavigate?: () => void }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          px: 1.25,
          pt: 0.5,
          pb: 3,
          // En minificado la barra de scroll robaría ancho al carril de 76 px.
          ...(mini ? { scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } } : {}),
        }}
      >
        <SidebarNav mini={mini} onNavigate={onNavigate} />
      </Box>
      <SidebarUserCard mini={mini} />
    </Box>
  );
}

/**
 * Contenedor del menú lateral con los tres estados del prototipo:
 * - móvil: cajón fuera de lienzo con velo
 * - escritorio (≥ md): columna fija de 268 px, pegajosa bajo el topbar
 * - escritorio minificado: sólo iconos, 76 px (preferencia persistida en
 *   `localStorage` por `ui.store`)
 */
export function Sidebar() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const mini = useUiStore((state) => state.sidebarMini);
  const openMobile = useUiStore((state) => state.sidebarOpenMobile);
  const setSidebarOpenMobile = useUiStore((state) => state.setSidebarOpenMobile);

  if (!isDesktop) {
    return (
      <Drawer
        open={openMobile}
        onClose={() => setSidebarOpenMobile(false)}
        transitionDuration={duration.drawer}
        ModalProps={{ keepMounted: true }}
        // En móvil el cajón cubre el topbar y la barra inferior, como en el prototipo.
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
        PaperProps={{
          sx: {
            width: `min(86vw, ${layout.sidebarWidth}px)`,
            bgcolor: 'background.paper',
            border: 0,
            paddingTop: 'env(safe-area-inset-top, 0px)',
          },
        }}
      >
        <SidebarContent mini={false} onNavigate={() => setSidebarOpenMobile(false)} />
      </Drawer>
    );
  }

  return (
    <Box
      component="aside"
      aria-label="Menú lateral"
      sx={{
        width: mini ? layout.sidebarWidthMini : layout.sidebarWidthDesktop,
        flexShrink: 0,
        borderRight: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        position: 'sticky',
        top: layout.topbarHeightDesktop,
        alignSelf: 'flex-start',
        height: `calc(100dvh - ${layout.topbarHeightDesktop}px)`,
        transition: `width ${duration.drawer}ms ${easing.inOut}`,
      }}
    >
      <SidebarContent mini={mini} />
    </Box>
  );
}
