import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { brandSoft, EMPTY_ICON_SIZE } from './surfaces';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Icono decorativo; por defecto, una bandeja vacía. */
  icon?: ReactNode;
  /** Acción sugerida (p. ej. "Crear rol" o "Limpiar filtros"). */
  action?: ReactNode;
  /** `alert` para un estado de error, que se anuncia de inmediato. */
  role?: 'status' | 'alert';
}

/**
 * Estado vacío de una lista o de una pantalla, como la tarjeta vacía del
 * prototipo: círculo de icono en tinte de marca, título, texto y acción. El
 * icono es decorativo: el texto es lo que se anuncia.
 */
export function EmptyState({ title, description, icon, action, role = 'status' }: EmptyStateProps) {
  return (
    <Stack role={role} spacing={1} alignItems="center" textAlign="center" sx={{ py: 5, px: 2 }}>
      <Box
        aria-hidden
        sx={{
          width: (theme) => theme.spacing(EMPTY_ICON_SIZE),
          height: (theme) => theme.spacing(EMPTY_ICON_SIZE),
          mb: 0.5,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: brandSoft,
          color: 'primary.main',
        }}
      >
        {icon ?? <InboxOutlinedIcon />}
      </Box>
      <Typography variant="h5" component="p">
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '42ch' }}>
          {description}
        </Typography>
      ) : null}
      {action ? <Box sx={{ pt: 1 }}>{action}</Box> : null}
    </Stack>
  );
}
