import { Inject, Injectable } from '@nestjs/common';

import { calendarDateIn } from '@/common/calendar-date';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { CommercialMetricsService, METRIC_CATALOGS } from '@/modules/commercial-metrics/commercial-metrics.service';
import { doneVisitStatusIds, nonFinalPhaseIds, openActivityStatusIds, openStageIds } from '@/modules/commercial-metrics/metric-definitions';
import type { CustomerActor } from '@/modules/customers/customer-actor.resolver';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import {
  ALERT_PARAMETERS,
  ALERT_TYPE_CODES,
  type AlertPriority,
  type AlertType,
  type AlertTypeRule,
  evaluateAlertRules,
} from './alert-rules';
import { DashboardContextFactory, type DashboardSource } from './dashboard-context';
import { truncate } from './dashboard-activity.service';
import { ALERTS_READ_MODEL, type AlertRecord, type AlertsCriteria, type AlertsReadModel, type AlertTypeQuery } from './ports/alerts-read-model.port';

/** Fuente (y por tanto permiso) de cada tipo de alerta (RN-01.31). */
const ALERT_SOURCES: Readonly<Record<AlertType, DashboardSource>> = {
  ACTIVIDAD_VENCIDA: 'activities',
  VISITA_SIN_CONFIRMAR: 'visits',
  PROYECTO_SIN_ACTUALIZAR: 'projects',
  OPORTUNIDAD_SIN_SIGUIENTE_ACCION: 'opportunities',
};

export interface AlertView extends AlertRecord {
  readonly id: string;
  readonly description: string;
  readonly priority: AlertPriority;
}

export interface AlertSummaryView {
  readonly type: AlertType;
  readonly enabled: boolean;
  readonly disabledReason: AlertTypeRule['disabledReason'];
  readonly count: number;
  readonly priority: AlertPriority | null;
}

export interface AlertsRequest {
  readonly types?: readonly AlertType[];
  readonly priorities?: readonly string[];
  readonly mine?: boolean;
  readonly sortBy?: 'priority' | 'referenceDate';
  readonly sortOrder?: 'asc' | 'desc';
  readonly page: number;
  readonly pageSize: number;
}

function wholeDaysBetween(earlier: Date, later: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86_400_000));
}

function days(count: number): string {
  return count === 1 ? '1 día' : `${count} días`;
}

/** Descripción de cada tipo (plantillas de D.6). Los asuntos son texto del usuario; nunca datos de contactos. */
export function alertDescription(record: AlertRecord, now: Date, timeZone: string): string {
  switch (record.type) {
    case 'ACTIVIDAD_VENCIDA': {
      const elapsed = wholeDaysBetween(record.referenceDate, now);
      const when = elapsed === 0 ? 'hoy' : `hace ${days(elapsed)}`;
      return truncate(`Actividad ${record.sourceCode} «${record.subject}» vencida ${when}`, 300);
    }
    case 'VISITA_SIN_CONFIRMAR': {
      const [year, month, day] = calendarDateIn(record.referenceDate, timeZone).split('-');
      return `Visita ${record.sourceCode} realizada el ${day}/${month}/${year} pendiente de confirmación`;
    }
    case 'PROYECTO_SIN_ACTUALIZAR':
      return `Proyecto ${record.sourceCode} sin actualizaciones desde hace ${days(wholeDaysBetween(record.referenceDate, now))}`;
    case 'OPORTUNIDAD_SIN_SIGUIENTE_ACCION':
      return `Oportunidad ${record.sourceCode} en etapa ${record.subject} sin siguiente acción`;
    default:
      return record.sourceCode;
  }
}

/**
 * Alertas de Inicio (endpoints 9–10, F-04): se calculan en cada consulta (RN-01.26)
 * a partir de `crm.alertas.*`, leídos en cada petición; cada tipo solo existe para
 * quien tiene el permiso de su fuente y con el alcance de ese permiso (RN-01.31).
 */
@Injectable()
export class DashboardAlertsService {
  constructor(
    @Inject(ALERTS_READ_MODEL) private readonly readModel: AlertsReadModel,
    private readonly metrics: CommercialMetricsService,
    private readonly context: DashboardContextFactory,
    private readonly parameters: ParameterReader,
    private readonly logger: AppLogger,
  ) {}

