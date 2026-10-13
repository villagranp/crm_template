import { describe, expect, it } from 'vitest';

import { ROUTE_PATHS } from '@/routes/route-paths';

import { COMMERCIAL_ACTIVITY_ROUTES } from './commercial-activity/commercial-activity-routes';
import { CRM_ROUTES } from './crm-routes';
import { opportunityDetailPath, projectDetailPath } from './projects';

describe('CRM_ROUTES (02 §E.1, 03 §E.1, 04 §E.1)', () => {
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

  it('las pantallas entregadas de Actividad comercial ya no usan el marcador provisional', () => {
    const provisional = COMMERCIAL_ACTIVITY_ROUTES.find((route) => route.path === ROUTE_PATHS.activity.agenda)?.Page;
    const delivered = [ROUTE_PATHS.activity.pending, ROUTE_PATHS.activity.activities, ROUTE_PATHS.activity.activityNew, ROUTE_PATHS.activity.activityDetail];

    for (const path of delivered) {
      const route = COMMERCIAL_ACTIVITY_ROUTES.find((item) => item.path === path);
      expect(route?.Page).toBeDefined();
      expect(route?.Page).not.toBe(provisional);
    }
  });
});

describe('rutas de detalle del Módulo 3', () => {
  it('sustituyen el parámetro con el id codificado', () => {
    expect(projectDetailPath('p-1')).toBe('/proyectos/p-1');
    expect(opportunityDetailPath('a/b')).toBe('/proyectos/oportunidades/a%2Fb');
  });
});
