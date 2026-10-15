import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { Alert, Box, Button, Chip, Skeleton, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { describeApiError } from '@/features/admin/common';

import type { AuthProvider } from '../parameters.api';
import { useAuthenticationSettings } from '../parameters.queries';

const PROVIDER_LABELS: Readonly<Record<AuthProvider, string>> = {
  local: 'Local (usuario y contraseña)',
  entra: 'Microsoft Entra ID',
  hybrid: 'Híbrido (local y Microsoft Entra ID)',
};

export interface AuthenticationSettingsCardProps {
  /** Filas de los parámetros de inicio de sesión local (`seguridad.*`), editables según permisos. */
  children?: ReactNode;
}

/**
 * Bloque «Acceso» de Parámetros (07 E.4, AC-07.31): proveedor de autenticación
 * vigente en **sólo lectura** (`GET /parameters/authentication`) y, debajo, los
 * parámetros de inicio de sesión local. El proveedor es configuración de
 * despliegue (`AUTH_PROVIDER`, ADR-019, RN-07.34): no hay ningún control que lo
 * cambie.
 */
export function AuthenticationSettingsCard({ children }: AuthenticationSettingsCardProps) {
  const settings = useAuthenticationSettings();

  let status: ReactNode;
  if (settings.isPending) {
    status = <Skeleton variant="text" aria-label="Cargando proveedor de autenticación" />;
  } else if (settings.isError) {
    status = (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void settings.refetch()}>
            Reintentar
          </Button>
        }
      >
        No se pudo consultar el proveedor de autenticación.{' '}
        {describeApiError(settings.error).message}
      </Alert>
    );
  } else {
    const { provider, localLoginEnabled } = settings.data;
    status = (
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="body2" color="text.secondary">
            Proveedor vigente:
          </Typography>
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label={PROVIDER_LABELS[provider] ?? provider}
            aria-label={`Proveedor vigente: ${PROVIDER_LABELS[provider] ?? provider}`}
          />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Se define en la configuración del despliegue. Cambiarlo requiere un nuevo despliegue, no
          se edita aquí.
        </Typography>
        {localLoginEnabled ? null : (
          <Alert severity="info">
            Con Microsoft Entra ID no hay inicio de sesión local: los parámetros de abajo no aplican
            mientras no cambie el proveedor.
          </Alert>
        )}
      </Stack>
    );
  }

  return (
    <Box component="article" aria-label="Autenticación">
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="flex-start"
        sx={{ px: { xs: 2, md: 2.5 }, py: 2 }}
      >
        <VerifiedUserOutlinedIcon color="primary" aria-hidden />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
            Autenticación
          </Typography>
          {status}
        </Box>
      </Stack>
      {children}
    </Box>
  );
}
