import { Box } from '@mui/material';
import { useEffect, useRef } from 'react';

import { authLayout } from '@/theme/tokens';

const { snow } = authLayout;
const MAX_DEVICE_PIXEL_RATIO = 2;
const RESIZE_DEBOUNCE_MS = 150;
const DRIFT_FREQUENCY = 0.0004;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

interface Particle {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  drift: number;
  phase: number;
  alpha: number;
}

function spawn(width: number, height: number, initial: boolean): Particle {
  return {
    x: Math.random() * width,
    y: initial ? Math.random() * height : -8,
    radius: Math.random() * 2 + 0.8,
    speedY: Math.random() * 0.55 + 0.18,
    drift: Math.random() * 0.6 + 0.1,
    phase: Math.random() * Math.PI * 2,
    alpha: Math.random() * 0.5 + 0.3,
  };
}

/**
 * Nieve decorativa del fondo de acceso: réplica de `snow-canvas.js` del
 * prototipo (`docs/design/prototype/assets/js/snow-canvas.js`).
 *
 * Igual que allí, siempre se pinta: con `prefers-reduced-motion: reduce` las
 * partículas quedan quietas (un solo fotograma) en lugar de desaparecer, y si
 * la preferencia cambia con la página abierta se aplica al momento. La
 * animación se detiene con la pestaña oculta. Es puramente decorativa
 * (`aria-hidden`).
 *
 * Sin `matchMedia` (jsdom, navegadores muy antiguos) no se monta: no hay un
 * canvas real que pintar.
 */
export function SnowCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!supported || !canvas || !context) {
      return undefined;
    }

    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let frame: number | null = null;
    let resizeTimer: number | undefined;

    const draw = (): void => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = snow.color;
      for (const particle of particles) {
        context.globalAlpha = particle.alpha;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    const resize = (): void => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      // Densidad proporcional al área: menos partículas en móvil.
      const count = Math.round(
        Math.min(snow.maxParticles, Math.max(snow.minParticles, (width * height) / snow.areaPerParticle)),
      );
      particles = Array.from({ length: count }, () => spawn(width, height, true));
      if (reducedMotion.matches) {
        draw();
      }
    };

    const step = (time: number): void => {
      for (const particle of particles) {
        particle.y += particle.speedY;
        particle.x += Math.sin(time * DRIFT_FREQUENCY + particle.phase) * particle.drift;
        if (particle.y - particle.radius > height) {
          Object.assign(particle, spawn(width, height, false));
        }
        if (particle.x < -10) particle.x = width + 10;
        if (particle.x > width + 10) particle.x = -10;
      }
      draw();
      frame = requestAnimationFrame(step);
    };

    const start = (): void => {
      if (reducedMotion.matches || document.hidden || frame !== null) return;
      frame = requestAnimationFrame(step);
    };
    const stop = (): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    const handleVisibility = (): void => (document.hidden ? stop() : start());
    const handleResize = (): void => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, RESIZE_DEBOUNCE_MS);
    };
    const handleMotionPreference = (): void => {
      if (reducedMotion.matches) {
        stop();
        draw();
      } else {
        start();
      }
    };

    resize();
    start();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('resize', handleResize);
    reducedMotion.addEventListener('change', handleMotionPreference);

    return () => {
      stop();
      window.clearTimeout(resizeTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('resize', handleResize);
      reducedMotion.removeEventListener('change', handleMotionPreference);
    };
  }, [supported]);

  if (!supported) {
    return null;
  }

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      aria-hidden="true"
      sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}
