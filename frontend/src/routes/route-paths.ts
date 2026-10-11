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
  },
} as const;
