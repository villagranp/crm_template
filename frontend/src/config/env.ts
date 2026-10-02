import { z } from 'zod';

/**
 * Frontend runtime configuration.
 *
 * Everything prefixed with `VITE_` is embedded in the published bundle and is
 * therefore PUBLIC. Never place secrets here (see SECURITY.md section "Secrets").
 *
 * Validation runs once at module load so the application fails fast on a
 * misconfigured build instead of failing later with a confusing runtime error.
 */
const envSchema = z
  .object({
    VITE_API_BASE_URL: z.string().min(1).default('/api/v1'),
    VITE_AUTH_PROVIDER: z.enum(['local', 'entra']).default('local'),
    VITE_ENTRA_CLIENT_ID: z.string().optional(),
    VITE_ENTRA_TENANT_ID: z.string().optional(),
    VITE_ENTRA_AUTHORITY: z.string().optional(),
    VITE_ENTRA_REDIRECT_URI: z.string().optional(),
    VITE_ENTRA_API_SCOPE: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.VITE_AUTH_PROVIDER !== 'entra') {
      return;
    }

    const requiredForEntra = [
      'VITE_ENTRA_CLIENT_ID',
      'VITE_ENTRA_TENANT_ID',
      'VITE_ENTRA_AUTHORITY',
      'VITE_ENTRA_REDIRECT_URI',
      'VITE_ENTRA_API_SCOPE',
    ] as const;

    for (const key of requiredForEntra) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when VITE_AUTH_PROVIDER=entra`,
        });
      }
    }
  });

export type AppEnvironment = z.infer<typeof envSchema>;

function parseEnvironment(): AppEnvironment {
  const result = envSchema.safeParse(import.meta.env);

  if (!result.success) {
    // Only the failing variable NAMES are reported, never their values.
    const invalidKeys = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid frontend configuration. Check these variables: ${invalidKeys}`);
  }

  return result.data;
}

export const env: AppEnvironment = parseEnvironment();

export const IS_PRODUCTION_BUILD = import.meta.env.PROD;
