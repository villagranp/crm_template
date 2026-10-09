/** Permisos del área Catálogos, con los nombres exactos del catálogo sembrado (ADR-008). */
export const CATALOG_PERMISSIONS = {
  view: 'catalogos.ver',
  create: 'catalogos.crear',
  /** También cubre alta, edición, orden y activación de elementos. */
  edit: 'catalogos.editar',
  remove: 'catalogos.eliminar',
} as const;
