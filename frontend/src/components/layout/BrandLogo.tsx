import { Box } from '@mui/material';

import { brandAssets, layout } from '@/theme/tokens';

interface BrandLogoProps {
  /** `mark` usa la marca cuadrada (sidebar minificado, pestaña del navegador). */
  variant?: 'wordmark' | 'mark';
  /** Fuerza el logo blanco sobre fondos siempre oscuros (gradientes, login). */
  onDark?: boolean;
  height?: number;
}

/**
 * Logo de marca.
 *
 * El original resolvía el logo por CSS (`background-image`) para que el
 * navegador descargara sólo el que usa. Aquí se hace con `<img>` y la variante
 * la decide el tema, que es equivalente y además permite `alt`.
 */
export function BrandLogo({ variant = 'wordmark', onDark = false, height = 28 }: BrandLogoProps) {
  if (variant === 'mark') {
    return (
      <Box
        component="img"
        src={brandAssets.mark}
        alt=""
        aria-hidden="true"
        sx={{ width: 32, height: 32, borderRadius: layout.radiusSm }}
      />
    );
  }

  return (
    <Box
      component="img"
      src={onDark ? brandAssets.logoDark : brandAssets.logoLight}
      alt="Ir al inicio"
      sx={{
        height,
        width: 'auto',
        maxWidth: 160,
        objectFit: 'contain',
        ...(onDark ? {} : { '[data-theme="dark"] &': { content: `url(${brandAssets.logoDark})` } }),
      }}
    />
  );
}
