import MenuIcon from '@mui/icons-material/Menu';
import { Box, ButtonBase, Paper } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';

import { MaterialSymbol } from '@/components/layout/MaterialSymbol';
import { activeModuleKey, firstNavigablePath } from '@/components/layout/menu-navigation';
import { useMenu } from '@/hooks/use-menu';
import { useUiStore } from '@/stores/ui.store';
import { bottomNavHiddenQuery, duration, easing, fontSizes, layout, shadows, zIndex } from '@/theme/tokens';

/** Huecos para módulos; el último siempre es "Menú". */
const MAX_MODULE_ITEMS = 3;

const itemSx = {
  flex: '1 1 0',
  minWidth: 0,
  minHeight: layout.bottomNavHeight,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 0.25,
  px: 0.5,
  fontSize: fontSizes.micro,
  fontWeight: 500,
  color: 'text.secondary',
  WebkitTapHighlightColor: 'transparent',
  transition: `color ${duration.hover}ms ease, transform ${duration.press}ms ${easing.out}`,
  '&:active': { transform: 'scale(0.94)' },
  '&[aria-current="page"]': { color: 'primary.main' },
  '& .MuiSvgIcon-root': { fontSize: layout.bottomNavIconSize },
} as const;

function ItemLabel({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
    >
      {children}
    </Box>
  );
}

/**
 * Navegación inferior de móvil (`.bottom-nav` del prototipo).
 *
 * Un elemento por módulo del menú del usuario (hasta tres) que lleva a su
 * primera opción, y "Menú" al final para abrir el cajón con todo lo demás. No
 * se declara una lista aparte: sale de `GET /me/menu` (ADR-018). El botón
 * flotante central del prototipo se omite mientras no haya una acción
 * principal real por ruta (decisión del responsable). Desaparece desde `md`.
 */
export function BottomNav() {
  const { pathname } = useLocation();
  const { data } = useMenu();
  const setSidebarOpenMobile = useUiStore((state) => state.setSidebarOpenMobile);
  const sidebarOpenMobile = useUiStore((state) => state.sidebarOpenMobile);

  const modules = (data ?? [])
    .map((module) => ({ module, path: firstNavigablePath(module.options) }))
    .filter(
      (entry): entry is { module: (typeof entry)['module']; path: string } => entry.path !== null,
    )
    .slice(0, MAX_MODULE_ITEMS);

  if (modules.length === 0) {
    return null;
  }

  const activeKey = activeModuleKey(data ?? [], pathname);

  return (
    <Paper
      component="nav"
      aria-label="Navegación rápida"
      square
      sx={(theme) => ({
        display: { xs: 'flex', md: 'none' },
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: zIndex.bottomNav,
        border: 0,
        borderTop: 1,
        borderColor: 'divider',
        borderRadius: 0,
        boxShadow: theme.palette.mode === 'dark' ? shadows.dark.up : shadows.light.up,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        [bottomNavHiddenQuery]: { display: 'none' },
      })}
    >
      {modules.map(({ module, path }) => (
        <ButtonBase
          key={module.key}
          component={RouterLink}
          to={path}
          aria-current={module.key === activeKey ? 'page' : undefined}
          sx={itemSx}
        >
          <MaterialSymbol name={module.icon ?? 'chevron_right'} size={layout.bottomNavIconSize} />
          <ItemLabel>{module.label}</ItemLabel>
        </ButtonBase>
      ))}
      <ButtonBase
        onClick={() => setSidebarOpenMobile(true)}
        aria-haspopup="true"
        aria-expanded={sidebarOpenMobile}
        sx={itemSx}
      >
        <MenuIcon aria-hidden="true" />
        <ItemLabel>Menú</ItemLabel>
      </ButtonBase>
    </Paper>
  );
}
