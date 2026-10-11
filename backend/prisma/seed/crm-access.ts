/**
 * Accesos del CRM comercial: módulos, permisos, opciones de menú y roles.
 *
 * Fuente: docs/implementation-plans/crm/00-modelo-de-datos.md §4.4, §5.
 * `access-catalog.ts` concatena estas listas con las del núcleo, así que la
 * semilla esencial (`prisma/seed.ts`) las trata igual que al resto.
 *
 * Opciones de menú y DM-32 (resuelta el 2026-10-10: "permisos y roles en la
 * Fase 0; opciones y rutas con cada módulo"): las opciones se DECLARAN aquí para
 * que los roles las referencien desde ya, pero la semilla solo crea las que
 * apuntan a una ruta registrada en `app-routes.registry.json` (PLAN-ADMIN D6).
 * Cuando un módulo entrega su pantalla y registra la ruta, la siguiente
 * ejecución de la semilla crea la opción y la asigna a los roles; antes, no
 * existe (nunca lleva a un 404).
 */
import type { MenuOptionSeed, ModuleSeed, PermissionSeed, RoleSeed } from './access-catalog';

/** Módulos del CRM (00 §5.3). Inicio y Administración ya existen en el núcleo. */
export const CRM_MODULES: ModuleSeed[] = [
  { key: 'clientes', name: 'Clientes', description: 'Clientes, establecimientos y contactos', icon: 'business', sortOrder: 20 },
  { key: 'proyectos', name: 'Proyectos', description: 'Proyectos, oportunidades y forecast', icon: 'apartment', sortOrder: 30 },
  {
    key: 'actividad-comercial',
    name: 'Actividad comercial',
    description: 'Agenda, visitas y actividades',
    icon: 'event_note',
    sortOrder: 40,
  },
  { key: 'reportes', name: 'Reportes', description: 'Reportes e indicadores comerciales', icon: 'bar_chart', sortOrder: 50 },
  { key: 'integraciones', name: 'Integraciones', description: 'Cargas masivas de datos', icon: 'upload_file', sortOrder: 60 },
];

/** Catálogo de permisos del CRM (00 §5.2): 41 permisos. */
export const CRM_PERMISSIONS: PermissionSeed[] = [
  { resource: 'clientes', resourceLabel: 'clientes', moduleKey: 'clientes', actions: ['ver', 'crear', 'editar', 'eliminar', 'administrar'] },
  { resource: 'contactos', resourceLabel: 'contactos', moduleKey: 'clientes', actions: ['ver', 'crear', 'editar', 'eliminar'] },
  { resource: 'proyectos', resourceLabel: 'proyectos', moduleKey: 'proyectos', actions: ['ver', 'crear', 'editar', 'eliminar', 'administrar'] },
  {
    resource: 'oportunidades',
    resourceLabel: 'oportunidades',
    moduleKey: 'proyectos',
    actions: ['ver', 'crear', 'editar', 'cerrar', 'eliminar', 'administrar'],
  },
  { resource: 'productos', resourceLabel: 'catálogo de productos', moduleKey: 'proyectos', actions: ['ver', 'configurar'] },
  { resource: 'forecast', resourceLabel: 'forecast comercial', moduleKey: 'proyectos', actions: ['ver', 'editar', 'administrar'] },
  // Sin `eliminar`: las visitas no se eliminan (se cancelan).
  { resource: 'visitas', resourceLabel: 'visitas', moduleKey: 'actividad-comercial', actions: ['ver', 'crear', 'editar', 'cerrar', 'administrar'] },
  {
    resource: 'actividades',
    resourceLabel: 'actividades',
    moduleKey: 'actividad-comercial',
    actions: ['ver', 'crear', 'editar', 'cerrar', 'eliminar', 'administrar'],
  },
  { resource: 'reportes', resourceLabel: 'reportes comerciales', moduleKey: 'reportes', actions: ['ver', 'exportar'] },
  { resource: 'importaciones', resourceLabel: 'cargas masivas de clientes', moduleKey: 'integraciones', actions: ['ver', 'crear'] },
  // Metas: solo lectura; la carga es por script (DM-9).
  { resource: 'metas', resourceLabel: 'metas comerciales', moduleKey: 'inicio', actions: ['ver'] },
];

/**
 * Opciones de menú del CRM (00 §5.3 y 07 E.5). Solo se siembran las que tienen
 * ruta registrada (ver cabecera, DM-32).
 */
