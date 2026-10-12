import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';

import { createQueryKeys, type ListQuery } from '@/features/admin/common';

import { exportAuditLogs, listAuditEvents, listAuditLogs } from './audit.api';
import { saveFile } from '@/lib/save-file';

export const auditKeys = createQueryKeys('audit');

const EVENTS_STALE_MS = 5 * 60_000;
const DEFAULT_EXPORT_FILE_NAME = 'auditoria.csv';

export function useAuditLogs(query: ListQuery) {
  return useQuery({ queryKey: auditKeys.list(query), queryFn: () => listAuditLogs(query), placeholderData: keepPreviousData });
}

export function useAuditEvents() {
  return useQuery({ queryKey: [...auditKeys.all, 'events'], queryFn: listAuditEvents, staleTime: EVENTS_STALE_MS });
}

/** Descarga el CSV y lo guarda en el equipo del usuario. */
export function useExportAuditLogs() {
  return useMutation({
    mutationFn: async (filters: ListQuery) => {
      const file = await exportAuditLogs(filters);
      saveFile(file.blob, file.fileName ?? DEFAULT_EXPORT_FILE_NAME);
    },
  });
}
