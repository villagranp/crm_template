import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  Box,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Tooltip,
  Typography,
  type Theme,
} from '@mui/material';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { MaterialSymbol } from '@/components/layout/MaterialSymbol';
import {
  activeModuleKey,
  isActivePath,
  moduleContainsPath,
  navigableOptions,
  optionContainsPath,
  splitMenuSections,
} from '@/components/layout/menu-navigation';
import { useMenu } from '@/hooks/use-menu';
import type { MenuModule, MenuOptionNode } from '@/services/access';
import { duration, easing, fontSizes, layout, letterSpacing } from '@/theme/tokens';

interface SidebarNavProps {
  /** Modo minificado: sólo iconos, con tooltip y menú flotante para los grupos. */
  mini?: boolean;
  onNavigate?: () => void;
}

/** `.nav-link-x` del prototipo; activo = píldora sólida del color primario. */
const navItemSx = (mini: boolean) =>
  ({
    gap: 1.5,
    minHeight: layout.tap,
    px: mini ? 0 : 1.5,
    py: 0.75,
    mb: 0.25,
    borderRadius: `${layout.radiusSm}px`,
    justifyContent: mini ? 'center' : 'flex-start',
    color: 'text.secondary',
    transition: `background-color ${duration.hover}ms ease, color ${duration.hover}ms ease, transform ${duration.press}ms ${easing.out}`,
    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
    '&:active': { transform: 'scale(0.985)' },
    '&.active, &[data-active="true"]': {
      bgcolor: 'primary.main',
      color: 'primary.contrastText',
      boxShadow: 1,
      '&:hover': { bgcolor: 'primary.main' },
    },
  }) as const;

const navTextProps = {
  fontSize: fontSizes.nav,
  fontWeight: 500,
  noWrap: true,
  color: 'inherit',
} as const;

/** `.nav-sub a`: sub-elemento con viñeta; activo = texto primario en negrita y viñeta rellena. */
const subItemSx = (depth: number) =>
  ({
    position: 'relative',
    minHeight: layout.tap - 4,
    py: 0.5,
    pr: 1.5,
    pl: 5.75 + depth * 1.5,
    mb: 0.25,
    borderRadius: `${layout.radiusSm}px`,
    fontSize: fontSizes.subnav,
    color: 'text.secondary',
    transition: `background-color ${duration.hover}ms ease, color ${duration.hover}ms ease`,
    '&::before': {
      content: '""',
      position: 'absolute',
      left: (theme: Theme) => theme.spacing(3.1 + depth * 1.5),
      width: layout.navDotSize,
      height: layout.navDotSize,
      borderRadius: '50%',
      bgcolor: 'divider',
      transition: `background-color ${duration.hover}ms ease, transform ${duration.hover}ms ${easing.out}`,
    },
    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
    '&:hover::before': { bgcolor: 'primary.main', transform: 'scale(1.25)' },
    '&.active': { color: 'primary.main', fontWeight: 600, bgcolor: 'transparent' },
    '&.active::before': { bgcolor: 'primary.main' },
  }) as const;

