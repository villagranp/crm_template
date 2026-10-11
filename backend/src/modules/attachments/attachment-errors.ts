import { BusinessRuleViolationError, PayloadTooLargeError } from '@/common/errors/application-error';

/** `413`: el archivo supera `crm.adjuntos.max_mb` (DC-4, API-STANDARDS §3). */
export const ATTACHMENT_TOO_LARGE = 'ATTACHMENT_TOO_LARGE';
/** `422`: la firma, la extensión o la lista blanca no admiten el archivo (DC-4). */
export const ATTACHMENT_TYPE_NOT_ALLOWED = 'ATTACHMENT_TYPE_NOT_ALLOWED';

/** Campo `multipart` del archivo en todas las rutas de subida (02 F.5). */
export const ATTACHMENT_FILE_FIELD = 'file';

export function attachmentTooLargeError(maxBytes: number): PayloadTooLargeError {
  return new PayloadTooLargeError(ATTACHMENT_TOO_LARGE, 'The file exceeds the maximum allowed size', [
    { field: ATTACHMENT_FILE_FIELD, maxBytes },
  ]);
}

export function attachmentTypeNotAllowedError(allowedTypes: readonly string[]): BusinessRuleViolationError {
  return new BusinessRuleViolationError(ATTACHMENT_TYPE_NOT_ALLOWED, 'The file type is not allowed', [
    { field: ATTACHMENT_FILE_FIELD, allowedTypes: [...allowedTypes] },
  ]);
}

/**
 * La fila existe pero falta su binario (ADR-021: "fila sin binario → error
 * registrado"). Es un `Error` sin código: el filtro global responde `500` con el
 * correlation ID y nunca se sirve otro archivo.
 */
export class AttachmentContentMissingError extends Error {
  constructor(readonly attachmentId: string) {
    super('The attachment binary is missing from the storage');
    this.name = 'AttachmentContentMissingError';
  }
}
