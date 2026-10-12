import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

import type { AttachmentContent } from './attachments.service';

/** Caracteres seguros dentro de `filename="…"` (ASCII imprimible sin comillas, barra invertida ni `%`). */
const ASCII_FALLBACK_UNSAFE = /[^\x20-\x7e]|["\\%]/g;
/** RFC 5987 `attr-char`: lo que `encodeURIComponent` deja sin codificar y no está permitido. */
const RFC5987_EXTRA = /['()*]/g;

/**
 * `Content-Disposition: attachment` con el nombre saneado (ADR-021, 02 F.5):
 * `filename` ASCII de respaldo para clientes antiguos y `filename*` UTF-8
 * codificado según RFC 5987/6266. Siempre `attachment`: nunca vista previa en
 * línea, tampoco de imágenes (ADR-021, mitigación sin antivirus).
 */
export function contentDispositionAttachment(fileName: string): string {
  const fallback = fileName.replace(ASCII_FALLBACK_UNSAFE, '_') || 'archivo';
  const encoded = encodeURIComponent(fileName).replace(
    RFC5987_EXTRA,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * Prepara la respuesta de descarga de un adjunto **después** de autorizar (02 F.5
 * F19). Uso en el controlador del dueño:
 *
 * ```ts
 * @Get(':customerId/attachments/:attachmentId/content')
 * async download(..., @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
 *   // 1. permiso + visibilidad del dueño (fuera del alcance → 404)
 *   const content = await this.attachments.open({ type: 'customer', id: customerId }, attachmentId);
 *   return attachmentDownload(response, content);
 * }
 * ```
 *
 * Cabeceras: `Content-Type` = tipo detectado al guardar (nunca el declarado por
 * el usuario), `Content-Length`, `Content-Disposition: attachment`,
 * `X-Content-Type-Options: nosniff` y `Cache-Control: no-store`.
 */
export function attachmentDownload(response: Response, content: AttachmentContent): StreamableFile {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  const file = new StreamableFile(content.stream, {
    type: content.contentType,
    length: content.sizeBytes,
    disposition: contentDispositionAttachment(content.fileName),
  });
  // Si el flujo falla a mitad, nunca se envía el mensaje del error al cliente
  // (el manejador por defecto respondería 400 con `error.message`).
  file.setErrorHandler((_error, res) => {
    if (res.destroyed) {
      return;
    }
    if (res.headersSent) {
      // Cuerpo a medias: se corta la conexión para que el cliente no tome el archivo por completo.
      response.destroy();
      return;
    }
    res.statusCode = 500;
    res.end();
  });
  return file;
}
