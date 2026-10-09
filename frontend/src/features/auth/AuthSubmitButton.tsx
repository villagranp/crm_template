import { Button, type ButtonProps } from '@mui/material';

import { authLayout, duration, easing, fontSizes, gradients } from '@/theme/tokens';

/**
 * Botón principal de las pantallas de acceso (`.btn-auth` del prototipo):
 * ancho completo, degradado de marca y sombra azul. Mientras envía conserva el
 * degradado atenuado en lugar del gris de MUI, para que no "parpadee".
 */
export function AuthSubmitButton({ sx, ...props }: Omit<ButtonProps, 'variant' | 'fullWidth'>) {
  return (
    <Button
      {...props}
      variant="contained"
      fullWidth
      sx={[
        {
          minHeight: authLayout.submitMinHeight,
          fontSize: fontSizes.authSubmit,
          color: 'common.white',
          backgroundImage: gradients.cta,
          boxShadow: authLayout.submitShadow,
          transition: `transform ${duration.press}ms ${easing.out}, box-shadow ${duration.hover}ms ease`,
          '&:hover': { boxShadow: authLayout.submitShadowHover },
          '&.Mui-disabled': { color: 'common.white', backgroundImage: gradients.cta, opacity: 0.7 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
