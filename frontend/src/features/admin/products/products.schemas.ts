import { z } from 'zod';

import { UNIT_DIMENSIONS } from './products.api';

/**
 * Formularios de familias, productos y unidades. Longitudes del modelo
 * (`backend/prisma/schema.prisma`); la validación aquí es de experiencia de
 * usuario: el backend valida de nuevo y es la autoridad.
 */

/**
 * Patrones alineados con `backend/src/modules/products/master-data-rules.ts`. El
 * backend recorta y pasa a mayúsculas antes de validar; aquí se hace lo mismo
 * (`toUpperCase` en el esquema) para que el usuario pueda escribir en minúsculas.
 */
/** `FAMILY_CODE_PATTERN`: empieza por letra o dígito; luego letras, dígitos, `-` o `_` (1–40). */
export const FAMILY_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,39}$/;
/** `UNIT_CODE_PATTERN`: empieza por letra o dígito; luego letras, dígitos o `_` (1–20). */
export const UNIT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_]{0,19}$/;
/** `SKU_PATTERN`: empieza por letra o dígito; luego letras, dígitos, espacio o `. _ - /` (1–60). */
export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._\-/ ]{0,59}$/;
/** `MAX_SORT_ORDER` de `product-masters.dto.ts`. */
export const MAX_SORT_ORDER = 100_000;
const SORT_ORDER_PATTERN = /^\d*$/;

const sortOrderField = z
  .string()
  .trim()
  .regex(SORT_ORDER_PATTERN, 'Debe ser un número entero de 0 en adelante.')
  .refine(
    (value) => value === '' || Number(value) <= MAX_SORT_ORDER,
    `Debe estar entre 0 y ${MAX_SORT_ORDER.toLocaleString('es-MX')}.`,
  );

function required(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `Escribe ${label}.`)
    .max(max, `Usa como máximo ${max} caracteres.`);
}

export const familyFormSchema = z.object({
  code: required('un código', 40)
    .toUpperCase()
    .regex(
      FAMILY_CODE_PATTERN,
      'Empieza por letra o dígito; sólo letras, dígitos, guion y guion bajo (p. ej. ACERO).',
    ),
  name: required('un nombre', 120),
  description: z.string().trim().max(400, 'Usa como máximo 400 caracteres.'),
  sortOrder: sortOrderField,
});
export type FamilyFormValues = z.infer<typeof familyFormSchema>;

export const productFormSchema = z.object({
  sku: required('el SKU', 60)
    .toUpperCase()
    .regex(
      SKU_PATTERN,
      'Empieza por letra o dígito; sólo letras, dígitos, espacios y . _ - / (p. ej. VAR-3/8).',
    ),
  description: required('una descripción', 300),
  familyId: z.string().min(1, 'Elige una familia.'),
  baseUnitId: z.string().min(1, 'Elige una unidad base.'),
});
export type ProductFormValues = z.infer<typeof productFormSchema>;

export const unitFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Escribe un código.')
    .max(20, 'Usa como máximo 20 caracteres.')
    .toUpperCase()
    .regex(
      UNIT_CODE_PATTERN,
      'Empieza por letra o dígito; sólo letras, dígitos y guion bajo (p. ej. TON, M2).',
    ),
  name: required('un nombre', 80),
  symbol: required('un símbolo', 12),
  dimension: z.enum(UNIT_DIMENSIONS, { errorMap: () => ({ message: 'Elige una dimensión.' }) }),
  sortOrder: sortOrderField,
});
export type UnitFormValues = z.infer<typeof unitFormSchema>;

/** `''` → `undefined` (no se envía); el resto, número. */
export function toSortOrder(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value.trim());
}
