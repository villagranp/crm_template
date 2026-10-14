import type { Page } from '@/infrastructure/database/ports/pagination';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { CommercialVisibility } from '@/modules/commercial-activity/ports/commercial-visibility';

import type { RecentActivityEventType } from '../dto/dashboard-activity.dto';

/**
 * Puerto de lectura de la actividad de Inicio (00 §11 `DashboardReadModel`, 01 L.1):
 * próximas visitas y actividad reciente (D.5). Lee las tablas, los historiales y la
 * vista `crm_interactions_v`; cada fuente llega con el alcance de su propio permiso.
 */
export const DASHBOARD_READ_MODEL = Symbol('DASHBOARD_READ_MODEL');

export interface NamedRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface UpcomingVisitRecord {
  readonly id: string;
  readonly code: string;
  readonly scheduledStartAt: Date;
  readonly scheduledEndAt: Date | null;
  readonly status: { readonly code: string; readonly label: string };
  readonly objective: string;
  readonly reminderMinutesBefore: number | null;
  readonly owner: { readonly id: string; readonly displayName: string };
  readonly customer: NamedRef;
  readonly project: NamedRef | null;
}

export interface UpcomingVisitsCriteria {
  /** `visitas.ver` + herencia por proyecto (04 H.3, DM-13). */
  readonly scope: CommercialVisibility;
  readonly pendingStatusIds: readonly string[];
  readonly from: Date;
  readonly until: Date;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Fuente de la actividad reciente con el alcance de su permiso; `null` = sin permiso (no se
 * consulta). Visitas y actividades suman la herencia por proyecto visible (04 H.3, DM-13).
 */
export interface RecentActivitySources {
  readonly activities: CommercialVisibility | null;
  readonly visits: CommercialVisibility | null;
  readonly opportunities: VisibilityScope | null;
  readonly projects: VisibilityScope | null;
}

export interface RecentActivitySemantics {
  readonly completedActivityStatusIds: readonly string[];
  readonly interactionActivityTypeIds: readonly string[];
  /** Visitas realizadas o confirmadas (DEF-F). */
  readonly interactionVisitStatusIds: readonly string[];
}

export interface RecentActivityCriteria {
  readonly sources: RecentActivitySources;
  readonly semantics: RecentActivitySemantics;
  readonly since: Date;
  readonly types: readonly RecentActivityEventType[];
  readonly page: number;
  readonly pageSize: number;
}

export interface RecentActivityRecord {
  readonly eventType: RecentActivityEventType;
  /** Id del hecho (registro o fila de historial): el `id` del evento es `{tipo}:{eventId}`. */
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly sourceType: 'ACTIVITY' | 'VISIT' | 'OPPORTUNITY' | 'PROJECT';
  readonly sourceId: string;
  readonly sourceCode: string;
  readonly sourceProjectId: string | null;
  readonly responsible: { readonly id: string; readonly displayName: string };
  readonly customer: NamedRef | null;
  readonly project: NamedRef | null;
  /** Piezas del resumen: asunto/objetivo, etapa o fase de origen y destino, resultado, avance. */
  readonly detail: {
    readonly subject: string | null;
    readonly fromLabel: string | null;
    readonly toLabel: string | null;
    readonly outcome: string | null;
    readonly action: string | null;
    readonly progress: string | null;
  };
}

export interface DashboardReadModel {
  upcomingVisits(criteria: UpcomingVisitsCriteria): Promise<Page<UpcomingVisitRecord>>;
  recentActivity(criteria: RecentActivityCriteria): Promise<Page<RecentActivityRecord>>;
}
