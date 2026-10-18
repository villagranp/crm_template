import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import { Button, Paper, Stack } from '@mui/material';

import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/data';
import { useAuth } from '@/hooks/use-auth';

/**
 * Dos nombres a propósito: el usuario ve «Acceso pendiente» (lo que le pasa a él) y el
 * administrador ve «Pendiente de acceso» en Usuarios (la etiqueta de la cuenta). Misma situación,
 * dos puntos de vista.
 */
const TITLE = 'Acceso pendiente';
/** Título del bloque: distinto del h1 para que un lector de pantalla no anuncie lo mismo dos veces. */
const BLOCK_TITLE = 'Falta asignar tu rol';
const DESCRIPTION =
  'Tu cuenta fue creada. El administrador debe asignarte un rol para que puedas trabajar. Avísale.';

/**
 * Inicio de quien ya está autenticado pero todavía no tiene rol (usuario recién creado en el primer
 * ingreso con Entra ID). Sustituye al panel, que sólo mostraría errores y bloques vacíos, y deja
 * una única salida clara: cerrar sesión o volver a comprobar cuando el administrador avise.
 */
export function PendingAccessState() {
  const { signOut } = useAuth();

  return (
    <>
      {/* Un solo encabezado (h1): sin migas, que repetirían el título. */}
      <PageHeader title={TITLE} />
      <Paper variant="outlined" sx={{ maxWidth: 'sm', mx: 'auto' }}>
        <EmptyState
          title={BLOCK_TITLE}
          description={DESCRIPTION}
          icon={<HourglassEmptyOutlinedIcon />}
          action={
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
              <Button
                variant="outlined"
                startIcon={<LogoutIcon />}
                onClick={() => void signOut()}
              >
                Cerrar sesión
              </Button>
              <Button variant="text" onClick={() => window.location.reload()}>
                Volver a comprobar
              </Button>
            </Stack>
          }
        />
      </Paper>
    </>
  );
}
