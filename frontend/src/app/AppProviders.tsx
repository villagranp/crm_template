import { CacheProvider } from '@emotion/react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';

import { ErrorBoundary } from '@/components/feedback/error-boundary';
import { queryClient } from '@/services/api/query-client';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { getTheme } from '@/theme';
import { createAppEmotionCache } from '@/theme/emotion-cache';

/**
 * Una sola caché para toda la vida de la página: el nonce de la CSP es el de la
 * respuesta que sirvió `index.html` y no cambia hasta la siguiente carga.
 */
const emotionCache = createAppEmotionCache();

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Punto único de composición de los proveedores transversales.
 *
 * El orden importa: la caché de Emotion (nonce de la CSP) va por fuera de todo, para
 * que también el mensaje del límite de error se pinte con estilos permitidos; el
 * límite de error envuelve al resto de proveedores para que un fallo al
 * inicializarlos siga mostrando un mensaje utilizable.
 */
export function AppProviders({ children }: AppProvidersProps) {
  const initialize = useAuthStore((state) => state.initialize);
  const themeMode = useUiStore((state) => state.themeMode);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  // El atributo lo consumen el CSS de marca y las capturas de prueba visual.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  return (
    <CacheProvider value={emotionCache}>
      <ErrorBoundary>
        <ThemeProvider theme={getTheme(themeMode)}>
          <CssBaseline />
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </CacheProvider>
  );
}
