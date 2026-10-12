import { describeApiError } from '@/lib/api-error-view';

import { ATTACHMENT_ERROR_CODES, type AttachmentLimits } from './attachments.api';

/** Formatos y mensajes de los adjuntos del CRM. */

const LOCALE = 'es-MX';
const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;
const PAYLOAD_TOO_LARGE = 413;

const sizeFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

/** "512 B", "1.5 KB", "3.2 MB" (formato numérico de `es-MX`). */
export function formatFileSize(bytes: number): string {
  if (bytes < BYTES_PER_KB) {
    return `${bytes} B`;
  }
  if (bytes < BYTES_PER_MB) {
    return `${sizeFormatter.format(bytes / BYTES_PER_KB)} KB`;
  }
  return `${sizeFormatter.format(bytes / BYTES_PER_MB)} MB`;
}

export function formatAttachmentDate(isoDate: string): string {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

const TYPE_LABELS: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
};

/** Etiqueta corta de un tipo MIME ("PDF", "Word"…); si no se conoce, el subtipo en mayúsculas. */
export function attachmentTypeLabel(contentType: string): string {
  const known = TYPE_LABELS[contentType.toLowerCase()];
  if (known) {
    return known;
  }
  const subtype = contentType.split('/')[1]?.split(';')[0]?.trim();
  return subtype ? subtype.toUpperCase() : 'Archivo';
}

function allowedTypesText(limits: AttachmentLimits | undefined): string {
  return limits && limits.allowedTypes.length > 0
    ? ` Tipos admitidos: ${[...new Set(limits.allowedTypes.map(attachmentTypeLabel))].join(', ')}.`
    : '';
}

function tooLargeMessage(limits: AttachmentLimits | undefined): string {
  return limits
    ? `El archivo supera el tamaño máximo permitido (${sizeFormatter.format(limits.maxMb)} MB).`
    : 'El archivo supera el tamaño máximo permitido.';
}

/**
 * Comprobación previa a la subida, sólo como ayuda (el backend detecta el tipo
 * por firma y corta por tamaño). Devuelve el mensaje del problema o `null`.
 * Un archivo sin tipo conocido por el navegador se deja pasar: lo decide el backend.
 */
export function precheckAttachment(file: File, limits: AttachmentLimits | undefined): string | null {
  if (!limits) {
    return null;
  }
  if (file.size > limits.maxMb * BYTES_PER_MB) {
    return tooLargeMessage(limits);
  }
  if (file.type && limits.allowedTypes.length > 0 && !limits.allowedTypes.includes(file.type)) {
    return `El tipo de archivo no está permitido.${allowedTypesText(limits)}`;
  }
  return null;
}

/**
 * Mensaje de un fallo de subida. El `413` puede llegar de NGINX sin cuerpo
 * JSON (02 §F.5): se reconoce por el estado, no sólo por el código.
 */
export function describeUploadError(error: unknown, limits: AttachmentLimits | undefined): string {
  const view = describeApiError(error, {
    [ATTACHMENT_ERROR_CODES.tooLarge]: tooLargeMessage(limits),
    [ATTACHMENT_ERROR_CODES.typeNotAllowed]: `El tipo de archivo no está permitido.${allowedTypesText(limits)}`,
  });
  return view.statusCode === PAYLOAD_TOO_LARGE ? tooLargeMessage(limits) : view.message;
}
