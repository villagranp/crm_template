/**
 * Permisos del Módulo 6 (06 §F.1, H.1) con los nombres exactos del catálogo
 * sembrado. Sólo deciden qué se muestra: el backend vuelve a exigir cada
 * permiso, y la autoría y el alcance (RN-06.19) llegan ya resueltos en
 * `canConfirm`/`canCancel`/`hasErrorFile` de la carga.
 */
export const CUSTOMER_IMPORT_PERMISSIONS = {
  view: 'importaciones.ver',
  create: 'importaciones.crear',
  /** La subida y la confirmación exigen además poder crear clientes. */
  customersCreate: 'clientes.crear',
  /** Para enlazar a la ficha del cliente creado o existente. */
  customersView: 'clientes.ver',
} as const;

export interface ImportPageActions {
  /** "Nueva carga": `importaciones.crear` + `clientes.crear`. */
  canUpload: boolean;
  /** "Descargar plantilla": `importaciones.crear`. */
  canDownloadTemplate: boolean;
}

/** Acciones de alta visibles según los permisos del usuario (`can` de `useCan()`). */
export function importPageActions(can: (permission: string) => boolean): ImportPageActions {
  const canCreate = can(CUSTOMER_IMPORT_PERMISSIONS.create);
  return {
    canUpload: canCreate && can(CUSTOMER_IMPORT_PERMISSIONS.customersCreate),
    canDownloadTemplate: canCreate,
  };
}
