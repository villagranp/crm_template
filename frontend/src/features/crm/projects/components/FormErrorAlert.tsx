import { Alert, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/** Alerta general de un envío fallido, con la referencia para soporte. */
export function FormErrorAlert({ message, correlationId, action }: { message: string; correlationId?: string; action?: ReactNode }) {
  return (
    <Alert severity="error" action={action}>
      {message}
      {correlationId ? (
        <Typography variant="caption" component="p" color="text.secondary">
          {`Referencia: ${correlationId}`}
        </Typography>
      ) : null}
    </Alert>
  );
}
