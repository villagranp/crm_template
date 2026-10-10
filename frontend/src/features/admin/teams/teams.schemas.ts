import { z } from 'zod';

/** Mismas reglas que `CreateTeamDto` del backend; la validación aquí es de experiencia de usuario. */
export const TEAM_CODE_MAX_LENGTH = 40;
export const TEAM_NAME_MAX_LENGTH = 120;
export const TEAM_DESCRIPTION_MAX_LENGTH = 500;
const TEAM_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const teamFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Escribe un código.')
    .max(TEAM_CODE_MAX_LENGTH, `Usa como máximo ${TEAM_CODE_MAX_LENGTH} caracteres.`)
    .regex(TEAM_CODE_PATTERN, 'Sólo letras, dígitos, punto, guion y guion bajo, sin espacios.'),
  name: z
    .string()
    .trim()
    .min(1, 'Escribe un nombre.')
    .max(TEAM_NAME_MAX_LENGTH, `Usa como máximo ${TEAM_NAME_MAX_LENGTH} caracteres.`),
  description: z
    .string()
    .trim()
    .max(TEAM_DESCRIPTION_MAX_LENGTH, `Usa como máximo ${TEAM_DESCRIPTION_MAX_LENGTH} caracteres.`),
  /** `''` = equipo raíz. */
  parentId: z.string(),
  manager: z.object({ id: z.string(), displayName: z.string() }).nullable(),
  isActive: z.boolean(),
});

export type TeamFormValues = z.infer<typeof teamFormSchema>;
