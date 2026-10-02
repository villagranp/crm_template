import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AppConfigService } from '@/config/app-config.service';
import {
  type AuthenticationProvider,
  InvalidTokenError,
} from '../ports/authentication-provider.port';
import type { AuthenticatedPrincipal, AuthProviderName } from '../ports/authenticated-principal';

/**
 * Validacion de access tokens de Microsoft Entra ID (ADR-007).
 *
 * Verifica firma contra JWKS, issuer, audience, exp, nbf y tenant.
 * NUNCA basta con que el token sea un JWT bien formado: un token emitido para otra
 * audiencia o tenant se rechaza.
 */
@Injectable()
export class EntraIdAuthenticationProvider implements AuthenticationProvider {
  readonly name: AuthProviderName = 'entra';

  private jwks?: JWTVerifyGetKey;

  constructor(private readonly config: AppConfigService) {}

  async verifyAccessToken(token: string): Promise<AuthenticatedPrincipal> {
    const tenantId = this.config.get('ENTRA_TENANT_ID');
    const audience = this.config.get('ENTRA_AUDIENCE');
    const authority = this.config.get('ENTRA_AUTHORITY');

    if (!tenantId || !audience) {
      throw new InvalidTokenError('Entra ID verification is not configured');
    }

    try {
      const { payload } = await jwtVerify(token, this.getJwks(tenantId), {
        issuer: authority ?? `https://login.microsoftonline.com/${tenantId}/v2.0`,
        audience,
        clockTolerance: 60,
      });

      if (payload['tid'] !== tenantId) {
        throw new InvalidTokenError('Token tenant does not match the expected tenant');
      }

      // Identidad estable: oid (objectId del directorio) y, como respaldo, sub.
      const subjectId =
        (typeof payload['oid'] === 'string' ? payload['oid'] : undefined) ?? payload.sub;

      if (!subjectId) {
        throw new InvalidTokenError('Token has no stable subject identifier');
      }

      return {
        subjectId,
        type: 'user',
        tenantId,
        email:
          (typeof payload['preferred_username'] === 'string'
            ? payload['preferred_username']
            : undefined) ?? undefined,
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

  /** JWKS remoto cacheado por jose, con soporte de rotacion de llaves. */
  private getJwks(tenantId: string): JWTVerifyGetKey {
    if (!this.jwks) {
      const jwksUri =
        this.config.get('ENTRA_JWKS_URI') ??
        `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
      this.jwks = createRemoteJWKSet(new URL(jwksUri), { cacheMaxAge: 600_000 });
    }
    return this.jwks;
  }
}
