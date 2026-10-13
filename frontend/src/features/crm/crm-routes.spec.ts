import { describe, expect, it } from 'vitest';

import { ROUTE_PATHS } from '@/routes/route-paths';

import { CRM_ROUTES } from './crm-routes';

describe('CRM_ROUTES (02 §E.1, 04 §E.1)', () => {
  it('protege cada ruta del CRM con el permiso de su operación o de su opción de menú', () => {
    const permissionByPath = Object.fromEntries(CRM_ROUTES.map((route) => [route.path, route.permission]));

    expect(permissionByPath).toEqual({
      [ROUTE_PATHS.crm.customers]: 'clientes.ver',
      [ROUTE_PATHS.crm.customerNew]: 'clientes.crear',
      [ROUTE_PATHS.crm.customerDetail]: 'clientes.ver',
      [ROUTE_PATHS.activity.agenda]: 'actividades.ver',
      [ROUTE_PATHS.activity.pending]: 'actividades.ver',
      [ROUTE_PATHS.activity.followUp]: 'actividades.ver',
      [ROUTE_PATHS.activity.history]: 'actividades.ver',
      [ROUTE_PATHS.activity.visits]: 'visitas.ver',
      [ROUTE_PATHS.activity.visitNew]: 'visitas.crear',
      [ROUTE_PATHS.activity.visitDetail]: 'visitas.ver',
      [ROUTE_PATHS.activity.activities]: 'actividades.ver',
      [ROUTE_PATHS.activity.activityNew]: 'actividades.crear',
      [ROUTE_PATHS.activity.activityDetail]: 'actividades.ver',
    });
  });
});
