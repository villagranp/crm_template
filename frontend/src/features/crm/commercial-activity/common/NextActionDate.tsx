import { Typography } from '@mui/material';

import { formatCalendarDate, todayInTimeZone } from './date-time';
import { useCommercialTimeZones } from './use-commercial-time-zones';

export interface NextActionDateProps {
  /** Fecha de calendario `YYYY-MM-DD` o `null`. */
  date: string | null;
  /** Texto antes de la fecha (p. ej. `' · '` cuando va detrás de la acción). */
  prefix?: string;
  /** "Hoy" de referencia (`YYYY-MM-DD`); por defecto, hoy en la zona de negocio (RN-04.9). */
  today?: string;
}

/**
 * Fecha de la próxima acción (04 §E.4): resaltada (color **y** texto "hoy" /
 * "pasada", nunca sólo color) si es hoy o ya pasó. Las fechas de calendario no
 * tienen zona: se comparan como texto `YYYY-MM-DD`.
 */
export function NextActionDate({ date, prefix = '', today: explicitToday }: NextActionDateProps) {
  const { businessTimeZone } = useCommercialTimeZones();
  const today = explicitToday ?? todayInTimeZone(businessTimeZone);
  if (!date) {
    return null;
  }
  const due = date <= today;
  let suffix = '';
  if (date === today) {
    suffix = ' (hoy)';
  } else if (date < today) {
    suffix = ' (pasada)';
  }
  return (
    <Typography
      component="span"
      variant="body2"
      sx={{ color: due ? 'warning.main' : 'text.secondary', fontWeight: due ? 'fontWeightMedium' : undefined }}
    >
      {`${prefix}${formatCalendarDate(date)}${suffix}`}
    </Typography>
  );
}
