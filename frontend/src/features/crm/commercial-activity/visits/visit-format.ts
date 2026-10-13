import type { VisitEventType } from './visits.api';

/** Etiquetas de los campos de visita, compartidas por listado, formulario, detalle y diálogos. */
export const VISIT_FIELD_TEXT = {
  code: 'Código',
  scheduledStartAt: 'Fecha y hora',
  scheduledEndAt: 'Fin',
  customer: 'Cliente',
  project: 'Proyecto',
  owner: 'Responsable',
  objective: 'Objetivo',
  location: 'Ubicación',
  reminder: 'Recordatorio',
  participants: 'Invitados',
  attendees: 'Asistentes',
  status: 'Estado',
  result: 'Resultado',
  attachments: 'Adjuntos',
} as const;

/** Tipo de evento del historial de la visita (`visit_events`). */
export const VISIT_EVENT_LABELS: Record<VisitEventType, string> = {
  PLANNED: 'Planificada',
  RESCHEDULED: 'Reprogramada',
  COMPLETED: 'Registrada como realizada',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
};

/** Icono (Material Symbols del registro de `MaterialSymbol`) por tipo de evento. */
export const VISIT_EVENT_ICONS: Record<VisitEventType, string> = {
  PLANNED: 'event_note',
  RESCHEDULED: 'event_repeat',
  COMPLETED: 'task_alt',
  CONFIRMED: 'fact_check',
  CANCELLED: 'event_busy',
};

/** Ventana para adjuntar a un evento ya ocurrido (D-04.18). La decide el backend; aquí sólo se usa para ofrecer o no "Subir". */
export const EVENT_ATTACHMENT_WINDOW_MS = 15 * 60_000;

/** "Reprogramada ×2" (E.6). */
export function rescheduleLabel(count: number): string | null {
  return count > 0 ? `Reprogramada ×${count}` : null;
}

/** Filtros del formulario del listado de visitas (los nombres son los de la API). */
export type VisitFilterField = 'from' | 'to' | 'statusId' | 'ownerId' | 'customerId' | 'countryId' | 'unregistered' | 'pendingConfirmation';

export type VisitFilterValues = Partial<Record<VisitFilterField, string>>;

export const VISIT_FILTER_FIELDS: readonly VisitFilterField[] = [
  'from',
  'to',
  'statusId',
  'ownerId',
  'customerId',
  'countryId',
  'unregistered',
  'pendingConfirmation',
];
