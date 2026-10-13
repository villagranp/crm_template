import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { attachmentKeys } from '@/features/crm/common/attachments.queries';
import { describeApiError } from '@/lib/api-error-view';

import { commercialAttachmentsPath } from '../../common/attachment-owner';
import { COMMERCIAL_ERROR_MESSAGES, withReference } from '../../common/commercial-activity.errors';
import { invalidateCommercialActivity } from '../../common/commercial-activity.queries';
import { uploadFilesInOrder, type UploadFilesResult } from '../../common/upload-files';
import { uploadToLatestEvent } from '../visit-event-uploads';
import type { VisitEventType } from '../visits.api';

/** Dónde van los archivos de una operación: al evento que crea, o a la visita (corrección, sin evento nuevo). */
export type VisitFilesTarget = { eventType: VisitEventType } | { visit: true };

/**
 * Sube los archivos de un diálogo de la visita **después** de la operación
 * (04 §E.12, D-04.18) y devuelve un aviso si alguno no quedó adjunto (la
 * operación ya está hecha y no se deshace). Invalida la lista de adjuntos del
 * dueño y el módulo (contadores de adjuntos de eventos, agenda, seguimiento).
 */
export function useVisitOperationFiles(visitId: string) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (target: VisitFilesTarget, files: readonly File[]): Promise<string | null> => {
      if (files.length === 0) {
        return null;
      }
      setUploading(true);
      try {
        let result: UploadFilesResult & { basePath: string | null };
        if ('visit' in target) {
          const basePath = commercialAttachmentsPath({ type: 'visit', visitId });
          result = { ...(await uploadFilesInOrder(basePath, files)), basePath };
        } else {
          result = await uploadToLatestEvent(visitId, target.eventType, files);
        }
        if (result.basePath && result.uploaded.length > 0) {
          void queryClient.invalidateQueries({ queryKey: attachmentKeys.owner(result.basePath) });
          void invalidateCommercialActivity(queryClient);
        }
        if (!result.failure) {
          return null;
        }
        const pending = files.length - result.uploaded.length;
        return `«${result.failure.file.name}» no se adjuntó: ${result.failure.message}${pending > 1 ? ` Quedaron ${pending} archivos sin adjuntar.` : ''}`;
      } catch (error) {
        return `No se pudieron adjuntar los archivos. ${withReference(describeApiError(error, COMMERCIAL_ERROR_MESSAGES))}`;
      } finally {
        setUploading(false);
      }
    },
    [queryClient, visitId],
  );

  return { upload, uploading };
}
