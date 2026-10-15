import { type CalendarDate, calendarDateIn } from '@/common/calendar-date';
import { BusinessRuleViolationError, ResourceConflictError } from '@/common/errors/application-error';

/**
 * Reglas puras del minuto de seguridad (Ajustes 1, AJ1-2; RN-AJ1.7–RN-AJ1.13, D-AJ1.5).
 * Sin base de datos ni reloj propio: las prueba `safety-minute-rules.spec.ts` y las aplica
 * `SafetyMinutesService`, que aporta "hoy" en la zona del negocio.
 */

/** Zona del negocio con la que se decide "hoy" (RN-AJ1.9), la misma que los vencimientos del CRM. */
export const BUSINESS_TIME_ZONE_PARAMETER = 'crm.zona_horaria_negocio';

/** Longitud máxima del mensaje tras recortar (RN-AJ1.7); el mínimo es 1. */
export const SAFETY_MINUTE_MESSAGE_MAX = 1000;

/**
 * Códigos propios (6.6): `SAFETY_MINUTE_DUPLICATE` y `SAFETY_MINUTE_LOCKED` son `409`
 * (`ResourceConflictError`); `SAFETY_MINUTE_PAST_DATE` es `422` (`BusinessRuleViolationError`).
 */
export const SAFETY_MINUTE_ERROR_CODES = {
  duplicate: 'SAFETY_MINUTE_DUPLICATE',
  locked: 'SAFETY_MINUTE_LOCKED',
  pastDate: 'SAFETY_MINUTE_PAST_DATE',
} as const;

/** Por qué una fecha ya no admite el cambio: `past` (anterior a hoy) o `today` (solo borrar, RN-AJ1.11). */
export type SafetyMinuteLockReason = 'past' | 'today';

/** "Hoy" del negocio como fecha de calendario (RN-AJ1.9). */
export function businessToday(now: Date, timeZone: string): CalendarDate {
  return calendarDateIn(now, timeZone);
}

/** Editables: hoy y futuros (RN-AJ1.10). Las fechas `YYYY-MM-DD` se comparan como texto. */
export function isEditable(displayDate: CalendarDate, today: CalendarDate): boolean {
  return displayDate >= today;
}

/** Borrables: solo futuros (RN-AJ1.11). */
export function isDeletable(displayDate: CalendarDate, today: CalendarDate): boolean {
  return displayDate > today;
}

/** Motivo del bloqueo al editar (solo `past`); `null` si se puede. */
export function editLockReason(displayDate: CalendarDate, today: CalendarDate): SafetyMinuteLockReason | null {
  return isEditable(displayDate, today) ? null : 'past';
}

/** Motivo del bloqueo al borrar (`today` o `past`); `null` si se puede. */
export function deleteLockReason(displayDate: CalendarDate, today: CalendarDate): SafetyMinuteLockReason | null {
  if (isDeletable(displayDate, today)) return null;
  return displayDate === today ? 'today' : 'past';
}

/** No se programa un mensaje para una fecha pasada (RN-AJ1.12). */
export function isPastDate(displayDate: CalendarDate, today: CalendarDate): boolean {
  return displayDate < today;
}

export function safetyMinuteLockedError(reason: SafetyMinuteLockReason, displayDate: CalendarDate): ResourceConflictError {
  return new ResourceConflictError(
    reason === 'today' ? 'The message of today cannot be deleted' : 'The message of a past date is read-only',
    [{ field: 'displayDate', reason, displayDate }],
    SAFETY_MINUTE_ERROR_CODES.locked,
  );
}

export function safetyMinuteDuplicateError(displayDate: CalendarDate): ResourceConflictError {
  return new ResourceConflictError(
    'There is already a safety minute for this date',
    [{ field: 'displayDate', issue: 'duplicated', displayDate }],
    SAFETY_MINUTE_ERROR_CODES.duplicate,
  );
}

export function safetyMinutePastDateError(displayDate: CalendarDate): BusinessRuleViolationError {
  return new BusinessRuleViolationError(SAFETY_MINUTE_ERROR_CODES.pastDate, 'The display date cannot be in the past', [
    { field: 'displayDate', issue: 'past', displayDate },
  ]);
}
