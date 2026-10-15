import type { DataScope, Permission } from './roles.api';

export const DATA_SCOPE_LABEL: Record<DataScope, string> = {
  OWN: 'Sólo lo propio',
  TEAM: 'Su equipo',
  COUNTRY: 'Su país',
  ORGANIZATION: 'Toda la organización',
};

/** Descripción breve de cada ámbito de visibilidad (07 E.2, RN-07.15). */
export const DATA_SCOPE_DESCRIPTION: Record<DataScope, string> = {
  OWN: 'Sólo los registros de los que es responsable.',
  TEAM: 'Los de su equipo y sus subequipos.',
  COUNTRY: 'Los del país asignado al usuario.',
  ORGANIZATION: 'Todos los registros de la organización.',
};

/**
 * Orden de las columnas de la matriz (07 AC-07.12): las operaciones del CRM
 * primero y después las de administración.
 */
const ACTION_ORDER = [
  'ver',
  'crear',
  'editar',
  'cerrar',
  'eliminar',
  'exportar',
  'administrar',
  'aprobar',
  'configurar',
];

export const ACTION_LABEL: Readonly<Record<string, string>> = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  cerrar: 'Cerrar',
  eliminar: 'Eliminar',
  exportar: 'Exportar',
  administrar: 'Administrar',
  aprobar: 'Aprobar',
  configurar: 'Configurar',
};

/** Ayuda emergente de las operaciones cuyo nombre se presta a confusión (07 E.2, RN-07.14). */
export const ACTION_HINT: Readonly<Record<string, string>> = {
  administrar:
    'Actuar sobre registros de otras personas dentro del alcance del rol. «Editar» sólo permite los propios. No da acceso al módulo de Administración.',
};

/** Nombre de los módulos del catálogo de permisos (`Permission.moduleKey`, 00 §5.3). */
export const MODULE_LABEL: Readonly<Record<string, string>> = {
  inicio: 'Inicio',
  clientes: 'Clientes',
  proyectos: 'Proyectos',
  'actividad-comercial': 'Actividad comercial',
  reportes: 'Reportes',
  integraciones: 'Integraciones',
  administracion: 'Administración',
  general: 'General',
};

/** Orden de los módulos en la matriz: el del menú (`AppModule.sortOrder` sembrado). */
const MODULE_ORDER = [
  'inicio',
  'clientes',
  'proyectos',
  'actividad-comercial',
  'reportes',
  'integraciones',
  'administracion',
];

/** Etiqueta del módulo; si no se conoce, la clave tal cual. */
export function moduleLabel(moduleKey: string): string {
  return MODULE_LABEL[moduleKey] ?? moduleKey;
}

function moduleRank(moduleKey: string): number {
  const index = MODULE_ORDER.indexOf(moduleKey);
  return index === -1 ? MODULE_ORDER.length : index;
}

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
    .sort(([a], [b]) => moduleRank(a) - moduleRank(b) || a.localeCompare(b))
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
