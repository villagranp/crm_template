import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SnowCanvas } from './SnowCanvas';

/** Contexto 2D falso: jsdom no implementa canvas. */
function fakeContext() {
  return {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
  };
}

function setup(reducedMotion: boolean) {
  const listeners: Array<() => void> = [];
  const media = {
    matches: reducedMotion,
    addEventListener: (_: string, listener: () => void) => listeners.push(listener),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  const context = fakeContext();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const requestFrame = vi.fn(() => 1);
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());

  return { media, listeners, context, requestFrame };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SnowCanvas', () => {
  it('con movimiento normal anima la nieve', () => {
    const { requestFrame } = setup(false);

    const { container } = render(<SnowCanvas />);

    expect(container.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true');
    expect(requestFrame).toHaveBeenCalled();
  });

  it('con movimiento reducido la pinta quieta en lugar de quitarla, como el prototipo', () => {
    const { requestFrame, context } = setup(true);

    const { container } = render(<SnowCanvas />);

    expect(container.querySelector('canvas')).toBeInTheDocument();
    expect(requestFrame).not.toHaveBeenCalled();
    expect(context.clearRect).toHaveBeenCalled();
  });

  it('si el usuario desactiva el movimiento reducido con la página abierta, empieza a animar', () => {
    const { media, listeners, requestFrame } = setup(true);
    render(<SnowCanvas />);

    media.matches = false;
    listeners.forEach((listener) => listener());

    expect(requestFrame).toHaveBeenCalled();
  });

  it('sin matchMedia (entorno sin canvas real) no se monta', () => {
    vi.stubGlobal('matchMedia', undefined);

    const { container } = render(<SnowCanvas />);

    expect(container.querySelector('canvas')).not.toBeInTheDocument();
  });
});