export const CRM_MENU_OPTIONS: MenuOptionSeed[] = [
  { key: 'clientes-buscar', moduleKey: 'clientes', label: 'Clientes', icon: 'business', path: '/clientes', sortOrder: 10, requiredPermission: 'clientes.ver' },
  { key: 'proyectos-buscar', moduleKey: 'proyectos', label: 'Proyectos', icon: 'apartment', path: '/proyectos', sortOrder: 10, requiredPermission: 'proyectos.ver' },
  {
    key: 'proyectos-equipo',
    moduleKey: 'proyectos',
    label: 'Proyectos del equipo',
    icon: 'groups',
    path: '/proyectos/equipo',
    sortOrder: 20,
    requiredPermission: 'proyectos.ver',
  },
  {
    key: 'proyectos-oportunidades',
    moduleKey: 'proyectos',
    label: 'Oportunidades',
    icon: 'handshake',
    path: '/proyectos/oportunidades',
    sortOrder: 30,
    requiredPermission: 'oportunidades.ver',
  },
  {
    key: 'proyectos-forecast',
    moduleKey: 'proyectos',
    label: 'Forecast M+6',
    icon: 'trending_up',
    path: '/proyectos/forecast',
    sortOrder: 40,
    requiredPermission: 'forecast.ver',
  },
  {
    key: 'actividad-agenda',
    moduleKey: 'actividad-comercial',
    label: 'Agenda',
    icon: 'calendar_month',
    path: '/actividad/agenda',
    sortOrder: 10,
    requiredPermission: 'actividades.ver',
  },
  {
    key: 'actividad-pendientes',
    moduleKey: 'actividad-comercial',
    label: 'Pendientes',
    icon: 'pending_actions',
    path: '/actividad/pendientes',
    sortOrder: 20,
    requiredPermission: 'actividades.ver',
  },
  {
    key: 'actividad-seguimiento',
    moduleKey: 'actividad-comercial',
    label: 'Seguimiento',
    icon: 'track_changes',
    path: '/actividad/seguimiento',
    sortOrder: 30,
    requiredPermission: 'actividades.ver',
  },
  {
    key: 'actividad-historial',
    moduleKey: 'actividad-comercial',
    label: 'Historial de interacciones',
    icon: 'history',
    path: '/actividad/historial',
    sortOrder: 40,
    requiredPermission: 'actividades.ver',
  },
  {
    key: 'actividad-visitas',
    moduleKey: 'actividad-comercial',
    label: 'Visitas',
    icon: 'location_on',
    path: '/actividad/visitas',
    sortOrder: 50,
    requiredPermission: 'visitas.ver',
  },
  {
    key: 'actividad-actividades',
    moduleKey: 'actividad-comercial',
    label: 'Actividades',
    icon: 'task_alt',
    path: '/actividad/actividades',
    sortOrder: 60,
    requiredPermission: 'actividades.ver',
  },
  { key: 'reportes-proyectos', moduleKey: 'reportes', label: 'Proyectos', icon: 'apartment', path: '/reportes/proyectos', sortOrder: 10, requiredPermission: 'reportes.ver' },
  {
    key: 'reportes-oportunidades',
    moduleKey: 'reportes',
    label: 'Oportunidades',
    icon: 'handshake',
    path: '/reportes/oportunidades',
    sortOrder: 20,
    requiredPermission: 'reportes.ver',
  },
  { key: 'reportes-forecast', moduleKey: 'reportes', label: 'Forecast', icon: 'trending_up', path: '/reportes/forecast', sortOrder: 30, requiredPermission: 'reportes.ver' },
  { key: 'reportes-visitas', moduleKey: 'reportes', label: 'Visitas', icon: 'location_on', path: '/reportes/visitas', sortOrder: 40, requiredPermission: 'reportes.ver' },
  {
    key: 'reportes-actividades',
    moduleKey: 'reportes',
    label: 'Actividades',
    icon: 'task_alt',
    path: '/reportes/actividades',
    sortOrder: 50,
    requiredPermission: 'reportes.ver',
  },
  {
    key: 'reportes-dashboard',
    moduleKey: 'reportes',
    label: 'Dashboard comercial',
    icon: 'insights',
    path: '/reportes/dashboard',
    sortOrder: 60,
    requiredPermission: 'reportes.ver',
  },
  {
    key: 'reportes-embudo',
    moduleKey: 'reportes',
    label: 'Embudo comercial',
    icon: 'filter_alt',
    path: '/reportes/embudo',
    sortOrder: 70,
    requiredPermission: 'reportes.ver',
  },
  {
    key: 'integraciones-clientes',
    moduleKey: 'integraciones',
    label: 'Carga masiva de clientes',
    icon: 'upload_file',
    path: '/integraciones/clientes',
    sortOrder: 10,
    requiredPermission: 'importaciones.ver',
  },
  // Administración del CRM (07 E.5): se conceden al administrador por '*'.
  {
    key: 'admin-tipos-cambio',
    moduleKey: 'administracion',
    label: 'Tipos de cambio',
    icon: 'currency_exchange',
    path: '/administracion/tipos-cambio',
    sortOrder: 64,
    requiredPermission: 'parametros.ver',
  },
  {
    key: 'admin-productos',
    moduleKey: 'administracion',
    label: 'Productos y unidades',
    icon: 'category',
    path: '/administracion/productos',
    sortOrder: 66,
    requiredPermission: 'productos.ver',
  },
  {
    key: 'admin-conversiones',
    moduleKey: 'administracion',
    label: 'Conversiones',
    icon: 'swap_horiz',
    path: '/administracion/conversiones',
    sortOrder: 68,
    requiredPermission: 'productos.ver',
  },
];

