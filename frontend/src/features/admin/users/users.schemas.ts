import { z } from 'zod';

import { REASON_MIN_LENGTH } from '@/features/admin/common';

/** Validación de experiencia de usuario; el backend vuelve a validar (`user.dto.ts`). */

const optionalText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .max(max, `Usa como máximo ${max} caracteres.`)
    .refine((value) => value === '' || value.length >= min, `Escribe al menos ${min} caracteres.`);

export const userFormSchema = z.object({
  email: z.string().trim().email('Escribe un correo válido.').max(320),
  firstName: z.string().trim().min(1, 'El nombre es obligatorio.').max(80),
  lastName: z.string().trim().min(1, 'El apellido es obligatorio.').max(80),
  jobTitle: optionalText(1, 120),
  phone: optionalText(5, 40),
  roleIds: z.array(z.string()),
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
