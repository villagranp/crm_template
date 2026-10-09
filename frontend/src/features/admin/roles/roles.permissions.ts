/** Permisos del área Roles y permisos, con los nombres exactos del catálogo sembrado (ADR-008). */
export const ROLE_PERMISSIONS = {
  view: 'roles.ver',
  create: 'roles.crear',
  edit: 'roles.editar',
  remove: 'roles.eliminar',
  /** Catálogo de permisos para la matriz. */
  viewPermissions: 'permisos.ver',
  /** `PUT /roles/{id}/menu-options`. */
  assignMenuOptions: 'opciones.configurar',
  viewMenuOptions: 'opciones.ver',
} as const;
