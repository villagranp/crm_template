import { useCallback, useEffect, useState } from 'react';

function isSupported(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true;
}

/**
 * Pantalla completa con la Fullscreen API del navegador.
 *
 * `supported` es falso en navegadores o contextos que no la permiten (iOS
 * Safari en iPhone, iframes sin permiso): ahí el botón no se muestra.
 */
export function useFullscreen() {
  const [supported] = useState(isSupported);
  const [active, setActive] = useState(() => supported && document.fullscreenElement !== null);

  useEffect(() => {
    if (!supported) {
      return undefined;
    }
    const handleChange = (): void => setActive(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, [supported]);

  const toggle = useCallback((): void => {
    // Un rechazo (gesto no válido, política del sitio) no debe romper la UI.
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  return { supported, active, toggle };
}
