import { Alert, Box, Button, Chip, Skeleton, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { AdminDrawer, describeApiError, DetailList, DetailSection } from '@/features/admin/common';

import { APPROVAL_STATUS_VIEW, formatDateTime } from '../approval-status';
import type { ApprovalStep } from '../approvals.api';
import { useApproval } from '../approvals.queries';

export interface ApprovalDetailDrawerProps {
  approvalId: string | null;
  onClose: () => void;
}

function approverLabel(step: ApprovalStep): string {
  if (step.approver) {
    return step.approver.displayName;
  }
  if (step.approverRole) {
    return `Rol: ${step.approverRole.name}`;
  }
  return 'Sin aprobador asignado';
}

/** Línea de tiempo de los pasos, en orden de secuencia. */
function StepsTimeline({ steps }: { steps: ApprovalStep[] }) {
  if (steps.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        La solicitud no tiene pasos.
      </Typography>
    );
  }
  return (
    <Box component="ol" aria-label="Pasos de aprobación" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {steps.map((step, index) => {
        const status = APPROVAL_STATUS_VIEW[step.status];
        const isLast = index === steps.length - 1;
        return (
          <Box component="li" key={step.id} sx={{ display: 'flex', gap: 2 }}>
            <Box
              sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              aria-hidden
            >
              <Box
                sx={{
                  width: (theme) => theme.spacing(1.5),
                  height: (theme) => theme.spacing(1.5),
                  mt: 0.75,
                  borderRadius: '50%',
                  bgcolor: status.color === 'default' ? 'text.disabled' : `${status.color}.main`,
                }}
              />
              {isLast ? null : (
                <Box sx={{ flex: 1, borderLeft: 1, borderColor: 'divider', my: 0.5 }} />
              )}
            </Box>
            <Box sx={{ pb: isLast ? 0 : 2, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="subtitle2" component="h4">
                  {`Paso ${step.sequence}`}
                </Typography>
                <Chip size="small" color={status.color} label={status.label} />
              </Stack>
              <Typography variant="body2">{approverLabel(step)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {step.resolvedAt
                  ? `Resuelto: ${formatDateTime(step.resolvedAt)}`
                  : `Creado: ${formatDateTime(step.createdAt)}`}
              </Typography>
              {step.comment ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5, overflowWrap: 'anywhere' }}
                >
                  {`«${step.comment}»`}
                </Typography>
              ) : null}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** Detalle de una solicitud: datos, motivo, instantánea y cadena de pasos. Sin acciones (D12). */
export function ApprovalDetailDrawer({ approvalId, onClose }: ApprovalDetailDrawerProps) {
  const approval = useApproval(approvalId);

  let content: ReactNode = null;
  if (approval.isPending) {
    content = (
      <Stack role="status" aria-label="Cargando" spacing={1}>
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <Skeleton variant="rounded" sx={{ height: (theme) => theme.spacing(12) }} />
      </Stack>
    );
  } else if (approval.isError) {
    content = (
      <Alert
        severity="error"
        action={
          <Button
            color="inherit"
            size="small"
            variant="text"
            onClick={() => void approval.refetch()}
          >
            Reintentar
          </Button>
        }
      >
        {describeApiError(approval.error).message}
      </Alert>
    );
  } else {
    const detail = approval.data;
    const status = APPROVAL_STATUS_VIEW[detail.status];
    content = (
      <Stack spacing={3}>
        <DetailSection number={1} title="Datos generales">
          <DetailList
            items={[
              {
                label: 'Estado',
                value: <Chip size="small" color={status.color} label={status.label} />,
              },
              { label: 'Solicitante', value: detail.requestedBy.displayName },
              {
                label: 'Recurso',
                value: `${detail.resourceType} · ${detail.resourceId}`,
                wide: true,
              },
              { label: 'Creada', value: formatDateTime(detail.createdAt) },
              { label: 'Resuelta', value: formatDateTime(detail.resolvedAt) },
              ...(detail.reason ? [{ label: 'Motivo', value: detail.reason, wide: true }] : []),
            ]}
          />
        </DetailSection>

        <DetailSection number={2} title="Historial">
          <StepsTimeline steps={detail.steps} />
        </DetailSection>

        {detail.payload !== null ? (
          <DetailSection number={3} title="Lo que se aprueba">
            <Box
              component="pre"
              className="scroll-x"
              sx={{
                m: 0,
                p: 1.5,
                bgcolor: 'action.hover',
                borderRadius: 1,
                typography: 'body2',
                fontFamily: 'monospace',
              }}
            >
              {JSON.stringify(detail.payload, null, 2)}
            </Box>
          </DetailSection>
        ) : null}

        <Alert severity="info">
          La resolución de solicitudes llegará con el primer flujo de negocio que las utilice.
        </Alert>
      </Stack>
    );
  }

  const heading = approval.data
    ? `${approval.data.code} · ${approval.data.title}`
    : 'Solicitud de aprobación';

  return (
    <AdminDrawer
      open={approvalId !== null}
      onClose={onClose}
      title={heading}
      subtitle="Aprobaciones"
    >
      {content}
    </AdminDrawer>
  );
}
