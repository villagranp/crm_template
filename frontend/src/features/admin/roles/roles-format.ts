import type { DataScope, Permission } from './roles.api';

export const DATA_SCOPE_LABEL: Record<DataScope, string> = {
  OWN: 'Sólo lo propio',
  TEAM: 'Su equipo',
  TERRITORY: 'Su territorio',
  ORGANIZATION: 'Toda la organización',
};

/** Orden de las columnas de la matriz: el del catálogo sembrado. */
const ACTION_ORDER = ['ver', 'crear', 'editar', 'eliminar', 'exportar', 'aprobar', 'configurar'];

export const ACTION_LABEL: Readonly<Record<string, string>> = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  exportar: 'Exportar',
  aprobar: 'Aprobar',
  configurar: 'Configurar',
};

export interface PermissionMatrixModule {
  moduleKey: string;
  actions: string[];
  resources: { resource: string; byAction: Record<string, Permission> }[];
}

function actionRank(action: string): number {
  const index = ACTION_ORDER.indexOf(action);
  return index === -1 ? ACTION_ORDER.length : index;
}

/**
 * Agrupa el catálogo por módulo y, dentro, por recurso × acción: la matriz
 * de la pantalla de roles. Función pura para poder probarla.
 */
export function buildPermissionMatrix(permissions: readonly Permission[]): PermissionMatrixModule[] {
  const modules = new Map<string, Map<string, Record<string, Permission>>>();

  for (const permission of permissions) {
    const moduleKey = permission.moduleKey ?? 'general';
    const resources = modules.get(moduleKey) ?? new Map<string, Record<string, Permission>>();
    const byAction = resources.get(permission.resource) ?? {};
    byAction[permission.action] = permission;
    resources.set(permission.resource, byAction);
    modules.set(moduleKey, resources);
  }

  return [...modules.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moduleKey, resources]) => {
      const actions = [...new Set([...resources.values()].flatMap((byAction) => Object.keys(byAction)))].sort(
        (a, b) => actionRank(a) - actionRank(b) || a.localeCompare(b),
      );
      return {
        moduleKey,
        actions,
        resources: [...resources.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([resource, byAction]) => ({ resource, byAction })),
      };
    });
}

/** Mensajes propios del área (ganan sobre los comunes de `describeApiError`). */
export const ROLE_ERRORS: Readonly<Record<string, string>> = {
  RESOURCE_CONFLICT: 'Ya existe un rol con ese código (los de roles eliminados también quedan reservados).',
  SYSTEM_RESOURCE_READ_ONLY: 'Es un rol del sistema y no se puede modificar. Duplícalo para crear una variante editable.',
  ROLE_IN_USE: 'El rol tiene usuarios asignados. Reasígnalos antes de eliminarlo.',
  UNKNOWN_REFERENCE: 'Algún permiso u opción seleccionada ya no existe. Actualiza y vuelve a intentarlo.',
};
