import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { createScopedQueryKeys, type ListQuery } from '@/lib/query-keys';

import {
  getCustomerLookup,
  getFollowUpTrace,
  listCountryOptions,
  listCustomerContacts,
  listCustomerProjectsLookup,
  listInteractions,
  listOpenOpportunities,
  listOwnerOptions,
  listOwnersByIds,
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
  ownersByIds: (ids: readonly string[]) => [...lookupKeys.all, 'owners-by-id', ids] as const,
  customer: (customerId: string) => [...lookupKeys.all, 'customer', customerId] as const,
  contacts: (customerId: string, query: ListQuery) => [...lookupKeys.all, 'contacts', customerId, query] as const,
  projects: (customerId: string, query: ListQuery) => [...lookupKeys.all, 'projects', customerId, query] as const,
  opportunities: (projectId: string, query: ListQuery) => [...lookupKeys.all, 'opportunities', projectId, query] as const,
  countries: () => [...lookupKeys.all, 'countries'] as const,
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

/** Los nombres de usuario cambian poco. */
const OWNER_NAMES_STALE_TIME_MS = 5 * 60_000;
const NO_OWNER_NAMES: ReadonlyMap<string, string> = new Map();

/**
 * Nombres de usuarios ya elegidos (filtro de asesor o de usuario tras recargar)
 * con `owner-options?id=` (D-04.10). Devuelve `id → nombre` sólo de los que el
 * backend devuelve (dentro del alcance y activos); el resto, sin nombre: la
 * pantalla usa su texto de respaldo.
 */
export function useOwnerNames(ids: readonly (string | null | undefined)[]): ReadonlyMap<string, string> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))].sort();
  const owners = useQuery({
    queryKey: commercialLookupKeys.ownersByIds(unique),
    queryFn: () => listOwnersByIds(unique),
    enabled: unique.length > 0,
    staleTime: OWNER_NAMES_STALE_TIME_MS,
  });
  const data = unique.length > 0 ? owners.data : undefined;
  return useMemo(() => (data ? new Map(data.data.map((user) => [user.id, user.displayName])) : NO_OWNER_NAMES), [data]);
}

/** Nombre de un usuario elegido (`null` mientras carga o si no está en el alcance). */
export function useOwnerName(id: string | null | undefined): string | null {
  const names = useOwnerNames([id]);
  return id ? (names.get(id) ?? null) : null;
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

/** Los países cambian poco. */
const COUNTRY_OPTIONS_STALE_TIME_MS = 10 * 60_000;

/** Países activos para el filtro de país (con `clientes.ver`; si no, `enabled = false`). */
export function useCountryOptions(enabled: boolean) {
  return useQuery({
    queryKey: commercialLookupKeys.countries(),
    queryFn: listCountryOptions,
    enabled,
    staleTime: COUNTRY_OPTIONS_STALE_TIME_MS,
  });
}
