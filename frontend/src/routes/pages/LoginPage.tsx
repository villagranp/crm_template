import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { Navigate } from 'react-router-dom';

import { BrandLogo } from '@/components/layout/BrandLogo';
import { useAuth } from '@/hooks/use-auth';
import { brandAssets, brand as brandScale } from '@/theme/tokens';

/**
 * Pantalla de acceso.
 *
 * Reproduce el planteamiento visual del spec: panel de marca a la izquierda
 * sobre el fondo corporativo y formulario a la derecha. El formulario de
 * credenciales **no** se incluye porque la plantilla no trae almacén de
 * usuarios ni endpoint de login: el botón delega en el proveedor configurado
 * (local o Entra ID). Al implementar el login local, este es el lugar donde
 * entra el formulario con React Hook Form + Zod.
 */
export function LoginPage() {
  const { isAuthenticated, signIn, errorMessage } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' } }}>
      <Box
        sx={{
          display: { xs: 'none', md: 'grid' },
          alignContent: 'center',
          p: 8,
          color: 'common.white',
          position: 'relative',
          backgroundImage: `linear-gradient(120deg, ${brandScale[900]}E6, ${brandScale[700]}CC), url(${brandAssets.authBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <Stack spacing={3} sx={{ maxWidth: 460 }}>
          <BrandLogo onDark height={36} />
          <Typography variant="h1" sx={{ color: 'inherit' }}>
            Acceso a la plataforma
          </Typography>
          <Typography variant="body1" sx={{ color: 'inherit', opacity: 0.85 }}>
            Tu menú y tus permisos se resuelven en el servidor a partir de los roles y las opciones asignadas a tu
            cuenta.
          </Typography>
        </Stack>
      </Box>

      <Box sx={{ display: 'grid', placeItems: 'center', p: { xs: 3, md: 6 }, bgcolor: 'background.default' }}>
        <Card sx={{ width: '100%', maxWidth: 420 }}>
          <CardContent sx={{ p: 4 }}>
            <Stack spacing={3}>
              <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                <BrandLogo height={32} />
              </Box>

              <Box>
                <Typography variant="h3" gutterBottom>
                  Iniciar sesión
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Usa la cuenta corporativa que te asignó el administrador del sistema.
                </Typography>
              </Box>

              {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

              <Button size="large" fullWidth onClick={() => void signIn()}>
                Continuar
              </Button>

              <Typography variant="caption" color="text.secondary">
                ¿Problemas para entrar? Contacta al administrador del sistema.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
