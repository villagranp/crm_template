import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import { Box, Card, Stack, Typography } from '@mui/material';
import { useId } from 'react';

import { fontSizes } from '@/theme/tokens';

import { formatLongDate } from '../dashboard-format';
import { useSafetyMinute } from '../dashboard.queries';

/** `YYYY-MM-DD` → fecha local sin desplazamiento de zona; `null` si no es una fecha válida. */
function parseDisplayDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Minuto de seguridad del día (Ajustes 1, §8.2): mensaje institucional que ven todos los usuarios
 * autenticados. No se pinta mientras carga, si falla ni si hoy no hay mensaje (D-AJ1.3), así que no
 * reserva hueco. El mensaje es entrada de usuario: se muestra siempre como TEXTO (los saltos de
 * línea se respetan con `white-space: pre-line`), nunca como HTML.
 */
export function SafetyMinuteCard() {
  const titleId = useId();
  const { data } = useSafetyMinute();
  const safetyMinute = data?.safetyMinute;

  if (!safetyMinute) {
    return null;
  }

  const date = parseDisplayDate(safetyMinute.displayDate);

  return (
    <Card
      component="section"
      role="region"
      aria-labelledby={titleId}
      sx={{
        minWidth: 0,
        borderLeft: (theme) => `${theme.spacing(0.5)} solid ${theme.palette.warning.main}`,
        px: { xs: 2, md: 2.5 },
        py: 2,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Box aria-hidden="true" sx={{ display: 'grid', color: 'warning.main', pt: 0.25 }}>
          <HealthAndSafetyOutlinedIcon />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography id={titleId} component="h2" sx={{ fontWeight: 600, fontSize: fontSizes.cardTitle }}>
            Minuto de seguridad
          </Typography>
          {date ? (
            <Typography sx={{ fontSize: fontSizes.caption, color: 'text.secondary' }}>
              {formatLongDate(date)}
            </Typography>
          ) : null}
          <Typography sx={{ mt: 1, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
            {safetyMinute.message}
          </Typography>
        </Box>
      </Stack>
    </Card>
  );
}
