import { formatCalendarDate, formatDateTime } from '@/features/crm/commercial-activity/entry-points';

import { useReportTimeZones } from './use-report-time-zones';

/**
 * Fechas de Reportes (RN-05.7): un **instante** (`…Z`) en la zona del perfil del usuario que
 * publica `GET /reports/filter-options` (P-05.27; la del navegador mientras carga); una **fecha de calendario**
 * (`YYYY-MM-DD`) tal cual, sin conversión de zona.
 */
export function ReportDateTime({ value }: { value: string | null | undefined }) {
  const { timeZone } = useReportTimeZones();
  return <>{formatDateTime(value, timeZone)}</>;
}

export function ReportCalendarDate({ value }: { value: string | null | undefined }) {
  return <>{formatCalendarDate(value)}</>;
}
