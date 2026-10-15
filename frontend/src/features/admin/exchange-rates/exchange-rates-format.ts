/** Formatos de la pantalla de tipos de cambio. */

const DATE_TIME = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' });

/**
 * `YYYY-MM-DD` → `dd/mm/aaaa`, sin pasar por `Date`: la fecha de vigencia no
 * tiene hora ni zona (DM-31) y convertirla podría restar un día.
 */
export function formatEffectiveDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/**
 * Tasa decimal sin ceros finales sobrantes (`"7.75000000"` → `"7.75"`), sin
 * convertirla a `number` para no perder precisión. Conserva al menos 2 decimales.
 */
export function formatRate(value: string): string {
  const [integer, decimals = ''] = value.split('.');
  const trimmed = decimals.replace(/0+$/, '').padEnd(2, '0');
  return `${integer}.${trimmed}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME.format(date);
}

/** Moneda base sin tasa (ADR-024, `ck_exchange_rates_not_base`). */
export const BASE_CURRENCY = 'USD';
