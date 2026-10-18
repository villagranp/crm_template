import { randomUUID } from 'node:crypto';

import { createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type JWTVerifyGetKey, type KeyLike, SignJWT } from 'jose';
import type { TestingModuleBuilder } from '@nestjs/testing';

import { AppConfigService } from '@/config/app-config.service';
import { AUTHENTICATION_PROVIDER } from '@/infrastructure/authentication/ports/authentication-provider.port';
import { EntraIdAuthenticationProvider } from '@/infrastructure/authentication/providers/entra-id-authentication.provider';

import { ENTRA_TEST } from './entra-env';

/**
 * Tokens de prueba "de Entra ID" firmados con un par de llaves RSA generado en memoria, y el
 * proveedor **real** (`EntraIdAuthenticationProvider`, con su verificación de firma, issuer,
 * audiencia, expiración, tenant y `oid`) apuntando a ese JWKS local en lugar de al de Microsoft.
 * Lo único sustituido es de dónde salen las llaves públicas: no hay red.
 */

const KEY_ID = 'integration-key';

let signingKey: KeyLike | undefined;
let foreignKey: KeyLike | undefined;
let jwks: JWTVerifyGetKey | undefined;

export async function initEntraTestKeys(): Promise<void> {
  const pair = await generateKeyPair('RS256');
  signingKey = pair.privateKey;
  foreignKey = (await generateKeyPair('RS256')).privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: KEY_ID, alg: 'RS256', use: 'sig' };
  jwks = createLocalJWKSet({ keys: [jwk] });
}

/** Sustituye solo el origen de las llaves del proveedor de Entra ID de la aplicación. */
export function withEntraTestProvider(builder: TestingModuleBuilder): TestingModuleBuilder {
  return builder.overrideProvider(AUTHENTICATION_PROVIDER).useFactory({
    factory: (config: AppConfigService) => new EntraIdAuthenticationProvider(config, jwks),
    inject: [AppConfigService],
  });
}

export interface EntraTokenOptions {
  /** Object ID del usuario; por omisión uno nuevo (un usuario que entra por primera vez). */
  oid?: string;
  /** `null` = sin el claim. */
  email?: string | null;
  /** Claim `email` aparte de `preferred_username`. */
  emailClaim?: string;
  name?: string | null;
  audience?: string;
  issuer?: string;
  tenantId?: string | null;
  /** Segundos de vigencia; negativo = ya expirado. */
  expiresInSeconds?: number;
  notBeforeInSeconds?: number;
  withoutOid?: boolean;
  /** `null` = sin el claim `scp` (token de aplicación). */
  scp?: string | null;
  /** `ver` del token; por omisión `2.0`. */
  ver?: string;
  /** Cliente que pidió el token (`azp`); por omisión, la SPA de prueba. `null` = sin el claim. */
  azp?: string | null;
  /** Sin claim `exp`. */
  withoutExp?: boolean;
  /** Firmado con una llave que el JWKS no conoce. */
  foreignSignature?: boolean;
}

export function newOid(): string {
  return randomUUID();
}

export async function entraToken(options: EntraTokenOptions = {}): Promise<string> {
  if (!signingKey || !foreignKey) {
    throw new Error('Llama a initEntraTestKeys() en beforeAll antes de firmar tokens.');
  }
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    ...(options.tenantId === null ? {} : { tid: options.tenantId ?? ENTRA_TEST.tenantId }),
    ...(options.withoutOid ? {} : { oid: options.oid ?? newOid() }),
    ...(options.email === null ? {} : { preferred_username: options.email ?? `sso-${randomUUID()}@integration.test` }),
    ...(options.emailClaim ? { email: options.emailClaim } : {}),
    ...(options.name === null ? {} : { name: options.name ?? 'Persona Entra' }),
    ver: options.ver ?? '2.0',
    ...(options.scp === null ? {} : { scp: options.scp ?? ENTRA_TEST.scope }),
    ...(options.azp === null ? {} : { azp: options.azp ?? ENTRA_TEST.clientId }),
  };
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
    .setIssuer(options.issuer ?? ENTRA_TEST.issuer)
    .setAudience(options.audience ?? ENTRA_TEST.audience)
    .setSubject(`pairwise-${randomUUID()}`)
    .setIssuedAt(now);
  if (!options.withoutExp) {
    jwt.setExpirationTime(now + (options.expiresInSeconds ?? 300));
  }
  if (options.notBeforeInSeconds !== undefined) {
    jwt.setNotBefore(now + options.notBeforeInSeconds);
  }
  return jwt.sign(options.foreignSignature ? foreignKey : signingKey);
}
