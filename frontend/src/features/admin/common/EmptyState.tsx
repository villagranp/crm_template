import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Icono decorativo; por defecto, una bandeja vacía. */
  icon?: ReactNode;
  /** Acción sugerida (p. ej. "Crear rol" o "Limpiar filtros"). */
  action?: ReactNode;
}

/**
 * Estado vacío de una lista o de una pantalla. El icono es decorativo: el
 * texto es lo que se anuncia.
 */
export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <Stack role="status" spacing={1} alignItems="center" textAlign="center" sx={{ py: 6, px: 2 }}>
      <Box aria-hidden sx={{ color: 'text.secondary', display: 'flex' }}>
        {icon ?? <InboxOutlinedIcon fontSize="large" />}
      </Box>
      <Typography variant="h5" component="p">
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      ) : null}
      {action ? <Box sx={{ pt: 1 }}>{action}</Box> : null}
    </Stack>
  );
}
