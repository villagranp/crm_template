import CloseIcon from '@mui/icons-material/Close';
import { Box, Drawer, IconButton, Stack, Typography } from '@mui/material';
import { useId, type ReactNode } from 'react';

/** Ancho del panel lateral en escritorio, en unidades de espaciado (560 px). */
const DRAWER_WIDTH = 70;

export interface AdminDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Nombre accesible del panel. */
  title: string;
  /** Contexto bajo el título (área, fecha…). */
  subtitle?: string;
  children: ReactNode;
}

/**
 * Ficha de detalle en panel lateral, con la misma cabecera que los diálogos
 * del CRUD: título, subtítulo y botón de cerrar sobre una línea divisoria.
 * En móvil ocupa todo el ancho.
 */
export function AdminDrawer({ open, onClose, title, subtitle, children }: AdminDrawerProps) {
  const titleId = useId();

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          'aria-labelledby': titleId,
          sx: { width: { xs: '100%', sm: (theme) => theme.spacing(DRAWER_WIDTH) } },
        },
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="flex-start"
        sx={{ px: { xs: 2, sm: 2.5 }, pt: 2, pb: 1.75, borderBottom: 1, borderColor: 'divider' }}
      >
        <Box sx={{ flex: 1, minWidth: 0, pt: 0.5 }}>
          <Typography id={titleId} variant="h5" component="h2" sx={{ overflowWrap: 'anywhere' }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="caption" color="text.secondary" component="p">
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        <IconButton
          aria-label="Cerrar detalle"
          onClick={onClose}
          sx={{ color: 'text.secondary', mr: -1 }}
        >
          <CloseIcon />
        </IconButton>
      </Stack>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2.5, overflowY: 'auto' }}>{children}</Box>
    </Drawer>
  );
}
