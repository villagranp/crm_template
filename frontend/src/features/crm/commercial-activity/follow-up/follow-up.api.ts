import { env } from '@/config/env';
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
 * instantes. `projectId` sólo llega por enlace (sin selector: el Módulo 3 no
 * está en esta rama).
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

/** Ruta de la API (sin la base) de un `contentPath`. Sólo rutas relativas: nunca otro origen. */
export function apiRelativePath(contentPath: string): string {
  if (!contentPath.startsWith('/') || contentPath.startsWith('//')) {
    throw new Error('Ruta de descarga no válida');
  }
  const basePath = new URL(env.VITE_API_BASE_URL, window.location.origin).pathname.replace(/\/+$/, '');
  return basePath && contentPath.startsWith(`${basePath}/`) ? contentPath.slice(basePath.length) : contentPath;
}

/**
 * Descarga un adjunto de la trazabilidad por la ruta de su dueño (F.4) con el
 * cliente autenticado (nunca un `<a href>`: el token vive en memoria).
 * `contentPath` llega con la base de la API (`/api/v1/...`) y se recorta.
 */
export function downloadTraceAttachment(attachment: TraceAttachment): Promise<DownloadedFile> {
  return httpClient.download(apiRelativePath(attachment.contentPath));
}
