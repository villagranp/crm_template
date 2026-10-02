import { BottomNavigation, BottomNavigationAction, Box, Paper } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';

import { MaterialSymbol } from '@/components/layout/MaterialSymbol';
import { useMenu } from '@/hooks/use-menu';
import { layout, zIndex } from '@/theme/tokens';

const MAX_ITEMS = 4;

/**
 * Navegación inferior de móvil.
 *
 * Toma las primeras opciones navegables del menú del usuario: no se declara
 * una lista aparte, porque una segunda fuente de navegación acabaría
 * divergiendo de los permisos. Desaparece a partir de `md`.
 */
export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data } = useMenu();

  const items = (data ?? [])
    .flatMap((module) => module.options)
    .filter((option) => option.path !== null)
    .slice(0, MAX_ITEMS);

  if (items.length === 0) {
    return null;
  }

  const currentValue = items.findIndex((item) => location.pathname === item.path);

  return (
    <Paper
      component="nav"
      aria-label="Navegación rápida"
      square
      sx={{
        display: { xs: 'block', md: 'none' },
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: zIndex.bottomNav,
        borderTop: 1,
        borderLeft: 0,
        borderRight: 0,
        borderBottom: 0,
        borderColor: 'divider',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <BottomNavigation
        showLabels
        value={currentValue === -1 ? false : currentValue}
        sx={{ height: layout.bottomNavHeight, bgcolor: 'transparent' }}
      >
        {items.map((item, index) => (
          <BottomNavigationAction
            key={item.id}
            label={item.label}
            value={index}
            onClick={() => navigate(item.path ?? '/')}
            icon={
              <Box sx={{ display: 'grid', placeItems: 'center' }}>
                <MaterialSymbol name={item.icon ?? 'chevron_right'} size={22} />
              </Box>
            }
            sx={{ minWidth: 0, py: 1 }}
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
}
