import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';

import type { ListQuery } from '@/lib/query-keys';
import { saveFile } from '@/lib/save-file';

import type { TraceAttachment } from '../common/commercial-activity.api';
import { commercialAreaKeys } from '../common/commercial-activity.queries';

import { downloadTraceAttachment, listFollowUps } from './follow-up.api';

/** Claves bajo `['crm', 'commercial-activity', 'follow-ups']`: cualquier mutación del módulo las invalida. */
export const followUpKeys = commercialAreaKeys('follow-ups');

export function useFollowUps(query: ListQuery) {
  return useQuery({
    queryKey: followUpKeys.list(query),
    queryFn: () => listFollowUps(query),
    placeholderData: keepPreviousData,
  });
}

export function useDownloadTraceAttachment() {
  return useMutation({
    mutationFn: async (attachment: TraceAttachment) => {
      const file = await downloadTraceAttachment(attachment);
      saveFile(file.blob, file.fileName ?? attachment.fileName);
    },
  });
}
