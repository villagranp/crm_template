import type { ListQuery } from '@/lib/query-keys';
import { httpClient, type DownloadedFile } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

import type { FollowUpRow, FollowUpScope, TraceAttachment } from '../common/commercial-activity.api';

/**
 * Seguimiento comercial (04 §E.4, F-23, `GET /follow-ups`). Los tipos de fila y
 * de trazabilidad son los compartidos de `common/commercial-activity.api.ts`.
 */

export const FOLLOW_UP_GROUPS = ['CUSTOMER', 'PROJECT'] as const;
export type FollowUpGroup = (typeof FOLLOW_UP_GROUPS)[number];
export const DEFAULT_FOLLOW_UP_GROUP: FollowUpGroup = 'CUSTOMER';

/** Órdenes que acepta la API (`FOLLOW_UP_SORT_FIELDS` del backend). */
export const FOLLOW_UP_SORT_FIELDS = ['lastInteractionAt', 'nextActionDate', 'customerName'] as const;

/**
 * Parámetros de la URL con el mismo nombre que en la API. Las fechas
 * `lastInteraction*` viajan en la URL como `YYYY-MM-DD` y a la API como
 * instantes. `projectId` se elige con el `ProjectPicker` del Módulo 3 o llega por
 * enlace (ficha del proyecto, trazabilidad).
 */
export const FOLLOW_UP_FILTER_KEYS = [
  'groupBy',
  'customerId',
  'projectId',
  'ownerId',
  'countryId',
  'withoutNextAction',
  'lastInteractionFrom',
  'lastInteractionTo',
] as const;
export type FollowUpFilterKey = (typeof FOLLOW_UP_FILTER_KEYS)[number];

export function listFollowUps(query: ListQuery): Promise<PaginatedResponse<FollowUpRow>> {
  return httpClient.get<PaginatedResponse<FollowUpRow>>('/follow-ups', { query });
}

/** Alcance de la trazabilidad de una fila: el proyecto en la vista por proyecto; si no, el cliente. */
export function traceScopeOf(row: FollowUpRow, groupBy: FollowUpGroup): FollowUpScope {
  return groupBy === 'PROJECT' && row.project ? { projectId: row.project.id } : { customerId: row.customer.id };
}

/** Únicas rutas de descarga que se aceptan: el contenido de un adjunto de actividad, visita o evento (F.4). */
const TRACE_CONTENT_PATH = /^\/(activities|visits)\/[0-9a-f-]+\/(events\/[0-9a-f-]+\/)?attachments\/[0-9a-f-]+\/content$/;

/** El `contentPath` recibido no es una ruta de descarga de adjuntos del módulo: no se pide. */
export class InvalidDownloadPathError extends Error {
  constructor() {
    super('Ruta de descarga no válida');
    this.name = 'InvalidDownloadPathError';
  }
}

/** `contentPath` si es una ruta de descarga del módulo (relativa a la base de la API); si no, `null`. */
export function traceAttachmentPath(contentPath: string): string | null {
  return TRACE_CONTENT_PATH.test(contentPath) ? contentPath : null;
}

/**
 * Descarga un adjunto de la trazabilidad por la ruta de su dueño (F.4) con el
 * cliente autenticado (nunca un `<a href>`: el token vive en memoria).
 * `contentPath` ya es relativa a la base de la API; por defensa, sólo se sigue
 * si tiene la forma de una ruta de contenido de adjuntos (nunca otro origen ni
 * otro recurso).
 */
export function downloadTraceAttachment(attachment: TraceAttachment): Promise<DownloadedFile> {
  const path = traceAttachmentPath(attachment.contentPath);
  return path ? httpClient.download(path) : Promise.reject(new InvalidDownloadPathError());
}
