import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { attachmentKeys } from '@/features/crm/common/attachments.queries';
import type { ListQuery } from '@/lib/query-keys';

import { commercialAttachmentsPath } from '../common/attachment-owner';
import { commercialAreaKeys, invalidateCommercialActivity } from '../common/commercial-activity.queries';

import {
  cancelActivity,
  completeActivity,
  createActivity,
  deleteActivity,
  getActivity,
  getActivityFormOptions,
  listActivities,
  listPendingActivities,
  updateActivity,
  type ActivityCompletionInput,
  type ActivityDetail,
  type CreateActivityInput,
  type UpdateActivityInput,
} from './activities.api';

const base = commercialAreaKeys('activities');

/** Claves bajo `['crm', 'commercial-activity', 'activities']`. */
export const activityKeys = {
  ...base,
  formOptions: () => [...base.all, 'form-options'] as const,
  pending: (query: ListQuery) => [...base.all, 'pending', query] as const,
};

/** Las opciones cambian poco (catálogos y parámetros). */
const FORM_OPTIONS_STALE_TIME_MS = 5 * 60_000;

export function useActivities(query: ListQuery) {
  return useQuery({
    queryKey: activityKeys.list(query),
    queryFn: () => listActivities(query),
    placeholderData: keepPreviousData,
  });
}

export function usePendingActivities(query: ListQuery) {
  return useQuery({
    queryKey: activityKeys.pending(query),
    queryFn: () => listPendingActivities(query),
    placeholderData: keepPreviousData,
  });
}

/**
 * Un lector pasivo (`passive`, p. ej. la zona horaria de cada celda) usa la
 * caché sin provocar recargas al montarse: si la consulta falló, no la reintenta
 * cada vez que aparece otro componente (eso lo decide la pantalla, con su aviso
 * y su "Reintentar").
 */
const PASSIVE_READER = { refetchOnMount: false, retryOnMount: false, refetchOnWindowFocus: false } as const;

export function useActivityFormOptions(enabled = true, { passive = false }: { passive?: boolean } = {}) {
  return useQuery({
    queryKey: activityKeys.formOptions(),
    queryFn: getActivityFormOptions,
    staleTime: FORM_OPTIONS_STALE_TIME_MS,
    enabled,
    ...(passive ? PASSIVE_READER : {}),
  });
}

export function useActivity(activityId: string | undefined) {
  return useQuery({
    queryKey: activityKeys.detail(activityId ?? ''),
    queryFn: () => getActivity(activityId ?? ''),
    enabled: Boolean(activityId),
  });
}

/**
 * Tras cada mutación: el detalle con la respuesta y, a la vez, listados,
 * bandeja, agenda, historial y seguimiento (todo cuelga de la raíz del módulo).
 */
function useSaveDetail() {
  const queryClient = useQueryClient();
  return (activity: ActivityDetail) => {
    queryClient.setQueryData(activityKeys.detail(activity.id), activity);
    return invalidateCommercialActivity(queryClient);
  };
}

export function useCreateActivity() {
  const save = useSaveDetail();
  return useMutation({
    mutationFn: (input: CreateActivityInput) => createActivity(input),
    onSuccess: save,
  });
}

export function useUpdateActivity(activityId: string) {
  const save = useSaveDetail();
  return useMutation({
    mutationFn: (input: UpdateActivityInput) => updateActivity(activityId, input),
    onSuccess: save,
  });
}

export function useCompleteActivity() {
  const save = useSaveDetail();
  return useMutation({
    mutationFn: ({ activityId, input }: { activityId: string; input: ActivityCompletionInput }) => completeActivity(activityId, input),
    onSuccess: save,
  });
}

export function useCancelActivity() {
  const save = useSaveDetail();
  return useMutation({
    mutationFn: ({ activityId, comment }: { activityId: string; comment: string | null }) => cancelActivity(activityId, comment),
    onSuccess: save,
  });
}

export function useDeleteActivity(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteActivity(activityId),
    // Quien elimina sale del detalle: se quitan de la caché el detalle y sus
    // adjuntos (sin volver a pedirlos: darían `404`) y el resto se recarga en
    // segundo plano. No se espera a esa recarga para salir del detalle.
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: activityKeys.detail(activityId) });
      queryClient.removeQueries({ queryKey: attachmentKeys.owner(commercialAttachmentsPath({ type: 'activity', activityId })) });
      void invalidateCommercialActivity(queryClient);
    },
  });
}
