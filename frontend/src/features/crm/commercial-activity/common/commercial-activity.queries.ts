import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { createScopedQueryKeys, type ListQuery } from '@/lib/query-keys';

import {
  getCustomerLookup,
  getFollowUpTrace,
  listCustomerContacts,
  listCustomerProjectsLookup,
  listInteractions,
  listOpenOpportunities,
  listOwnerOptions,
  type FollowUpScope,
  type InteractionQuery,
} from './commercial-activity.api';

/**
 * Claves de TanStack Query de Actividad comercial. Todo cuelga de
 * `['crm', 'commercial-activity']`: una operación de ciclo de vida cambia a la
 * vez listados, bandeja, agenda, historial y seguimiento (AC-04.6, AC-04.10),
 * así que se invalida la raíz entera con `invalidateCommercialActivity`.
 */
const root = createScopedQueryKeys('crm', 'commercial-activity');

export const commercialActivityRootKey = root.all;

/** Claves de un área del módulo con la misma forma que `createScopedQueryKeys`. */
export function commercialAreaKeys<TArea extends string>(area: TArea) {
  const all = [...root.all, area] as const;
  return {
    all,
    lists: () => [...all, 'list'] as const,
    list: (query: ListQuery) => [...all, 'list', query] as const,
    details: () => [...all, 'detail'] as const,
    detail: (id: string) => [...all, 'detail', id] as const,
  };
}

const lookupKeys = commercialAreaKeys('lookups');
const readKeys = commercialAreaKeys('read-models');

export const commercialLookupKeys = {
  owners: (query: ListQuery) => [...lookupKeys.all, 'owners', query] as const,
  customer: (customerId: string) => [...lookupKeys.all, 'customer', customerId] as const,
  contacts: (customerId: string, query: ListQuery) => [...lookupKeys.all, 'contacts', customerId, query] as const,
  projects: (customerId: string, query: ListQuery) => [...lookupKeys.all, 'projects', customerId, query] as const,
  opportunities: (projectId: string, query: ListQuery) => [...lookupKeys.all, 'opportunities', projectId, query] as const,
};

export const commercialReadKeys = {
  interactions: (query: InteractionQuery) => [...readKeys.all, 'interactions', query] as const,
  trace: (scope: FollowUpScope) => [...readKeys.all, 'trace', scope.customerId ?? null, scope.projectId ?? null] as const,
};

/** Tras cualquier mutación del módulo: listados, bandeja, agenda, historial y seguimiento. */
export function invalidateCommercialActivity(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: commercialActivityRootKey });
}

export function useInvalidateCommercialActivity(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(() => invalidateCommercialActivity(queryClient), [queryClient]);
}

/** Búsquedas de selectores: resultados por página. */
export const LOOKUP_PAGE_SIZE = 20;
/** Para resolver una preselección entre los proyectos u oportunidades de su padre (máximo de la API). */
export const LOOKUP_MAX_PAGE_SIZE = 100;

export function useOwnerOptions(search: string, enabled: boolean) {
  const query: ListQuery = { search: search || undefined, page: 1, pageSize: LOOKUP_PAGE_SIZE };
  return useQuery({
    queryKey: commercialLookupKeys.owners(query),
    queryFn: () => listOwnerOptions(query),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useCustomerLookup(customerId: string | undefined) {
  return useQuery({
    queryKey: commercialLookupKeys.customer(customerId ?? ''),
    queryFn: () => getCustomerLookup(customerId ?? ''),
    enabled: Boolean(customerId),
  });
}

export function useCustomerContacts(customerId: string | null, search: string, enabled: boolean) {
  const query: ListQuery = { search: search || undefined, page: 1, pageSize: LOOKUP_PAGE_SIZE };
  return useQuery({
    queryKey: commercialLookupKeys.contacts(customerId ?? '', query),
    queryFn: () => listCustomerContacts(customerId ?? '', query),
    enabled: enabled && Boolean(customerId),
    placeholderData: keepPreviousData,
  });
}

export function useCustomerProjectsLookup(customerId: string | null, query: ListQuery, enabled: boolean) {
  return useQuery({
    queryKey: commercialLookupKeys.projects(customerId ?? '', query),
    queryFn: () => listCustomerProjectsLookup(customerId ?? '', query),
    enabled: enabled && Boolean(customerId),
    placeholderData: keepPreviousData,
  });
}

export function useOpenOpportunities(projectId: string | null, enabled: boolean) {
  const query: ListQuery = { page: 1, pageSize: LOOKUP_MAX_PAGE_SIZE };
  return useQuery({
    queryKey: commercialLookupKeys.opportunities(projectId ?? '', query),
    queryFn: () => listOpenOpportunities(projectId ?? '', query),
    enabled: enabled && Boolean(projectId),
  });
}

export function useInteractions(query: InteractionQuery, enabled = true) {
  return useQuery({
    queryKey: commercialReadKeys.interactions(query),
    queryFn: () => listInteractions(query),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useFollowUpTrace(scope: FollowUpScope, enabled = true) {
  return useQuery({
    queryKey: commercialReadKeys.trace(scope),
    queryFn: () => getFollowUpTrace(scope),
    enabled,
  });
}
