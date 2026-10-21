import { afterEach, describe, expect, it } from 'vitest';

import { CSP_NONCE_PLACEHOLDER, createAppEmotionCache, readCspNonce } from './emotion-cache';

function setNonceMeta(content: string | null): void {
  document.head.querySelectorAll('meta[name="csp-nonce"]').forEach((node) => node.remove());
  if (content !== null) {
    const meta = document.createElement('meta');
    meta.name = 'csp-nonce';
    meta.content = content;
    document.head.appendChild(meta);
  }
}

describe('emotion-cache (CSP con nonce, G-11)', () => {
  afterEach(() => setNonceMeta(null));

  it('lee el nonce que NGINX escribió en <meta name="csp-nonce">', () => {
    setNonceMeta('3f2a9c0b7d4e41a6b8c5d2e1f0a9b8c7');

    expect(readCspNonce()).toBe('3f2a9c0b7d4e41a6b8c5d2e1f0a9b8c7');
  });

  it('acepta un nonce en base64', () => {
    setNonceMeta('rAnd0mBase64Value+/AbCdEf==');

    expect(readCspNonce()).toBe('rAnd0mBase64Value+/AbCdEf==');
  });

  it('sin NGINX (Vite, pruebas) el marcador queda sin sustituir y se ignora', () => {
    setNonceMeta(CSP_NONCE_PLACEHOLDER);

    expect(readCspNonce()).toBeUndefined();
  });

  it('sin meta, vacío o con un valor que no es un nonce, devuelve undefined', () => {
    setNonceMeta(null);
    expect(readCspNonce()).toBeUndefined();

    setNonceMeta('');
    expect(readCspNonce()).toBeUndefined();

    setNonceMeta('"><script>alert(1)</script>');
    expect(readCspNonce()).toBeUndefined();
  });

  it('crea la caché con el nonce y la clave por defecto de Emotion', () => {
    const cache = createAppEmotionCache('3f2a9c0b7d4e41a6b8c5d2e1f0a9b8c7');

    expect(cache.key).toBe('css');
    expect(cache.nonce).toBe('3f2a9c0b7d4e41a6b8c5d2e1f0a9b8c7');
    expect(cache.sheet.nonce).toBe('3f2a9c0b7d4e41a6b8c5d2e1f0a9b8c7');
  });

  it('sin nonce crea la caché igualmente (desarrollo y pruebas)', () => {
    setNonceMeta(CSP_NONCE_PLACEHOLDER);

    const cache = createAppEmotionCache();

    expect(cache.nonce).toBeUndefined();
  });
});
