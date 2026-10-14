import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListQuery } from '@/lib/query-keys';

import { commercialAreaKeys } from '../common/commercial-activity.queries';

import { listInteractionHistory } from './interactions.api';

/** Claves bajo `['crm', 'commercial-activity', 'interactions']`: cualquier mutación del módulo las invalida. */
export const interactionKeys = commercialAreaKeys('interactions');

export function useInteractionHistory(query: ListQuery) {
  return useQuery({
    queryKey: interactionKeys.list(query),
    queryFn: () => listInteractionHistory(query),
    placeholderData: keepPreviousData,
  });
}
