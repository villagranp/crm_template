import { describe, expect, it } from 'vitest';

import { ROUTE_PATHS } from '@/routes/route-paths';

import { CRM_ROUTES } from './crm-routes';

describe('CRM_ROUTES (02 §E.1)', () => {
  it('protege cada ruta de Clientes con el permiso de su operación', () => {
    const permissionByPath = Object.fromEntries(CRM_ROUTES.map((route) => [route.path, route.permission]));

    expect(permissionByPath).toEqual({
      [ROUTE_PATHS.crm.customers]: 'clientes.ver',
      [ROUTE_PATHS.crm.customerNew]: 'clientes.crear',
      [ROUTE_PATHS.crm.customerDetail]: 'clientes.ver',
    });
  });
});
