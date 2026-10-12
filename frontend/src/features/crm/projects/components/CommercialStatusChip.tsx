import { Chip } from '@mui/material';

import { COMMERCIAL_STATUS_TONES, commercialStatusText } from '../project-format';
import type { CommercialStatus } from '../projects.api';

/**
 * Estado comercial derivado del proyecto (RN-03.14, DEF-B): etapa abierta,
 * Ganado, Perdido o Sin oportunidades. Lo calcula el backend; aquí sólo se pinta
 * con su texto (DESIGN-SYSTEM §7: nunca sólo color).
 */
export function CommercialStatusChip({ status }: { status: CommercialStatus }) {
  const tone = COMMERCIAL_STATUS_TONES[status.kind];
  return (
    <Chip
      size="small"
      color={tone}
      variant={status.kind === 'NO_OPPORTUNITIES' ? 'outlined' : 'filled'}
      label={commercialStatusText(status)}
    />
  );
}
