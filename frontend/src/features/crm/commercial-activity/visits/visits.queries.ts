import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ListQuery } from '@/lib/query-keys';

import { commercialAreaKeys, invalidateCommercialActivity } from '../common/commercial-activity.queries';

import {
  cancelVisit,
  completeVisit,
  confirmVisit,
  correctVisitCompletion,
  createVisit,
  getScheduleConflicts,
  getVisit,
  getVisitFormOptions,
  listVisitEvents,
  listVisits,
  rescheduleVisit,
  updateVisit,
  type CreateVisitInput,
  type ScheduleConflictsQuery,
  type UpdateVisitInput,
  type VisitCancellationInput,
  type VisitCompletionInput,
  type VisitConfirmationInput,
  type VisitDetail,
  type VisitReschedulingInput,
} from './visits.api';

const base = commercialAreaKeys('visits');

/** Claves bajo `['crm', 'commercial-activity', 'visits']`. */
export const visitKeys = {
  ...base,
  formOptions: () => [...base.all, 'form-options'] as const,
  events: (visitId: string) => [...base.all, 'events', visitId] as const,
  conflicts: (query: ScheduleConflictsQuery) => [...base.all, 'conflicts', query] as const,
};

/** Las opciones cambian poco (catálogos y parámetros). */
const FORM_OPTIONS_STALE_TIME_MS = 5 * 60_000;

export function useVisits(query: ListQuery) {
  return useQuery({
    queryKey: visitKeys.list(query),
    queryFn: () => listVisits(query),
    placeholderData: keepPreviousData,
  });
}

export function useVisitFormOptions(enabled = true) {
  return useQuery({
    queryKey: visitKeys.formOptions(),
    queryFn: getVisitFormOptions,
    staleTime: FORM_OPTIONS_STALE_TIME_MS,
    enabled,
  });
}

export function useVisit(visitId: string | undefined) {
  return useQuery({
    queryKey: visitKeys.detail(visitId ?? ''),
    queryFn: () => getVisit(visitId ?? ''),
    enabled: Boolean(visitId),
  });
}

export function useVisitEvents(visitId: string | undefined) {
  return useQuery({
    queryKey: visitKeys.events(visitId ?? ''),
    queryFn: () => listVisitEvents(visitId ?? ''),
    enabled: Boolean(visitId),
  });
}

/** Solapes del responsable (RN-04.14). `null` = no se consulta (faltan datos o el modo es `NO`). */
export function useScheduleConflicts(query: ScheduleConflictsQuery | null) {
  return useQuery({
    queryKey: visitKeys.conflicts(query ?? { start: '' }),
    queryFn: () => getScheduleConflicts(query ?? { start: '' }),
    enabled: query !== null,
    placeholderData: keepPreviousData,
  });
}

/**
 * Tras cada mutación: el detalle con la respuesta y, a la vez, listados,
 * eventos, agenda, historial y seguimiento (todo cuelga de la raíz del módulo,
 * AC-04.6).
 */
function useSaveDetail() {
  const queryClient = useQueryClient();
  return (visit: VisitDetail) => {
    queryClient.setQueryData(visitKeys.detail(visit.id), visit);
    return invalidateCommercialActivity(queryClient);
  };
}

export function useCreateVisit() {
  const save = useSaveDetail();
  return useMutation({
    mutationFn: (input: CreateVisitInput) => createVisit(input),
    onSuccess: save,
  });
}

export function useUpdateVisit(visitId: string) {
  const save = useSaveDetail();
  return useMutation({
    mutationFn: (input: UpdateVisitInput) => updateVisit(visitId, input),
    onSuccess: save,
  });
}

/** Registrar realizada (`POST`) o corregir la realización (`PUT`, RN-04.17). */
export function useVisitCompletion(visitId: string, mode: 'record' | 'correct') {
  const save = useSaveDetail();
  return useMutation({
    mutationFn: (input: VisitCompletionInput) => (mode === 'record' ? completeVisit(visitId, input) : correctVisitCompletion(visitId, input)),
    onSuccess: save,
  });
}

export function useConfirmVisit(visitId: string) {
  const save = useSaveDetail();
  return useMutation({
    mutationFn: (input: VisitConfirmationInput) => confirmVisit(visitId, input),
    onSuccess: save,
  });
}

export function useRescheduleVisit(visitId: string) {
  const save = useSaveDetail();
  return useMutation({
    mutationFn: (input: VisitReschedulingInput) => rescheduleVisit(visitId, input),
    onSuccess: save,
  });
}

export function useCancelVisit(visitId: string) {
  const save = useSaveDetail();
  return useMutation({
    mutationFn: (input: VisitCancellationInput) => cancelVisit(visitId, input),
    onSuccess: save,
  });
}
