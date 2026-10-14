import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createScopedQueryKeys } from '@/lib/query-keys';
import { saveFile } from '@/lib/save-file';

import {
  deleteAttachment,
  downloadAttachment,
  listAttachments,
  type AttachmentDto,
  type AttachmentListQuery,
} from './attachments.api';

const keys = createScopedQueryKeys('crm', 'attachments');

/** Claves por dueño: `['crm', 'attachments', <ruta base>, …]`. */
export const attachmentKeys = {
  all: keys.all,
  owner: (basePath: string) => [...keys.all, basePath] as const,
  list: (basePath: string, query: AttachmentListQuery) => [...keys.all, basePath, 'list', query] as const,
};

export function useAttachments(basePath: string, query: AttachmentListQuery) {
  return useQuery({
    queryKey: attachmentKeys.list(basePath, query),
    queryFn: () => listAttachments(basePath, query),
    placeholderData: keepPreviousData,
  });
}

/** `onChanged` (opcional) se llama tras eliminar, p. ej. para refrescar los contadores del módulo dueño. */
export function useDeleteAttachment(basePath: string, onChanged?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachment: AttachmentDto) => deleteAttachment(basePath, attachment.id),
    onSuccess: () => {
      onChanged?.();
      return queryClient.invalidateQueries({ queryKey: attachmentKeys.owner(basePath) });
    },
  });
}

export function useDownloadAttachment(basePath: string) {
  return useMutation({
    mutationFn: async (attachment: AttachmentDto) => {
      const file = await downloadAttachment(basePath, attachment.id);
      saveFile(file.blob, file.fileName ?? attachment.fileName);
    },
  });
}