function SectionLabel({ mini, children }: { mini: boolean; children: ReactNode }) {
  if (mini) {
    // En minificado la etiqueta se reduce a un separador corto.
    return <Box role="separator" sx={{ height: '1px', bgcolor: 'divider', mx: 1, my: 1.5 }} />;
  }
  return (
    <Typography
      component="h2"
      sx={{
        fontSize: fontSizes.micro,
        fontWeight: 700,
        letterSpacing: letterSpacing.section,
        textTransform: 'uppercase',
        color: 'text.secondary',
        px: 1.5,
        pt: 2,
        pb: 0.75,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Typography>
  );
}

function withTooltip(mini: boolean, title: string, node: ReactNode) {
  // Anclado al propio elemento: el contenedor del sidebar recorta en X.
  return mini ? (
    <Tooltip title={title} placement="right">
      <Box>{node}</Box>
    </Tooltip>
  ) : (
    node
  );
}

/** Opción suelta de primer nivel (sección "Principal"). */
function TopLevelItem({
  option,
  mini,
  onNavigate,
}: {
  option: MenuOptionNode;
  mini: boolean;
  onNavigate?: () => void;
}) {
  return withTooltip(
    mini,
    option.label,
    <ListItemButton
      component={NavLink}
      to={option.path ?? '#'}
      end={option.path === '/'}
      onClick={onNavigate}
      aria-label={mini ? option.label : undefined}
      sx={navItemSx(mini)}
    >
      <ListItemIcon sx={{ minWidth: 0, color: 'inherit' }}>
        <MaterialSymbol name={option.icon ?? 'chevron_right'} />
      </ListItemIcon>
      {mini ? null : <ListItemText primary={option.label} primaryTypographyProps={navTextProps} />}
    </ListItemButton>,
  );
}

/** Sub-elementos de un grupo, con anidamiento para opciones que agrupan. */
function SubItems({
  options,
  depth,
  onNavigate,
}: {
  options: MenuOptionNode[];
  depth: number;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();

  return (
    <List disablePadding>
      {options.map((option) =>
        option.children.length > 0 ? (
          <SubGroup
            key={option.id}
            option={option}
            depth={depth}
            onNavigate={onNavigate}
            pathname={pathname}
          />
        ) : (
          <ListItemButton
            key={option.id}
            component={NavLink}
            to={option.path ?? '#'}
            end={option.path === '/'}
            onClick={onNavigate}
            sx={subItemSx(depth)}
          >
            {option.label}
          </ListItemButton>
        ),
      )}
    </List>
  );
}

function SubGroup({
  option,
  depth,
  pathname,
  onNavigate,
}: {
  option: MenuOptionNode;
  depth: number;
  pathname: string;
  onNavigate?: () => void;
}) {
  const containsActive = optionContainsPath(option, pathname);
  const [open, setOpen] = useState(containsActive);

  useEffect(() => {
    if (containsActive) {
      setOpen(true);
    }
  }, [containsActive]);

  return (
    <>
      <ListItemButton
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        sx={subItemSx(depth)}
      >
        <Box component="span" sx={{ flex: 1 }}>
          {option.label}
        </Box>
        <ChevronRightIcon
          aria-hidden="true"
          fontSize="small"
          sx={{
            opacity: 0.6,
            transform: open ? 'rotate(90deg)' : 'none',
            transition: `transform ${duration.accordion}ms ${easing.inOut}`,
          }}
        />
      </ListItemButton>
      <Collapse
        in={open}
        timeout={duration.accordion}
        easing={{ enter: easing.inOut, exit: easing.inOut }}
        unmountOnExit
      >
        <SubItems options={option.children} depth={depth + 1} onNavigate={onNavigate} />
      </Collapse>
    </>
  );
}

/** Menú flotante de un grupo en modo minificado: el acordeón no cabe en 76 px. */
function MiniGroupMenu({
  module,
  anchor,
  onClose,
}: {
  module: MenuModule;
  anchor: HTMLElement | null;
  onClose: () => void;
}) {
  const { pathname } = useLocation();

  return (
    <Menu
      anchorEl={anchor}
      open={Boolean(anchor)}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{ paper: { sx: { ml: 1, mt: 0 } } }}
    >
      <Typography sx={{ px: 2, py: 1, fontWeight: 600, fontSize: fontSizes.subnav }}>
        {module.label}
      </Typography>
      {navigableOptions([module]).map((option) => (
        <MenuItem
          key={option.id}
          component={NavLink}
          to={option.path ?? '#'}
          onClick={onClose}
          selected={isActivePath(pathname, option.path)}
        >
          {option.label}
        </MenuItem>
      ))}
    </Menu>
  );
}

function ModuleGroup({
  module,
  mini,
  open,
  onToggle,
  onNavigate,
}: {
  module: MenuModule;
  mini: boolean;
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const isActive = moduleContainsPath(module, pathname);
  const [flyoutAnchor, setFlyoutAnchor] = useState<HTMLElement | null>(null);
  const regionId = `nav-group-${module.key}`;

  const handleClick = (event: MouseEvent<HTMLElement>): void => {
    if (mini) {
      setFlyoutAnchor(event.currentTarget);
      return;
    }
    onToggle();
  };

  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      {withTooltip(
        mini,
        module.label,
        <ListItemButton
          onClick={handleClick}
          data-active={isActive}
          aria-expanded={mini ? Boolean(flyoutAnchor) : open}
          aria-controls={mini ? undefined : regionId}
          aria-haspopup={mini ? 'menu' : undefined}
          aria-label={mini ? module.label : undefined}
          sx={navItemSx(mini)}
        >
          <ListItemIcon sx={{ minWidth: 0, color: 'inherit' }}>
            <MaterialSymbol name={module.icon ?? 'chevron_right'} />
          </ListItemIcon>
          {mini ? null : (
            <>
              <ListItemText primary={module.label} primaryTypographyProps={navTextProps} />
              <ChevronRightIcon
                aria-hidden="true"
                fontSize="small"
                sx={{
                  opacity: isActive ? 0.9 : 0.6,
                  transform: open ? 'rotate(90deg)' : 'none',
                  transition: `transform ${duration.accordion}ms ${easing.inOut}`,
                }}
              />
            </>
          )}
        </ListItemButton>,
      )}

      {mini ? (
        <MiniGroupMenu
          module={module}
          anchor={flyoutAnchor}
          onClose={() => setFlyoutAnchor(null)}
        />
      ) : (
        <Collapse
          id={regionId}
          in={open}
          timeout={duration.accordion}
          easing={{ enter: easing.inOut, exit: easing.inOut }}
          unmountOnExit
        >
          <SubItems options={module.options} depth={0} onNavigate={onNavigate} />
        </Collapse>
      )}
    </Box>
  );
}

/**
 * Menú lateral (`.sidebar-scroll` del prototipo) en tres secciones:
 * "Principal" (opciones del módulo de inicio, sueltas), "Módulos" (módulos de
 * negocio como grupos desplegables) y "Sistema" (módulos `isSystem`).
 *
 * Igual que en el CRM original, **el menú no se escribe en cada página**. La
 * diferencia es que su fuente ya no es un archivo JavaScript, sino las
 * opciones que el backend concede al usuario (`GET /me/menu`, ADR-018), de modo
 * que el menú y la autorización no pueden divergir.
 */
export function SidebarNav({ mini = false, onNavigate }: SidebarNavProps) {
  const { data, isPending, isError } = useMenu();
  const { pathname } = useLocation();
  const currentModule = data ? activeModuleKey(data, pathname) : null;
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(
    () => new Set(currentModule ? [currentModule] : []),
  );

  // Al navegar a otra sección se despliega el grupo que la contiene.
  useEffect(() => {
    if (currentModule) {
      setOpenKeys((keys) => (keys.has(currentModule) ? keys : new Set([...keys, currentModule])));
    }
  }, [currentModule]);

  if (isPending) {
    return (
      <Box sx={{ p: 2 }} aria-busy="true" aria-label="Cargando menú">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} height={layout.pillHeight} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (isError || !data || data.length === 0) {
    return mini ? null : (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
        {isError
          ? 'No se pudo cargar el menú. Recarga la página.'
          : 'No hay opciones asignadas a tu usuario todavía.'}
      </Typography>
    );
  }

  const sections = splitMenuSections(data);
  const toggle = (key: string): void =>
    setOpenKeys((keys) => {
      const next = new Set(keys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  const renderGroups = (modules: MenuModule[]) => (
    <List disablePadding>
      {modules.map((module) => (
        <ModuleGroup
          key={module.key}
          module={module}
          mini={mini}
          open={openKeys.has(module.key)}
          onToggle={() => toggle(module.key)}
          onNavigate={onNavigate}
        />
      ))}
    </List>
  );

  return (
    <Box component="nav" aria-label="Navegación principal">
      {sections.principal.length > 0 ? (
        <Box component="section">
          <SectionLabel mini={mini}>Principal</SectionLabel>
          <List disablePadding>
            {sections.principal.map((option) => (
              <Box component="li" key={option.id} sx={{ listStyle: 'none' }}>
                <TopLevelItem option={option} mini={mini} onNavigate={onNavigate} />
              </Box>
            ))}
          </List>
        </Box>
      ) : null}

      {sections.modules.length > 0 ? (
        <Box component="section">
          <SectionLabel mini={mini}>Módulos</SectionLabel>
          {renderGroups(sections.modules)}
        </Box>
      ) : null}

      {sections.system.length > 0 ? (
        <Box component="section">
          <SectionLabel mini={mini}>Sistema</SectionLabel>
          {renderGroups(sections.system)}
        </Box>
      ) : null}
    </Box>
  );
}
