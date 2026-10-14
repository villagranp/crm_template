import { Step, StepLabel, Stepper, Typography } from '@mui/material';

import type { CustomerImport } from '../customer-imports.api';
import { IMPORT_STEPS, importStepState } from '../customer-imports-format';

/**
 * Indicador de pasos Archivo → Validación → Confirmación → Resultado (06 §E.4),
 * marcado según el estado. Un paso fallido lleva texto, no sólo color.
 */
export function ImportSteps({ data }: { data: Pick<CustomerImport, 'status' | 'confirmedAt'> }) {
  const { activeStep, failedStep, failedLabel } = importStepState(data);
  return (
    <Stepper activeStep={activeStep} alternativeLabel aria-label="Pasos de la carga" sx={{ py: 1 }}>
      {IMPORT_STEPS.map((label, index) => {
        const failed = failedStep === index;
        return (
          <Step key={label} completed={index < activeStep && !failed}>
            <StepLabel
              error={failed}
              optional={
                failed && failedLabel ? (
                  <Typography variant="caption" color="error">
                    {failedLabel}
                  </Typography>
                ) : undefined
              }
            >
              {label}
            </StepLabel>
          </Step>
        );
      })}
    </Stepper>
  );
}
