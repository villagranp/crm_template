import { describe, expect, it } from 'vitest';

import { ROUTE_PATHS } from '@/routes/route-paths';

import { CRM_ROUTES } from './crm-routes';
import { opportunityDetailPath, projectDetailPath } from './projects';

describe('CRM_ROUTES (02 §E.1, 03 §E.1)', () => {
  it('protege cada ruta con el permiso de su opción de menú o de su operación (nombres del catálogo sembrado)', () => {
    const permissionByPath = Object.fromEntries(CRM_ROUTES.map((route) => [route.path, route.permission]));

    expect(permissionByPath).toEqual({
      '/clientes': 'clientes.ver',
      '/clientes/nuevo': 'clientes.crear',
      '/clientes/:customerId': 'clientes.ver',
      '/proyectos': 'proyectos.ver',
      '/proyectos/nuevo': 'proyectos.crear',
      '/proyectos/:projectId': 'proyectos.ver',
      '/proyectos/equipo': 'proyectos.ver',
      '/proyectos/oportunidades': 'oportunidades.ver',
      '/proyectos/oportunidades/:opportunityId': 'oportunidades.ver',
      '/proyectos/forecast': 'forecast.ver',
    });
  });

  it('las rutas del Módulo 3 salen de ROUTE_PATHS.crm.projects', () => {
    expect(ROUTE_PATHS.crm.projects).toEqual({
      search: '/proyectos',
      create: '/proyectos/nuevo',
      detail: '/proyectos/:projectId',
      team: '/proyectos/equipo',
      opportunities: '/proyectos/oportunidades',
      opportunityDetail: '/proyectos/oportunidades/:opportunityId',
      forecast: '/proyectos/forecast',
    });
  });
});

describe('rutas de detalle del Módulo 3', () => {
  it('sustituyen el parámetro con el id codificado', () => {
    expect(projectDetailPath('p-1')).toBe('/proyectos/p-1');
    expect(opportunityDetailPath('a/b')).toBe('/proyectos/oportunidades/a%2Fb');
  });
});
