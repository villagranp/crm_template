/**
 * Rutas que el propio frontend necesita conocer (las de funcionalidad vienen del menú, ADR-018).
 *
 * Toda ruta navegable dentro del shell debe figurar también en
 * `backend/src/modules/access/app-routes.registry.json` (PLAN-ADMIN D6): el
 * backend sólo deja crear opciones de menú que apunten a rutas registradas y
 * `route-registry.spec.ts` falla si el router y el registro divergen.
 */
export const ROUTE_PATHS = {
  home: '/',
  login: '/acceso',
  changePassword: '/cambiar-contrasena',
  admin: {
    users: '/administracion/usuarios',
    roles: '/administracion/roles',
    menuOptions: '/administracion/opciones',
    teams: '/administracion/equipos',
    catalogs: '/administracion/catalogos',
    parameters: '/administracion/parametros',
    approvals: '/administracion/aprobaciones',
    audit: '/administracion/auditoria',
  },
  crm: {
    customers: '/clientes',
    customerNew: '/clientes/nuevo',
    /** Ruta con parámetro (D-02.12): se registra, pero no puede ser destino de una opción de menú. */
    customerDetail: '/clientes/:customerId',
    /** Módulo 3 (03 §E.1). Las rutas con parámetro se registran, pero nunca son destino de menú (D-03.2). */
    projects: {
      search: '/proyectos',
      create: '/proyectos/nuevo',
      detail: '/proyectos/:projectId',
      team: '/proyectos/equipo',
      opportunities: '/proyectos/oportunidades',
      opportunityDetail: '/proyectos/oportunidades/:opportunityId',
      forecast: '/proyectos/forecast',
    },
    /** Módulo 6 (06 §E): carga masiva de clientes. El detalle es ruta hija, no opción de menú. */
    customerImports: {
      list: '/integraciones/clientes',
      detail: '/integraciones/clientes/:importId',
    },
  },
  /** Actividad comercial (04 E.1). Las rutas con parámetro no son destino de menú (D-04.13). */
  activity: {
    agenda: '/actividad/agenda',
    pending: '/actividad/pendientes',
    followUp: '/actividad/seguimiento',
    history: '/actividad/historial',
    visits: '/actividad/visitas',
    visitNew: '/actividad/visitas/nueva',
    visitDetail: '/actividad/visitas/:visitId',
    activities: '/actividad/actividades',
    activityNew: '/actividad/actividades/nueva',
    activityDetail: '/actividad/actividades/:activityId',
  },
} as const;
