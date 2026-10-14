/**
 * Dueño de un adjunto de Actividad comercial (04 §F.4, DC-2): las rutas cuelgan
 * del dueño y es este módulo quien autoriza.
 */
export type CommercialAttachmentOwner =
  | { type: 'activity'; activityId: string }
  | { type: 'visit'; visitId: string }
  | { type: 'visitEvent'; visitId: string; eventId: string };

/** Ruta base de la API para listar, subir, descargar (`…/{aid}/content`) y borrar. */
export function commercialAttachmentsPath(owner: CommercialAttachmentOwner): string {
  switch (owner.type) {
    case 'activity':
      return `/activities/${encodeURIComponent(owner.activityId)}/attachments`;
    case 'visit':
      return `/visits/${encodeURIComponent(owner.visitId)}/attachments`;
    default:
      return `/visits/${encodeURIComponent(owner.visitId)}/events/${encodeURIComponent(owner.eventId)}/attachments`;
  }
}

/**
 * Archivos elegidos en un alta (antes de que exista el dueño) que se suben al
 * llegar a su detalle (patrón de D-02.15). Viven en memoria: si se recarga la
 * página antes, se pierden y no se suben dos veces.
 */
const pendingByOwner = new Map<string, File[]>();

export function stashPendingAttachments(owner: CommercialAttachmentOwner, files: readonly File[]): void {
  if (files.length > 0) {
    pendingByOwner.set(commercialAttachmentsPath(owner), [...files]);
  }
}

/** Devuelve y olvida los archivos pendientes del dueño (una sola vez). */
export function takePendingAttachments(owner: CommercialAttachmentOwner): File[] {
  const key = commercialAttachmentsPath(owner);
  const files = pendingByOwner.get(key) ?? [];
  pendingByOwner.delete(key);
  return files;
}
