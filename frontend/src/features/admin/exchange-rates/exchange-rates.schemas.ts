import { z } from 'zod';

/**
 * Formularios y filtros de tipos de cambio. Validación de experiencia de
 * usuario: el backend valida de nuevo (RN-07.44) y es la autoridad.
 */

/** `Decimal(19,8)`: hasta 11 dígitos enteros y 8 decimales. */
const RATE_PATTERN = /^\d{1,11}(\.\d{1,8})?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const SOURCE_MAX = 120;
export const NOTES_MAX = 500;

/** Admite la coma decimal habitual en español y la convierte en punto: la API recibe una cadena con punto. */
export function normalizeRate(raw: string): string {
  return raw.trim().replace(',', '.');
}

export function isPositiveRate(raw: string): boolean {
  const value = normalizeRate(raw);
  return RATE_PATTERN.test(value) && /[1-9]/.test(value);
}

const rateField = z
  .string()
  .trim()
  .min(1, 'Escribe la tasa.')
  .refine(
    (value) => RATE_PATTERN.test(normalizeRate(value)),
    'Número con hasta 8 decimales, p. ej. 7.75.',
  )
  .refine((value) => isPositiveRate(value), 'La tasa debe ser mayor que 0.');

export const exchangeRateFormSchema = z.object({
  currencyCode: z.string().min(1, 'Elige una moneda.'),
  effectiveDate: z.string().regex(ISO_DATE, 'Elige la fecha de vigencia.'),
  ratePerUsd: rateField,
  source: z
    .string()
    .trim()
    .min(1, 'Escribe la fuente.')
    .max(SOURCE_MAX, `Usa como máximo ${SOURCE_MAX} caracteres.`),
  notes: z.string().trim().max(NOTES_MAX, `Usa como máximo ${NOTES_MAX} caracteres.`),
});
export type ExchangeRateFormValues = z.infer<typeof exchangeRateFormSchema>;

/** Rango de fechas del filtro: `Desde ≤ Hasta`. `null` si es válido. */
export function dateRangeError(from: string | undefined, to: string | undefined): string | null {
  if (from && to && from > to) {
    return '«Desde» no puede ser posterior a «Hasta».';
  }
  return null;
}
