import type { CookieOptions, Request, Response } from 'express';

import type { AppConfigService } from '@/config/app-config.service';

/**
 * Cookie del refresh token (PLAN-AUTH-LOCAL §3).
 *
 * HttpOnly para que ningún script la lea; SameSite=Lax para que un sitio ajeno
 * no pueda provocar un refresh o un logout con ella; Path limitado a /auth
 * para que no viaje en el resto de peticiones.
 */
export const REFRESH_COOKIE_NAME = 'refresh_token';

function baseOptions(config: AppConfigService): CookieOptions {
  return {
    httpOnly: true,
    // En desarrollo se sirve por HTTP; en el resto de entornos, solo HTTPS.
    secure: config.get('NODE_ENV') !== 'development',
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
  response.cookie(REFRESH_COOKIE_NAME, refreshToken, { ...baseOptions(config), expires: expiresAt });
}

export function clearRefreshCookie(response: Response, config: AppConfigService): void {
  response.clearCookie(REFRESH_COOKIE_NAME, baseOptions(config));
}

/**
 * Lee la cookie sin `cookie-parser`: es la única cookie que la API consume y
 * no justifica una dependencia nueva.
 */
export function readRefreshCookie(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === REFRESH_COOKIE_NAME) {
      const value = part.slice(separator + 1).trim();
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}
