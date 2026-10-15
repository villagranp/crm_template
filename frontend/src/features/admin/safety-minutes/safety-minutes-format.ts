/** Formatos de la pantalla del minuto de seguridad. */

const DATE_TIME = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' });

/** `YYYY-MM-DD` → `dd/mm/aaaa`, sin pasar por `Date` (una fecha sin hora no tiene zona: podría restar un día). */
export function formatDisplayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME.format(date);
}
