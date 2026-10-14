import type { ListQuery } from '@/lib/query-keys';
import { httpClient } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

import type { Interaction } from '../common/commercial-activity.api';

/**
 * Historial de interacciones (04 §E.5, F-24, `GET /interactions`) con todos sus
 * filtros. `listInteractions` de `common/` sólo cubre cliente/proyecto/
 * oportunidad (fichas y drawer); esta acepta el `ListQuery` completo.
 */

/** Único orden de la API: `occurredAt`, descendente por defecto; `sortOrder=asc` lo invierte. */
export const INTERACTION_SORT_FIELDS = ['occurredAt'] as const;
export const DEFAULT_INTERACTION_SORT = { field: 'occurredAt', direction: 'desc' } as const;

/**
 * Parámetros de la URL con el mismo nombre que en la API. `from`/`to` viajan en
 * la URL como `YYYY-MM-DD` y a la API como instantes. El filtro "tipo" usa
 * `sourceType=VISIT` (Visita) o `typeId` (tipo de actividad), nunca los dos.
 */
export const INTERACTION_FILTER_KEYS = ['from', 'to', 'customerId', 'projectId', 'opportunityId', 'userId', 'sourceType', 'typeId', 'resultId'] as const;
export type InteractionFilterKey = (typeof INTERACTION_FILTER_KEYS)[number];

export function listInteractionHistory(query: ListQuery): Promise<PaginatedResponse<Interaction>> {
  return httpClient.get<PaginatedResponse<Interaction>>('/interactions', { query });
}
