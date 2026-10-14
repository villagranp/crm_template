import { Box, Card, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { fontSizes } from '@/theme/tokens';

export interface DashboardPanelProps {
  /** Id del título (`aria-labelledby` de la sección). */
  id: string;
  title: string;
  icon?: ReactNode;
  /** Controles a la derecha del título (p. ej. "Ordenar por"). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Tarjeta de bloque del panel (alertas, próximas visitas, actividad
 * reciente): sección con título `h2` y contenido. Usa la tarjeta del tema.
 */
export function DashboardPanel({ id, title, icon, actions, children }: DashboardPanelProps) {
  return (
    <Card
      component="section"
      aria-labelledby={id}
      sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
        spacing={1}
        sx={{ px: { xs: 2, md: 2.5 }, pt: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          {icon ? (
            <Box aria-hidden="true" sx={{ display: 'grid', color: 'primary.main' }}>
              {icon}
            </Box>
          ) : null}
          <Typography
            id={id}
            component="h2"
            sx={{ fontWeight: 600, fontSize: fontSizes.cardTitle }}
          >
            {title}
          </Typography>
        </Stack>
        {actions}
      </Stack>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Card>
  );
}
