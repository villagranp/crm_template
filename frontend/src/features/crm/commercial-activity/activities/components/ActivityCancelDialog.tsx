import { Alert, DialogContentText, TextField } from '@mui/material';
import { useEffect, useId, useState } from 'react';

import { DialogFooter, EntityDialog } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';

import { COMMERCIAL_ERROR_MESSAGES, withReference } from '../../common/commercial-activity.errors';
import type { ActivityDetail } from '../activities.api';
import { useCancelActivity } from '../activities.queries';
import { ACTIVITY_LIMITS } from '../activities.schemas';

export interface ActivityCancelDialogProps {
  open: boolean;
  activity: { id: string; code: string; subject: string } | null;
  onClose: () => void;
  onCancelled?: (activity: ActivityDetail) => void;
}

/**
 * Cancelar una actividad abierta (04 §E.10, RN-04.30). Definitiva: no se puede
 * reabrir (D-04.6). El comentario es opcional y queda en la auditoría (D-04.7).
 */
export function ActivityCancelDialog({ open, activity, onClose, onCancelled }: ActivityCancelDialogProps) {
  const descriptionId = useId();
  const cancellation = useCancelActivity();
  const [comment, setComment] = useState('');
  const { reset } = cancellation;

  useEffect(() => {
    if (open) {
      setComment('');
      reset();
    }
  }, [open, reset]);

  const submit = () => {
    if (!activity) {
      return;
    }
    cancellation.mutate(
      { activityId: activity.id, comment: comment.trim() || null },
      {
        onSuccess: (detail) => {
          onCancelled?.(detail);
          onClose();
        },
      },
    );
  };

  return (
    <EntityDialog
      open={open}
      onClose={cancellation.isPending ? undefined : onClose}
      title="Cancelar actividad"
      subtitle={activity ? `${activity.code} · ${activity.subject}` : undefined}
      describedBy={descriptionId}
      maxWidth="sm"
      fullScreenBelow="xs"
      onSubmit={submit}
      actions={
        <DialogFooter onCancel={onClose} cancelLabel="Volver" submitLabel="Cancelar actividad" pending={cancellation.isPending} destructive />
      }
    >
      <DialogContentText id={descriptionId} sx={{ mb: 2 }}>
        La actividad quedará cancelada y no podrá reabrirse. Saldrá de la bandeja de pendientes.
      </DialogContentText>
      <TextField
        label="Comentario (opcional)"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        fullWidth
        multiline
        minRows={2}
        disabled={cancellation.isPending}
        helperText="Queda registrado en la auditoría."
        slotProps={{ htmlInput: { maxLength: ACTIVITY_LIMITS.cancellationComment } }}
      />
      {cancellation.isError ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {withReference(describeApiError(cancellation.error, COMMERCIAL_ERROR_MESSAGES))}
        </Alert>
      ) : null}
    </EntityDialog>
  );
}
