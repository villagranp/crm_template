/**
 * Catálogo base de gestión: módulos, permisos, opciones de menú y roles.
 *
 * Es la definición declarativa que consume `prisma/seed.ts`. Vive aquí, en
 * datos y no en código imperativo, para que ampliarlo sea revisable en un pull
 * request de una sola lectura.
 *
 * Reglas:
 * - Los permisos siguen el formato `recurso.accion` (ADR-008).
 * - Todo lo marcado `isSystem` no se puede borrar desde la interfaz.
 * - Añadir una opción de menú aquí NO basta para que un usuario la vea: hay que
 *   asignarla a un rol (`roles[].menuOptions`) o directamente al usuario.
 */

import { CRM_MENU_OPTIONS, CRM_MODULES, CRM_PERMISSIONS, CRM_ROLES } from './crm-access';
import { CRM_PARAMETERS } from './crm-parameters';

/** `cerrar` y `administrar` los añade el CRM (00 §5.1). */
export const ACTIONS = ['ver', 'crear', 'editar', 'eliminar', 'exportar', 'aprobar', 'configurar', 'cerrar', 'administrar'] as const;

export type ActionKey = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<ActionKey, string> = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  exportar: 'Exportar',
  aprobar: 'Aprobar',
  configurar: 'Configurar',
  cerrar: 'Cerrar',
  administrar: 'Administrar',
};

export interface ModuleSeed {
  key: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
  isSystem?: boolean;
}

export interface PermissionSeed {
  resource: string;
  /** Etiqueta del recurso en singular, para componer el nombre del permiso. */
  resourceLabel: string;
  moduleKey: string;
  actions: ActionKey[];
}

export interface MenuOptionSeed {
  key: string;
  moduleKey: string;
  label: string;
  icon: string;
  path: string | null;
  sortOrder: number;
  requiredPermission?: string;
  parentKey?: string;
  isPublic?: boolean;
}

export interface RoleSeed {
  code: string;
  name: string;
  description: string;
  dataScope: 'OWN' | 'TEAM' | 'COUNTRY' | 'ORGANIZATION';
  /** `'*'` concede todos los permisos del catálogo. */
  permissions: string[] | '*';
  /** `'*'` concede todas las opciones de menú. */
  menuOptions: string[] | '*';
}

/**
 * Módulos base. "Administración" es el módulo de sistema que la plantilla trae
 * completo; los módulos de negocio los añade cada proyecto.
 */
const CORE_MODULES: ModuleSeed[] = [
  { key: 'inicio', name: 'Inicio', description: 'Panel de control y accesos rápidos', icon: 'dashboard', sortOrder: 10 },
  {
    key: 'administracion',
    name: 'Administración',
    description: 'Configuración transversal del sistema',
    icon: 'settings',
    sortOrder: 90,
    isSystem: true,
  },
];

/**
 * Permisos del núcleo de gestión. Cada entrada genera un permiso por acción.
 */
const CORE_PERMISSIONS: PermissionSeed[] = [
  {
    resource: 'usuarios',
    resourceLabel: 'usuarios',
    moduleKey: 'administracion',
    actions: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  },
  {
    resource: 'roles',
    resourceLabel: 'roles y permisos',
    moduleKey: 'administracion',
    actions: ['ver', 'crear', 'editar', 'eliminar'],
  },
  {
    resource: 'permisos',
    resourceLabel: 'catálogo de permisos',
    moduleKey: 'administracion',
    actions: ['ver'],
  },
  {
    resource: 'opciones',
    resourceLabel: 'opciones de menú',
    moduleKey: 'administracion',
    actions: ['ver', 'crear', 'editar', 'eliminar', 'configurar'],
  },
  {
    resource: 'equipos',
    resourceLabel: 'equipos',
    moduleKey: 'administracion',
    actions: ['ver', 'crear', 'editar', 'eliminar'],
  },
  {
    resource: 'catalogos',
    resourceLabel: 'catálogos',
    moduleKey: 'administracion',
    actions: ['ver', 'crear', 'editar', 'eliminar'],
  },
  {
    resource: 'parametros',
    resourceLabel: 'parámetros del sistema',
    moduleKey: 'administracion',
    actions: ['ver', 'editar', 'configurar'],
  },
  {
    resource: 'auditoria',
    resourceLabel: 'bitácora de auditoría',
    moduleKey: 'administracion',
    actions: ['ver', 'exportar'],
  },
  {
    resource: 'aprobaciones',
    resourceLabel: 'aprobaciones',
    moduleKey: 'administracion',
    actions: ['ver', 'aprobar'],
  },
];

