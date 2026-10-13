import { Inject, Injectable } from '@nestjs/common';

import { PermissionDeniedError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { CommercialMetricsService } from '@/modules/commercial-metrics/commercial-metrics.service';
import {
  completedActivityStatusIds,
  confirmedVisitStatusIds,
  doneVisitStatusIds,
  interactionActivityTypeIds,
  pendingVisitStatusIds,
} from '@/modules/commercial-metrics/metric-definitions';
import type { CustomerActor } from '@/modules/customers/customer-actor.resolver';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import { DASHBOARD_PARAMETERS, DashboardContextFactory } from './dashboard-context';
import type { RecentActivityEventType } from './dto/dashboard-activity.dto';
import {
  DASHBOARD_READ_MODEL,
  type DashboardReadModel,
  type RecentActivityRecord,
  type UpcomingVisitRecord,
} from './ports/dashboard-read-model.port';

/** Máximo de caracteres de un resumen o un objetivo (RN-01.21). */
export const SUMMARY_MAX_LENGTH = 200;

/** Fuentes de la actividad reciente (D.5) y el permiso que exige cada una. */
export const RECENT_ACTIVITY_SOURCE_PERMISSIONS = ['actividades.ver', 'visitas.ver', 'oportunidades.ver', 'proyectos.ver'] as const;

export function truncate(text: string, max = SUMMARY_MAX_LENGTH): string {
  const chars = [...text.replace(/\s+/g, ' ').trim()];
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`;
}

const OUTCOME_LABELS: Readonly<Record<string, string>> = { WON: 'Ganada', LOST: 'Perdida', PARTIAL: 'Ganada parcial' };
const RESULT_ACTION_LABELS: Readonly<Record<string, string>> = {
  RECORDED: 'Resultado registrado',
  CHANGED: 'Resultado modificado',
  CLEARED: 'Resultado eliminado',
};

/** Resumen legible de un evento (D.5); nunca datos de contactos (RN-01.21). */
export function eventSummary(record: Pick<RecentActivityRecord, 'eventType' | 'sourceType' | 'sourceCode' | 'detail'>): string {
  const { detail } = record;
  const subject = detail.subject ?? '';
  const transition = `${detail.fromLabel ?? '—'} → ${detail.toLabel ?? '—'}`;
  const outcome = detail.outcome ? (OUTCOME_LABELS[detail.outcome] ?? detail.outcome) : null;
  switch (record.eventType) {
    case 'ACTIVIDAD_REGISTRADA':
      return truncate(`Actividad registrada: ${subject}`);
    case 'ACTIVIDAD_COMPLETADA':
      return truncate(`Actividad completada: ${subject}`);
    case 'INTERACCION':
      return truncate(record.sourceType === 'VISIT' ? `Visita: ${subject}` : `Interacción: ${subject}`);
    case 'OPORTUNIDAD_ETAPA':
      // Reapertura: el cambio de etapa anula el resultado en la misma operación (RN-01.23).
      return truncate(detail.action === 'CLEARED' ? `${transition} · resultado anulado` : transition);
    case 'OPORTUNIDAD_CERRADA':
      return truncate(outcome ? `${transition} · ${outcome}` : transition);
    case 'OPORTUNIDAD_RESULTADO':
      return truncate(`${RESULT_ACTION_LABELS[detail.action ?? ''] ?? 'Resultado'}${outcome ? `: ${outcome}` : ''}`);
    case 'OPORTUNIDAD_CREADA':
      return truncate(`Oportunidad ${record.sourceCode} creada`);
    case 'OPORTUNIDAD_ACTUALIZADA':
      return truncate(`Oportunidad ${record.sourceCode} actualizada`);
    case 'PROYECTO_CREADO':
      return truncate(`Proyecto creado: ${subject}`);
    case 'PROYECTO_FASE':
      return truncate(detail.progress ? `${transition} (${detail.progress} %)` : transition);
    default:
      return truncate(subject);
  }
}

export interface UpcomingVisitView extends UpcomingVisitRecord {
  readonly reminderDue: boolean;
}

export interface RecentActivityView extends RecentActivityRecord {
  readonly summary: string;
}

/**
 * Actividad de Inicio (endpoints 7–8, F-03): próximas visitas y actividad
 * reciente. Cada fuente se consulta solo con su permiso y con el alcance de ese
 * permiso (RN-01.22, AC-01.25).
 */
@Injectable()
export class DashboardActivityService {
  constructor(
    @Inject(DASHBOARD_READ_MODEL) private readonly readModel: DashboardReadModel,
    private readonly metrics: CommercialMetricsService,
    private readonly context: DashboardContextFactory,
    private readonly parameters: ParameterReader,
  ) {}

  async upcomingVisits(actor: CustomerActor, page: { page: number; pageSize: number }): Promise<Page<UpcomingVisitView>> {
    const [scopes, days, statuses] = await Promise.all([
      this.context.sourceScopes(actor, ['visits']),
      this.parameters.get<number>(DASHBOARD_PARAMETERS.upcomingVisitDays),
      this.metrics.semanticCatalog('crm.estado_visita'),
    ]);
    const scope = scopes.visits;
    if (!scope) throw new PermissionDeniedError('visitas.ver');
    const now = this.context.now();
    const result = await this.readModel.upcomingVisits({
      scope,
      pendingStatusIds: pendingVisitStatusIds(statuses),
      from: now,
      until: new Date(now.getTime() + days * 86_400_000),
      ...page,
    });
    return {
      ...result,
      items: result.items.map((visit) => ({
        ...visit,
        objective: truncate(visit.objective),
        // RN-01.25: aviso en Inicio (DM-27), sin notificaciones.
        reminderDue:
          visit.reminderMinutesBefore !== null && now.getTime() >= visit.scheduledStartAt.getTime() - visit.reminderMinutesBefore * 60_000,
      })),
    };
  }

  async recentActivity(
    actor: CustomerActor,
    query: { page: number; pageSize: number; sinceDays: number; types: readonly RecentActivityEventType[] },
  ): Promise<Page<RecentActivityView>> {
    const [scopes, activityStatuses, activityTypes, visitStatuses] = await Promise.all([
      this.context.sourceScopes(actor, ['activities', 'visits', 'opportunities', 'projects']),
      this.metrics.semanticCatalog('crm.estado_actividad'),
      this.metrics.semanticCatalog('crm.tipo_actividad'),
      this.metrics.semanticCatalog('crm.estado_visita'),
    ]);
    const now = this.context.now();
    const result = await this.readModel.recentActivity({
      sources: { activities: scopes.activities, visits: scopes.visits, opportunities: scopes.opportunities, projects: scopes.projects },
      semantics: {
        completedActivityStatusIds: completedActivityStatusIds(activityStatuses),
        interactionActivityTypeIds: interactionActivityTypeIds(activityTypes),
        interactionVisitStatusIds: [...doneVisitStatusIds(visitStatuses), ...confirmedVisitStatusIds(visitStatuses)],
      },
      since: new Date(now.getTime() - query.sinceDays * 86_400_000),
      types: query.types,
      page: query.page,
      pageSize: query.pageSize,
    });
    return { ...result, items: result.items.map((record) => ({ ...record, summary: eventSummary(record) })) };
  }
}
