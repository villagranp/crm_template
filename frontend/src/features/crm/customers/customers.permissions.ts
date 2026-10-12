/**
 * Permisos que usa el submódulo de Clientes, con los nombres exactos del
 * catálogo sembrado (02 §H.2, `backend/prisma/seed/crm-access.ts`).
 *
 * Sólo deciden qué se muestra: el backend vuelve a exigir cada permiso y las
 * reglas de propiedad llegan ya resueltas en `capabilities`.
 */
export const CUSTOMER_PERMISSIONS = {
  view: 'clientes.ver',
  create: 'clientes.crear',
  edit: 'clientes.editar',
  delete: 'clientes.eliminar',
  administer: 'clientes.administrar',
} as const;

export const CONTACT_PERMISSIONS = {
  view: 'contactos.ver',
  create: 'contactos.crear',
  edit: 'contactos.editar',
  delete: 'contactos.eliminar',
} as const;

/** Permisos de otros módulos que condicionan secciones de la ficha (D-02.10). */
export const RELATED_PERMISSIONS = {
  viewProjects: 'proyectos.ver',
  createActivity: 'actividades.crear',
} as const;
