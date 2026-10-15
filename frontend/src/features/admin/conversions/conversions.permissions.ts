/** Permisos de «Conversiones» (07 E.5, H.1), con los nombres exactos del catálogo sembrado. */
export const CONVERSION_PERMISSIONS = {
  view: 'productos.ver',
  /** Alta, edición y activar/desactivar reglas. */
  configure: 'productos.configurar',
  /** Para leer la unidad de tonelaje (`GET /parameters`); sin él, el destino no se preselecciona. */
  viewParameters: 'parametros.ver',
  /** Para ofrecer los tipos de proyecto (`GET /catalogs`); sin él, no se ofrece ese ámbito. */
  viewCatalogs: 'catalogos.ver',
} as const;
