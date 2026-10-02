import { Box, Container, Typography } from '@mui/material';
import { Outlet } from 'react-router-dom';

import { BottomNav } from '@/components/layout/BottomNav';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { useAuth } from '@/hooks/use-auth';
import { layout } from '@/theme/tokens';

/**
 * Shell de la aplicación: topbar, menú lateral, contenido y navegación
 * inferior de móvil.
 *
 * Estructura tomada de `docs/design/DESIGN-SPEC-SOURCE.md` §7 y §7b. El menú
 * sólo se monta con sesión iniciada, porque sus opciones las devuelve el
 * backend según los permisos del usuario.
 */
export function AppShell() {
  const { isAuthenticated } = useAuth();

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Topbar />

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {isAuthenticated ? <Sidebar /> : null}

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            py: { xs: 2, md: 3 },
            // Deja sitio a la barra inferior de móvil y a la safe area de iOS.
            pb: { xs: `calc(${layout.bottomNavHeight}px + env(safe-area-inset-bottom, 0px) + 16px)`, md: 3 },
          }}
        >
          <Container maxWidth={false} sx={{ maxWidth: layout.contentMaxWidth, px: { xs: 2, lg: 3 } }}>
            <Outlet />
          </Container>
        </Box>
      </Box>

      <Box
        component="footer"
        sx={{
          display: { xs: 'none', md: 'block' },
          py: 2,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Container maxWidth={false} sx={{ maxWidth: layout.contentMaxWidth }}>
          <Typography variant="caption" color="text.secondary">
            Plantilla de proyecto — sin funcionalidad de negocio. Lee CLAUDE.md antes de añadir una.
          </Typography>
        </Container>
      </Box>

      {isAuthenticated ? <BottomNav /> : null}
    </Box>
  );
}
