import createCache, { type EmotionCache } from '@emotion/cache';

/**
 * Caché de Emotion compatible con la Content-Security-Policy del borde (ASVS 5.0 G-11).
 *
 * MUI inyecta sus estilos con `<style>` en tiempo de ejecución. La CSP de NGINX ya no
 * admite `style-src 'unsafe-inline'`: solo los `<style>` que llevan el nonce de la
 * respuesta. NGINX genera ese nonce por petición, lo emite en la cabecera CSP y lo
 * escribe en `<meta name="csp-nonce">` de `index.html` sustituyendo el marcador
 * {@link CSP_NONCE_PLACEHOLDER}. Esta caché lo lee de ahí y lo pone en cada `<style>`.
 *
 * Sin NGINX (servidor de Vite, Vitest, Playwright contra `pnpm dev`) el marcador queda
 * sin sustituir y no hay CSP: la caché se crea sin nonce y todo funciona igual.
 */

/** Texto literal que NGINX sustituye por el nonce (`sub_filter`). Debe coincidir con `index.html`. */
export const CSP_NONCE_PLACEHOLDER = '__CSP_NONCE__';

const CSP_NONCE_META_SELECTOR = 'meta[name="csp-nonce"]';

/** Mismo prefijo de clase que la caché por defecto de Emotion: no cambia ningún selector existente. */
const EMOTION_CACHE_KEY = 'css';

/** Un nonce válido es base64 o hexadecimal; cualquier otra cosa (incl. el marcador) se ignora. */
const NONCE_PATTERN = /^[A-Za-z0-9+/_-]{16,}={0,2}$/;

/** Nonce de la respuesta actual, o `undefined` si el documento no lo trae (desarrollo y pruebas). */
export function readCspNonce(doc: Document = document): string | undefined {
  const value = doc.querySelector<HTMLMetaElement>(CSP_NONCE_META_SELECTOR)?.content.trim();
  if (!value || value === CSP_NONCE_PLACEHOLDER || !NONCE_PATTERN.test(value)) {
    return undefined;
  }
  return value;
}

export function createAppEmotionCache(nonce: string | undefined = readCspNonce()): EmotionCache {
  return createCache({ key: EMOTION_CACHE_KEY, nonce });
}
