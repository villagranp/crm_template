import { describe, expect, it } from 'vitest';

import { getShellNavigablePaths } from '@/routes/app-routes';

import {
  customerHref,
  isRegisteredPath,
  kpiCardHref,
  sourceHref,
  visitHref,
  type LinkContext,
} from './source-routes';

const ALL = new Set([
  'proyectos.ver',
  'oportunidades.ver',
  'forecast.ver',
  'visitas.ver',
  'actividades.ver',
  'clientes.ver',
]);

/** Contexto con las rutas reales del router de hoy. */
function realContext(permissions: ReadonlySet<string> = ALL): LinkContext {
  return {
    navigablePaths: getShellNavigablePaths(),
    can: (permission) => permissions.has(permission),
  };
}

/** Contexto con el Módulo 4 ya registrado (rutas hipotéticas de 04 §E.1). */
function withActivityModule(): LinkContext {
  return {
    navigablePaths: [
      ...getShellNavigablePaths(),
      '/actividad/visitas',
      '/actividad/pendientes',
      '/actividad/visitas/:visitId',
      '/actividad/actividades/:activityId',
    ],
    can: (permission) => ALL.has(permission),
  };
}

describe('source-routes (PF-01.22)', () => {
  it('las tarjetas con ruta registrada enlazan al listado con el filtro de E.3', () => {
    const context = realContext();
    const period = { from: '2026-10-01', to: '2026-10-31' };

    expect(kpiCardHref('activeProjects', context)).toBe('/proyectos?active=true');
    expect(kpiCardHref('openOpportunities', context)).toBe('/proyectos/oportunidades?status=OPEN');
    expect(kpiCardHref('wonOpportunities', context, period)).toBe(
      '/proyectos/oportunidades?outcome=WON,PARTIAL&decisionFrom=2026-10-01&decisionTo=2026-10-31',
    );
    expect(kpiCardHref('lostOpportunities', context, period)).toBe(
      '/proyectos/oportunidades?outcome=LOST&decisionFrom=2026-10-01&decisionTo=2026-10-31',
    );
    expect(kpiCardHref('forecast', context)).toBe('/proyectos/forecast');
  });

  it('con el router real, las tarjetas de Actividad comercial (Módulo 4) enlazan a sus listados', () => {
    const context = realContext();
    expect(kpiCardHref('pendingVisits', context)).toBe('/actividad/visitas?statusGroup=PENDING');
    expect(kpiCardHref('overdueActivities', context)).toBe('/actividad/pendientes?bucket=OVERDUE');
  });

  it('sin la ruta del módulo dueño registrada no hay enlace (RN-01.19)', () => {
    const context: LinkContext = { ...realContext(), navigablePaths: realContext().navigablePaths.filter((path) => !path.startsWith('/actividad')) };
    expect(kpiCardHref('pendingVisits', context)).toBeNull();
    expect(kpiCardHref('pendingActivities', context)).toBeNull();
    expect(kpiCardHref('overdueActivities', context)).toBeNull();
  });

  it('el enlace aparece en cuanto la ruta se registra, con `bucket` repetible', () => {
    const context = withActivityModule();
    expect(kpiCardHref('pendingVisits', context)).toBe('/actividad/visitas?statusGroup=PENDING');
    expect(kpiCardHref('pendingActivities', context)).toBe(
      '/actividad/pendientes?bucket=DUE_SOON&bucket=PENDING',
    );
    expect(kpiCardHref('overdueActivities', context)).toBe('/actividad/pendientes?bucket=OVERDUE');
    expect(visitHref('v-1', context)).toBe('/actividad/visitas/v-1');
    expect(sourceHref({ type: 'ACTIVITY', id: 'a-1' }, context)).toBe('/actividad/actividades/a-1');
  });

  it('sin el permiso de la ruta no hay enlace aunque la ruta exista', () => {
    const context = realContext(new Set(['oportunidades.ver']));
    expect(kpiCardHref('activeProjects', context)).toBeNull();
    expect(kpiCardHref('openOpportunities', context)).toBe('/proyectos/oportunidades?status=OPEN');
  });

  it('fichas de origen registradas: proyecto, oportunidad, cliente, visita y actividad', () => {
    const context = realContext();
    expect(sourceHref({ type: 'PROJECT', id: 'p-1' }, context)).toBe('/proyectos/p-1');
    expect(sourceHref({ type: 'OPPORTUNITY', id: 'o-1' }, context)).toBe(
      '/proyectos/oportunidades/o-1',
    );
    expect(customerHref('c-1', context)).toBe('/clientes/c-1');
    expect(sourceHref({ type: 'VISIT', id: 'v-1' }, context)).toBe('/actividad/visitas/v-1');
    expect(sourceHref({ type: 'ACTIVITY', id: 'a-1' }, context)).toBe('/actividad/actividades/a-1');
    expect(customerHref('c-1', realContext(new Set(['proyectos.ver'])))).toBeNull();
  });

  it('un listado exige la ruta exacta; una ficha admite un patrón con parámetros', () => {
    const paths = ['/proyectos/:projectId'];
    expect(isRegisteredPath('/proyectos/forecast', paths)).toBe(false);
    expect(isRegisteredPath('/proyectos/p-1', paths, true)).toBe(true);
    expect(isRegisteredPath('/proyectos/oportunidades/o-1', paths, true)).toBe(false);
  });
});
