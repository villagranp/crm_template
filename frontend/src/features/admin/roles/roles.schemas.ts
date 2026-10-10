import { z } from 'zod';

import { DATA_SCOPES } from './roles.api';

/** Mismo patrón que el backend (`ROLE_CODE_PATTERN`). */
export const ROLE_CODE_PATTERN = /^[a-z][a-z0-9-]{1,58}[a-z0-9]$/;

export const roleFormSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(ROLE_CODE_PATTERN, 'Minúsculas, números y guiones; empieza por letra (3 a 60 caracteres).'),
  name: z.string().trim().min(2, 'Escribe al menos 2 caracteres.').max(120),
  description: z.string().trim().max(400, 'Usa como máximo 400 caracteres.'),
  dataScope: z.enum(DATA_SCOPES),
  isActive: z.boolean(),
});

export type RoleFormValues = z.infer<typeof roleFormSchema>;
