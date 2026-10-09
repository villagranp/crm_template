import { Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { ROUTE_PATHS } from '@/routes/route-paths';
import { pageTitleSx } from '@/theme/typography';

/**
 * Pantalla "Sin acceso" de una ruta protegida por permiso.
 *
 * No redirige (evita bucles con rutas que a su vez exigen permiso) y no dice
 * qué permiso falta: esa información sólo ayuda a quien sondea el sistema.
 */
export function AccessDeniedPage() {
  return (
    <Stack spacing={2} alignItems="flex-start" sx={{ py: 6 }}>
      <Typography variant="h1" sx={pageTitleSx}>
        Sin acceso
      </Typography>
      <Typography variant="body1" color="text.secondary">
        No tienes permiso para ver esta pantalla. Si crees que deberías tenerlo, pídeselo al administrador del sistema.
      </Typography>
      <Button component={RouterLink} to={ROUTE_PATHS.home}>
        Volver al inicio
      </Button>
    </Stack>
  );
}
