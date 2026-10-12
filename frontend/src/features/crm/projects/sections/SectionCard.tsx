import { Box, Button, Card, Skeleton, Stack, Typography } from '@mui/material';
import { useId, type ReactNode } from 'react';

import { EmptyState } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';

import { PROJECT_ERROR_MESSAGES, withReference } from '../projects.errors';

export interface SectionCardProps {
  title: string;
  /** Acciones de la sección (a la derecha del título). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Tarjeta de una sección de la ficha del proyecto (03 §E.4): `region` con su
 * título, para que cada sección sea un punto de referencia accesible y sus
 * estados (carga, vacío, error) no afecten a las demás.
 */
export function SectionCard({ title, actions, children }: SectionCardProps) {
  const titleId = useId();
  return (
    <Card component="section" aria-labelledby={titleId}>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        flexWrap="wrap"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography id={titleId} variant="h6" component="h2">
          {title}
        </Typography>
        {actions ? (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {actions}
          </Stack>
        ) : null}
      </Stack>
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>{children}</Box>
    </Card>
  );
}

/** Esqueleto de carga de una sección. */
export function SectionLoading({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <Stack role="status" aria-label={label} spacing={1}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} variant="text" />
      ))}
    </Stack>
  );
}

/** Error de una sección con "Reintentar" y la referencia para soporte. */
export function SectionError({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  return (
    <EmptyState
      role="alert"
      title={title}
      description={withReference(describeApiError(error, PROJECT_ERROR_MESSAGES))}
      action={
        <Button variant="outlined" onClick={onRetry}>
          Reintentar
        </Button>
      }
    />
  );
}
