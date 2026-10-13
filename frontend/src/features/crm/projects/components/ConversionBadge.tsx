import SyncDisabledOutlinedIcon from '@mui/icons-material/SyncDisabledOutlined';
import { Chip, Tooltip } from '@mui/material';

import { formatDecimal } from '@/features/crm/common/decimal';

import { CONVERSION_SCOPE_LABELS } from '../project-format';
import type { ConversionScope } from '../projects.api';

export interface ConversionBadgeProps {
  /** Regla aplicada (foto del backend) o `null` = sin conversión. */
  conversion: { scope: ConversionScope; factor: string } | null;
}

export const NO_CONVERSION_HELP =
  'No hay una regla de conversión a toneladas para esta unidad: la línea no suma en el total de toneladas.';

/**
 * Regla de conversión aplicada (ámbito y factor que devolvió el backend) o el
 * aviso "Sin conversión" (RN-03.31). El frontend no tiene factores propios
 * (AC-03.35): sólo muestra los que llegan de la API.
 */
export function ConversionBadge({ conversion }: ConversionBadgeProps) {
  if (!conversion) {
    return (
      <Tooltip title={NO_CONVERSION_HELP} describeChild>
        <Chip
          size="small"
          variant="outlined"
          color="warning"
          icon={<SyncDisabledOutlinedIcon />}
          label="Sin conversión"
          tabIndex={0}
        />
      </Tooltip>
    );
  }
  return (
    <Chip
      size="small"
      variant="outlined"
      label={`${CONVERSION_SCOPE_LABELS[conversion.scope]} · factor ${formatDecimal(conversion.factor)}`}
    />
  );
}
