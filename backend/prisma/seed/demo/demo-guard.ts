/**
 * Guardia de la semilla de demostración (00 §8.1). TODAS deben cumplirse; si
 * una falla, la semilla termina con código ≠ 0 sin escribir nada.
 *
 * 1. `NODE_ENV !== 'production'`.
 * 2. Variable explícita `SEED_DEMO=true`.
 * 3. Parámetro en base `sistema.permite_datos_demo = true` (la semilla esencial
 *    lo crea con `false` y nunca pisa su valor).
 * 4. (Estructural) el script no se referencia desde `package.json#prisma.seed`,
 *    ni desde pipelines ni desde el `Dockerfile`.
 */
export const DEMO_PARAMETER_KEY = 'sistema.permite_datos_demo';

export interface DemoGuardInput {
  nodeEnv: string | undefined;
  seedDemo: string | undefined;
  /** Valor del parámetro en base; `null` si no existe (semilla esencial sin ejecutar). */
  parameterValue: string | null;
}

/** Devuelve los motivos de rechazo; lista vacía = se puede sembrar. */
export function evaluateDemoGuards(input: DemoGuardInput): string[] {
  const failures: string[] = [];

  if ((input.nodeEnv ?? '').trim().toLowerCase() === 'production') {
    failures.push('NODE_ENV=production: la semilla de demostración nunca se ejecuta en producción.');
  }
  if (input.seedDemo !== 'true') {
    failures.push('Falta SEED_DEMO=true: la semilla de demostración exige activarla explícitamente.');
  }
  if (input.parameterValue === null) {
    failures.push(`No existe el parámetro ${DEMO_PARAMETER_KEY}: ejecuta antes la semilla esencial (prisma:seed).`);
  } else if (input.parameterValue.trim().toLowerCase() !== 'true') {
    failures.push(`El parámetro ${DEMO_PARAMETER_KEY} no es true en esta base de datos.`);
  }

  return failures;
}

export interface DemoPasswordEnv {
  SEED_DEMO_PASSWORD?: string;
  AUTH_PROVIDER?: string;
}

/**
 * Contraseña inicial de los usuarios demo: SOLO `SEED_DEMO_PASSWORD`. No cae a
 * `AUTH_DEFAULT_PASSWORD` (esa es la de las altas reales): sin la variable
 * explícita, o con `AUTH_PROVIDER=entra`, devuelve `undefined` y las cuentas
 * demo quedan `INVITED` sin credencial.
 */
export function resolveDemoPassword(env: DemoPasswordEnv): string | undefined {
  if (env.AUTH_PROVIDER === 'entra') {
    return undefined;
  }
  const password = env.SEED_DEMO_PASSWORD;
  return password && password.trim().length > 0 ? password : undefined;
}
