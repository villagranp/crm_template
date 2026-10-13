import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { createScopedQueryKeys, type ListQuery } from '@/lib/query-keys';
import type { UploadOptions } from '@/services/api';

import {
  ACTIVE_IMPORT_STATUSES,
  cancelCustomerImport,
  confirmCustomerImport,
  getCustomerImport,
  getCustomerImportSettings,
  listCustomerImportRows,
  listCustomerImports,
  uploadCustomerImport,
  type ConfirmCustomerImportInput,
  type CustomerImport,
  type ImportStatus,
} from './customer-imports.api';
import { CUSTOMER_IMPORT_ERROR_CODES, hasErrorCode } from './customer-imports.errors';

/** Claves bajo `['crm', 'customer-imports']`; las filas cuelgan de la carga. */
const base = createScopedQueryKeys('crm', 'customer-imports');

export const customerImportKeys = {
  ...base,
  settings: () => [...base.all, 'settings'] as const,
  rowsOf: (importId: string) => [...base.all, 'rows', importId] as const,
  rows: (importId: string, query: ListQuery) => [...base.all, 'rows', importId, query] as const,
};

/** Sondeo del detalle mientras la carga está en un estado transitorio (06 §E.4). */
export const IMPORT_POLL_INTERVAL_MS = 2_000;

/** Los parámetros cambian poco: se reutilizan durante la sesión de pantalla. */
const SETTINGS_STALE_TIME_MS = 5 * 60_000;

export function isActiveImportStatus(status: ImportStatus | undefined): boolean {
  return status !== undefined && ACTIVE_IMPORT_STATUSES.includes(status);
}

export function useCustomerImportSettings() {
  return useQuery({
    queryKey: customerImportKeys.settings(),
    queryFn: getCustomerImportSettings,
    staleTime: SETTINGS_STALE_TIME_MS,
  });
}

export function useCustomerImports(query: ListQuery) {
  return useQuery({
    queryKey: customerImportKeys.list(query),
    queryFn: () => listCustomerImports(query),
    placeholderData: keepPreviousData,
  });
}

export function useCustomerImport(importId: string | undefined) {
  return useQuery({
    queryKey: customerImportKeys.detail(importId ?? ''),
    queryFn: () => getCustomerImport(importId ?? ''),
    enabled: Boolean(importId),
    refetchInterval: (query) => (isActiveImportStatus(query.state.data?.status) ? IMPORT_POLL_INTERVAL_MS : false),
  });
}

export function useCustomerImportRows(importId: string, query: ListQuery, enabled = true) {
  return useQuery({
    queryKey: customerImportKeys.rows(importId, query),
    queryFn: () => listCustomerImportRows(importId, query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/**
 * Filas válidas con advertencias de una carga: `warningRows` cuenta filas de
 * cualquier estado, y el diálogo de confirmación necesita sólo las válidas
 * (RN-06.18). Se pide una fila y se lee `pagination.totalItems`.
 */
export function useValidRowsWithWarnings(importId: string, enabled: boolean) {
  const query: ListQuery = { status: 'VALID', hasWarnings: 'true', page: 1, pageSize: 1 };
  return useQuery({
    queryKey: customerImportKeys.rows(importId, query),
    queryFn: () => listCustomerImportRows(importId, query),
    select: (page) => page.pagination.totalItems,
    enabled,
  });
}

/**
 * Las filas cambian de estado al confirmar, al terminar o al cancelar: cuando
 * cambia el estado de la carga (por el sondeo o por una mutación) se recargan.
 */
export function useRefreshRowsOnStatusChange(importId: string, status: ImportStatus | undefined): void {
  const queryClient = useQueryClient();
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current !== undefined && status !== undefined && previous.current !== status) {
      void queryClient.invalidateQueries({ queryKey: customerImportKeys.rowsOf(importId) });
    }
    previous.current = status;
  }, [importId, status, queryClient]);
}

export interface UploadVariables {
  file: File;
  onProgress?: UploadOptions['onProgress'];
  signal?: AbortSignal;
}

export function useUploadCustomerImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, onProgress, signal }: UploadVariables) => uploadCustomerImport(file, { onProgress, signal }),
    onSuccess: (created) => {
      queryClient.setQueryData(customerImportKeys.detail(created.id), created);
      return queryClient.invalidateQueries({ queryKey: customerImportKeys.lists() });
    },
    // Un archivo rechazado por estructura queda en el historial como `FAILED`.
    onError: (error) =>
      hasErrorCode(error, CUSTOMER_IMPORT_ERROR_CODES.invalidImportFile)
        ? queryClient.invalidateQueries({ queryKey: customerImportKeys.lists() })
        : undefined,
  });
}

/** Tras confirmar o cancelar: detalle nuevo, listas y filas recargadas. */
function useApplyImportChange(importId: string) {
  const queryClient = useQueryClient();
  return (updated: CustomerImport) => {
    queryClient.setQueryData(customerImportKeys.detail(importId), updated);
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: customerImportKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: customerImportKeys.rowsOf(importId) }),
    ]);
  };
}

/** Códigos que indican que la pantalla está desactualizada: se recarga el detalle. */
const STALE_IMPORT_CODES: readonly string[] = [
  CUSTOMER_IMPORT_ERROR_CODES.invalidImportStatus,
  CUSTOMER_IMPORT_ERROR_CODES.importChanged,
  CUSTOMER_IMPORT_ERROR_CODES.importsDisabled,
  CUSTOMER_IMPORT_ERROR_CODES.noValidRows,
];

function useRefreshOnStaleError(importId: string) {
  const queryClient = useQueryClient();
  return (error: unknown) =>
    STALE_IMPORT_CODES.some((code) => hasErrorCode(error, code))
      ? queryClient.invalidateQueries({ queryKey: customerImportKeys.detail(importId) })
      : undefined;
}

export function useConfirmCustomerImport(importId: string) {
  const apply = useApplyImportChange(importId);
  const refreshOnStale = useRefreshOnStaleError(importId);
  return useMutation({
    mutationFn: (input: ConfirmCustomerImportInput) => confirmCustomerImport(importId, input),
    onSuccess: apply,
    onError: refreshOnStale,
  });
}

export function useCancelCustomerImport(importId: string) {
  const apply = useApplyImportChange(importId);
  const refreshOnStale = useRefreshOnStaleError(importId);
  return useMutation({
    mutationFn: () => cancelCustomerImport(importId),
    onSuccess: apply,
    onError: refreshOnStale,
  });
}
