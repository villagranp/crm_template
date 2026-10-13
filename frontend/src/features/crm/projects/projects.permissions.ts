/**
 * Permisos del Módulo 3 (Proyectos, oportunidades, forecast y catálogo de
 * productos), con los nombres exactos del catálogo sembrado (03 §H.1,
 * `backend/prisma/seed/crm-access.ts`).
 *
 * Sólo deciden qué se muestra: el backend vuelve a exigir cada permiso y las
 * reglas de propiedad (propio frente a ajeno, DM-34) llegan ya resueltas en
 * `capabilities`. Los submódulos `opportunities/` y `forecast/` los importan
 * desde el barril `projects/index.ts`.
 */
export const PROJECT_PERMISSIONS = {
  view: 'proyectos.ver',
  create: 'proyectos.crear',
  edit: 'proyectos.editar',
  delete: 'proyectos.eliminar',
  administer: 'proyectos.administrar',
} as const;

export const OPPORTUNITY_PERMISSIONS = {
  view: 'oportunidades.ver',
  create: 'oportunidades.crear',
  edit: 'oportunidades.editar',
  close: 'oportunidades.cerrar',
  delete: 'oportunidades.eliminar',
  administer: 'oportunidades.administrar',
} as const;

export const FORECAST_PERMISSIONS = {
  view: 'forecast.ver',
  edit: 'forecast.editar',
  administer: 'forecast.administrar',
} as const;

/** Catálogo de productos: aquí solo lectura; `productos.configurar` es del Módulo 7 (DM-23). */
export const PRODUCT_PERMISSIONS = {
  view: 'productos.ver',
} as const;
