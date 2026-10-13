import { useCallback } from 'react';

import type { AttachmentLimits } from '@/features/crm/common/attachments.api';
import { AttachmentsSection } from '@/features/crm/common/AttachmentsSection';

import { commercialAttachmentsPath, takePendingAttachments, type CommercialAttachmentOwner } from './attachment-owner';
import { useInvalidateCommercialActivity } from './commercial-activity.queries';
import { formatDateTime } from './date-time';
import { useCommercialTimeZones } from './use-commercial-time-zones';

export interface AttachmentsPanelProps {
  owner: CommercialAttachmentOwner;
  /**
   * El dueño es editable (actividad abierta con `EDIT` en `allowedActions`;
   * visita no confirmada ni cancelada). Ocultar es experiencia de usuario: el
   * backend decide (`403`/`409 RECORD_READ_ONLY`).
   */
  canManage: boolean;
  /**
   * Límites para ayudar antes de subir (`form-options.attachments` del módulo:
   * los de actividades en una actividad, los de visitas en una visita). Sin
   * ellos, decide el backend (`413`/`422`, que se muestran con su mensaje).
   */
  limits?: AttachmentLimits;
  title?: string;
  emptyMessage?: string;
  /** Sube al montar los archivos que dejó el alta para este dueño. */
  uploadPendingFromCreation?: boolean;
}

const EMPTY_MESSAGES: Record<CommercialAttachmentOwner['type'], string> = {
  activity: 'Esta actividad no tiene adjuntos',
  visit: 'Esta visita no tiene adjuntos',
  visitEvent: 'Este evento no tiene adjuntos',
};

/**
 * Adjuntos de una actividad, una visita o un evento de visita (04 §E.12):
 * envoltorio de `crm/common/AttachmentsSection` con la ruta del dueño (F.4).
 * Lista, subida con progreso y error por archivo (`413 ATTACHMENT_TOO_LARGE`,
 * `422 ATTACHMENT_TYPE_NOT_ALLOWED`), descarga por el cliente autenticado (sin
 * vista previa, ADR-021) y eliminación. Los adjuntos de un evento no se eliminan
 * (historia).
 */
export function AttachmentsPanel({ owner, canManage, limits, title, emptyMessage, uploadPendingFromCreation = false }: AttachmentsPanelProps) {
  const basePath = commercialAttachmentsPath(owner);
  // Subir o eliminar cambia `attachmentCount` de listas, agenda, eventos y seguimiento.
  const invalidateModule = useInvalidateCommercialActivity();
  const onChanged = useCallback(() => void invalidateModule(), [invalidateModule]);
  const { timeZone } = useCommercialTimeZones();
  const formatDate = useCallback((isoDate: string) => formatDateTime(isoDate, timeZone), [timeZone]);
  // `AttachmentsSection` la llama una sola vez al montar.
  const takeInitialFiles = uploadPendingFromCreation ? () => takePendingAttachments(owner) : undefined;

  return (
    <AttachmentsSection
      basePath={basePath}
      canManage={canManage}
      canDelete={canManage && owner.type !== 'visitEvent'}
      limits={limits}
      title={title}
      emptyMessage={emptyMessage ?? EMPTY_MESSAGES[owner.type]}
      takeInitialFiles={takeInitialFiles}
      onChanged={onChanged}
      formatDate={formatDate}
    />
  );
}
