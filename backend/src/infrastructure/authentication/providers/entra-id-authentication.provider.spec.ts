import { createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike, SignJWT } from 'jose';

import type { AppConfigService } from '@/config/app-config.service';

import { InvalidTokenError } from '../ports/authentication-provider.port';
import { ENTRA_REJECTION, EntraIdAuthenticationProvider, parseClientIds } from './entra-id-authentication.provider';

const TENANT = '11111111-1111-4111-8111-111111111111';
const AUDIENCE = 'api://mi-cliente-ag-test';
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;
const OID = '3F2504E0-4F89-11D3-9A0C-0305E82C3301';
const SPA_CLIENT = '7c2d9a41-6e3b-4f08-8a15-0d9b4e7f1c63';
const SCOPE = 'access_as_user';

let privateKey: KeyLike;
let otherPrivateKey: KeyLike;
let jwks: ReturnType<typeof createLocalJWKSet>;

function providerWith(settings: Record<string, string | undefined> = {}): EntraIdAuthenticationProvider {
  const values: Record<string, string | undefined> = { ENTRA_TENANT_ID: TENANT, ENTRA_AUDIENCE: AUDIENCE, ENTRA_AUTHORITY: undefined, ...settings };
  return new EntraIdAuthenticationProvider({ get: (key: string) => values[key] } as unknown as AppConfigService, jwks);
}

interface TokenOptions {
  claims?: Record<string, unknown>;
  issuer?: string;
  audience?: string;
  expiresIn?: string | number;
  withoutExp?: boolean;
  notBefore?: string | number;
  otherKey?: boolean;
}

