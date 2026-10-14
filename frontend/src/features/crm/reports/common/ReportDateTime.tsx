import { formatCalendarDate, formatDateTime, useCommercialTimeZones } from '@/features/crm/commercial-activity/entry-points';

/**
 * Fechas de Reportes (RN-05.7): un **instante** (`…Z`) en la zona del perfil del usuario, como
 * en Actividad comercial (la del navegador mientras carga); una **fecha de calendario**
 * (`YYYY-MM-DD`) tal cual, sin conversión de zona.
 */
export function ReportDateTime({ value }: { value: string | null | undefined }) {
  const { timeZone } = useCommercialTimeZones();
  return <>{formatDateTime(value, timeZone)}</>;
}

export function ReportCalendarDate({ value }: { value: string | null | undefined }) {
  return <>{formatCalendarDate(value)}</>;
}