/** Opciones de menú del núcleo. `inicio` es pública: la ve cualquier sesión. */
const CORE_MENU_OPTIONS: MenuOptionSeed[] = [
  { key: 'inicio', moduleKey: 'inicio', label: 'Panel de control', icon: 'dashboard', path: '/', sortOrder: 10, isPublic: true },
  {
    key: 'admin-usuarios',
    moduleKey: 'administracion',
    label: 'Usuarios',
    icon: 'manage_accounts',
    path: '/administracion/usuarios',
    sortOrder: 10,
    requiredPermission: 'usuarios.ver',
  },
  {
    key: 'admin-roles',
    moduleKey: 'administracion',
    label: 'Roles y permisos',
    icon: 'admin_panel_settings',
    path: '/administracion/roles',
    sortOrder: 20,
    requiredPermission: 'roles.ver',
  },
  {
    key: 'admin-opciones',
    moduleKey: 'administracion',
    label: 'Opciones de menú',
    icon: 'list_alt',
    path: '/administracion/opciones',
    sortOrder: 30,
    requiredPermission: 'opciones.ver',
  },
  {
    key: 'admin-equipos',
    moduleKey: 'administracion',
    label: 'Equipos',
    icon: 'groups',
    path: '/administracion/equipos',
    sortOrder: 40,
    requiredPermission: 'equipos.ver',
  },
  {
    key: 'admin-catalogos',
    moduleKey: 'administracion',
    label: 'Catálogos',
    icon: 'inventory_2',
    path: '/administracion/catalogos',
    sortOrder: 50,
    requiredPermission: 'catalogos.ver',
  },
  {
    key: 'admin-parametros',
    moduleKey: 'administracion',
    label: 'Parámetros',
    icon: 'tune',
    path: '/administracion/parametros',
    sortOrder: 60,
    requiredPermission: 'parametros.ver',
  },
  {
    key: 'admin-aprobaciones',
    moduleKey: 'administracion',
    label: 'Aprobaciones',
    icon: 'fact_check',
    path: '/administracion/aprobaciones',
    sortOrder: 70,
    requiredPermission: 'aprobaciones.ver',
  },
  {
    key: 'admin-auditoria',
    moduleKey: 'administracion',
    label: 'Auditoría',
    icon: 'history',
    path: '/administracion/auditoria',
    sortOrder: 80,
    requiredPermission: 'auditoria.ver',
  },
];

/**
 * Roles base.
 *
 * `administrador` existe para que el sistema sea administrable desde el primer
 * arranque. `consulta` y `operacion` son plantillas razonables que cada
 * proyecto ajusta; no pretenden cubrir su negocio.
 */