/** Permisos comunes a los tres roles comerciales (00 §5.4). */
const ASESOR_PERMISSIONS = [
  'clientes.ver',
  'clientes.crear',
  'clientes.editar',
  'contactos.ver',
  'contactos.crear',
  'contactos.editar',
  'proyectos.ver',
  'proyectos.crear',
  'proyectos.editar',
  'oportunidades.ver',
  'oportunidades.crear',
  'oportunidades.editar',
  'oportunidades.cerrar',
  'productos.ver',
  'forecast.ver',
  'forecast.editar',
  'visitas.ver',
  'visitas.crear',
  'visitas.editar',
  // Confirma SUS PROPIAS visitas (DM-20; ck_visits_confirmed_by_owner).
  'visitas.cerrar',
  'actividades.ver',
  'actividades.crear',
  'actividades.editar',
  'actividades.cerrar',
  'reportes.ver',
  'metas.ver',
];

/** Manager y responsable de país: lo del asesor + eliminar, administrar y exportar. */
const SUPERVISOR_PERMISSIONS = [
  ...ASESOR_PERMISSIONS,
  'clientes.eliminar',
  'clientes.administrar',
  'contactos.eliminar',
  'proyectos.eliminar',
  'proyectos.administrar',
  'oportunidades.eliminar',
  'oportunidades.administrar',
  'forecast.administrar',
  'visitas.administrar',
  'actividades.eliminar',
  'actividades.administrar',
  'reportes.exportar',
];

/** Opciones comerciales (sin la carga masiva: ningún rol comercial tiene `importaciones.*`). */
const COMMERCIAL_MENU = CRM_MENU_OPTIONS.filter(
  (option) => option.moduleKey !== 'administracion' && option.moduleKey !== 'integraciones',
).map((option) => option.key);

/**
 * Roles comerciales (00 §4.4, DM-11, D-07.1): de sistema, la semilla repone sus
 * asignaciones; para variar un perfil se duplica el rol.
 */
export const CRM_ROLES: RoleSeed[] = [
  {
    code: 'asesor',
    name: 'Asesor',
    description: 'Asesor comercial: ve y gestiona sus propios clientes, proyectos y actividad.',
    dataScope: 'OWN',
    permissions: ASESOR_PERMISSIONS,
    menuOptions: ['inicio', ...COMMERCIAL_MENU],
  },
  {
    code: 'manager',
    name: 'Manager',
    description: 'Jefe o supervisor comercial: ve su equipo y subequipos; administra registros ajenos dentro de ese alcance.',
    dataScope: 'TEAM',
    permissions: SUPERVISOR_PERMISSIONS,
    menuOptions: ['inicio', ...COMMERCIAL_MENU],
  },
  {
    code: 'responsable-pais',
    name: 'Responsable de país',
    description: 'Ve y administra la actividad comercial de su país.',
    dataScope: 'COUNTRY',
    permissions: SUPERVISOR_PERMISSIONS,
    menuOptions: ['inicio', ...COMMERCIAL_MENU],
  },
];
