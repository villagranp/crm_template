import { formatDate, formatDateTime, formatTime } from './date-time';
import { useCommercialTimeZones } from './use-commercial-time-zones';

const FORMATTERS = { dateTime: formatDateTime, date: formatDate, time: formatTime } as const;

export interface ZonedDateTimeProps {
  /** Instante ISO (`…Z`) o `null`. */
  value: string | null | undefined;
  /** Por defecto, fecha y hora. */
  format?: keyof typeof FORMATTERS;
}

/**
 * Texto de un instante en la zona del usuario (RN-04.9, D-04.17): para celdas
 * de tabla y otros sitios donde no hay un componente que pase la zona.
 */
export function ZonedDateTime({ value, format = 'dateTime' }: ZonedDateTimeProps) {
  const { timeZone } = useCommercialTimeZones();
  return <>{FORMATTERS[format](value, timeZone)}</>;
}
