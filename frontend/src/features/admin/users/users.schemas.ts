import { z } from 'zod';

import { REASON_MIN_LENGTH } from '@/features/admin/common';

/** Validación de experiencia de usuario; el backend vuelve a validar (`user.dto.ts`). */

const optionalText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .max(max, `Usa como máximo ${max} caracteres.`)
    .refine((value) => value === '' || value.length >= min, `Escribe al menos ${min} caracteres.`);

/** 07 RN-07.1: 1–40 caracteres, letras, dígitos, `-` y `_`. El backend lo guarda en mayúsculas. */
export const EMPLOYEE_CODE_MAX_LENGTH = 40;
const EMPLOYEE_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Normaliza como el backend (recortado y en mayúsculas); vacío = sin código. */
export function normalizeEmployeeCode(value: string): string {
  return value.trim().toUpperCase();
}

const employeeCodeField = z
  .string()
  .trim()
  .max(EMPLOYEE_CODE_MAX_LENGTH, `Usa como máximo ${EMPLOYEE_CODE_MAX_LENGTH} caracteres.`)
  .refine((value) => value === '' || EMPLOYEE_CODE_PATTERN.test(value), 'Sólo letras, dígitos, guion y guion bajo, sin espacios.');

/** Equipo elegido en el formulario o en el panel de equipos (07 RN-07.10). */
export const teamAssignmentSchema = z.object({
  teamId: z.string(),
  name: z.string(),
  isPrimary: z.boolean(),
});

export type TeamAssignmentValue = z.infer<typeof teamAssignmentSchema>;

export const userFormSchema = z.object({
  email: z.string().trim().email('Escribe un correo válido.').max(320),
  firstName: z.string().trim().min(1, 'El nombre es obligatorio.').max(80),
  lastName: z.string().trim().min(1, 'El apellido es obligatorio.').max(80),
  jobTitle: optionalText(1, 120),
  phone: optionalText(5, 40),
  employeeCode: employeeCodeField,
  /** `''` = sin país. */
  countryId: z.string(),
  roleIds: z.array(z.string()),
  teams: z.array(teamAssignmentSchema),
});

export type UserFormValues = z.infer<typeof userFormSchema>;

/** En el alta, al menos un rol: sin rol el usuario no ve nada. */
export const createUserSchema = userFormSchema.refine((values) => values.roleIds.length > 0, {
  path: ['roleIds'],
  message: 'Elige al menos un rol.',
});

/** Excepción directa (ADR-018 §4, D5): razón obligatoria y caducidad futura opcional. */
export const directAssignmentSchema = z.object({
  targetId: z.string().min(1, 'Elige un elemento.'),
  effect: z.enum(['GRANT', 'DENY']),
  reason: z
    .string()
    .trim()
    .min(REASON_MIN_LENGTH, `Escribe al menos ${REASON_MIN_LENGTH} caracteres.`)
    .max(300, 'Usa como máximo 300 caracteres.'),
  expiresAt: z
    .string()
    .refine((value) => value === '' || new Date(value).getTime() > Date.now(), 'La caducidad debe ser futura.'),
});

export type DirectAssignmentFormValues = z.infer<typeof directAssignmentSchema>;
