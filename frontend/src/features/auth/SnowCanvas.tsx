import { Box } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

import { authLayout } from '@/theme/tokens';

const { snow } = authLayout;
const MAX_DEVICE_PIXEL_RATIO = 2;
const RESIZE_DEBOUNCE_MS = 150;
const DRIFT_FREQUENCY = 0.0004;

interface Particle {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  drift: number;
  phase: number;
  alpha: number;
}

/**
 * Sólo se anima si el sistema declara explícitamente que no hay preferencia de
 * movimiento reducido. Sin `matchMedia` (navegadores antiguos, jsdom) no se anima.
 */
function motionAllowed(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: no-preference)').matches
  );
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
 * Nieve decorativa del fondo de acceso (`snow-canvas.js` del prototipo).
 *
 * Coste cero cuando no se ve: con `prefers-reduced-motion` no se monta el
 * canvas, la animación se detiene con la pestaña oculta y sólo existe en las
 * pantallas de acceso. Es puramente decorativa (`aria-hidden`).
 */
export function SnowCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled] = useState(motionAllowed);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!enabled || !canvas || !context) {
      return undefined;
    }

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let frame: number | null = null;
    let resizeTimer: number | undefined;

    const resize = (): void => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.round(
        Math.min(
          snow.maxParticles,
          Math.max(snow.minParticles, (width * height) / snow.areaPerParticle),
        ),
      );
      particles = Array.from({ length: count }, () => spawn(width, height, true));
    };

    const step = (time: number): void => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = snow.color;
      for (const particle of particles) {
        particle.y += particle.speedY;
        particle.x += Math.sin(time * DRIFT_FREQUENCY + particle.phase) * particle.drift;
        if (particle.y - particle.radius > height) {
          Object.assign(particle, spawn(width, height, false));
        }
        if (particle.x < -10) particle.x = width + 10;
        if (particle.x > width + 10) particle.x = -10;
        context.globalAlpha = particle.alpha;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      frame = requestAnimationFrame(step);
    };

    const start = (): void => {
      if (frame === null) frame = requestAnimationFrame(step);
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

    resize();
    start();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('resize', handleResize);

    return () => {
      stop();
      window.clearTimeout(resizeTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('resize', handleResize);
    };
  }, [enabled]);

  if (!enabled) {
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
