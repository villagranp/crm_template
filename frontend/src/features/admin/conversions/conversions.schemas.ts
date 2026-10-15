import { z } from 'zod';

import { CONVERSION_SCOPES } from './conversions.api';

/**
 * Formulario de regla de conversión. Validación de experiencia de usuario: el
 * backend valida de nuevo (RN-07.36) y es la autoridad.
 */

/** `Decimal(19,8)`: hasta 11 dígitos enteros y 8 decimales. */
const FACTOR_PATTERN = /^\d{1,11}(\.\d{1,8})?$/;
export const DESCRIPTION_MAX = 300;

/** Admite la coma decimal y la convierte en punto: la API recibe una cadena con punto. */
export function normalizeFactor(raw: string): string {
  return raw.trim().replace(',', '.');
}

export const conversionRuleFormSchema = z
  .object({
    fromUnitId: z.string().min(1, 'Elige la unidad de origen.'),
    /** Vacío = la unidad de tonelaje configurada (el backend la pone por defecto). */
    toUnitId: z.string(),
    scope: z.enum(CONVERSION_SCOPES),
    referenceId: z.string(),
    factor: z
      .string()
      .trim()
      .min(1, 'Escribe el factor.')
      .refine(
        (value) => FACTOR_PATTERN.test(normalizeFactor(value)),
        'Número con hasta 8 decimales, p. ej. 0.001.',
      )
      .refine((value) => /[1-9]/.test(normalizeFactor(value)), 'El factor debe ser mayor que 0.'),
    description: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX, `Usa como máximo ${DESCRIPTION_MAX} caracteres.`),
  })
  .superRefine((values, context) => {
    if (values.scope !== 'GLOBAL' && !values.referenceId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referenceId'],
        message: 'Elige a qué se aplica la regla.',
      });
    }
  });

export type ConversionRuleFormValues = z.infer<typeof conversionRuleFormSchema>;
