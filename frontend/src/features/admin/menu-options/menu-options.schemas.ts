import { z } from 'zod';

/** Mismos patrones que el backend (`menu-option.dto.ts`). */
export const MENU_OPTION_KEY_PATTERN = /^[a-z][a-z0-9-]{1,78}[a-z0-9]$/;
const ICON_PATTERN = /^[a-z0-9_]{0,60}$/;

export const menuOptionFormSchema = z
  .object({
    moduleId: z.string().min(1, 'Elige un módulo.'),
    parentId: z.string(),
    key: z
      .string()
      .trim()
      .regex(MENU_OPTION_KEY_PATTERN, 'Minúsculas, números y guiones; empieza por letra (3 a 80 caracteres).'),
    label: z.string().trim().min(1, 'La etiqueta es obligatoria.').max(120),
    description: z.string().trim().max(400),
    icon: z.string().trim().regex(ICON_PATTERN, 'Nombre de glifo de Material Symbols (minúsculas y guion bajo).'),
    kind: z.enum(['LINK', 'GROUP']),
    path: z.string(),
    sortOrder: z.number({ invalid_type_error: 'Escribe un número.' }).int('Usa un número entero.').min(0).max(100_000),
    requiredPermissionId: z.string(),
    isPublic: z.boolean(),
    isActive: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.kind === 'LINK' && !values.path) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['path'], message: 'Elige la pantalla a la que lleva.' });
    }
  });

export type MenuOptionFormValues = z.infer<typeof menuOptionFormSchema>;
