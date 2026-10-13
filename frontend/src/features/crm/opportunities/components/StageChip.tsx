import { Chip } from '@mui/material';

import type { OpportunityStage } from '../opportunities.api';

/**
 * Etapa de la oportunidad (03 §E.9): abierta con contorno; cerrada rellena en
 * verde (Ganado) o rojo (Perdido). El texto siempre acompaña al color.
 */
export function StageChip({ stage }: { stage: Pick<OpportunityStage, 'label' | 'isClosed' | 'outcome'> }) {
  if (!stage.isClosed) {
    return <Chip size="small" variant="outlined" color="info" label={stage.label} />;
  }
  return <Chip size="small" color={stage.outcome === 'LOST' ? 'error' : 'success'} label={stage.label} />;
}
