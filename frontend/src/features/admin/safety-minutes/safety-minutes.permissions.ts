/**
 * Permisos del mantenimiento del «Minuto de seguridad» (AJ1 HU-AJ1-2, AC-AJ1.15).
 * Ocultar un control es experiencia de usuario: el backend vuelve a exigir cada permiso.
 */
export const SAFETY_MINUTE_PERMISSIONS = {
  /** Consultar la lista (y la opción de menú). */
  view: 'minuto_seguridad.ver',
  create: 'minuto_seguridad.crear',
  edit: 'minuto_seguridad.editar',
  remove: 'minuto_seguridad.eliminar',
} as const;
