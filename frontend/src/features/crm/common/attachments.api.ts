import { httpClient, type DownloadedFile, type UploadProgress } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

/**
 * Adjuntos de un registro del CRM (ADR-021, 02 §F.5).
 *
 * Las rutas son por dueño (DC-2): `/customers/{id}/attachments`, y las que
 * definan Proyectos y Actividad con la misma forma. El módulo dueño decide la
 * autorización; este cliente sólo necesita la ruta base.
 */

/** `AttachmentResponseDto`: nunca trae `storageKey` ni rutas del almacenamiento. */
export interface AttachmentDto {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  description: string | null;
  createdAt: string;
  createdBy: { id: string; displayName: string } | null;
}

/** Límites de `form-options.attachments` (parámetros `crm.adjuntos.*`). Sólo para ayudar: el backend decide. */
export interface AttachmentLimits {
  maxMb: number;
  /** Tipos MIME admitidos. */
  allowedTypes: readonly string[];
}

export const ATTACHMENT_ERROR_CODES = {
  tooLarge: 'ATTACHMENT_TOO_LARGE',
  typeNotAllowed: 'ATTACHMENT_TYPE_NOT_ALLOWED',
} as const;

export interface AttachmentListQuery {
  page: number;
  pageSize: number;
}

export function listAttachments(
  basePath: string,
  query: AttachmentListQuery,
): Promise<PaginatedResponse<AttachmentDto>> {
  return httpClient.get<PaginatedResponse<AttachmentDto>>(basePath, { query: { ...query } });
}

export interface UploadAttachmentOptions {
  description?: string;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/** Un archivo por petición (`multipart/form-data`: `file` y `description?`). */
export function uploadAttachment(
  basePath: string,
  file: File,
  { description, onProgress, signal }: UploadAttachmentOptions = {},
): Promise<AttachmentDto> {
  const body = new FormData();
  body.append('file', file, file.name);
  if (description?.trim()) {
    body.append('description', description.trim());
  }
  return httpClient.upload<AttachmentDto>(basePath, body, { onProgress, signal });
}

/**
 * El binario lo transmite la API después de autorizar; se descarga con el
 * token en memoria (un `<a href>` no lo enviaría) y se entrega con `saveFile`.
 */
export function downloadAttachment(basePath: string, attachmentId: string): Promise<DownloadedFile> {
  return httpClient.download(`${basePath}/${encodeURIComponent(attachmentId)}/content`);
}

export function deleteAttachment(basePath: string, attachmentId: string): Promise<void> {
  return httpClient.delete<void>(`${basePath}/${encodeURIComponent(attachmentId)}`);
}
