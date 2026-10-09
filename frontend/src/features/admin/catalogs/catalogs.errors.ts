/**
 * Mensajes de error propios del área (ganan sobre los comunes de `describeApiError`).
 * Viven fuera de los componentes para que React Fast Refresh funcione.
 */
export const CATALOG_FORM_ERRORS: Readonly<Record<string, string>> = {
  RESOURCE_CONFLICT: 'Ya existe un catálogo con esa clave.',
  SYSTEM_RESOURCE_READ_ONLY: 'Es un catálogo del sistema: su clave no se puede cambiar.',
};

export const CATALOG_ITEM_ERRORS: Readonly<Record<string, string>> = {
  RESOURCE_CONFLICT: 'Ya existe un elemento con ese código en este catálogo.',
  RESOURCE_NOT_FOUND: 'El elemento o el catálogo ya no existen. Actualiza y vuelve a intentarlo.',
};

export const CATALOG_DELETE_ERRORS: Readonly<Record<string, string>> = {
  CATALOG_NOT_EMPTY: 'El catálogo tiene elementos (activos o inactivos); sólo se puede eliminar si está vacío.',
  SYSTEM_RESOURCE_READ_ONLY: 'Es un catálogo del sistema y no se puede eliminar.',
};
