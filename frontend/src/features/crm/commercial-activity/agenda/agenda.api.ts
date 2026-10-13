import type { ListQuery } from '@/lib/query-keys';
import { httpClient } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

import type { AgendaItem, RecordKind, StatusGroup } from '../common/commercial-activity.api';
import { endOfDayIso, startOfDayIso } from '../common/date-time';

/**
 * Llamadas de la agenda (04 §F.3): `GET /agenda` (listado paginado) y
 * `GET /agenda/calendar` (sin paginar, rango ≤ 42 días y 500 eventos, D-04.12).
 * Contrato: `backend/src/modules/commercial-activity/dto/agenda.dto.ts`. El
 * backend admite filtros repetibles; esta pantalla envía un valor por filtro.
 */

/** Filtros de la pantalla tal como viven en la URL (comunes a calendario y listado). */
export const AGENDA_FILTER_KEYS = ['ownerId', 'countryId', 'type', 'statusGroup', 'customerId', 'from', 'to'] as const;
export type AgendaFilterKey = (typeof AGENDA_FILTER_KEYS)[number];
export type AgendaFilterValues = Partial<Record<AgendaFilterKey, string>>;

/** Lista blanca de `sortBy` del listado (`AGENDA_SORT_FIELDS` del backend). */
export const AGENDA_SORT_FIELDS = ['date', 'kind', 'customerName', 'ownerName', 'status'] as const;

/** Valor de `type` en la URL que significa "solo visitas" (`kind=VISIT`); cualquier otro es un tipo de actividad. */
export const VISIT_TYPE_FILTER = 'VISIT';

export const AGENDA_STATUS_GROUPS: readonly StatusGroup[] = ['PENDING', 'OVERDUE', 'DONE', 'CONFIRMED', 'CANCELLED'];

/** Filtros comunes de la API (`AgendaFilterFields`). */
export interface AgendaApiFilters {
  ownerId?: string;
  countryId?: string;
  kind?: RecordKind;
  activityTypeId?: string;
  statusGroup?: string;
  customerId?: string;
}

export interface AgendaCalendarQuery extends AgendaApiFilters {
  /** Instante ISO con zona; obligatorio. */
  from: string;
  /** Instante ISO con zona (incluido); obligatorio. */
  to: string;
}

export interface AgendaCalendarResponse {
  /** Por fecha ascendente, como mucho 500. */
  data: AgendaItem[];
  /** Había más de 500 eventos en el rango. */
  truncated: boolean;
}

function isStatusGroup(value: string | undefined): value is StatusGroup {
  return AGENDA_STATUS_GROUPS.includes(value as StatusGroup);
}

/**
 * Filtros de la URL → filtros de la API. El filtro "Tipo" es uno solo en la
 * pantalla (E.2): `VISIT` ⇒ `kind=VISIT`; un tipo de actividad ⇒
 * `activityTypeId` (sin `kind`, el backend deja solo actividades). Las fechas
 * (`from`/`to`) no van aquí: el calendario fija las suyas y el listado las
 * traduce con `toAgendaListQuery`.
 */
export function toAgendaApiFilters(filters: AgendaFilterValues): AgendaApiFilters {
  const result: AgendaApiFilters = {};
  if (filters.ownerId) {
    result.ownerId = filters.ownerId;
  }
  if (filters.countryId) {
    result.countryId = filters.countryId;
  }
  if (filters.customerId) {
    result.customerId = filters.customerId;
  }
  if (isStatusGroup(filters.statusGroup)) {
    result.statusGroup = filters.statusGroup;
  }
  if (filters.type === VISIT_TYPE_FILTER) {
    result.kind = 'VISIT';
  } else if (filters.type) {
    result.activityTypeId = filters.type;
  }
  return result;
}

/**
 * Consulta del listado: paginación y orden de `useTableQueryState` + filtros
 * traducidos + rango `YYYY-MM-DD` de la URL como instantes del día completo.
 */
export function toAgendaListQuery(tableQuery: ListQuery, filters: AgendaFilterValues): ListQuery {
  const query: ListQuery = {
    page: tableQuery.page,
    pageSize: tableQuery.pageSize,
    sortBy: tableQuery.sortBy,
    sortOrder: tableQuery.sortOrder,
    ...toAgendaApiFilters(filters),
  };
  const from = startOfDayIso(filters.from);
  const to = endOfDayIso(filters.to);
  if (from) {
    query.from = from;
  }
  if (to) {
    query.to = to;
  }
  return query;
}

export function listAgenda(query: ListQuery): Promise<PaginatedResponse<AgendaItem>> {
  return httpClient.get<PaginatedResponse<AgendaItem>>('/agenda', { query });
}

export function getAgendaCalendar(query: AgendaCalendarQuery): Promise<AgendaCalendarResponse> {
  return httpClient.get<AgendaCalendarResponse>('/agenda/calendar', { query: { ...query } });
}
