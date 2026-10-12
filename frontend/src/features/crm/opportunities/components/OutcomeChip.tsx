import { Chip } from '@mui/material';

import type { OpportunityOutcome, OutcomeOption } from '../opportunities.api';
import { resultText } from '../opportunity-format';

const TONES: Record<OpportunityOutcome, 'success' | 'warning' | 'error'> = {
  WON: 'success',
  PARTIAL: 'warning',
  LOST: 'error',
};

export interface OutcomeChipProps {
  result: { outcome: OpportunityOutcome; awardedPercent: string | null };
  /** Etiquetas de `form-options.outcomes`; sin ellas, las del conjunto cerrado (DM-15). */
  options?: readonly OutcomeOption[];
}

/** Resultado vigente ("Parcial · 60%"). Parcial cuenta como ganada (DM-15) pero se distingue. */
export function OutcomeChip({ result, options }: OutcomeChipProps) {
  return <Chip size="small" variant="outlined" color={TONES[result.outcome]} label={resultText(result, options)} />;
}
