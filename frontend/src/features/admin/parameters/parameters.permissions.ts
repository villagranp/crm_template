/** Permisos del área Parámetros, con los nombres exactos del catálogo sembrado. */
export const PARAMETER_PERMISSIONS = {
  view: 'parametros.ver',
  edit: 'parametros.editar',
  /** Además de `edit`, para los parámetros del grupo `seguridad` (PLAN-ADMIN D10). */
  configure: 'parametros.configurar',
} as const;
