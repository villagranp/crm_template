import { z } from 'zod';

/**
 * Esquema unico de configuracion del backend.
 * La aplicacion falla al arrancar si falta o es invalida una variable obligatoria (fail fast).
 * Toda variable nueva se agrega aqui Y en el .env.example de la raiz.
 */
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
    JWT_ACCESS_TOKEN_TTL: z.string().default('15m'),
    JWT_REFRESH_TOKEN_SECRET: z.string().optional(),
    JWT_REFRESH_TOKEN_TTL: z.string().default('7d'),

    // ENTRA ID
    ENTRA_TENANT_ID: z.string().optional(),
    ENTRA_CLIENT_ID: z.string().optional(),
    ENTRA_AUDIENCE: z.string().optional(),
    ENTRA_AUTHORITY: z.string().optional(),
    ENTRA_JWKS_URI: z.string().optional(),

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
