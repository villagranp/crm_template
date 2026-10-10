import { z } from 'zod';

/**
 * Esquemas de los formularios de acceso.
 *
 * Son validación de UX: el servidor es la autoridad (PLAN-AUTH-LOCAL D6/D7).
 * La política de contraseña se replica sólo en lo que el usuario puede ver
 * antes de enviar (longitud); la lista de contraseñas comunes vive en el
 * backend y su rechazo llega como `422 PASSWORD_POLICY_VIOLATION`.
 */

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Escribe tu correo electrónico.').email('Escribe un correo electrónico válido.'),
  // Sin reglas de longitud: la contraseña inicial del administrador está exenta
  // de la política (D11) y el login no debe adelantar pistas sobre ella.
  password: z.string().min(1, 'Escribe tu contraseña.'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Escribe tu contraseña actual.'),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Usa al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
      .max(MAX_PASSWORD_LENGTH, `Usa como máximo ${MAX_PASSWORD_LENGTH} caracteres.`),
    confirmation: z.string().min(1, 'Repite la nueva contraseña.'),
  })
  .refine((values) => values.newPassword === values.confirmation, {
    path: ['confirmation'],
    message: 'Las contraseñas no coinciden.',
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
