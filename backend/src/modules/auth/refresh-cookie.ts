import type { CookieOptions, Request, Response } from 'express';

import type { AppConfigService } from '@/config/app-config.service';

/**
 * Cookie del refresh token (PLAN-AUTH-LOCAL §3, ASVS G-18).
 *
 * HttpOnly para que ningún script la lea; SameSite=Lax para que un sitio ajeno
 * no pueda provocar un refresh o un logout con ella; Path limitado a /auth
 * para que no viaje en el resto de peticiones.
 *
 * Nombre: con `Secure` (todo entorno salvo desarrollo) lleva el prefijo
 * `__Secure-`, que obliga al navegador a aceptarla solo si llegó por HTTPS con
 * `Secure`: una conexión sin cifrar no puede sembrar ni sustituir la cookie. En
 * desarrollo (`http://localhost`, sin `Secure`) conserva el nombre sin prefijo,
 * porque el navegador rechaza una cookie `__Secure-` que no sea `Secure`.
 *
 * No se usa `__Host-`: exige `Path=/` y la cookie se limita deliberadamente a la
 * ruta de autenticación para que no viaje con cada petición a la API.
 */
const SECURE_REFRESH_COOKIE_NAME = '__Secure-refresh_token';
const DEVELOPMENT_REFRESH_COOKIE_NAME = 'refresh_token';

/** En desarrollo se sirve por HTTP; en el resto de entornos, solo HTTPS. */
function isSecureCookie(config: AppConfigService): boolean {
  return config.get('NODE_ENV') !== 'development';
}

/**
 * Único punto que decide el nombre de la cookie. Se fija y se lee SOLO con el
 * nombre vigente: aceptar también el antiguo reabriría la sustitución que el
 * prefijo impide.
 */
export function refreshCookieName(config: AppConfigService): string {
  return isSecureCookie(config) ? SECURE_REFRESH_COOKIE_NAME : DEVELOPMENT_REFRESH_COOKIE_NAME;
}

function baseOptions(config: AppConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureCookie(config),
    sameSite: 'lax',
    path: `/${config.get('API_GLOBAL_PREFIX')}/v${config.get('API_DEFAULT_VERSION')}/auth`,
  };
}

export function setRefreshCookie(
  response: Response,
  config: AppConfigService,
  refreshToken: string,
  expiresAt: Date,
): void {
  response.cookie(refreshCookieName(config), refreshToken, { ...baseOptions(config), expires: expiresAt });
}

export function clearRefreshCookie(response: Response, config: AppConfigService): void {
  response.clearCookie(refreshCookieName(config), baseOptions(config));
}

/**
 * Lee la cookie sin `cookie-parser`: es la única cookie que la API consume y
 * no justifica una dependencia nueva.
 */
export function readRefreshCookie(request: Request, config: AppConfigService): string | undefined {
  const header = request.headers.cookie;
  if (!header) {
    return undefined;
  }

  const name = refreshCookieName(config);
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}
