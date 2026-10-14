import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';

import type { AgendaStatusGroup } from '../agenda-status';

import type { UserRefRecord } from './activity.repository.port';
import type { CommercialVisibility } from './commercial-visibility';

export const AGENDA_READ_MODEL = Symbol('AGENDA_READ_MODEL');

export const AGENDA_KINDS = ['VISIT', 'ACTIVITY'] as const;
export type AgendaKind = (typeof AGENDA_KINDS)[number];

/** Orden del listado de la agenda (lista blanca, 04 F.3). */
export const AGENDA_SORT_FIELDS = ['date', 'kind', 'customerName', 'ownerName', 'status'] as const;
export type AgendaSortField = (typeof AGENDA_SORT_FIELDS)[number];

/**
 * Visibilidad de cada fuente; `null` = el actor no tiene el permiso de ver de esa
 * fuente y no se consulta (la agenda sin `visitas.ver` no incluye visitas, AC-04.5).
 */
export interface SourceVisibility {
  readonly visits: CommercialVisibility | null;
  readonly activities: CommercialVisibility | null;
}

/** Filtros comunes a listado y calendario, ya normalizados por el servicio. */
export interface AgendaFilter {
  /** Fecha de agenda (RN-04.36), inclusive. */
  readonly from: Date | null;
  readonly to: Date | null;
  /** Fuentes pedidas (nunca vacía: el servicio resuelve el defecto). */
  readonly kinds: readonly AgendaKind[];
  readonly ownerIds: readonly string[];
  /** País del cliente. */
  readonly countryIds: readonly string[];
  /** Solo actividades de estos tipos (no afecta a las visitas). */
  readonly activityTypeIds: readonly string[];
  readonly statusGroups: readonly AgendaStatusGroup[];
  /** Estados de cualquiera de los dos catálogos (`crm.estado_visita`, `crm.estado_actividad`). */
  readonly statusIds: readonly string[];
  readonly customerId: string | null;
  readonly projectId: string | null;
  /** Instante de referencia de "vencida" y "sin registrar". */
  readonly now: Date;
  /** Fin efectivo de las visitas sin fin (`crm.visitas.duracion_por_defecto_minutos`). */
  readonly defaultDurationMinutes: number;
}

export interface AgendaListCriteria extends AgendaFilter, PageRequest {
  readonly sortBy: AgendaSortField;
  readonly sortOrder: 'asc' | 'desc';
}

/** Evento de la agenda (visita o actividad), con su estado ya derivado (RN-04.35, RN-04.36). */
export interface AgendaItemRecord {
  readonly kind: AgendaKind;
  readonly id: string;
  readonly code: string;
  readonly date: Date;
  readonly endDate: Date | null;
  /** Tipo de actividad; `null` en visitas. */
  readonly typeId: string | null;
  /** Etiqueta del tipo de actividad; `null` en visitas (la etiqueta "Visita" la pone el servicio). */
  readonly typeLabel: string | null;
  /** Objetivo de la visita o asunto de la actividad. */
  readonly subject: string;
  readonly customer: { readonly id: string; readonly crmCode: string; readonly legalName: string };
  readonly project: { readonly id: string; readonly code: string; readonly name: string } | null;
  readonly owner: UserRefRecord;
  readonly status: { readonly id: string; readonly code: string; readonly label: string; readonly group: AgendaStatusGroup };
  readonly isRescheduled: boolean;
  readonly isUnregistered: boolean;
  readonly hasReminder: boolean;
  readonly attachmentCount: number;
}

/**
 * Agenda (04 F.3, F.6): visitas y actividades con el **mismo** filtro de alcance que
 * sus listados (H.3), aplicado en SQL antes de paginar.
 */
export interface AgendaReadModel {
  list(criteria: AgendaListCriteria, visibility: SourceVisibility): Promise<Page<AgendaItemRecord>>;
  /** Por fecha ascendente, como mucho `cap` eventos; `truncated` si había más (D-04.12). */
  calendar(filter: AgendaFilter, visibility: SourceVisibility, cap: number): Promise<{ items: AgendaItemRecord[]; truncated: boolean }>;
}
