import { validateEnvironment } from './env.schema';

const TENANT = '4b1f0e6a-2d9c-4a57-9b0e-5f3a7c1d2e80';
const CLIENT = '7c2d9a41-6e3b-4f08-8a15-0d9b4e7f1c63';

const BASE = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

const ENTRA = {
  ...BASE,
  AUTH_PROVIDER: 'entra',
  ENTRA_TENANT_ID: TENANT,
  ENTRA_CLIENT_ID: CLIENT,
  ENTRA_AUDIENCE: 'api://mi-cliente-ag',
  ENTRA_AUTHORITY: `https://login.microsoftonline.com/${TENANT}/v2.0`,
  ENTRA_JWKS_URI: `https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`,
};

const PRODUCTION = {
  ...ENTRA,
  NODE_ENV: 'production',
  ENTRA_REQUIRED_SCOPE: 'access_as_user',
  ENTRA_ALLOWED_CLIENT_IDS: CLIENT,
  CORS_ALLOWED_ORIGINS: 'https://crm.example.com',
};

function issuesOf(raw: Record<string, unknown>): string {
  try {
    validateEnvironment(raw);
    return '';
  } catch (error) {
    return (error as Error).message;
  }
}

describe('validateEnvironment · Entra ID (ADR-027)', () => {
  it('el modo local no exige nada de Entra ID ni valida los marcadores del .env.example', () => {
    expect(issuesOf({ ...BASE, ENTRA_TENANT_ID: '<tenant-id>', ENTRA_AUTHORITY: 'http://x/<tenant-id>/v2.0', ENTRA_REQUIRED_SCOPE: '' })).toBe('');
  });

  it('una configuración de Entra ID válida (desarrollo) pasa sin scope ni clientes', () => {
    expect(issuesOf(ENTRA)).toBe('');
  });

  it('exige tenant, cliente y audiencia', () => {
    const message = issuesOf({ ...BASE, AUTH_PROVIDER: 'entra' });
    for (const key of ['ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_AUDIENCE']) expect(message).toContain(key);
  });

  it('B2: ENTRA_TENANT_ID debe ser un GUID', () => {
    expect(issuesOf({ ...ENTRA, ENTRA_TENANT_ID: 'mi-tenant', ENTRA_AUTHORITY: undefined })).toContain('ENTRA_TENANT_ID debe ser un GUID');
  });

  it.each([
    ['HTTP', `http://login.microsoftonline.com/${TENANT}/v2.0`],
    ['sin /v2.0 (tokens v1)', `https://login.microsoftonline.com/${TENANT}/`],
    ['sin el tenant', 'https://login.microsoftonline.com/22222222-2222-4222-8222-222222222222/v2.0'],
    ['con barra final', `https://login.microsoftonline.com/${TENANT}/v2.0/`],
  ])('B2: ENTRA_AUTHORITY %s se rechaza', (_name, authority) => {
    expect(issuesOf({ ...ENTRA, ENTRA_AUTHORITY: authority })).toContain('ENTRA_AUTHORITY');
  });

  it('B2: ENTRA_JWKS_URI debe ser HTTPS', () => {
    expect(issuesOf({ ...ENTRA, ENTRA_JWKS_URI: 'http://login.microsoftonline.com/keys' })).toContain('ENTRA_JWKS_URI debe ser HTTPS');
  });

  it('ENTRA_ALLOWED_CLIENT_IDS debe ser una lista de GUID', () => {
    expect(issuesOf({ ...ENTRA, ENTRA_ALLOWED_CLIENT_IDS: `${CLIENT},no-guid` })).toContain('ENTRA_ALLOWED_CLIENT_IDS');
    expect(issuesOf({ ...ENTRA, ENTRA_ALLOWED_CLIENT_IDS: `${CLIENT}, ${CLIENT.toUpperCase()}` })).toBe('');
  });

  describe('M1: en producción con Entra ID, scope y clientes son obligatorios (falla al arrancar)', () => {
    it('una configuración completa pasa', () => {
      expect(issuesOf(PRODUCTION)).toBe('');
    });

    it('sin ENTRA_REQUIRED_SCOPE falla', () => {
      expect(issuesOf({ ...PRODUCTION, ENTRA_REQUIRED_SCOPE: undefined })).toContain('ENTRA_REQUIRED_SCOPE es obligatorio');
      expect(issuesOf({ ...PRODUCTION, ENTRA_REQUIRED_SCOPE: '   ' })).toContain('ENTRA_REQUIRED_SCOPE es obligatorio');
    });

    it('sin ENTRA_ALLOWED_CLIENT_IDS falla', () => {
      expect(issuesOf({ ...PRODUCTION, ENTRA_ALLOWED_CLIENT_IDS: undefined })).toContain('ENTRA_ALLOWED_CLIENT_IDS es obligatorio');
      expect(issuesOf({ ...PRODUCTION, ENTRA_ALLOWED_CLIENT_IDS: ' , ' })).toContain('ENTRA_ALLOWED_CLIENT_IDS es obligatorio');
    });

    it('el modo local en producción no los exige', () => {
      expect(issuesOf({ ...BASE, NODE_ENV: 'production', JWT_ACCESS_TOKEN_SECRET: 'x'.repeat(40), CORS_ALLOWED_ORIGINS: '' })).toBe('');
    });
  });
});

