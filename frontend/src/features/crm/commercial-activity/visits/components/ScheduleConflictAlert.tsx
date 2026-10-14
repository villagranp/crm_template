import { Alert, AlertTitle, Box, Typography } from '@mui/material';

import { formatDateTime, formatTime } from '../../common/date-time';
import { useCommercialTimeZones } from '../../common/use-commercial-time-zones';
import type { ScheduleConflict, ScheduleConflictMode } from '../visits.api';

export interface ScheduleConflictAlertProps {
  conflicts: readonly ScheduleConflict[];
  /** Con `BLOQUEAR` el backend rechaza el guardado (`409`): se avisa, sin deshabilitar nada. */
  mode?: ScheduleConflictMode;
  /** `true` si el responsable es el propio usuario ("Ya tienes…"). */
  ownVisits?: boolean;
  /** Tras guardar: la visita ya quedó guardada con el solape (modo `AVISAR`). */
  saved?: boolean;
}

function describeConflict(conflict: ScheduleConflict, timeZone: string | undefined): string {
  const range = `${formatDateTime(conflict.scheduledStartAt, timeZone)} a ${formatTime(conflict.effectiveEndAt, timeZone)}`;
  // Una visita fuera del alcance llega sin código ni cliente (no se revelan sus datos, AC-04.59).
  if (!conflict.isVisible || !conflict.code) {
    return `Otra visita del responsable, de ${range}`;
  }
  return conflict.customerName ? `${conflict.code}, de ${range}, con ${conflict.customerName}` : `${conflict.code}, de ${range}`;
}

/**
 * Aviso de conflicto horario (04 §E.7, RN-04.14, D-04.2): lista los solapes con
 * otras visitas no canceladas del mismo responsable. Es una advertencia: no
 * impide guardar (modo `AVISAR`). Se usa antes de guardar (planificar,
 * reprogramar) y después, en el detalle, con los `scheduleConflicts` de la
 * respuesta.
 */
export function ScheduleConflictAlert({ conflicts, mode, ownVisits = true, saved = false }: ScheduleConflictAlertProps) {
  const { timeZone } = useCommercialTimeZones();
  if (conflicts.length === 0) {
    return null;
  }
  const blocking = mode === 'BLOQUEAR';
  let title = ownVisits ? 'Ya tienes otra visita en ese horario' : 'El responsable ya tiene otra visita en ese horario';
  if (saved) {
    title = 'La visita se guardó, pero se solapa con otra';
  }

  return (
    <Alert severity={blocking ? 'error' : 'warning'} role="status">
      <AlertTitle>{title}</AlertTitle>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {conflicts.map((conflict, index) => (
          <Typography component="li" variant="body2" key={conflict.visitId ?? `oculta-${index}`} sx={{ overflowWrap: 'anywhere' }}>
            {describeConflict(conflict, timeZone)}
          </Typography>
        ))}
      </Box>
      {saved ? null : (
        <Typography variant="body2" sx={{ mt: 1 }}>
          {blocking ? 'La configuración actual no permite guardar visitas que se solapan.' : 'Puedes guardar igualmente.'}
        </Typography>
      )}
    </Alert>
  );
}