const CORE_ROLES: RoleSeed[] = [
  {
    code: 'administrador',
    name: 'Administrador',
    description: 'Acceso total, incluida la configuración del sistema.',
    dataScope: 'ORGANIZATION',
    permissions: '*',
    menuOptions: '*',
  },
  {
    code: 'gestor-accesos',
    name: 'Gestor de accesos',
    // ADR-020: gestiona datos, no accesos. Conserva `roles.editar` y
    // `opciones.configurar` sin efecto práctico (las operaciones que cambian
    // accesos exigen además ser administrador).
    description:
      'Administra los datos de usuarios y equipos. La asignación de roles y permisos es exclusiva del administrador.',
    dataScope: 'ORGANIZATION',
    permissions: [
      'usuarios.ver',
      'usuarios.crear',
      'usuarios.editar',
      'usuarios.exportar',
      'roles.ver',
      'roles.editar',
      'permisos.ver',
      'opciones.ver',
      'opciones.configurar',
      'equipos.ver',
      'equipos.crear',
      'equipos.editar',
      'equipos.eliminar',
      'auditoria.ver',
    ],
    menuOptions: ['inicio', 'admin-usuarios', 'admin-roles', 'admin-opciones', 'admin-equipos', 'admin-auditoria'],
  },
  {
    code: 'auditor',
    name: 'Auditor',
    description: 'Sólo lectura sobre configuración y bitácora. No modifica nada.',
    dataScope: 'ORGANIZATION',
    permissions: ['usuarios.ver', 'roles.ver', 'permisos.ver', 'opciones.ver', 'equipos.ver', 'auditoria.ver', 'auditoria.exportar'],
    menuOptions: ['inicio', 'admin-usuarios', 'admin-roles', 'admin-opciones', 'admin-auditoria'],
  },
  {
    code: 'usuario',
    name: 'Usuario',
    description: 'Acceso básico a la aplicación, sin funciones de administración.',
    dataScope: 'OWN',
    permissions: [],
    menuOptions: ['inicio'],
  },
];

export interface SystemParameterSeed {
  key: string;
  value: string;
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'DATE';
  group: string;
  name: string;
  description: string;
  isPublic: boolean;
}

/** Parámetros del sistema con los que arranca cualquier proyecto. */
const CORE_SYSTEM_PARAMETERS: SystemParameterSeed[] = [
  {
    key: 'app.nombre',
    value: 'Aplicación empresarial',
    type: 'STRING',
    group: 'general',
    name: 'Nombre de la aplicación',
    description: 'Se muestra en el título y en los correos del sistema.',
    isPublic: true,
  },
  {
    key: 'seguridad.intentos_fallidos_maximos',
    value: '5',
    type: 'NUMBER',
    group: 'seguridad',
    name: 'Intentos fallidos antes de bloquear',
    description: 'Número de accesos fallidos consecutivos que bloquean la cuenta.',
    isPublic: false,
  },
  {
    key: 'seguridad.minutos_bloqueo',
    value: '15',
    type: 'NUMBER',
    group: 'seguridad',
    name: 'Minutos de bloqueo',
    description: 'Duración del bloqueo temporal de la cuenta.',
    isPublic: false,
  },
  {
    key: 'seguridad.dias_caducidad_password',
    value: '0',
    type: 'NUMBER',
    group: 'seguridad',
    name: 'Días de caducidad de contraseña',
    description: 'Cero desactiva la caducidad. Cámbialo sólo si una política lo exige.',
    isPublic: false,
  },
  {
    key: 'auditoria.dias_retencion',
    value: '365',
    type: 'NUMBER',
    group: 'auditoria',
    name: 'Días de retención de la bitácora',
    description: 'Debe cumplir la política de retención del proyecto (docs/security).',
    isPublic: false,
  },
  {
    key: 'ui.paginacion_default',
    value: '20',
    type: 'NUMBER',
    group: 'interfaz',
    name: 'Tamaño de página por defecto',
    description: 'Debe coincidir con DEFAULT_PAGE_SIZE de la API.',
    isPublic: true,
  },
];

/** Catálogo completo: núcleo + CRM (`crm-access.ts`). */
export const MODULES: ModuleSeed[] = [...CORE_MODULES, ...CRM_MODULES];
export const PERMISSIONS: PermissionSeed[] = [...CORE_PERMISSIONS, ...CRM_PERMISSIONS];
/** Declaradas; la semilla solo crea las que tienen ruta registrada (DM-32, PLAN-ADMIN D6). */
export const MENU_OPTIONS: MenuOptionSeed[] = [...CORE_MENU_OPTIONS, ...CRM_MENU_OPTIONS];
export const ROLES: RoleSeed[] = [...CORE_ROLES, ...CRM_ROLES];
export const SYSTEM_PARAMETERS: SystemParameterSeed[] = [...CORE_SYSTEM_PARAMETERS, ...CRM_PARAMETERS];
