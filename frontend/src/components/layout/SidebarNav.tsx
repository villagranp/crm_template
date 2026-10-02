import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Box,
  Collapse,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { MaterialSymbol } from '@/components/layout/MaterialSymbol';
import { useMenu } from '@/hooks/use-menu';
import type { MenuModule, MenuOptionNode } from '@/services/access';
import { duration, easing } from '@/theme/tokens';

interface SidebarNavProps {
  /** Modo minificado: sólo iconos, con tooltip anclado al elemento. */
  mini?: boolean;
  onNavigate?: () => void;
}

function isActivePath(currentPath: string, optionPath: string | null): boolean {
  if (!optionPath) {
    return false;
  }
  return currentPath === optionPath || currentPath.startsWith(`${optionPath}/`);
}

function hasActiveChild(currentPath: string, option: MenuOptionNode): boolean {
  if (isActivePath(currentPath, option.path)) {
    return true;
  }
  return option.children.some((child) => hasActiveChild(currentPath, child));
}

interface OptionItemProps {
  option: MenuOptionNode;
  mini: boolean;
  depth: number;
  onNavigate?: () => void;
}

function OptionItem({ option, mini, depth, onNavigate }: OptionItemProps) {
  const location = useLocation();
  const childActive = hasActiveChild(location.pathname, option);
  const [open, setOpen] = useState(childActive);

  const label = (
    <ListItemText
      primary={option.label}
      primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, noWrap: true }}
    />
  );

  const icon = (
    <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>
      <MaterialSymbol name={option.icon ?? 'chevron_right'} />
    </ListItemIcon>
  );

  const commonSx = {
    borderRadius: 2,
    minHeight: 44,
    mb: 0.25,
    pl: mini ? 1.5 : 1.5 + depth * 1.5,
    justifyContent: mini ? 'center' : 'flex-start',
    '&.active, &[data-active="true"]': {
      bgcolor: 'action.selected',
      color: 'primary.main',
      fontWeight: 600,
    },
  } as const;

  // Nodo que agrupa: despliega en acordeón en lugar de navegar.
  if (option.children.length > 0) {
    return (
      <>
        <ListItemButton
          onClick={() => setOpen((value) => !value)}
          data-active={childActive}
          sx={commonSx}
          aria-expanded={open}
        >
          {icon}
          {mini ? null : label}
          {mini ? null : open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </ListItemButton>

        <Collapse
          in={open && !mini}
          timeout={duration.accordion}
          easing={{ enter: easing.inOut, exit: easing.inOut }}
          unmountOnExit
        >
          <List disablePadding>
            {option.children.map((child) => (
              <OptionItem key={child.id} option={child} mini={mini} depth={depth + 1} onNavigate={onNavigate} />
            ))}
          </List>
        </Collapse>
      </>
    );
  }

  const button = (
    <ListItemButton component={NavLink} to={option.path ?? '#'} onClick={onNavigate} sx={commonSx}>
      {icon}
      {mini ? null : label}
    </ListItemButton>
  );

  // El tooltip del modo minificado va anclado al propio elemento, porque el
  // contenedor del sidebar recorta en el eje X.
  return mini ? (
    <Tooltip title={option.label} placement="right">
      <span>{button}</span>
    </Tooltip>
  ) : (
    button
  );
}

function ModuleSection({ module, mini, onNavigate }: { module: MenuModule; mini: boolean; onNavigate?: () => void }) {
  return (
    <Box component="section" sx={{ mb: 1.5 }}>
      {mini ? (
        <Divider sx={{ my: 1 }} />
      ) : (
        <Typography
          variant="overline"
          component="h2"
          sx={{ px: 2, color: 'text.secondary', display: 'block', mt: 1.5 }}
        >
          {module.label}
        </Typography>
      )}
      <List disablePadding sx={{ px: 1 }}>
        {module.options.map((option) => (
          <OptionItem key={option.id} option={option} mini={mini} depth={0} onNavigate={onNavigate} />
        ))}
      </List>
    </Box>
  );
}

/**
 * Menú lateral.
 *
 * Igual que en el CRM original, **el menú no se escribe en cada página**: aquí
 * se genera de una sola fuente. La diferencia es que esa fuente ya no es un
 * archivo JavaScript, sino las opciones que el backend concede al usuario
 * (`GET /me/menu`), de modo que el menú y la autorización no pueden divergir.
 */
export function SidebarNav({ mini = false, onNavigate }: SidebarNavProps) {
  const { data, isPending, isError } = useMenu();

  if (isPending) {
    return (
      <Box sx={{ p: 2 }}>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} height={36} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (isError || !data || data.length === 0) {
    return mini ? null : (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
        No hay opciones asignadas a tu usuario todavía.
      </Typography>
    );
  }

  return (
    <Box component="nav" aria-label="Navegación principal" sx={{ py: 1 }}>
      {data.map((module) => (
        <ModuleSection key={module.key} module={module} mini={mini} onNavigate={onNavigate} />
      ))}
    </Box>
  );
}
