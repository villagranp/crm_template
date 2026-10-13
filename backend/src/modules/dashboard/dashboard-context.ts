import { Inject, Injectable } from '@nestjs/common';

import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { noVisibility, type VisibilityScope } from '@/modules/access/visibility-scope';
import { VisibilityScopeResolver } from '@/modules/access/visibility-scope.resolver';
import { BUSINESS_CLOCK, type BusinessClock } from '@/modules/commercial-metrics/business-clock';
import type { MetricContext } from '@/modules/commercial-metrics/commercial-metrics.service';
import type { CustomerActor } from '@/modules/customers/customer-actor.resolver';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

/** Permisos `.ver` de las fuentes de Inicio (01 H.1). */
export const DASHBOARD_PERMISSIONS = {
  projects: 'proyectos.ver',
  opportunities: 'oportunidades.ver',
  forecast: 'forecast.ver',
  visits: 'visitas.ver',
  activities: 'actividades.ver',
  targets: 'metas.ver',
} as const;

export type DashboardSource = keyof typeof DASHBOARD_PERMISSIONS;

export const DASHBOARD_PARAMETERS = {
  timeZone: 'crm.zona_horaria_negocio',
  forecastHorizon: 'crm.forecast.horizonte_meses',
  tonnageUnit: 'crm.forecast.unidad_tonelaje',
  dueSoonHours: 'crm.alertas.actividad_por_vencer_horas',
  upcomingVisitDays: 'crm.inicio.visitas_proximas_dias',
} as const;

/**
 * Contexto de cada consulta de Inicio: reloj del negocio, zona horaria y el
 * alcance de **cada** permiso de fuente (RN-01.5, 00 §4.2), resueltos en el
 * backend en cada petición (el frontend no envía ni amplía el ámbito, H.2).
 */
@Injectable()
export class DashboardContextFactory {
  constructor(
    private readonly scopes: VisibilityScopeResolver,
    private readonly parameters: ParameterReader,
    @Inject(BUSINESS_CLOCK) private readonly clock: BusinessClock,
    private readonly logger: AppLogger,
  ) {}

  now(): Date {
    return this.clock.now();
  }

  async timeZone(): Promise<string> {
    return this.parameters.get<string>(DASHBOARD_PARAMETERS.timeZone);
  }

  /** Alcance de cada fuente que el actor puede ver; `null` si no tiene su permiso (no se consulta, RN-01.4). */
  async sourceScopes(actor: CustomerActor, sources: readonly DashboardSource[]): Promise<Record<DashboardSource, VisibilityScope | null>> {
    const permitted = sources.filter((source) => actor.permissions.has(DASHBOARD_PERMISSIONS[source]));
    const resolved = await this.scopes.resolveMany(
      actor.userId,
      permitted.map((source) => DASHBOARD_PERMISSIONS[source]),
    );
    const result = { projects: null, opportunities: null, forecast: null, visits: null, activities: null, targets: null } as Record<
      DashboardSource,
      VisibilityScope | null
    >;
    for (const source of permitted) {
      const scope = resolved.get(DASHBOARD_PERMISSIONS[source]) ?? noVisibility(actor.userId);
      if (scope.kind === 'FILTERED' && scope.dataScope === 'COUNTRY' && scope.countryIds.length === 0) {
        // DM-30: alcance de país sin país asignado → nunca ORGANIZATION; se registra (sin datos personales).
        this.logger.warn('dashboard_country_scope_without_country', { userId: actor.userId, permission: DASHBOARD_PERMISSIONS[source] });
      }
      result[source] = scope;
    }
    return result;
  }

  /** `MetricContext` de 01 F.2 para una fuente concreta. */
  async metricContext(actor: CustomerActor, source: DashboardSource): Promise<MetricContext> {
    const [scopes, businessTimeZone] = await Promise.all([this.sourceScopes(actor, [source]), this.timeZone()]);
    return { scope: scopes[source] ?? noVisibility(actor.userId), now: this.now(), businessTimeZone };
  }
}
