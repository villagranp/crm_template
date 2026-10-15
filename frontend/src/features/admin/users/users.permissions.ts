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
  /** Equipos del usuario: `PUT /users/{id}/teams` y `teamIds` en el alta (+ administrador, 07 RN-07.10). */
  editTeams: 'equipos.editar',
  /** Lista de equipos para elegir (`GET /teams`). */
  viewTeams: 'equipos.ver',
  /**
   * Lista de países (`GET /customers/form-options`, 02 F2): no hay endpoint de
   * países bajo `usuarios.*` (07 E.1). El administrador lo tiene siempre.
   */
  viewCountries: 'clientes.ver',
} as const;
