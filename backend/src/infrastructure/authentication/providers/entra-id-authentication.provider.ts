import { Inject, Injectable, Optional } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

import { isGuestUpn, isGuid, usableEmail } from '@/common/identity-claims';
import { AppConfigService } from '@/config/app-config.service';

import {
  type AuthenticationProvider,
  InvalidTokenError,
} from '../ports/authentication-provider.port';
import type { AuthenticatedPrincipal, AuthProviderName } from '../ports/authenticated-principal';

/**
 * Resolutor de llaves de firma alternativo (pruebas): permite verificar tokens firmados con un par
 * de llaves de prueba sin llamar a Microsoft. En producción no se registra y se usa el JWKS remoto.
 */
export const ENTRA_KEY_RESOLVER = Symbol('ENTRA_KEY_RESOLVER');

/** Códigos de rechazo propios (los de `jose` se conservan tal cual); nunca incluyen datos del token. */
export const ENTRA_REJECTION = {
  tenant: 'ENTRA_TENANT_MISMATCH',
  objectId: 'ENTRA_OID_INVALID',
  version: 'ENTRA_VERSION_NOT_V2',
  scopeMissing: 'ENTRA_SCOPE_MISSING',
  scopeNotAllowed: 'ENTRA_SCOPE_NOT_ALLOWED',
  clientNotAllowed: 'ENTRA_CLIENT_NOT_ALLOWED',
  notConfigured: 'ENTRA_NOT_CONFIGURED',
} as const;

/**
 * Validacion de access tokens de Microsoft Entra ID (ADR-007, ADR-027).
 *
 * Verifica firma contra JWKS (solo RS256), issuer, audience, exp (obligatorio), nbf y tenant, y exige un
 * token **delegado de usuario v2.0**:
 *
 *  - `ver` = `2.0`: el formato v1 (issuer `sts.windows.net`, claims distintos) no se acepta.
 *  - `scp` no vacio: un token de aplicacion (client credentials) no trae `scp` y no es un usuario.
 *  - `oid` en forma de GUID, que es la identidad estable (el `sub` es distinto por aplicacion).
 *  - Si `ENTRA_REQUIRED_SCOPE` esta configurado, el `scp` debe contenerlo.
 *  - Si `ENTRA_ALLOWED_CLIENT_IDS` esta configurado, el `azp` (cliente que pidio el token; en v2) debe
 *    estar en la lista. Con `ver` = 2.0 exigido, `appid` (v1) no se usa nunca.
 *
 * NUNCA basta con que el token sea un JWT bien formado: un token emitido para otra audiencia o
 * tenant se rechaza. Los rechazos llevan un `code` estable sin datos del token (el guard solo lo registra).
 */
@Injectable()
export class EntraIdAuthenticationProvider implements AuthenticationProvider {
  readonly name: AuthProviderName = 'entra';

  private jwks?: JWTVerifyGetKey;

  constructor(
    private readonly config: AppConfigService,
    @Optional() @Inject(ENTRA_KEY_RESOLVER) keyResolver?: JWTVerifyGetKey,
  ) {
    this.jwks = keyResolver;
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedPrincipal> {
    const tenantId = this.config.get('ENTRA_TENANT_ID');
    const audience = this.config.get('ENTRA_AUDIENCE');
    const authority = this.config.get('ENTRA_AUTHORITY');

    if (!tenantId || !audience) {
      throw new InvalidTokenError('Entra ID verification is not configured', ENTRA_REJECTION.notConfigured);
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.getJwks(tenantId), {
        issuer: authority ?? `https://login.microsoftonline.com/${tenantId}/v2.0`,
        audience,
        // Entra ID firma con RS256: se fija para no aceptar otro algoritmo que declare el token.
        algorithms: ['RS256'],
        // Un token sin expiracion nunca caduca: se exige el claim.
        requiredClaims: ['exp'],
        clockTolerance: 60,
      }));
    } catch (error) {
      // Solo el codigo de jose (p. ej. ERR_JWT_EXPIRED): su mensaje puede citar claims del token.
      const code = (error as { code?: unknown } | null)?.code;
      throw new InvalidTokenError('Access token verification failed', typeof code === 'string' ? code : 'ERR_TOKEN_INVALID');
    }

    if (payload['tid'] !== tenantId) {
      throw new InvalidTokenError('Token tenant does not match the expected tenant', ENTRA_REJECTION.tenant);
    }

    if (payload['ver'] !== '2.0') {
      throw new InvalidTokenError('Only v2.0 access tokens are accepted', ENTRA_REJECTION.version);
    }

    // Identidad estable: `oid` (objectId del directorio), siempre. `sub` es pairwise por aplicación
    // y no sirve para vincular: un token sin `oid` válido se rechaza (ADR-027).
    const oid = payload['oid'];
    if (typeof oid !== 'string' || !isGuid(oid)) {
      throw new InvalidTokenError('Token has no valid object identifier (oid)', ENTRA_REJECTION.objectId);
    }

    const scopes = typeof payload['scp'] === 'string' ? payload['scp'].split(' ').filter((scope) => scope.length > 0) : [];
    if (scopes.length === 0) {
      throw new InvalidTokenError('Token has no delegated scope (scp): application tokens are not accepted', ENTRA_REJECTION.scopeMissing);
    }

    const requiredScope = this.config.get('ENTRA_REQUIRED_SCOPE');
    if (requiredScope && !scopes.includes(requiredScope)) {
      throw new InvalidTokenError('Token does not carry the required scope', ENTRA_REJECTION.scopeNotAllowed);
    }

    const allowedClients = parseClientIds(this.config.get('ENTRA_ALLOWED_CLIENT_IDS'));
    if (allowedClients.length > 0) {
      const client = typeof payload['azp'] === 'string' ? payload['azp'].toLowerCase() : undefined;
      if (!client || !allowedClients.includes(client)) {
        throw new InvalidTokenError('Token was requested by a client that is not allowed', ENTRA_REJECTION.clientNotAllowed);
      }
    }

    return {
      subjectId: oid.toLowerCase(),
      type: 'user',
      tenantId,
      email: emailOf(payload),
      displayName: typeof payload['name'] === 'string' ? payload['name'] : undefined,
      providerRoles: Array.isArray(payload['roles'])
        ? (payload['roles'] as unknown[]).filter((role): role is string => typeof role === 'string')
        : [],
      issuedBy: this.name,
    };
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

/** Lista de client ids separados por comas, en minúsculas y sin vacíos. */
export function parseClientIds(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter((id) => id.length > 0);
}

/**
 * Correo del token: `preferred_username` (el UPN) y solo si no es un correo utilizable o no viene, el claim
 * `email`. Si `preferred_username` es el UPN de un **invitado** (`#EXT#`), no se cae a `email`: el
 * resultado es «sin correo» y la admisión responde `IDENTITY_INCOMPLETE` (ADR-027).
 */
function emailOf(payload: JWTPayload): string | undefined {
  const upn = payload['preferred_username'];
  if (isGuestUpn(upn)) {
    return undefined;
  }
  const fromUpn = typeof upn === 'string' ? usableEmail(upn) : null;
  if (fromUpn) {
    return fromUpn;
  }
  const claim = payload['email'];
  return (typeof claim === 'string' ? usableEmail(claim) : null) ?? undefined;
}
