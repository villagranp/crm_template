import { Box, Typography } from '@mui/material';
import { Outlet } from 'react-router-dom';

import { BottomNav } from '@/components/layout/BottomNav';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { useAuth } from '@/hooks/use-auth';
import { brandIdentity, layout } from '@/theme/tokens';

/**
 * Variable CSS con el margen lateral del contenido. `PageHeader` la usa para
 * salirse de ese margen y ocupar todo el ancho del área de contenido, como la
 * banda `.page-header` del prototipo.
 */
export const APP_GUTTER_VAR = '--app-gutter';

const gutterVar = `var(${APP_GUTTER_VAR})`;

/**
 * Shell de la aplicación: topbar a todo el ancho, menú lateral, contenido y
 * navegación inferior de móvil (estructura de `docs/design/prototype`).
 *
 * El menú sólo se monta con sesión iniciada, porque sus opciones las devuelve
 * el backend según los permisos del usuario.
 */
export function AppShell() {
  const { isAuthenticated } = useAuth();

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      <Topbar />

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {isAuthenticated ? <Sidebar /> : null}

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            [APP_GUTTER_VAR]: {
              xs: `${layout.gutterBySize.xs}px`,
              sm: `${layout.gutterBySize.sm}px`,
              md: `${layout.gutterBySize.md}px`,
              xl: `${layout.gutterBySize.xl}px`,
            },
          }}
        >
          <Box
            sx={{
              flex: 1,
              width: '100%',
              maxWidth: layout.contentMaxWidth,
              mx: 'auto',
              px: gutterVar,
              pt: gutterVar,
              // Deja sitio a la barra inferior de móvil y a la safe area de iOS.
              pb: {
                xs: `calc(${layout.bottomNavHeight}px + env(safe-area-inset-bottom, 0px) + ${gutterVar})`,
                md: gutterVar,
              },
            }}
          >
            <Outlet />
          </Box>

          <Box
            component="footer"
            sx={{
              display: { xs: 'none', md: 'block' },
              px: gutterVar,
              py: 2,
              borderTop: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Typography variant="caption" color="text.secondary">
              © {new Date().getFullYear()} {brandIdentity.productName}
            </Typography>
          </Box>
        </Box>
      </Box>

      {isAuthenticated ? <BottomNav /> : null}
    </Box>
  );
}
