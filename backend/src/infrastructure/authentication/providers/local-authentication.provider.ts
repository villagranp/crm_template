import { Injectable } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { AppConfigService } from '@/config/app-config.service';
import {
  type AuthenticationProvider,
  InvalidTokenError,
} from '../ports/authentication-provider.port';
import type { AuthenticatedPrincipal, AuthProviderName } from '../ports/authenticated-principal';

/**
 * Autenticacion local con JWT propio (AUTHENTICATION.md seccion 3).
 *
 * SKELETON: verifica tokens ya emitidos. La emision (login, refresh con rotacion,
 * hashing Argon2id y revocacion) se implementa en el primer proyecto que use
 * AUTH_PROVIDER=local, siguiendo el Skill `authentication`.
 */
@Injectable()
export class LocalAuthenticationProvider implements AuthenticationProvider {
  readonly name: AuthProviderName = 'local';

  constructor(private readonly config: AppConfigService) {}

  async verifyAccessToken(token: string): Promise<AuthenticatedPrincipal> {
    const secret = this.config.get('JWT_ACCESS_TOKEN_SECRET');

    if (!secret) {
      throw new InvalidTokenError('Local JWT verification is not configured');
    }

    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
        issuer: this.config.get('JWT_ISSUER'),
        audience: this.config.get('JWT_AUDIENCE'),
        clockTolerance: 60,
      });

      if (!payload.sub) {
        throw new InvalidTokenError('Token has no subject');
      }

      return {
        subjectId: payload.sub,
        type: 'user',
        email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
        displayName: typeof payload['name'] === 'string' ? payload['name'] : undefined,
        providerRoles: Array.isArray(payload['roles'])
          ? (payload['roles'] as unknown[]).filter((role): role is string => typeof role === 'string')
          : [],
        issuedBy: this.name,
      };
    } catch (error) {
      throw new InvalidTokenError(
        error instanceof Error ? error.message : 'Access token verification failed',
      );
    }
  }
}
