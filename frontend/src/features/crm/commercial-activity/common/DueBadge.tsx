import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import { Box, Stack, Typography } from '@mui/material';

import type { DueBucket } from './commercial-activity.api';
import { describeDue, formatDateTime } from './date-time';

export interface DueBadgeProps {
  /** Vencimiento (instante ISO) o `null` si no tiene. */
  dueAt: string | null;
  /** Clasificación del backend (RN-04.31); `null` si la actividad ya no está abierta. */
  bucket: DueBucket | null;
  /** Instante de referencia del texto relativo (por defecto, ahora). */
  now?: Date;
}

const BUCKET_VIEW: Partial<Record<DueBucket, { label: string; color: string; Icon: typeof ScheduleOutlinedIcon }>> = {
  OVERDUE: { label: 'Vencida', color: 'error.main', Icon: ReportProblemOutlinedIcon },
  DUE_SOON: { label: 'Próxima a vencer', color: 'warning.main', Icon: ScheduleOutlinedIcon },
};

/**
 * Vencimiento de una actividad (04 §E.3, §E.9): marca de vencida o próxima a
 * vencer (texto + icono + color, nunca sólo color), texto relativo ("vence en
 * 5 h", "venció hace 2 días") y fecha absoluta. La clasificación la decide el
 * backend con el umbral `crm.alertas.actividad_por_vencer_horas`: aquí no se
 * recalcula. Una actividad cerrada sólo muestra la fecha.
 */
export function DueBadge({ dueAt, bucket, now }: DueBadgeProps) {
  if (!dueAt) {
    return (
      <Typography variant="body2" color="text.secondary" component="span">
        Sin vencimiento
      </Typography>
    );
  }

  const view = bucket ? BUCKET_VIEW[bucket] : undefined;
  const relative = bucket ? describeDue(dueAt, now) : null;

  return (
    <Stack spacing={0.25} component="span" sx={{ display: 'inline-flex', minWidth: 0 }}>
      {view ? (
        <Box
          component="span"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: view.color, fontWeight: 'fontWeightMedium', typography: 'body2' }}
        >
          <view.Icon fontSize="inherit" aria-hidden />
          {view.label}
        </Box>
      ) : null}
      <Typography variant={view ? 'caption' : 'body2'} color={view ? 'text.secondary' : 'text.primary'} component="span">
        {relative ? `${relative} · ${formatDateTime(dueAt)}` : formatDateTime(dueAt)}
      </Typography>
    </Stack>
  );
}
