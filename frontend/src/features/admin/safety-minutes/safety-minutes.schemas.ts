import { z } from 'zod';

/**
 * Formulario y filtros del minuto de seguridad. Validación de experiencia de
 * usuario: el backend valida de nuevo (RN-AJ1.7, RN-AJ1.12) y es la autoridad.
 */

export const MESSAGE_MAX = 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Hoy en la zona del navegador como `YYYY-MM-DD` (el backend usa la zona de negocio y decide). */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Esquema del formulario. `minDate` es hoy; `originalDate` es la fecha que ya
 * tiene el mensaje que se edita: conservarla es válido aunque sea hoy.
 */
export function createSafetyMinuteFormSchema(minDate: string, originalDate?: string) {
  return z.object({
    message: z
      .string()
      .trim()
      .min(1, 'Escribe el mensaje.')
      .max(MESSAGE_MAX, `Usa como máximo ${MESSAGE_MAX} caracteres.`),
    displayDate: z
      .string()
      .regex(ISO_DATE, 'Elige la fecha de visualización.')
      .refine((value) => value === originalDate || value >= minDate, 'La fecha no puede ser anterior a hoy.'),
  });
}
export type SafetyMinuteFormValues = z.infer<ReturnType<typeof createSafetyMinuteFormSchema>>;

/** Rango de fechas del filtro: `Desde ≤ Hasta`. `null` si es válido. */
export function dateRangeError(from: string | undefined, to: string | undefined): string | null {
  if (from && to && from > to) {
    return '«Desde» no puede ser posterior a «Hasta».';
  }
  return null;
}