describe('validateEnvironment · CORS en producción (endurecimiento para internet)', () => {
  const LOCAL_PRODUCTION = { ...BASE, NODE_ENV: 'production', JWT_ACCESS_TOKEN_SECRET: 'x'.repeat(40) };

  it.each([
    ['un origen https', 'https://crm.example.com'],
    ['varios orígenes https con puerto y espacios', 'https://crm.example.com, https://10.0.0.5:8443'],
    ['ninguno (SPA y API en el mismo origen)', ''],
  ])('admite %s', (_name, origins) => {
    expect(issuesOf({ ...LOCAL_PRODUCTION, CORS_ALLOWED_ORIGINS: origins })).toBe('');
  });

  it.each([
    ['el comodín', '*'],
    ['un origen http', 'http://crm.example.com'],
    ['http mezclado con https', 'https://crm.example.com,http://localhost'],
    ['una ruta', 'https://crm.example.com/app'],
    ['una barra final', 'https://crm.example.com/'],
    ['un comodín de subdominio', 'https://*.example.com'],
    ['un valor que no es URL', 'crm.example.com'],
  ])('falla al arrancar con %s', (_name, origins) => {
    expect(issuesOf({ ...LOCAL_PRODUCTION, CORS_ALLOWED_ORIGINS: origins })).toContain('CORS_ALLOWED_ORIGINS en producción solo admite orígenes https://');
  });

  it('sin la variable en producción falla: el valor por defecto es de desarrollo (http)', () => {
    expect(issuesOf(LOCAL_PRODUCTION)).toContain('CORS_ALLOWED_ORIGINS');
  });

  it('fuera de producción conserva los orígenes http de desarrollo', () => {
    expect(issuesOf({ ...BASE, CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost' })).toBe('');
    expect(issuesOf({ ...BASE, NODE_ENV: 'test', CORS_ALLOWED_ORIGINS: 'http://localhost' })).toBe('');
  });
});

describe('validateEnvironment · TRUST_PROXY_HOPS', () => {
  it('por defecto confía en un salto (NGINX)', () => {
    expect(validateEnvironment(BASE).TRUST_PROXY_HOPS).toBe(1);
    expect(validateEnvironment({ ...BASE, TRUST_PROXY_HOPS: '' }).TRUST_PROXY_HOPS).toBe(1);
  });

  it.each([
    ['0', 0],
    ['2', 2],
  ])('acepta %s', (raw, expected) => {
    expect(validateEnvironment({ ...BASE, TRUST_PROXY_HOPS: raw }).TRUST_PROXY_HOPS).toBe(expected);
  });

  it.each(['-1', '1.5', 'true', 'abc'])('rechaza %s', (raw) => {
    expect(issuesOf({ ...BASE, TRUST_PROXY_HOPS: raw })).toContain('TRUST_PROXY_HOPS');
  });
});
