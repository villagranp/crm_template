import { Box, Button, type ButtonProps } from '@mui/material';
import { keyframes } from '@mui/material/styles';

import { authLayout, breakpoints, duration, easing, fontSizes, gradients } from '@/theme/tokens';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

/** Sólo con ratón y sin movimiento reducido: igual que el `@media (hover: hover)` del prototipo. */
const HOVER_MOTION = '@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

type AuthSubmitButtonProps = Omit<ButtonProps, 'variant' | 'fullWidth'> & {
  /** Envío en curso: el texto se difumina bajo un anillo que gira (`.btn-x.is-loading`). */
  loading?: boolean;
};

/**
 * Botón principal de las pantallas de acceso: `.btn-auth` + `.btn-x` del
 * prototipo (`docs/design/prototype/assets/css/{auth,style}.css`).
 *
 * - Degradado de marca y sombra azul que crece al pasar el ratón.
 * - Al pasar el ratón se eleva y un brillo diagonal lo barre; con movimiento
 *   reducido o en pantallas táctiles no hay elevación ni brillo.
 * - Al pulsar, la onda de MUI hace de `.ripple`.
 * - Cargando: conserva el texto (difuminado) bajo el anillo, en vez de
 *   cambiarlo, para que el botón no cambie de ancho ni "parpadee".
 */
export function AuthSubmitButton({ sx, loading = false, children, disabled, ...props }: AuthSubmitButtonProps) {
  return (
    <Button
      {...props}
      variant="contained"
      fullWidth
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      sx={[
        {
          position: 'relative',
          overflow: 'hidden',
          // `.btn-auth` mide 50 px en todos los anchos: se repite en `lg` porque el tema baja
          // los botones a 40 px ahí.
          minHeight: authLayout.submitMinHeight,
          [`@media (min-width: ${breakpoints.lg}px)`]: { minHeight: authLayout.submitMinHeight },
          fontSize: fontSizes.authSubmit,
          color: 'common.white',
          backgroundImage: gradients.cta,
          boxShadow: authLayout.submitShadow,
          transition: `transform ${duration.press}ms ${easing.out}, box-shadow ${duration.hover}ms ease`,
          '&:hover': { boxShadow: authLayout.submitShadowHover },
          '&.Mui-disabled': { color: 'common.white', backgroundImage: gradients.cta, boxShadow: authLayout.submitShadow },
          // Cargando no es "deshabilitado": no se atenúa todo el botón, sólo el texto.
          '&.Mui-disabled:not([aria-busy="true"])': { opacity: 0.7 },
          [HOVER_MOTION]: {
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              backgroundImage: gradients.sheen,
              transform: 'translateX(-120%)',
              transition: `transform ${duration.sheen}ms ${easing.out}`,
              pointerEvents: 'none',
            },
            '&:hover:not(.Mui-disabled)': { transform: `translateY(-${authLayout.submitHoverLift}px)` },
            '&:hover:not(.Mui-disabled)::before': { transform: 'translateX(120%)' },
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        component="span"
        sx={{
          transition: `filter ${duration.labelFade}ms ease, opacity ${duration.labelFade}ms ease`,
          ...(loading && {
            filter: `blur(${authLayout.submitLoadingBlur}px)`,
            opacity: authLayout.submitLoadingOpacity,
          }),
        }}
      >
        {children}
      </Box>
      <Box
        component="span"
        aria-hidden="true"
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          opacity: loading ? 1 : 0,
          transition: `opacity ${duration.labelFade}ms ease`,
          pointerEvents: 'none',
        }}
      >
        <Box
          component="span"
          sx={{
            width: authLayout.spinnerSize,
            height: authLayout.spinnerSize,
            borderRadius: '50%',
            border: `${authLayout.spinnerThickness}px solid ${authLayout.spinnerTrack}`,
            borderTopColor: 'common.white',
            // Como en el prototipo, el anillo gira también con movimiento reducido: es la señal de progreso.
            animation: loading ? `${spin} ${duration.spin}ms linear infinite` : 'none',
          }}
        />
      </Box>
    </Button>
  );
}