  /** Reglas vigentes, tipos permitidos y criterios de consulta, comunes a la bandeja y al resumen. */
  private async prepare(actor: CustomerActor, request: Pick<AlertsRequest, 'types' | 'priorities' | 'mine'>) {
    const [readings, priorityItems, scopes, timeZone, activityStatuses, visitStatuses, phases, stages] = await Promise.all([
      Promise.all([
        this.parameters.read<number>(ALERT_PARAMETERS.unconfirmedVisitHours),
        this.parameters.read<number>(ALERT_PARAMETERS.staleProjectDays),
        this.parameters.read<boolean>(ALERT_PARAMETERS.opportunityWithoutNextAction),
        this.parameters.read<Record<string, string>>(ALERT_PARAMETERS.priorities),
      ]),
      this.metrics.semanticCatalog('crm.prioridad'),
      this.context.sourceScopes(actor, ['activities', 'visits', 'projects', 'opportunities']),
      this.context.timeZone(),
      this.metrics.semanticCatalog(METRIC_CATALOGS.activityStatus),
      this.metrics.semanticCatalog(METRIC_CATALOGS.visitStatus),
      this.metrics.semanticCatalog(METRIC_CATALOGS.projectPhase),
      this.metrics.semanticCatalog(METRIC_CATALOGS.opportunityStage),
    ]);
    const [unconfirmedVisitHours, staleProjectDays, opportunityWithoutNextAction, priorities] = readings;
    const { rules, invalidParameters } = evaluateAlertRules(
      { unconfirmedVisitHours, staleProjectDays, opportunityWithoutNextAction, priorities },
      priorityItems,
    );
    for (const key of invalidParameters) {
      // RN-01.30: el tipo se desactiva y se registra la clave, nunca el valor.
      this.logger.warn('dashboard_alert_parameter_invalid', { key });
    }

    const now = this.context.now();
    const visible = ALERT_TYPE_CODES.filter((type) => scopes[ALERT_SOURCES[type]] !== null);
    const queries: AlertTypeQuery[] = visible
      .filter((type) => rules[type].enabled)
      .filter((type) => !request.types || request.types.length === 0 || request.types.includes(type))
      .filter((type) => !request.priorities || request.priorities.length === 0 || request.priorities.includes(rules[type].priority?.code ?? ''))
      .map((type) => ({ type, scope: scopes[ALERT_SOURCES[type]] as NonNullable<(typeof scopes)[DashboardSource]>, weight: rules[type].priority?.weight ?? 0 }));
    const hours = rules.VISITA_SIN_CONFIRMAR.threshold;
    const staleDays = rules.PROYECTO_SIN_ACTUALIZAR.threshold;
    const criteria: AlertsCriteria = {
      types: queries,
      now,
      ...(request.mine && actor.userId ? { ownerId: actor.userId } : {}),
      semantics: {
        openActivityStatusIds: openActivityStatusIds(activityStatuses),
        doneVisitStatusIds: doneVisitStatusIds(visitStatuses),
        nonFinalPhaseIds: nonFinalPhaseIds(phases),
        openStageIds: openStageIds(stages),
        unconfirmedVisitBefore: hours === null ? null : new Date(now.getTime() - hours * 3_600_000),
        staleProjectBefore: staleDays === null ? null : new Date(now.getTime() - staleDays * 86_400_000),
      },
    };
    return { rules, visible, criteria, now, timeZone };
  }

  async list(actor: CustomerActor, request: AlertsRequest): Promise<Page<AlertView>> {
    const { rules, criteria, now, timeZone } = await this.prepare(actor, request);
    const page = await this.readModel.list({
      ...criteria,
      sortBy: request.sortBy ?? 'priority',
      sortOrder: request.sortOrder ?? (request.sortBy === 'referenceDate' ? 'asc' : 'desc'),
      page: request.page,
      pageSize: request.pageSize,
    });
    return {
      ...page,
      items: page.items.map((record) => ({
        ...record,
        id: `${record.type}:${record.sourceId}`,
        description: alertDescription(record, now, timeZone),
        priority: rules[record.type].priority as AlertPriority,
      })),
    };
  }

  async summary(actor: CustomerActor): Promise<AlertSummaryView[]> {
    const { rules, visible, criteria } = await this.prepare(actor, {});
    const counts = await this.readModel.countByType(criteria);
    // Un tipo sin permiso no se lista (RN-01.31); los desactivados sí, con su motivo.
    return visible.map((type) => ({
      type,
      enabled: rules[type].enabled,
      disabledReason: rules[type].disabledReason,
      count: rules[type].enabled ? (counts[type] ?? 0) : 0,
      priority: rules[type].priority,
    }));
  }
}
