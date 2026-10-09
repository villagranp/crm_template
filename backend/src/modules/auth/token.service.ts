import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { SignJWT } from 'jose';

import { AppConfigService } from '@/config/app-config.service';
import { parseDurationMs } from '@/config/duration';

/**
 * Emisión del access token (PLAN-AUTH-LOCAL, D1).
 *
 * Solo firma. La verificación vive en `LocalAuthenticationProvider`, que es
 * quien la usa en cada petición; tenerla en dos sitios permitiría que diverjan.
 * Las pruebas firman aquí y verifican allí para que esa compatibilidad no se
 * rompa en silencio.
 *
 * El token no lleva roles ni permisos: salen de la base de datos en cada
 * petición (ADR-008, ADR-018). Así, retirar un permiso surte efecto sin
 * esperar a que caduque el token.
 */

/**
 * HS256 exige una clave de al menos 256 bits. Por debajo, la firma se puede
 * forzar por diccionario.
 */
export const MIN_ACCESS_TOKEN_SECRET_BYTES = 32;

export interface AccessTokenSubject {
  userId: string;
  email: string;
  displayName: string;
  /** D13: el token solo sirve para cambiar la contraseña. */
  passwordChangeRequired: boolean;
}

/** Claim privado que marca un token con cambio de contraseña pendiente (D13). */
export const PASSWORD_CHANGE_REQUIRED_CLAIM = 'pcr';

export interface IssuedAccessToken {
  accessToken: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  constructor(private readonly config: AppConfigService) {}

  async signAccessToken(subject: AccessTokenSubject): Promise<IssuedAccessToken> {
    const key = this.signingKey();
    // Los claims de tiempo de un JWT van en segundos enteros. `expiresAt` se
    // deriva del mismo valor para que coincida exactamente con `exp`.
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = issuedAt + parseDurationMs(this.config.get('JWT_ACCESS_TOKEN_TTL')) / 1000;

    const claims: Record<string, unknown> = { email: subject.email, name: subject.displayName };
    if (subject.passwordChangeRequired) {
      claims[PASSWORD_CHANGE_REQUIRED_CLAIM] = true;
    }

    const accessToken = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(subject.userId)
      .setIssuer(this.config.get('JWT_ISSUER'))
      .setAudience(this.config.get('JWT_AUDIENCE'))
      .setIssuedAt(issuedAt)
      .setNotBefore(issuedAt)
      .setExpirationTime(expiresAtSeconds)
      .setJti(randomUUID())
      .sign(key);

    return { accessToken, expiresAt: new Date(expiresAtSeconds * 1000) };
  }

  private signingKey(): Uint8Array {
    const secret = this.config.get('JWT_ACCESS_TOKEN_SECRET');
    const key = new TextEncoder().encode(secret ?? '');

    if (key.byteLength < MIN_ACCESS_TOKEN_SECRET_BYTES) {
      // El mensaje no incluye el valor ni su longitud: solo qué falta.
      throw new Error(
        `JWT_ACCESS_TOKEN_SECRET debe tener al menos ${MIN_ACCESS_TOKEN_SECRET_BYTES} bytes para emitir tokens`,
      );
    }

    return key;
  }
}
