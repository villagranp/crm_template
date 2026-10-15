import { Button, Stack, Typography } from '@mui/material';

import { AdminDialog } from '@/features/admin/common';

import type { SafetyMinute } from '../safety-minutes.api';
import { formatDateTime, formatDisplayDate } from '../safety-minutes-format';

export interface SafetyMinuteDetailDialogProps {
  minute: SafetyMinute | null;
  onClose: () => void;
}

/**
 * Mensaje completo de una fecha. Se pinta siempre como texto (React escapa el
 * contenido) con los saltos de línea respetados: nunca como HTML (RN-AJ1.7).
 */
export function SafetyMinuteDetailDialog({ minute, onClose }: SafetyMinuteDetailDialogProps) {
  return (
    <AdminDialog
      open={minute !== null}
      onClose={onClose}
      title={minute ? `Mensaje del ${formatDisplayDate(minute.displayDate)}` : 'Mensaje'}
      subtitle="Minuto de seguridad"
      maxWidth="sm"
      actions={<Button onClick={onClose}>Cerrar</Button>}
    >
      {minute ? (
        <Stack spacing={2}>
          <Typography variant="body1" sx={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
            {minute.message}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Actualizado por {minute.updatedBy?.displayName ?? 'Sistema'} · {formatDateTime(minute.updatedAt)}
          </Typography>
        </Stack>
      ) : null}
    </AdminDialog>
  );
}
