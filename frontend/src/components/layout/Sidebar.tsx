import { Box, Drawer, useMediaQuery, useTheme } from '@mui/material';

import { SidebarNav } from '@/components/layout/SidebarNav';
import { useUiStore } from '@/stores/ui.store';
import { duration, easing, layout } from '@/theme/tokens';

/**
 * Contenedor del menú lateral con los tres estados del spec:
 * - móvil: cajón fuera de lienzo con velo
 * - escritorio: columna fija y pegajosa
 * - escritorio minificado: sólo iconos, 76 px
 *
 * Los textos del modo minificado se ocultan con `display: none` (lo hace
 * `SidebarNav` al no renderizarlos), nunca con opacidad: con `nowrap` seguirían
 * ocupando ancho y empujarían el icono fuera de la columna.
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
        PaperProps={{
          sx: {
            width: 'min(86vw, 300px)',
            bgcolor: 'background.paper',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          },
        }}
      >
        <SidebarNav onNavigate={() => setSidebarOpenMobile(false)} />
      </Drawer>
    );
  }

  return (
    <Box
      component="aside"
      sx={{
        width: mini ? layout.sidebarWidthMini : layout.sidebarWidth,
        flexShrink: 0,
        borderRight: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        position: 'sticky',
        top: layout.topbarHeightDesktop,
        alignSelf: 'flex-start',
        height: `calc(100dvh - ${layout.topbarHeightDesktop}px)`,
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: `width ${duration.drawer}ms ${easing.inOut}`,
      }}
    >
      <SidebarNav mini={mini} />
    </Box>
  );
}
