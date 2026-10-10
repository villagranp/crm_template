/** Permisos del área Equipos, con los nombres exactos del catálogo sembrado (ADR-008). */
export const TEAM_PERMISSIONS = {
  view: 'equipos.ver',
  create: 'equipos.crear',
  edit: 'equipos.editar',
  remove: 'equipos.eliminar',
  /** Los selectores de responsable y miembros buscan en `GET /users`. */
  searchUsers: 'usuarios.ver',
} as const;
