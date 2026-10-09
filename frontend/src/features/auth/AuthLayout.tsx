import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { BrandLogo } from '@/components/layout/BrandLogo';
import { authLayout, brandAssets } from '@/theme/tokens';

interface AuthLayoutProps {
  /** Título del panel de marca (visible desde `md`). */
  panelTitle: string;
  panelDescription: string;
  /** Título de la tarjeta: es el `h1` accesible de la pantalla. */
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

/**
 * Marco de las pantallas de acceso: panel de marca a la izquierda sobre el
 * fondo corporativo y tarjeta con el formulario a la derecha (en móvil sólo la
 * tarjeta). Vive fuera del shell porque aún no hay menú que mostrar.
 */
export function AuthLayout({ panelTitle, panelDescription, title, subtitle, children }: AuthLayoutProps) {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' } }}>
      <Box
        aria-hidden="true"
        sx={{
          display: { xs: 'none', md: 'grid' },
          alignContent: 'center',
          p: 8,
          color: 'common.white',
          position: 'relative',
          backgroundImage: `${authLayout.backgroundOverlay}, url(${brandAssets.authBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <Stack spacing={3} sx={{ maxWidth: authLayout.brandPanelMaxWidth }}>
          <BrandLogo onDark height={authLayout.logoHeightPanel} />
          <Typography variant="h1" component="p" sx={{ color: 'inherit' }}>
            {panelTitle}
          </Typography>
          <Typography variant="body1" sx={{ color: 'inherit', opacity: 0.85 }}>
            {panelDescription}
          </Typography>
        </Stack>
      </Box>

      <Box
        component="main"
        sx={{ display: 'grid', placeItems: 'center', p: { xs: 2, sm: 3, md: 6 }, bgcolor: 'background.default' }}
      >
        <Card sx={{ width: '100%', maxWidth: authLayout.formCardMaxWidth }}>
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Stack spacing={3}>
              <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                <BrandLogo height={authLayout.logoHeightMobile} />
              </Box>

              <Box>
                <Typography variant="h3" component="h1" gutterBottom>
                  {title}
                </Typography>
                {subtitle ? (
                  <Typography variant="body2" color="text.secondary">
                    {subtitle}
                  </Typography>
                ) : null}
              </Box>

              {children}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
