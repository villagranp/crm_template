/**
 * Duraciones de configuración (`15m`, `8h`, `7d`) a milisegundos.
 *
 * El formato es deliberadamente estrecho —un entero y una unidad— y coincide
 * con la validación de `env.schema.ts`. Así el valor que firma el access token
 * y el que fija la caducidad de la sesión salen siempre de la misma lectura.
 */

export const DURATION_PATTERN = /^(\d+)([smhd])$/;

type DurationUnit = 's' | 'm' | 'h' | 'd';

const UNIT_MS: Record<DurationUnit, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDurationMs(value: string): number {
  const match = DURATION_PATTERN.exec(value);
  const amount = match ? Number(match[1]) : 0;

  if (!match || amount <= 0) {
    throw new Error(`Duración inválida: "${value}". Usa un entero y s, m, h o d (por ejemplo 15m).`);
  }

  return amount * UNIT_MS[match[2] as DurationUnit];
}
