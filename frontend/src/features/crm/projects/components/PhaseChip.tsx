import { Chip } from '@mui/material';

import { formatPercent } from '@/features/crm/common/decimal';

export interface PhaseChipProps {
  /** Etiqueta de la fase (`crm.fase_cliente`). */
  label: string;
  /** Porcentaje de avance como cadena decimal (`"75.00"`). */
  progress: string;
  /** Fase final (RN-03.15): chip relleno. */
  isFinal?: boolean;
}

/** Fase del cliente con su porcentaje ("Diseño · 10%"). El texto siempre acompaña al color. */
export function PhaseChip({ label, progress, isFinal = false }: PhaseChipProps) {
  return (
    <Chip
      size="small"
      variant={isFinal ? 'filled' : 'outlined'}
      color={isFinal ? 'success' : 'default'}
      label={`${label} · ${formatPercent(progress)}`}
    />
  );
}
