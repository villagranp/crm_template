/**
 * Permisos del módulo Reportes (05 H.1), con los nombres exactos del catálogo sembrado.
 *
 * Sólo deciden qué se muestra (p. ej. el botón "Exportar a Excel"): el backend vuelve a
 * exigir `reportes.ver` en cada consulta y `reportes.exportar` **y** `reportes.ver` en cada
 * `/export` (AC-05.28).
 */
export const REPORT_PERMISSIONS = {
  view: 'reportes.ver',
  export: 'reportes.exportar',
} as const;

/**
 * Permisos `.ver` de las fichas de origen (05 E.1, AC-05.4): el código de una fila sólo es
 * enlace si el usuario puede abrir la ficha. Nombres del catálogo sembrado (03 §H.1, 04 §H.2).
 */
export const REPORT_SOURCE_PERMISSIONS = {
  project: 'proyectos.ver',
  opportunity: 'oportunidades.ver',
  customer: 'clientes.ver',
  visit: 'visitas.ver',
  activity: 'actividades.ver',
  /** Selector de productos del catálogo (`GET /products`) en los filtros. */
  product: 'productos.ver',
} as const;
