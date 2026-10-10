import { Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { ROUTE_PATHS } from '@/routes/route-paths';

/**
 * Pantalla "Sin acceso" de una ruta protegida por permiso.
 *
 * No redirige (evita bucles con rutas que a su vez exigen permiso) y no dice
 * qué permiso falta: esa información sólo ayuda a quien sondea el sistema.
 */
export function AccessDeniedPage() {
  return (
    <>
      <PageHeader
        title="Sin acceso"
        breadcrumbs={[{ label: 'Inicio', to: ROUTE_PATHS.home }, { label: 'Sin acceso' }]}
      />
      <Stack spacing={2} alignItems="flex-start">
        <Typography variant="body1" color="text.secondary">
          No tienes permiso para ver esta pantalla. Si crees que deberías tenerlo, pídeselo al
          administrador del sistema.
        </Typography>
        <Button component={RouterLink} to={ROUTE_PATHS.home}>
          Volver al inicio
        </Button>
      </Stack>
    </>
  );
}
