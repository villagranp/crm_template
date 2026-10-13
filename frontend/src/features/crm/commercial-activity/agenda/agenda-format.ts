import type { ActivityTypeOption } from '../activities/activities.api';
import { activityTypeIconName } from '../activities/activity-format';
import type { AgendaItem, StatusGroup } from '../common/commercial-activity.api';
import { formatTime } from '../common/date-time';

import type { AgendaFilterKey } from './agenda.api';

/**
 * Presentación de los eventos de la agenda (04 §E.2). Solo textos e iconos: el
 * estado y la fecha ya llegan resueltos del backend (RN-04.35, RN-04.36).
 */

/** Icono de visita (Material Symbols). */
export const VISIT_ICON = 'location_on';

/** Etiquetas de los filtros (formulario y chips). */
export const AGENDA_FILTER_LABELS: Record<AgendaFilterKey, string> = {
  ownerId: 'Asesor',
  countryId: 'País',
  type: 'Tipo',
  statusGroup: 'Estado',
  customerId: 'Cliente',
  from: 'Desde',
  to: 'Hasta',
};

/** Etiquetas del filtro "Estado" (grupos de RN-04.35). */
export const STATUS_GROUP_LABELS: Record<StatusGroup, string> = {
  PENDING: 'Pendiente',
  OVERDUE: 'Vencida',
  DONE: 'Realizada',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
};

/** Tinte de fondo de un evento por grupo (`soft`/`softDark` de los tokens). El color nunca va solo: hay icono y texto. */
export const STATUS_GROUP_TONE: Record<StatusGroup, 'info' | 'danger' | 'success' | 'steel'> = {
  PENDING: 'info',
  OVERDUE: 'danger',
  DONE: 'success',
  CONFIRMED: 'success',
  CANCELLED: 'steel',
};

/** Icono del evento: `location_on` para visitas; para actividades, el de su tipo (respaldo `event_note`). */
export function agendaIconName(item: Pick<AgendaItem, 'kind' | 'typeId'>, types: readonly ActivityTypeOption[] | undefined): string {
  if (item.kind === 'VISIT') {
    return VISIT_ICON;
  }
  return activityTypeIconName(types?.find((type) => type.id === item.typeId));
}

/** Texto del estado como lo muestra `StatusChip` (con "Vencida" en una actividad abierta vencida). */
export function agendaStatusText(item: Pick<AgendaItem, 'status'>): string {
  return item.status.group === 'OVERDUE' ? `${item.status.label} · Vencida` : item.status.label;
}

/** `true` si la actividad sigue abierta (se puede ofrecer "Completar" si el backend lo permite). */
export function isOpenAgendaActivity(item: Pick<AgendaItem, 'kind' | 'status'>): boolean {
  return item.kind === 'ACTIVITY' && (item.status.group === 'PENDING' || item.status.group === 'OVERDUE');
}

export function attachmentsText(count: number): string {
  return count === 1 ? '1 adjunto' : `${count} adjuntos`;
}

/**
 * Nombre accesible completo de un evento: hora, tipo, asunto, cliente y estado
 * (con "Reprogramada", "Sin registrar" y adjuntos cuando aplican). Así el
 * evento se entiende igual sin ver colores ni iconos. Ejemplo:
 * "10:00, Llamada: Seguimiento; cliente: Constructora Peña S.A.; estado: Pendiente".
 */
export function agendaEventLabel(item: AgendaItem): string {
  const status = [agendaStatusText(item)];
  if (item.isRescheduled) {
    status.push('Reprogramada');
  }
  if (item.isUnregistered) {
    status.push('Sin registrar');
  }
  const parts = [`${formatTime(item.date)}, ${item.typeLabel}: ${item.subject}`, `cliente: ${item.customer.legalName}`, `estado: ${status.join(', ')}`];
  if (item.attachmentCount > 0) {
    parts.push(attachmentsText(item.attachmentCount));
  }
  return parts.join('; ');
}

/** "10:00" o "10:00 – 11:30". */
export function agendaTimeRange(item: Pick<AgendaItem, 'date' | 'endDate'>): string {
  return item.endDate ? `${formatTime(item.date)} – ${formatTime(item.endDate)}` : formatTime(item.date);
}
