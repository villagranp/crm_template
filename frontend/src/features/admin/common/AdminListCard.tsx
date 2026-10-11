import RefreshIcon from '@mui/icons-material/Refresh';
import { Box, IconButton, Paper, Stack, Tooltip, Typography, type Theme } from '@mui/material';
import { useId, type ReactNode } from 'react';

import { brandSoft, ICON_TILE_SIZE, subtleSurface, TILE_RADIUS } from '@/components/data/surfaces';

export interface AdminListCardProps {
  /** Icono del área (decorativo), en el mosaico de la cabecera. */
  icon: ReactNode;
  title: string;
  /** Normalmente `recordsSubtitle(total, descripción)`. */
  subtitle?: ReactNode;
  /** Acciones de icono a la derecha de la cabecera (exportar, actualizar…). */
  tools?: ReactNode;
  /** Barra bajo la cabecera: chips de filtro, búsqueda y acción primaria (`ListToolbar`). */
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * Tarjeta de listado del CRUD del prototipo (`card-x` de `pages/modulo.html`):
 * cabecera con mosaico de icono, título, subtítulo y herramientas; barra de
 * filtros; y el contenido (normalmente un `DataTable`) a sangre.
 */
export function AdminListCard({
  icon,
  title,
  subtitle,
  tools,
  toolbar,
  children,
}: AdminListCardProps) {
  const titleId = useId();

  return (
    <Paper component="section" aria-labelledby={titleId} sx={{ overflow: 'hidden', boxShadow: 1 }}>
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{
          px: { xs: 2, md: 2.5 },
          py: 1.75,
          borderBottom: 1,
          borderColor: 'divider',
          background: (theme: Theme) =>
            `linear-gradient(180deg, ${subtleSurface(theme)}, transparent)`,
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: (theme) => theme.spacing(ICON_TILE_SIZE),
            height: (theme) => theme.spacing(ICON_TILE_SIZE),
            flexShrink: 0,
            borderRadius: TILE_RADIUS,
            display: 'grid',
            placeItems: 'center',
            bgcolor: brandSoft,
            color: 'primary.main',
          }}
        >
          {icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={titleId} variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography
              variant="caption"
              color="text.secondary"
              component="p"
              sx={{ overflowWrap: 'anywhere' }}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {tools ? (
          <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0, color: 'text.secondary' }}>
            {tools}
          </Stack>
        ) : null}
      </Stack>
      {toolbar}
      {children}
    </Paper>
  );
}

export interface ListCardToolProps {
  /** Nombre accesible y texto de la ayuda emergente. */
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

/** Botón de icono de la cabecera de la tarjeta (`card-x-tools`), con ayuda emergente. */
export function ListCardTool({ label, icon, onClick, disabled = false }: ListCardToolProps) {
  return (
    <Tooltip title={label}>
      {/* El `span` permite la ayuda emergente sobre un botón deshabilitado. */}
      <span>
        <IconButton
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          sx={{ color: 'inherit' }}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );
}

/** "Actualizar": vuelve a pedir la lista (y sus contadores) al servidor. */
export function RefreshTool({
  onRefresh,
  busy = false,
}: {
  onRefresh: () => void;
  busy?: boolean;
}) {
  return (
    <ListCardTool label="Actualizar" icon={<RefreshIcon />} onClick={onRefresh} disabled={busy} />
  );
}
