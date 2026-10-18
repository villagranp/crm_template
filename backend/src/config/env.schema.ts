import { z } from 'zod';

import { DURATION_PATTERN } from './duration';

/**
 * Esquema unico de configuracion del backend.
 * La aplicacion falla al arrancar si falta o es invalida una variable obligatoria (fail fast).
 * Toda variable nueva se agrega aqui Y en el .env.example de la raiz.
 */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const envSchema = z
  .object({
    // APP
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().min(1).default('enterprise-app'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    API_GLOBAL_PREFIX: z.string().default('api'),
    API_DEFAULT_VERSION: z.string().default('1'),
    SWAGGER_ENABLED: z
      .string()
      .default('true')
      .transform((value) => value === 'true'),

    // DATABASE
    DATABASE_PROVIDER: z.enum(['postgresql', 'mysql']).default('postgresql'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

    // AUTH
    AUTH_PROVIDER: z.enum(['local', 'entra', 'hybrid']).default('local'),
    JWT_ISSUER: z.string().default('enterprise-app'),
    JWT_AUDIENCE: z.string().default('enterprise-api'),
    JWT_ACCESS_TOKEN_SECRET: z.string().optional(),
    // Formato estrecho (entero + s|m|h|d): lo consumen jose y la caducidad de la
    // sesión, y ambos deben leer lo mismo. Ver PLAN-AUTH-LOCAL, D1 y D2.
    JWT_ACCESS_TOKEN_TTL: z.string().regex(DURATION_PATTERN, 'Usa un entero y s, m, h o d').default('15m'),
    JWT_REFRESH_TOKEN_SECRET: z.string().optional(),
    // Vida absoluta de la sesión, sin deslizamiento: rotar no la alarga.
    JWT_REFRESH_TOKEN_TTL: z.string().regex(DURATION_PATTERN, 'Usa un entero y s, m, h o d').default('8h'),
    // Contrasena inicial de los usuarios que da de alta o restablece un
    // administrador (PLAN-AUTH-LOCAL, D12). Siempre con cambio obligatorio.
    // Vacia = las altas nacen sin credencial y el restablecimiento no esta disponible.
    AUTH_DEFAULT_PASSWORD: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(12, 'Debe tener al menos 12 caracteres').max(128).optional(),
    ),

    // ENTRA ID
    ENTRA_TENANT_ID: z.string().optional(),
    ENTRA_CLIENT_ID: z.string().optional(),
    ENTRA_AUDIENCE: z.string().optional(),
    ENTRA_AUTHORITY: z.string().optional(),
    ENTRA_JWKS_URI: z.string().optional(),
    // ADR-027: scope delegado que debe traer el token (`scp`) y clientes (`azp`) que pueden pedirlo, separados
    // por comas. Se aplican siempre que esten configurados; con NODE_ENV=production y AUTH_PROVIDER=entra
    // son obligatorios (abajo).
    ENTRA_REQUIRED_SCOPE: z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.string().trim().optional()),
    ENTRA_ALLOWED_CLIENT_IDS: z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.string().trim().optional()),

    // CORS
    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

    // LOGGING
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    LOG_PRETTY: z
      .string()
      .default('false')
      .transform((value) => value === 'true'),
    CORRELATION_ID_HEADER: z.string().default('x-correlation-id'),

    // RATE LIMITING
    RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),

    // ADJUNTOS (ADR-021)
    // Ruta base del almacenamiento de adjuntos (relativa al directorio de trabajo
    // del backend o absoluta). Se crea al arrancar si no existe; si no se puede
    // crear o no es escribible, el backend no arranca. En Docker es un volumen.
    ATTACHMENTS_STORAGE_PATH: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z
        .string()
        .trim()
        .max(1024)
        .refine((value) => !value.includes('\u0000'), 'ATTACHMENTS_STORAGE_PATH contiene caracteres no validos')
        .default('./storage/attachments'),
    ),

    // SNOWFLAKE (opcional)
    SNOWFLAKE_ENABLED: z
      .string()
      .default('false')
      .transform((value) => value === 'true'),
    SNOWFLAKE_ACCOUNT: z.string().optional(),
    SNOWFLAKE_USERNAME: z.string().optional(),
    SNOWFLAKE_ROLE: z.string().optional(),
    SNOWFLAKE_WAREHOUSE: z.string().optional(),
    SNOWFLAKE_DATABASE: z.string().optional(),
    SNOWFLAKE_SCHEMA: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const requiresLocalJwt = env.AUTH_PROVIDER === 'local' || env.AUTH_PROVIDER === 'hybrid';
    if (requiresLocalJwt && env.NODE_ENV === 'production' && !env.JWT_ACCESS_TOKEN_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_TOKEN_SECRET'],
        message: 'JWT_ACCESS_TOKEN_SECRET es obligatorio cuando AUTH_PROVIDER usa JWT local',
      });
    }

    const requiresEntra = env.AUTH_PROVIDER === 'entra' || env.AUTH_PROVIDER === 'hybrid';
    if (requiresEntra) {
      const missing = (['ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_AUDIENCE'] as const).filter(
        (key) => !env[key],
      );
      for (const key of missing) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} es obligatorio cuando AUTH_PROVIDER incluye Entra ID`,
        });
      }

      const issue = (key: string, message: string): void => {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });
      };
      const tenant = env.ENTRA_TENANT_ID;
      if (tenant && !GUID.test(tenant)) {
        issue('ENTRA_TENANT_ID', 'ENTRA_TENANT_ID debe ser un GUID');
      }
      if (env.ENTRA_AUTHORITY) {
        const authority = env.ENTRA_AUTHORITY;
        const valid = authority.startsWith('https://') && authority.endsWith('/v2.0') && (!tenant || authority.toLowerCase().includes(tenant.toLowerCase()));
        if (!valid) {
          issue('ENTRA_AUTHORITY', 'ENTRA_AUTHORITY debe ser HTTPS, contener el tenant y terminar en /v2.0 (se aceptan solo tokens v2)');
        }
      }
      if (env.ENTRA_JWKS_URI && !env.ENTRA_JWKS_URI.startsWith('https://')) {
        issue('ENTRA_JWKS_URI', 'ENTRA_JWKS_URI debe ser HTTPS');
      }
      const clients = (env.ENTRA_ALLOWED_CLIENT_IDS ?? '').split(',').map((id) => id.trim()).filter((id) => id.length > 0);
      if (clients.some((id) => !GUID.test(id))) {
        issue('ENTRA_ALLOWED_CLIENT_IDS', 'ENTRA_ALLOWED_CLIENT_IDS debe ser una lista de GUID separados por comas');
      }
      if (env.NODE_ENV === 'production') {
        if (!env.ENTRA_REQUIRED_SCOPE) {
          issue('ENTRA_REQUIRED_SCOPE', 'ENTRA_REQUIRED_SCOPE es obligatorio en producción con Entra ID (el scope que expone la API)');
        }
        if (clients.length === 0) {
          issue('ENTRA_ALLOWED_CLIENT_IDS', 'ENTRA_ALLOWED_CLIENT_IDS es obligatorio en producción con Entra ID (el client id de la SPA)');
        }
      }
    }
  });

export type AppEnvironment = z.infer<typeof envSchema>;

/**
 * Valida el entorno. Lanza un error legible con TODAS las variables invalidas,
 * sin imprimir sus valores (pueden ser secretos).
 */
export function validateEnvironment(raw: Record<string, unknown>): AppEnvironment {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuracion invalida:\n${details}`);
  }

  return result.data;
}
