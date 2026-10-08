import { Box } from '@mui/material';

import { useUiStore } from '@/stores/ui.store';
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
 * La variante se elige en JavaScript a partir del modo de color activo. El
 * intento anterior lo hacía con `content: url(...)` desde `sx`: el truco
 * funciona en CSS plano, pero aquí el selector de tema no aplica y el logo azul
 * se quedaba sobre el fondo oscuro, casi ilegible.
 */
export function BrandLogo({ variant = 'wordmark', onDark = false, height = 28 }: BrandLogoProps) {
  const themeMode = useUiStore((state) => state.themeMode);
  const useLightAsset = onDark || themeMode === 'dark';

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
      src={useLightAsset ? brandAssets.logoDark : brandAssets.logoLight}
      alt="Ir al inicio"
      sx={{ height, width: 'auto', maxWidth: 160, objectFit: 'contain', display: 'block' }}
    />
  );
}
