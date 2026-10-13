import { ROUTE_PATHS } from '@/routes/route-paths';

import type { ActivitySpecificField, ActivityTypeRef } from './activities.api';

/**
 * Presentación de actividades. El comportamiento nunca depende del código del
 * tipo (RN-04.4: la lógica usa `metadata`); aquí sólo se elige un texto de
 * ayuda o un icono, con respaldo genérico si el catálogo trae otro código.
 */

/** Código sembrado del tipo correo (D-04.8): sólo para su texto de ayuda (RN-04.26). */
const EMAIL_TYPE_CODE = 'CORREO';

export function isEmailType(type: Pick<ActivityTypeRef, 'code'> | undefined): boolean {
  return type?.code === EMAIL_TYPE_CODE;
}

/** Nombre del icono (Material Symbols) por código de tipo; `event_note` si no se conoce. */
const TYPE_ICON_BY_CODE: Readonly<Record<string, string>> = {
  LLAMADA: 'call',
  REUNION: 'groups',
  CORREO: 'mail',
  TAREA: 'task_alt',
};

export function activityTypeIconName(type: Pick<ActivityTypeRef, 'code'> | undefined): string {
  return (type && TYPE_ICON_BY_CODE[type.code]) || 'event_note';
}

export function activityDetailPath(activityId: string): string {
  return ROUTE_PATHS.activity.activityDetail.replace(':activityId', encodeURIComponent(activityId));
}

/** Alta con preselección (04 §E.1): `?customerId=&projectId=&opportunityId=&typeId=`. */
export function newActivityPath(preset: { customerId?: string; projectId?: string; opportunityId?: string; typeId?: string } = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(preset)) {
    if (value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `${ROUTE_PATHS.activity.activityNew}?${query}` : ROUTE_PATHS.activity.activityNew;
}

export const ACTIVITY_FIELD_TEXT = {
  code: 'Código',
  type: 'Tipo',
  subject: 'Asunto',
  customer: 'Cliente',
  project: 'Proyecto',
  opportunity: 'Oportunidad',
  owner: 'Responsable',
  scheduledAt: 'Fecha y hora',
  dueAt: 'Vencimiento',
  priority: 'Prioridad',
  status: 'Estado',
  result: 'Resultado',
  attachments: 'Adjuntos',
} as const;

/** Etiquetas de los campos específicos por tipo (RN-04.24), compartidas por formulario y detalle. */
export const ACTIVITY_FIELD_LABELS: Record<ActivitySpecificField, string> = {
  scheduledAt: 'Fecha y hora',
  durationMinutes: 'Duración (minutos)',
  participants: 'Participantes',
  summary: 'Resumen',
  resultId: 'Resultado',
  resultNotes: 'Notas del resultado',
  nextAction: 'Siguiente acción',
  nextActionDate: 'Fecha de la siguiente acción',
};
