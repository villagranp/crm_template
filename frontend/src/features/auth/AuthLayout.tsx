import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { BrandLogo } from '@/components/layout/BrandLogo';
import { SnowCanvas } from '@/features/auth/SnowCanvas';
import {
  authLayout,
  brand,
  brandAssets,
  brandIdentity,
  fonts,
  fontSizes,
  onBrand,
} from '@/theme/tokens';

interface AuthLayoutProps {
  /** Título del panel de marca (visible desde `lg`). */
  panelTitle: string;
  /** Texto bajo el título del panel; opcional (el acceso no lo usa, el cambio de contraseña sí). */
  panelDescription?: string;
  /** Título de la tarjeta: es el `h1` accesible de la pantalla. */
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

/**
 * Marco de las pantallas de acceso (`pages/auth/login.html` del prototipo):
 * foto corporativa a sangre con velo y nieve decorativa, tarjeta centrada
 * dividida desde `lg` (panel azul de marca a la izquierda, formulario blanco a
 * la derecha) y una sola columna en móvil. Vive fuera del shell porque aún no
 * hay menú que mostrar.
 */
export function AuthLayout({
  panelTitle,
  panelDescription,
  title,
  subtitle,
  children,
}: AuthLayoutProps) {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        bgcolor: brand[900],
      }}
    >
      {/* Fondo: foto + velo (en ::after) + nieve. Decorativo. */}
      <Box
        aria-hidden="true"
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          backgroundImage: `url(${brandAssets.authBackground}), ${authLayout.backgroundFallback}`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            backgroundImage: authLayout.backgroundOverlay,
          },
        }}
      >
        <SnowCanvas />
      </Box>

      <Box
        component="main"
        sx={(theme) => ({
          position: 'relative',
          zIndex: 1,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          pt: `calc(${theme.spacing(2.5)} + env(safe-area-inset-top, 0px))`,
          pb: theme.spacing(2.5),
          pl: `calc(${theme.spacing(2)} + env(safe-area-inset-left, 0px))`,
          pr: `calc(${theme.spacing(2)} + env(safe-area-inset-right, 0px))`,
          '@media (max-height: 560px) and (orientation: landscape)': {
            justifyContent: 'flex-start',
          },
        })}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: { xs: authLayout.cardMaxWidthCompact, lg: authLayout.cardMaxWidth },
            minHeight: { lg: authLayout.cardMinHeight },
            mx: 'auto',
            display: 'flex',
            bgcolor: 'background.paper',
            color: 'text.primary',
            borderRadius: `${authLayout.cardRadius}px`,
            boxShadow: authLayout.cardShadow,
            overflow: 'hidden',
          }}
        >
          {/* Panel de marca: repite la identidad, así que se oculta a lectores de pantalla. */}
          <Box
            aria-hidden="true"
            sx={{
              display: { xs: 'none', lg: 'flex' },
              flexDirection: 'column',
              flex: `0 0 ${authLayout.asideBasis}`,
              p: 5,
              color: 'common.white',
              backgroundImage: authLayout.asideBackground,
            }}
          >
            <BrandLogo onDark height={authLayout.logoHeightPanel} />

            <Box sx={{ mt: 'auto', pb: 3 }}>
              <Typography
                component="p"
                sx={{
                  fontFamily: fonts.heading,
                  fontWeight: 700,
                  fontSize: fontSizes.authAsideTitle,
                  lineHeight: 1.2,
                  mb: panelDescription ? 1.5 : 0,
                }}
              >
                {panelTitle}
              </Typography>
              {panelDescription ? (
                <Typography
                  sx={{
                    color: onBrand.textMuted,
                    fontSize: fontSizes.nav,
                    maxWidth: authLayout.asideTextMaxWidth,
                  }}
                >
                  {panelDescription}
                </Typography>
              ) : null}
            </Box>
          </Box>

          {/* Formulario */}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: { lg: 'center' },
              pt: { xs: 3.5, sm: 4.5, lg: 6 },
              pb: { xs: 3, sm: 4, lg: 6 },
              px: { xs: 2.5, sm: 4, lg: 6.5 },
            }}
          >
            <Box sx={{ display: { xs: 'flex', lg: 'none' }, mb: 3 }}>
              <BrandLogo height={authLayout.logoHeightMobile} />
            </Box>

            <Box sx={{ mb: 3 }}>
              <Typography
                variant="h1"
                sx={{
                  fontFamily: fonts.heading,
                  fontWeight: 700,
                  fontSize: fontSizes.authTitle,
                  mb: 0.75,
                }}
              >
                {title}
              </Typography>
              {subtitle ? (
                <Typography
                  component="div"
                  sx={{ color: 'text.secondary', fontSize: fontSizes.nav }}
                >
                  {subtitle}
                </Typography>
              ) : null}
            </Box>

            {children}
          </Box>
        </Box>
      </Box>

      <Box
        component="footer"
        sx={(theme) => ({
          position: 'relative',
          zIndex: 1,
          textAlign: 'center',
          px: 2,
          pb: `calc(${theme.spacing(2)} + env(safe-area-inset-bottom, 0px))`,
          fontSize: fontSizes.small,
          color: authLayout.footerText,
        })}
      >
        © {new Date().getFullYear()} {brandIdentity.companyName}
      </Box>
    </Box>
  );
}
