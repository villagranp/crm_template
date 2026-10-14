import type { Page } from '@/infrastructure/database/ports/pagination';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { CommercialVisibility } from '@/modules/commercial-activity/ports/commercial-visibility';

import type { AlertType } from '../alert-rules';

/**
 * Puerto de lectura de las alertas (00 §11 `AlertsReadModel`, 01 L.1). Cada tipo
 * llega con el alcance de **su** permiso, su peso de prioridad y la semántica de
 * catálogo ya resuelta (ids de estados/fases/etapas). El adaptador aplica la
 * vigencia (RN-01.13) y la visibilidad (00 §4.2) de cada tipo.
 */
export const ALERTS_READ_MODEL = Symbol('ALERTS_READ_MODEL');

/** Tipos cuya fuente es una actividad o una visita: visibilidad directa + herencia por proyecto (04 H.3, DM-13). */
export type InteractionAlertType = Extract<AlertType, 'ACTIVIDAD_VENCIDA' | 'VISITA_SIN_CONFIRMAR'>;

interface AlertTypeQueryBase {
  /** `metadata.weight` de la prioridad del tipo (orden RN-01.27). */
  readonly weight: number;
}

export type AlertTypeQuery =
  | (AlertTypeQueryBase & { readonly type: InteractionAlertType; readonly scope: CommercialVisibility })
  | (AlertTypeQueryBase & { readonly type: Exclude<AlertType, InteractionAlertType>; readonly scope: VisibilityScope });

export interface AlertSemantics {
  readonly openActivityStatusIds: readonly string[];
  readonly doneVisitStatusIds: readonly string[];
  readonly nonFinalPhaseIds: readonly string[];
  readonly openStageIds: readonly string[];
  /** AL-2: realizada antes de este instante (ahora − horas). */
  readonly unconfirmedVisitBefore: Date | null;
  /** AL-3: `last_activity_at` anterior a este instante (ahora − días). */
  readonly staleProjectBefore: Date | null;
}

export interface AlertsCriteria {
  readonly types: readonly AlertTypeQuery[];
  readonly semantics: AlertSemantics;
  readonly now: Date;
  /** "Asignadas a mí": `owner_id = ownerId`. */
  readonly ownerId?: string;
}

export interface AlertListCriteria extends AlertsCriteria {
  readonly sortBy: 'priority' | 'referenceDate';
  readonly sortOrder: 'asc' | 'desc';
  readonly page: number;
  readonly pageSize: number;
}

export interface AlertNamedRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface AlertRecord {
  readonly type: AlertType;
  readonly sourceId: string;
  readonly sourceCode: string;
  readonly referenceDate: Date;
  readonly owner: { readonly id: string; readonly displayName: string };
  readonly customer: AlertNamedRef | null;
  readonly project: AlertNamedRef | null;
  /** Asunto de la actividad, objetivo de la visita, nombre del proyecto o etiqueta de la etapa. */
  readonly subject: string;
  /** Proyecto padre del origen (oportunidades). */
  readonly sourceProjectId: string | null;
}

export interface AlertsReadModel {
  list(criteria: AlertListCriteria): Promise<Page<AlertRecord>>;
  countByType(criteria: AlertsCriteria): Promise<Partial<Record<AlertType, number>>>;
}
