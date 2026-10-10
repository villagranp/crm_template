/** Permisos del área Opciones de menú, con los nombres exactos del catálogo sembrado (ADR-008). */
export const MENU_OPTION_PERMISSIONS = {
  view: 'opciones.ver',
  create: 'opciones.crear',
  edit: 'opciones.editar',
  remove: 'opciones.eliminar',
  /** Selector del permiso que exige la opción. */
  viewPermissions: 'permisos.ver',
} as const;
