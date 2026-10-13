/**
 * Permisos que usa Actividad comercial, con los nombres exactos del catálogo
 * sembrado (04 §H.2, `backend/prisma/seed/crm-access.ts`).
 *
 * Sólo deciden qué se muestra: el backend vuelve a exigir cada permiso y la
 * propiedad y el estado llegan ya resueltos en `allowedActions`.
 */
export const ACTIVITY_PERMISSIONS = {
  view: 'actividades.ver',
  create: 'actividades.crear',
  edit: 'actividades.editar',
  /** Completar (F-33) y registrar una gestión ya realizada (D-04.14). */
  close: 'actividades.cerrar',
  delete: 'actividades.eliminar',
  /** Asignar otro responsable (RN-04.5) y operar sobre actividades ajenas. */
  administer: 'actividades.administrar',
} as const;

export const VISIT_PERMISSIONS = {
  view: 'visitas.ver',
  create: 'visitas.crear',
  edit: 'visitas.editar',
  /** Confirmar: sólo el dueño de la visita (DM-20). */
  close: 'visitas.cerrar',
  administer: 'visitas.administrar',
} as const;

/** Permisos de otros módulos que condicionan campos de los formularios. */
export const COMMERCIAL_RELATED_PERMISSIONS = {
  /** Contactos del cliente como participantes (RN-04.6, 02 H.5). */
  viewContacts: 'contactos.ver',
  /** Lista de países del filtro (`GET /customers/form-options`, 02 F2). */
  viewCustomers: 'clientes.ver',
} as const;
