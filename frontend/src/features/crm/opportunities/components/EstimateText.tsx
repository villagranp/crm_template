import { Box, Typography } from '@mui/material';

import type { OpportunityCore } from '../opportunities.api';
import { estimateTexts } from '../opportunity-format';

export interface EstimateTextProps {
  opportunity: Pick<OpportunityCore, 'estimatedAmount' | 'currencyCode' | 'estimatedAmountUsd' | 'estimatedTonnage'>;
  /** Muestra también el tonelaje estimado. */
  withTonnage?: boolean;
}

/**
 * Estimación de una oportunidad (RN-03.83): monto original con su moneda y,
 * debajo, el equivalente en USD (si la moneda no es USD) y el tonelaje.
 */
export function EstimateText({ opportunity, withTonnage = false }: EstimateTextProps) {
  const texts = estimateTexts(opportunity);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" component="span" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
        {texts.original}
      </Typography>
      {texts.usd ? (
        <Typography variant="caption" color="text.secondary" component="span" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
          {`≈ ${texts.usd}`}
        </Typography>
      ) : null}
      {withTonnage && texts.tonnage ? (
        <Typography variant="caption" color="text.secondary" component="span" sx={{ display: 'block' }}>
          {texts.tonnage}
        </Typography>
      ) : null}
    </Box>
  );
}
