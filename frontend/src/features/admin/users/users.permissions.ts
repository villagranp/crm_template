/** Permisos del área Usuarios, con los nombres exactos del catálogo sembrado (ADR-008). */
export const USER_PERMISSIONS = {
  view: 'usuarios.ver',
  create: 'usuarios.crear',
  edit: 'usuarios.editar',
  export: 'usuarios.exportar',
  /** Opciones de menú directas al usuario: `PUT /users/{id}/menu-options`. */
  assignMenuOptions: 'opciones.configurar',
  /** Catálogos para asignar. */
  viewRoles: 'roles.ver',
  viewPermissions: 'permisos.ver',
  viewMenuOptions: 'opciones.ver',
} as const;
