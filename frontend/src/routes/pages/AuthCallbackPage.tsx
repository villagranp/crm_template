import { Alert, Button, Stack } from '@mui/material';
import { useEffect, useRef } from 'react';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom';

import { FullPageLoader } from '@/components/feedback/full-page-loader';
import { env } from '@/config/env';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { getSsoErrorMessage } from '@/features/auth/auth-error-messages';
import { useAuth } from '@/hooks/use-auth';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { consumeReturnPath } from '@/services/auth';
import { brandIdentity } from '@/theme/tokens';

const PROCESSING_LABEL = 'Iniciando sesión…';

/**
 * Redirect URI de Entra ID (`/auth/callback`). Ruta pública: se carga con la respuesta de Microsoft
 * y no puede exigir sesión, porque la sesión se completa justamente aquí.
 *
 * El proveedor procesa la respuesta durante `initialize()` (arranque de la aplicación); esta
 * pantalla sólo espera a que termine y decide el destino:
 * - sesión iniciada: la ruta de retorno guardada antes de salir a Microsoft, o el inicio;
 * - fallo: el mensaje traducido y un enlace a `/acceso`.
 */
export function AuthCallbackPage() {
  const { status, signInError, signIn } = useAuth();
  const navigate = useNavigate();
  // Un solo viaje de vuelta aunque React ejecute el efecto dos veces (StrictMode).
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || hasNavigated.current) {
      return;
    }
    hasNavigated.current = true;
    navigate(consumeReturnPath() ?? ROUTE_PATHS.home, { replace: true });
  }, [status, navigate]);

  if (env.VITE_AUTH_PROVIDER !== 'entra') {
    return <Navigate to={ROUTE_PATHS.login} replace />;
  }

  if (status === 'initializing' || status === 'authenticated') {
    return <FullPageLoader label={PROCESSING_LABEL} />;
  }

  return (
    <AuthLayout
      panelTitle={brandIdentity.productName}
      title="No se pudo iniciar sesión"
      subtitle="Microsoft no completó el acceso a tu cuenta corporativa."
    >
      <Stack spacing={3}>
        <Alert severity="error" role="alert">
          {getSsoErrorMessage(signInError)}
        </Alert>
        {/* Sin `prompt`, Microsoft reutiliza su sesión y devolvería la misma cuenta rechazada. */}
        <Button
          variant="contained"
          fullWidth
          onClick={() => void signIn(undefined, { selectAccount: true }).catch(() => undefined)}
        >
          Usar otra cuenta
        </Button>
        <Button component={RouterLink} to={ROUTE_PATHS.login} variant="outlined" fullWidth>
          Volver al acceso
        </Button>
      </Stack>
    </AuthLayout>
  );
}
