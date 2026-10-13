import { commercialAttachmentsPath } from '../common/attachment-owner';
import { uploadFilesInOrder, type UploadFilesResult } from '../common/upload-files';

import { listVisitEvents, type VisitEventType } from './visits.api';

export interface EventUploadResult extends UploadFilesResult {
  /** Ruta base de los adjuntos del evento, para invalidar su lista; `null` si no se encontró el evento. */
  basePath: string | null;
}

/**
 * Sube los archivos de una operación de la visita (realizar, confirmar,
 * reprogramar, cancelar) al evento que esa operación acaba de crear (04 §E.12,
 * D-04.18: sólo quien lo ejecutó, en los 15 minutos siguientes; lo decide el
 * backend). La respuesta de la operación es el detalle de la visita, sin el id
 * del evento: se lee el historial y se toma el último evento de ese tipo.
 *
 * Se detiene en el primer archivo que falla (`413`, `422`, `403`, `409`) y lo
 * devuelve con su mensaje ya traducido. La operación ya está hecha: quien llama
 * avisa de que el archivo no quedó adjunto.
 */
export async function uploadToLatestEvent(visitId: string, eventType: VisitEventType, files: readonly File[]): Promise<EventUploadResult> {
  if (files.length === 0) {
    return { uploaded: [], failure: null, basePath: null };
  }
  const events = await listVisitEvents(visitId);
  const event = [...events].reverse().find((item) => item.eventType === eventType);
  if (!event) {
    const [first] = files;
    return {
      uploaded: [],
      failure: first ? { file: first, message: 'No se encontró el evento recién registrado.' } : null,
      basePath: null,
    };
  }
  const basePath = commercialAttachmentsPath({ type: 'visitEvent', visitId, eventId: event.id });
  const result = await uploadFilesInOrder(basePath, files);
  return { ...result, basePath };
}
