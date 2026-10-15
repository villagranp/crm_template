import { ConfirmDialog } from '@/features/admin/common';

import type { SafetyMinute } from '../safety-minutes.api';
import { describeSafetyMinuteError } from '../safety-minutes.errors';
import { formatDisplayDate } from '../safety-minutes-format';
import { useDeleteSafetyMinute } from '../safety-minutes.queries';

export interface SafetyMinuteDeleteDialogProps {
  /** `null` = cerrado. */
  minute: SafetyMinute | null;
  onClose: () => void;
}

/** Confirmación del borrado (físico; el rastro queda en la auditoría, RN-AJ1.11/13). */
export function SafetyMinuteDeleteDialog({ minute, onClose }: SafetyMinuteDeleteDialogProps) {
  const mutation = useDeleteSafetyMinute();

  return (
    <ConfirmDialog
      open={minute !== null}
      title="Eliminar mensaje"
      description={
        minute
          ? `Se eliminará el mensaje programado para el ${formatDisplayDate(minute.displayDate)}. No se puede deshacer.`
          : undefined
      }
      confirmLabel="Eliminar"
      destructive
      isPending={mutation.isPending}
      errorMessage={mutation.isError ? describeSafetyMinuteError(mutation.error).message : null}
      onConfirm={() => {
        if (minute) {
          mutation.mutate(minute.id, { onSuccess: onClose });
        }
      }}
      onClose={() => {
        mutation.reset();
        onClose();
      }}
    />
  );
}
