import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListQuery } from '@/lib/query-keys';

import { commercialAreaKeys } from '../common/commercial-activity.queries';

import { getAgendaCalendar, listAgenda, type AgendaCalendarQuery } from './agenda.api';

const base = commercialAreaKeys('agenda');

/**
 * Claves bajo `['crm', 'commercial-activity', 'agenda']`: cualquier operación
 * del módulo invalida la raíz (`invalidateCommercialActivity`) y la agenda se
 * refresca sola, sin recargar la página (AC-04.6).
 */
export const agendaKeys = {
  ...base,
  calendar: (query: AgendaCalendarQuery) => [...base.all, 'calendar', query] as const,
};

/** Listado paginado (`GET /agenda`). */
export function useAgendaList(query: ListQuery, enabled = true) {
  return useQuery({
    queryKey: agendaKeys.list(query),
    queryFn: () => listAgenda(query),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Calendario del rango visible (`GET /agenda/calendar`). Al navegar, los eventos previos siguen en pantalla mientras llega el nuevo rango. */
export function useAgendaCalendar(query: AgendaCalendarQuery, enabled = true) {
  return useQuery({
    queryKey: agendaKeys.calendar(query),
    queryFn: () => getAgendaCalendar(query),
    enabled,
    placeholderData: keepPreviousData,
  });
}