/** Token v2 delegado por defecto: `ver` 2.0, `scp`, `azp` de la SPA, `oid` y `tid`. */
async function token(options: TokenOptions = {}): Promise<string> {
  const jwt = new SignJWT({ tid: TENANT, oid: OID, ver: '2.0', scp: SCOPE, azp: SPA_CLIENT, name: 'Ana Beltrán', preferred_username: 'Ana@Example.invalid', ...options.claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setSubject('pairwise-sub')
    .setIssuedAt();
  if (!options.withoutExp) jwt.setExpirationTime(options.expiresIn ?? '5m');
  if (options.notBefore !== undefined) jwt.setNotBefore(options.notBefore);
  return jwt.sign(options.otherKey ? otherPrivateKey : privateKey);
}

async function rejection(provider: EntraIdAuthenticationProvider, signed: string): Promise<InvalidTokenError> {
  const error = await provider.verifyAccessToken(signed).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(InvalidTokenError);
  return error as InvalidTokenError;
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  otherPrivateKey = (await generateKeyPair('RS256')).privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

describe('EntraIdAuthenticationProvider (llaves de prueba, sin red)', () => {
  const provider = (): EntraIdAuthenticationProvider => providerWith();

  it('acepta un token v2 delegado válido y lo traduce al principal: oid en minúsculas (no sub), correo normalizado, tenant y nombre', async () => {
    const principal = await provider().verifyAccessToken(await token());
    expect(principal).toMatchObject({
      subjectId: OID.toLowerCase(),
      type: 'user',
      tenantId: TENANT,
      email: 'ana@example.invalid',
      displayName: 'Ana Beltrán',
      issuedBy: 'entra',
    });
    expect(principal.subjectId).not.toBe('pairwise-sub');
  });

  describe('correo del token', () => {
    it('toma el correo de `email` si preferred_username no es un correo utilizable', async () => {
      const principal = await provider().verifyAccessToken(await token({ claims: { preferred_username: 'usuario-sin-arroba', email: 'Otro@Example.invalid' } }));
      expect(principal.email).toBe('otro@example.invalid');
    });

    it('toma el correo de `email` si preferred_username no viene', async () => {
      const principal = await provider().verifyAccessToken(await token({ claims: { preferred_username: undefined, email: 'otro@example.invalid' } }));
      expect(principal.email).toBe('otro@example.invalid');
    });

    it('sin ningún correo utilizable el principal no trae correo (la admisión responde IDENTITY_INCOMPLETE)', async () => {
      const principal = await provider().verifyAccessToken(await token({ claims: { preferred_username: 'sin-arroba', email: undefined } }));
      expect(principal.email).toBeUndefined();
    });

    it('M2: si preferred_username es el UPN de un invitado (#EXT#) NO se cae al claim email: sin correo', async () => {
      for (const upn of ['ana_empresa.com#EXT#@tenant.onmicrosoft.com', 'ana_empresa.com#ext#@tenant.onmicrosoft.com']) {
        const principal = await provider().verifyAccessToken(await token({ claims: { preferred_username: upn, email: 'ana@somosgrupoag.com' } }));
        expect(principal.email).toBeUndefined();
      }
    });

    it('M3: un correo con ancho cero o bidi no es utilizable (ni como preferred_username ni como email)', async () => {
      const zeroWidth = `ana${String.fromCharCode(0x200b)}@example.invalid`;
      const bidi = `ana@example.invalid${String.fromCharCode(0x202e)}`;
      expect((await provider().verifyAccessToken(await token({ claims: { preferred_username: zeroWidth, email: bidi } }))).email).toBeUndefined();
    });
  });

  it.each([
    ['otra audiencia', { audience: 'api://otra-api' }],
    ['otro issuer', { issuer: 'https://login.microsoftonline.com/22222222-2222-4222-8222-222222222222/v2.0' }],
    ['otro tenant (tid)', { claims: { tid: '22222222-2222-4222-8222-222222222222' } }],
    ['sin tid', { claims: { tid: undefined } }],
    ['expirado', { expiresIn: '-10m' }],
    ['todavía no válido (nbf)', { notBefore: '10m' }],
    ['firmado con otra llave', { otherKey: true }],
    ['sin oid', { claims: { oid: undefined } }],
    ['oid que no es un GUID', { claims: { oid: 'no-es-un-guid' } }],
  ] as [string, TokenOptions][])('rechaza un token %s', async (_name, options) => {
    await rejection(provider(), await token(options));
  });

  it('B1: rechaza un token sin expiración (requiredClaims exp)', async () => {
    const error = await rejection(provider(), await token({ withoutExp: true }));
    expect(error.code).toBe('ERR_JWT_CLAIM_VALIDATION_FAILED');
  });

  describe('M1: solo tokens delegados de usuario v2.0', () => {
    it('rechaza un token de aplicación (sin scp)', async () => {
      expect((await rejection(provider(), await token({ claims: { scp: undefined, roles: ['Task.Read'] } }))).code).toBe(ENTRA_REJECTION.scopeMissing);
    });

    it.each(['', '   '])('rechaza un scp vacío (%p)', async (scp) => {
      expect((await rejection(provider(), await token({ claims: { scp } }))).code).toBe(ENTRA_REJECTION.scopeMissing);
    });

    it('rechaza un scp que no es texto', async () => {
      expect((await rejection(provider(), await token({ claims: { scp: ['access_as_user'] } }))).code).toBe(ENTRA_REJECTION.scopeMissing);
    });

    it.each([['1.0'], [undefined], ['3.0']])('rechaza un token con ver %p (solo v2.0)', async (ver) => {
      expect((await rejection(provider(), await token({ claims: { ver } }))).code).toBe(ENTRA_REJECTION.version);
    });

    it('rechaza un token v1 aunque traiga appid y scp', async () => {
      const v1 = await token({ claims: { ver: '1.0', appid: SPA_CLIENT, azp: undefined } });
      expect((await rejection(providerWith({ ENTRA_ALLOWED_CLIENT_IDS: SPA_CLIENT }), v1)).code).toBe(ENTRA_REJECTION.version);
    });

    it('con ENTRA_REQUIRED_SCOPE el scp debe contenerlo (entre varios, separados por espacio)', async () => {
      const strict = providerWith({ ENTRA_REQUIRED_SCOPE: SCOPE });
      await expect(strict.verifyAccessToken(await token({ claims: { scp: 'otro access_as_user' } }))).resolves.toMatchObject({ type: 'user' });
      expect((await rejection(strict, await token({ claims: { scp: 'otro_scope' } }))).code).toBe(ENTRA_REJECTION.scopeNotAllowed);
      expect((await rejection(strict, await token({ claims: { scp: 'access_as_user_extra' } }))).code).toBe(ENTRA_REJECTION.scopeNotAllowed);
    });

    it('con ENTRA_ALLOWED_CLIENT_IDS el azp debe estar en la lista (sin distinguir mayúsculas); sin azp, rechaza', async () => {
      const strict = providerWith({ ENTRA_ALLOWED_CLIENT_IDS: ` ${SPA_CLIENT.toUpperCase()} , 99999999-9999-4999-8999-999999999999 ` });
      await expect(strict.verifyAccessToken(await token())).resolves.toMatchObject({ type: 'user' });
      expect((await rejection(strict, await token({ claims: { azp: '00000000-0000-4000-8000-000000000000' } }))).code).toBe(ENTRA_REJECTION.clientNotAllowed);
      expect((await rejection(strict, await token({ claims: { azp: undefined } }))).code).toBe(ENTRA_REJECTION.clientNotAllowed);
      expect((await rejection(strict, await token({ claims: { azp: 42 } }))).code).toBe(ENTRA_REJECTION.clientNotAllowed);
    });

    it('un appid válido NO sustituye al azp (con v2 el cliente es azp)', async () => {
      const strict = providerWith({ ENTRA_ALLOWED_CLIENT_IDS: SPA_CLIENT });
      expect((await rejection(strict, await token({ claims: { azp: undefined, appid: SPA_CLIENT } }))).code).toBe(ENTRA_REJECTION.clientNotAllowed);
    });

    it('sin esas variables configuradas no se aplican (solo se exigen scp y ver)', async () => {
      await expect(provider().verifyAccessToken(await token({ claims: { scp: 'cualquiera', azp: 'cualquiera' } }))).resolves.toMatchObject({ type: 'user' });
    });
  });

  it('el rechazo lleva un código estable y su mensaje no incluye datos del token', async () => {
    const error = await rejection(provider(), await token({ expiresIn: '-10m', claims: { preferred_username: 'secreto@example.invalid' } }));
    expect(error.code).toBe('ERR_JWT_EXPIRED');
    expect(error.message).not.toContain('secreto');
    expect(error.message).toBe('Access token verification failed');
  });

  it('rechaza un token sin firma (alg none) y un texto que no es un JWT', async () => {
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ tid: TENANT, oid: OID, iss: ISSUER, aud: AUDIENCE, exp: 4_102_444_800 })).toString('base64url')}.`;
    await rejection(provider(), unsigned);
    await rejection(provider(), 'no-es-un-jwt');
  });

  it('rechaza un token firmado con un algoritmo distinto de RS256', async () => {
    const hs = await new SignJWT({ tid: TENANT, oid: OID, ver: '2.0', scp: SCOPE })
      .setProtectedHeader({ alg: 'HS256', kid: 'test-key' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('una-clave-simetrica-de-prueba-0123456789'));
    await rejection(provider(), hs);
  });

  it('sin ENTRA_TENANT_ID o ENTRA_AUDIENCE configurados rechaza todo', async () => {
    const unconfigured = new EntraIdAuthenticationProvider({ get: () => undefined } as unknown as AppConfigService);
    expect((await rejection(unconfigured, await token())).code).toBe(ENTRA_REJECTION.notConfigured);
  });
});

describe('parseClientIds', () => {
  it('separa por comas, recorta, baja a minúsculas y omite vacíos', () => {
    expect(parseClientIds(' A-1 ,, b-2 ,')).toEqual(['a-1', 'b-2']);
    expect(parseClientIds(undefined)).toEqual([]);
  });
});
