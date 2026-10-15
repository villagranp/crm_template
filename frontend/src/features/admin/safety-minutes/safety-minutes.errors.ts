import { ADMIN_ERROR_CODES, describeApiError, type ApiErrorView } from '@/features/admin/common';
import { ApiError } from '@/services/api/api-error';

/** Motivos de `409 SAFETY_MINUTE_LOCKED` (`details[0].reason`). */
const LOCKED_BY_REASON: Readonly<Record<string, string>> = {
  past: 'El mensaje es de una fecha pasada y ya no se puede modificar ni eliminar.',
  today: 'El mensaje de hoy se puede editar, pero ya no se puede eliminar.',
};

function lockedReason(error: unknown): string | null {
  if (error instanceof ApiError && error.code === ADMIN_ERROR_CODES.safetyMinuteLocked) {
    const [first] = error.details;
    if (typeof first === 'object' && first !== null && 'reason' in first) {
      const { reason } = first as { reason: unknown };
      return typeof reason === 'string' ? reason : null;
    }
  }
  return null;
}

/** `describeApiError` con el motivo del bloqueo traducido; el resto de códigos viene de la administración. */
export function describeSafetyMinuteError(error: unknown): ApiErrorView {
  const view = describeApiError(error);
  const reason = lockedReason(error);
  const message = reason ? LOCKED_BY_REASON[reason] : undefined;
  return message ? { ...view, message } : view;
}

/** `true` si el error es `409 SAFETY_MINUTE_DUPLICATE` (se marca el campo de la fecha). */
export function isDuplicateDate(error: unknown): boolean {
  return error instanceof ApiError && error.code === ADMIN_ERROR_CODES.safetyMinuteDuplicate;
}
