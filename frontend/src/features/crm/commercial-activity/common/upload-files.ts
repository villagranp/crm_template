import { describeUploadError } from '@/features/crm/common/attachment-format';
import { uploadAttachment, type AttachmentLimits } from '@/features/crm/common/attachments.api';

export interface UploadFilesResult {
  /** Archivos subidos, en orden. */
  uploaded: File[];
  /** Primer archivo que falló, con su mensaje ya traducido; la subida se detiene ahí. */
  failure: { file: File; message: string } | null;
}

/**
 * Sube archivos de uno en uno a la ruta de un dueño (04 §E.12) y se detiene en
 * el primer fallo (p. ej. `413`/`422`), para que el diálogo no siga con la
 * operación (completar) dejando archivos a medias sin avisar.
 */
export async function uploadFilesInOrder(basePath: string, files: readonly File[], limits?: AttachmentLimits): Promise<UploadFilesResult> {
  const uploaded: File[] = [];
  for (const file of files) {
    try {
      await uploadAttachment(basePath, file);
      uploaded.push(file);
    } catch (error) {
      return { uploaded, failure: { file, message: describeUploadError(error, limits) } };
    }
  }
  return { uploaded, failure: null };
}
