import { z } from 'zod';

/**
 * Formulario y filtros del minuto de seguridad. Validación de experiencia de
 * usuario: el backend valida de nuevo (RN-AJ1.7, RN-AJ1.12) y es la autoridad.
 */

export const MESSAGE_MAX = 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Esquema del formulario. De la fecha sólo se valida el formato: «no anterior a hoy» lo decide el
 * servidor con `crm.zona_horaria_negocio` (`422 SAFETY_MINUTE_PAST_DATE`), no la zona del navegador.
 */
export const safetyMinuteFormSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Escribe el mensaje.')
    .max(MESSAGE_MAX, `Usa como máximo ${MESSAGE_MAX} caracteres.`),
  displayDate: z.string().regex(ISO_DATE, 'Elige la fecha de visualización.'),
});
export type SafetyMinuteFormValues = z.infer<typeof safetyMinuteFormSchema>;

/** Rango de fechas del filtro: `Desde ≤ Hasta`. `null` si es válido. */
export function dateRangeError(from: string | undefined, to: string | undefined): string | null {
  if (from && to && from > to) {
    return '«Desde» no puede ser posterior a «Hasta».';
  }
  return null;
}
