import { Readable } from 'node:stream';

import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';

import { VALIDATION_FAILED } from '@/common/filters/validation-exception.factory';
import { MAX_UPLOAD_MB } from '@/modules/parameters/parameter-rules.registry';

import { ATTACHMENT_FILE_FIELD, attachmentTooLargeError } from './attachment-errors';
import { maxBytesFromMegabytes } from './attachment-policy';

/**
 * Límites de `multipart` de las rutas de subida de adjuntos (02 F.5 F18):
 * un archivo en el campo `file`, como mucho `description` de texto, y el techo
 * absoluto de tamaño `MAX_UPLOAD_MB` (= `client_max_body_size` de NGINX y
 * máximo admitido para `crm.adjuntos.max_mb`). El máximo **vigente** del
 * parámetro lo aplica `AttachmentsService` al guardar, en streaming.
 *
 * Almacenamiento en memoria acotada (por defecto de multer, sin escribir a
 * disco fuera de la base del almacenamiento): como mucho `MAX_UPLOAD_MB` por petición.
 */
export const ATTACHMENT_UPLOAD_LIMITS = {
  files: 1,
  fileSize: maxBytesFromMegabytes(MAX_UPLOAD_MB),
  fields: 2,
  fieldSize: 4 * 1024,
  parts: 3,
  headerPairs: 50,
} as const;

/** Archivo que deja multer en `@UploadedFile()` (forma mínima; no se depende de `@types/multer`). */
export interface UploadedAttachmentFile {
  readonly originalname: string;
  readonly size: number;
  readonly buffer: Buffer;
}

/**
 * Traduce los errores de multer al contrato de la API:
 * archivo mayor que el techo → `413 ATTACHMENT_TOO_LARGE`; más de un archivo,
 * campo inesperado o `multipart` mal formado → `400 VALIDATION_FAILED`.
 */
export function translateUploadError(error: unknown): unknown {
  if (error instanceof HttpException && error.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE) {
    return attachmentTooLargeError(ATTACHMENT_UPLOAD_LIMITS.fileSize);
  }
  if (error instanceof BadRequestException) {
    return uploadValidationError(error.message);
  }
  return error;
}

function uploadValidationError(issue: string): BadRequestException {
  return new BadRequestException({
    code: VALIDATION_FAILED,
    message: 'Request validation failed',
    details: [{ field: ATTACHMENT_FILE_FIELD, issue }],
  });
}

const MulterFileInterceptor = FileInterceptor(ATTACHMENT_FILE_FIELD, { limits: ATTACHMENT_UPLOAD_LIMITS });

/**
 * Interceptor de subida para los controladores de los dueños:
 *
 * ```ts
 * @Post(':customerId/attachments')
 * @ApiConsumes('multipart/form-data')
 * @UseInterceptors(AttachmentUploadInterceptor)
 * async upload(@UploadedFile() file: UploadedAttachmentFile | undefined, @Body() body: UploadAttachmentDto) {
 *   const upload = toAttachmentUpload(file, body.description);   // 400 si falta el archivo
 *   return this.attachments.add({ type: 'customer', id }, upload, actor);
 * }
 * ```
 */
@Injectable()
export class AttachmentUploadInterceptor extends MulterFileInterceptor {
  override async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      throw translateUploadError(error);
    }
  }
}

/**
 * Convierte el archivo recibido en la entrada de `AttachmentsService.add`.
 * Sin archivo → `400 VALIDATION_FAILED` (`details[].field = 'file'`).
 */
export function toAttachmentUpload(
  file: UploadedAttachmentFile | undefined,
  description?: string | null,
): { content: Readable; fileName: string; description: string | null } {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw uploadValidationError('A file is required');
  }
  return { content: Readable.from([file.buffer]), fileName: file.originalname, description: description ?? null };
}
